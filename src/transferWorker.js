const fs = require("fs");
const path = require("path");
const https = require("https");
const { parentPort } = require("worker_threads");
const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const { Transform } = require("stream");
const { clampPartSize } = require("./transferShared");
const { buildCompletedDownloadParts } = require("./downloadResume");

function buildClient({ endpoint, region = "auto", accessKeyId, secretAccessKey, rejectUnauthorized = true }) {
  const options = {
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  };
  if (rejectUnauthorized === false) {
    options.requestHandler = new NodeHttpHandler({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  }
  return new S3Client(options);
}

function sendProgress(id, loaded, total, state = "running") {
  parentPort.postMessage({ type: "progress", id, loaded, total, state });
}

async function handleUpload(msg) {
  const {
    id,
    bucket,
    key,
    filePath,
    endpoint,
    accessKeyId,
    secretAccessKey,
    partSize = 8 * 1024 * 1024,
    concurrency = 2,
    resumeInfo,
    region,
    rejectUnauthorized,
  } = msg;

  const client = buildClient({ endpoint, region, accessKeyId, secretAccessKey, rejectUnauthorized });
  const stat = fs.statSync(filePath);
  const total = stat.size;
  let uploadId = resumeInfo?.uploadId;
  let completedParts = resumeInfo?.parts || [];
  let loaded = completedParts.reduce((acc, p) => acc + p.size, 0);
  const partCount = Math.ceil(total / partSize);

  if (!uploadId) {
    const created = await client.send(
      new CreateMultipartUploadCommand({ Bucket: bucket, Key: key })
    );
    uploadId = created.UploadId;
    parentPort.postMessage({
      type: "upload-started",
      id,
      uploadId,
      total,
    });
  }

  const existingParts = new Map(
    completedParts.map((p) => [p.PartNumber, p])
  );

  const running = [];
  const addRunning = (promise) => {
    running.push(promise);
    promise.finally(() => {
      const idx = running.indexOf(promise);
      if (idx !== -1) running.splice(idx, 1);
    });
  };

  const uploadPart = async (partNumber) => {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(total - 1, partNumber * partSize - 1);
    const size = end - start + 1;

    if (existingParts.has(partNumber)) {
      loaded += size;
      sendProgress(id, loaded, total, "running");
      return;
    }

    const progressStream = new Transform({
      transform(chunk, encoding, callback) {
        loaded += chunk.length;
        sendProgress(id, loaded, total, "running");
        callback(null, chunk);
      },
    });
    const stream = fs.createReadStream(filePath, { start, end }).pipe(progressStream);

    const result = await client.send(
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        PartNumber: partNumber,
        UploadId: uploadId,
        Body: stream,
        ContentLength: size,
      })
    );

    const partRecord = {
      PartNumber: partNumber,
      ETag: result.ETag,
      size,
    };
    completedParts.push(partRecord);
    parentPort.postMessage({
      type: "part-complete",
      id,
      uploadId,
      part: partRecord,
      loaded,
      total,
    });
  };

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const task = uploadPart(partNumber);
    addRunning(task);
    if (running.length >= concurrency) {
      await Promise.race(running);
    }
  }

  await Promise.all(running);

  const sortedParts = completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    })
  );

  const verifyHead = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const verifiedSize = verifyHead.ContentLength || 0;
  if (verifiedSize !== total) {
    throw new Error(`Upload verification failed: remote size ${verifiedSize} does not match local size ${total}`);
  }

  parentPort.postMessage({
    type: "done",
    id,
    total,
    verification: {
      ok: true,
      method: "size",
      expectedSize: total,
      actualSize: verifiedSize,
      etag: verifyHead.ETag || "",
    },
  });
}

async function handleDownload(msg) {
  const {
    id,
    bucket,
    key,
    dest,
    endpoint,
    accessKeyId,
    secretAccessKey,
    partSize = 8 * 1024 * 1024,
    concurrency = 2,
    resumeInfo,
    existingSize = 0,
    region,
    rejectUnauthorized,
  } = msg;

  const client = buildClient({ endpoint, region, accessKeyId, secretAccessKey, rejectUnauthorized });
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const total = head.ContentLength || 0;
  const etag = head.ETag;
  const normalizedPartSize = clampPartSize(partSize);
  const partCount = total > 0 ? Math.ceil(total / normalizedPartSize) : 0;

  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, "");
  }

  if (total === 0) {
    fs.truncateSync(dest, 0);
    parentPort.postMessage({
      type: "download-started",
      id,
      total: 0,
      etag,
      partSize: normalizedPartSize,
      parts: [],
    });
    parentPort.postMessage({
      type: "done",
      id,
      total: 0,
      verification: {
        ok: true,
        method: "size",
        expectedSize: 0,
        actualSize: 0,
        etag,
      },
    });
    return;
  }

  fs.truncateSync(dest, total);
  const { completedParts, loaded } = buildCompletedDownloadParts({
    total,
    partSize: normalizedPartSize,
    existingSize,
    resumeInfo,
    etag,
  });
  parentPort.postMessage({
    type: "download-started",
    id,
    total,
    etag,
    partSize: normalizedPartSize,
    parts: Array.from(completedParts.values()),
  });
  let progressLoaded = loaded;
  sendProgress(id, progressLoaded, total, "running");

  const downloadPart = async (partNumber) => {
    if (completedParts.has(partNumber)) {
      return;
    }
    const start = (partNumber - 1) * normalizedPartSize;
    const end = Math.min(total - 1, partNumber * normalizedPartSize - 1);
    if (end < start) return;
    const size = end - start + 1;
    const resp = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
    const body = resp.Body;
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(dest, { flags: "r+", start });
      body.on("data", (chunk) => {
        progressLoaded += chunk.length;
        sendProgress(id, progressLoaded, total, "running");
      });
      body.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
      body.pipe(writeStream);
    });
    const partRecord = {
      PartNumber: partNumber,
      size,
    };
    completedParts.set(partNumber, partRecord);
    parentPort.postMessage({
      type: "download-part-complete",
      id,
      part: partRecord,
      total,
      etag,
      partSize: normalizedPartSize,
    });
  };

  const running = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const task = downloadPart(partNumber);
    running.push(task);
    task.finally(() => {
      const idx = running.indexOf(task);
      if (idx >= 0) running.splice(idx, 1);
    });
    if (running.length >= concurrency) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);

  const actualSize = fs.statSync(dest).size;
  if (actualSize !== total) {
    throw new Error(`Download verification failed: local size ${actualSize} does not match remote size ${total}`);
  }

  parentPort.postMessage({
    type: "done",
    id,
    total,
    verification: {
      ok: true,
      method: "size",
      expectedSize: total,
      actualSize,
      etag,
    },
  });
}

parentPort.on("message", async (msg) => {
  try {
    if (msg.type === "upload") {
      await handleUpload(msg);
    }
    if (msg.type === "download") {
      await handleDownload(msg);
    }
  } catch (err) {
    parentPort.postMessage({
      type: "error",
      id: msg.id,
      uploadId: msg.uploadId,
      error: err && err.message ? err.message : String(err),
      errorDetails: {
        operation: msg.type || "",
        bucket: msg.bucket || "",
        key: msg.key || "",
        requestId: err?.$metadata?.requestId || "",
        httpStatus: err?.$metadata?.httpStatusCode || "",
        type: err?.name || "",
        message: err?.message || String(err),
      },
    });
  }
});
