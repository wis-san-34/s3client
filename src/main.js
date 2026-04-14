const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { Worker } = require("worker_threads");
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const { ResumeStore, TransferHistoryStore, ConfigStore } = require("./store");
const {
  PRIORITY_WEIGHT,
  chunkArray,
  clampConcurrency,
  clampPartSize,
  getMaxRetries,
  getRetryDelayMs,
  normalizeQueuePriority,
  sanitizeRelativePath,
} = require("./transferShared");
const {
  normalizeError,
  validateIpcPayload,
  snapshotConnection,
  renderableTransfer,
  persistentTransferSnapshot,
  createTransferPayload,
  buildErrorDetails,
} = require("./mainUtils");

let mainWindow;
const transfers = new Map();
const pendingTransfers = [];
const fsp = fs.promises;
let dataDir = "";
let resumeStore = null;
let transferHistoryStore = null;
let configStore = null;
let _schedulingInProgress = false;

const DEFAULT_MAX_ACTIVE_TRANSFERS = 3;
const DEFAULT_MAX_ACTIVE_UPLOADS = 2;
const DEFAULT_MAX_ACTIVE_DOWNLOADS = 2;

function getMaxActiveTransfers() {
  try {
    ensureStores();
    const active = configStore.getActiveConnection({ includeSecret: false });
    const fromConfig = Number.parseInt(`${active?.maxActiveTransfers ?? ""}`, 10);
    if (Number.isFinite(fromConfig) && fromConfig >= 1) return Math.min(fromConfig, 16);
  } catch (err) {
    // Ignore config lookup errors and fallback to env/default.
  }
  const fromEnv = Number.parseInt(process.env.S3_MAX_ACTIVE_TRANSFERS || "", 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.min(fromEnv, 16);
  return DEFAULT_MAX_ACTIVE_TRANSFERS;
}

function getMaxActiveUploads() {
  try {
    ensureStores();
    const active = configStore.getActiveConnection({ includeSecret: false });
    const fromConfig = Number.parseInt(`${active?.maxActiveUploads ?? ""}`, 10);
    if (Number.isFinite(fromConfig) && fromConfig >= 1) return Math.min(fromConfig, 16);
  } catch (err) {
    // Ignore config lookup errors and fallback to env/default.
  }
  const fromEnv = Number.parseInt(process.env.S3_MAX_ACTIVE_UPLOADS || "", 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.min(fromEnv, 16);
  return DEFAULT_MAX_ACTIVE_UPLOADS;
}

function getMaxActiveDownloads() {
  try {
    ensureStores();
    const active = configStore.getActiveConnection({ includeSecret: false });
    const fromConfig = Number.parseInt(`${active?.maxActiveDownloads ?? ""}`, 10);
    if (Number.isFinite(fromConfig) && fromConfig >= 1) return Math.min(fromConfig, 16);
  } catch (err) {
    // Ignore config lookup errors and fallback to env/default.
  }
  const fromEnv = Number.parseInt(process.env.S3_MAX_ACTIVE_DOWNLOADS || "", 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.min(fromEnv, 16);
  return DEFAULT_MAX_ACTIVE_DOWNLOADS;
}

function ensureStores() {
  if (resumeStore && transferHistoryStore && configStore) return;
  if (!app || typeof app.getPath !== "function") {
    throw new Error("Electron app module is unavailable. Run this project with Electron.");
  }
  dataDir = path.join(app.getPath("userData"), "s3-desktop");
  resumeStore = new ResumeStore(path.join(dataDir, "resume.json"));
  transferHistoryStore = new TransferHistoryStore(path.join(dataDir, "transfer-history.json"));
  configStore = new ConfigStore(path.join(dataDir, "config.json"));
}


function normalizeTransferSettings(connection) {
  return {
    partSize: clampPartSize(connection.partSize || 8 * 1024 * 1024),
    concurrency: clampConcurrency(connection.concurrency || 2),
  };
}


function buildS3Client(connection) {
  ensureStores();
  const cfg = connection || configStore.getActiveConnection();
  if (!cfg || !cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
    throw new Error("Missing endpoint or credentials");
  }
  return new S3Client({
    region: cfg.region || "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

async function listAllBucketObjects({ bucket, prefix = "" }) {
  const client = buildS3Client();
  const objects = [];
  let continuationToken = undefined;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    (res.Contents || []).forEach((item) => {
      if (!item?.Key) return;
      if (item.Key.endsWith("/") && (!item.Size || item.Size === 0)) return;
      objects.push({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
      });
    });
    continuationToken = res.NextContinuationToken || undefined;
  } while (continuationToken);
  return objects;
}

async function softDeleteObjects(client, bucket, keys, activeConnection) {
  const softDeleteEnabled = Boolean(activeConnection?.softDeleteEnabled);
  if (!softDeleteEnabled) return;
  const trashPrefix = (activeConnection?.trashPrefix || ".trash/").replace(/^\/+/, "");
  const safePrefix = trashPrefix.endsWith("/") ? trashPrefix : `${trashPrefix}/`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: `${safePrefix}${stamp}/${key}`,
        CopySource: `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
      })
    );
  }
}

async function deleteObjectsInBatches(client, bucket, keys) {
  for (const chunk of chunkArray(keys, 1000)) {
    if (chunk.length === 1) {
      // eslint-disable-next-line no-await-in-loop
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: chunk[0] }));
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: true,
        },
      })
    );
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    icon: path.join(__dirname, "../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function createAppMenu() {
  const versionLabel = `Version ${app.getVersion()}`;
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: versionLabel, enabled: false },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}


function publishTransferUpdate(transfer) {
  if (!transfer) return;
  ensureStores();
  transfer.updatedAt = new Date().toISOString();
  transferHistoryStore.upsert(persistentTransferSnapshot(transfer));
  sendToRenderer("transfer-update", renderableTransfer(transfer));
}

function removePendingTransfer(id) {
  const index = pendingTransfers.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    pendingTransfers.splice(index, 1);
  }
}

function queueTransferJob(transfer, payload, connection, { priority = "normal", immediate = false } = {}) {
  const normalizedPriority = normalizeQueuePriority(immediate ? "high" : priority);
  removePendingTransfer(transfer.id);
  transfer.queuePriority = normalizedPriority;
  transfer.connection = snapshotConnection(connection);
  transfer.error = "";
  transfer.errorDetails = null;
  transfer.nextRetryAt = null;
  transfer.state = "queued";
  pendingTransfers.push({
    id: transfer.id,
    type: transfer.type,
    payload,
    connection,
    priority: normalizedPriority,
    createdAt: Date.now(),
  });
  publishTransferUpdate(transfer);
}


function mergeTransferList() {
  ensureStores();
  const activeMap = new Map();
  Array.from(transfers.values()).forEach((transfer) => {
    activeMap.set(transfer.id, renderableTransfer(transfer));
  });
  transferHistoryStore.list().forEach((entry) => {
    if (!activeMap.has(entry.id)) {
      activeMap.set(entry.id, entry);
    }
  });
  return Array.from(activeMap.values());
}


function sendToRenderer(channel, payload) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getActiveTransferCount() {
  let count = 0;
  transfers.forEach((transfer) => {
    if (transfer?.state === "running" && transfer?.worker) {
      count += 1;
    }
  });
  return count;
}

function getActiveTransferCountByType(type) {
  let count = 0;
  transfers.forEach((transfer) => {
    if (transfer?.type === type && transfer?.state === "running" && transfer?.worker) {
      count += 1;
    }
  });
  return count;
}

function dequeueNextTransferJob() {
  if (!pendingTransfers.length) return null;
  pendingTransfers.sort((a, b) => {
    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.createdAt - b.createdAt;
  });
  return pendingTransfers.shift() || null;
}

function launchTransferWorker(transfer, job, cfg) {
  const { partSize, concurrency } = normalizeTransferSettings(cfg);
  if (job.type === "upload") {
    const { filePath, key, bucket } = job.payload;
    const resumeInfo = resumeStore.getUpload({ bucket, key, filePath });
    const loadedFromResume = resumeInfo?.parts?.reduce((acc, p) => acc + (p.size || 0), 0) || 0;
    transfer.filePath = filePath;
    transfer.key = key;
    transfer.bucket = bucket;
    transfer.type = "upload";
    transfer.loaded = loadedFromResume;
    transfer.total = resumeInfo?.fileSize;
    transfer.connection = snapshotConnection(cfg);
    transfer.state = "running";
    transfer.queuePriority = normalizeQueuePriority(job.priority);
    transfer.error = "";
    transfer.startedAt = transfer.startedAt || new Date().toISOString();
    transfer.endedAt = null;

    const worker = new Worker(path.join(__dirname, "transferWorker.js"));
    wireWorkerEvents(transfer.id, worker, { filePath, key, bucket, partSize, type: "upload" });
    worker.postMessage({
      type: "upload",
      id: transfer.id,
      bucket,
      key,
      filePath,
      uploadId: resumeInfo?.uploadId,
      endpoint: cfg.endpoint,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region || "auto",
      partSize,
      concurrency,
      resumeInfo,
    });
    transfer.worker = worker;
    publishTransferUpdate(transfer);
    return;
  }

  if (job.type === "download") {
    const { key, bucket, dest } = job.payload;
    const resumeInfo = resumeStore.getDownload({ bucket, key, filePath: dest });
    const effectivePartSize = clampPartSize(resumeInfo?.partSize || partSize);
    const loadedFromResume = resumeInfo?.parts?.reduce((acc, p) => acc + (p.size || 0), 0) || 0;
    const existingSize = fs.existsSync(dest) ? fs.statSync(dest).size : 0;

    transfer.key = key;
    transfer.bucket = bucket;
    transfer.dest = dest;
    transfer.type = "download";
    transfer.loaded = loadedFromResume || existingSize;
    transfer.total = resumeInfo?.total;
    transfer.connection = snapshotConnection(cfg);
    transfer.state = "running";
    transfer.queuePriority = normalizeQueuePriority(job.priority);
    transfer.error = "";
    transfer.startedAt = transfer.startedAt || new Date().toISOString();
    transfer.endedAt = null;

    const worker = new Worker(path.join(__dirname, "transferWorker.js"));
    wireWorkerEvents(transfer.id, worker, { bucket, key, filePath: dest, type: "download" });
    worker.postMessage({
      type: "download",
      id: transfer.id,
      bucket,
      key,
      dest,
      endpoint: cfg.endpoint,
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region || "auto",
      partSize: effectivePartSize,
      concurrency,
      resumeInfo,
      existingSize,
    });
    transfer.worker = worker;
    publishTransferUpdate(transfer);
  }
}

function scheduleQueuedTransfers() {
  // Guard against concurrent re-entrant calls (e.g. a worker completion event
  // firing while we are already mid-loop), which could dequeue the same job twice.
  if (_schedulingInProgress) return;
  _schedulingInProgress = true;
  try {
    ensureStores();
    const globalLimit = getMaxActiveTransfers();
    const uploadLimit = getMaxActiveUploads();
    const downloadLimit = getMaxActiveDownloads();
    while (getActiveTransferCount() < globalLimit) {
      const queued = dequeueNextTransferJob();
      if (!queued) break;
      if (
        (queued.type === "upload" && getActiveTransferCountByType("upload") >= uploadLimit) ||
        (queued.type === "download" && getActiveTransferCountByType("download") >= downloadLimit)
      ) {
        pendingTransfers.push(queued);
        const hasRunnable = pendingTransfers.some((entry) => {
          if (entry.type === "upload") return getActiveTransferCountByType("upload") < uploadLimit;
          if (entry.type === "download") return getActiveTransferCountByType("download") < downloadLimit;
          return true;
        });
        if (!hasRunnable) break;
        continue;
      }
      const transfer = transfers.get(queued.id);
      if (!transfer) continue;
      const cfg = queued.connection || configStore.getActiveConnection();
      if (!cfg || !cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) {
        transfer.state = "error";
        transfer.error = "Missing endpoint or credentials";
        transfer.endedAt = new Date().toISOString();
        publishTransferUpdate(transfer);
        transfers.delete(transfer.id);
        continue;
      }
      launchTransferWorker(transfer, queued, cfg);
    }
  } finally {
    _schedulingInProgress = false;
  }
}

function enqueueOrStartTransfer({ id, type, payload, connection, priority = "normal", immediate = false }) {
  ensureStores();
  const existing = transfers.get(id);
  const transfer = existing || {
    id,
    createdAt: new Date().toISOString(),
  };
  transfer.type = type;
  transfer.key = payload.key;
  transfer.bucket = payload.bucket;
  transfer.filePath = payload.filePath;
  transfer.dest = payload.dest;
  transfer.loaded = existing?.state === "paused" ? existing.loaded || 0 : 0;
  transfer.total = existing?.state === "paused" ? existing.total || null : null;
  transfer.retryCount = existing?.retryCount || 0;
  transfer.maxRetries = getMaxRetries(payload?.maxRetries);
  transfer.startedAt = null;
  transfer.endedAt = null;
  transfers.set(id, transfer);
  queueTransferJob(transfer, payload, connection, { priority, immediate });
  scheduleQueuedTransfers();
  return transfer;
}

function wireWorkerEvents(id, worker, meta) {
  worker.on("message", (msg) => {
    if (msg.type === "progress") {
      const transfer = transfers.get(id);
      if (!transfer) return;
      transfer.loaded = msg.loaded;
      transfer.total = msg.total;
      transfer.state = msg.state;
      publishTransferUpdate(transfer);
    }

    if (msg.type === "upload-started") {
      const transfer = transfers.get(id);
      if (transfer) {
        transfer.uploadId = msg.uploadId;
      }
      resumeStore.setUpload(
        { bucket: meta.bucket, key: meta.key, filePath: meta.filePath },
        {
          bucket: meta.bucket,
          key: meta.key,
          filePath: meta.filePath,
          uploadId: msg.uploadId,
          partSize: meta.partSize,
          parts: [],
          fileSize: msg.total,
        }
      );
    }

    if (msg.type === "part-complete") {
      const resumeInfo = resumeStore.getUpload({
        bucket: meta.bucket,
        key: meta.key,
        filePath: meta.filePath,
      });
      if (resumeInfo) {
        resumeInfo.parts = resumeInfo.parts || [];
        resumeInfo.parts.push({
          PartNumber: msg.part.PartNumber,
          ETag: msg.part.ETag,
          size: msg.part.size,
        });
        resumeStore.setUpload(
          { bucket: meta.bucket, key: meta.key, filePath: meta.filePath },
          resumeInfo
        );
      }
    }

    if (msg.type === "download-started") {
      const transfer = transfers.get(id);
      if (transfer) {
        transfer.total = msg.total;
      }
      resumeStore.setDownload(
        { bucket: meta.bucket, key: meta.key, filePath: meta.filePath },
        {
          bucket: meta.bucket,
          key: meta.key,
          filePath: meta.filePath,
          partSize: msg.partSize,
          total: msg.total,
          etag: msg.etag,
          parts: msg.parts || [],
        }
      );
    }

    if (msg.type === "download-part-complete") {
      const resumeKey = { bucket: meta.bucket, key: meta.key, filePath: meta.filePath };
      const resumeInfo =
        resumeStore.getDownload(resumeKey) ||
        {
          bucket: meta.bucket,
          key: meta.key,
          filePath: meta.filePath,
          partSize: msg.partSize,
          total: msg.total,
          etag: msg.etag,
          parts: [],
        };
      const parts = Array.isArray(resumeInfo.parts) ? resumeInfo.parts : [];
      const existingIndex = parts.findIndex((p) => p.PartNumber === msg.part.PartNumber);
      if (existingIndex >= 0) {
        parts[existingIndex] = msg.part;
      } else {
        parts.push(msg.part);
      }
      resumeInfo.parts = parts;
      resumeStore.setDownload(resumeKey, resumeInfo);
    }

    if (msg.type === "done") {
      const transfer = transfers.get(id);
      if (transfer && transfer.type === "upload") {
        resumeStore.clearUpload({
          bucket: transfer.bucket,
          key: transfer.key,
          filePath: transfer.filePath,
        });
      }
      if (transfer && transfer.type === "download") {
        resumeStore.clearDownload({
          bucket: transfer.bucket,
          key: transfer.key,
          filePath: transfer.dest,
        });
      }
      if (transfer) {
        transfer.state = "done";
        transfer.loaded = transfer.total || msg.total;
        transfer.endedAt = new Date().toISOString();
      }
      publishTransferUpdate(transfer);
      worker.terminate();
      if (transfer) transfer.worker = null;
      transfers.delete(id);
      scheduleQueuedTransfers();
    }

    if (msg.type === "error") {
      const transfer = transfers.get(id);
      if (transfer) {
        transfer.retryCount = transfer.retryCount || 0;
        transfer.maxRetries = getMaxRetries(transfer.maxRetries);
        transfer.error = msg.error;
        transfer.errorDetails = msg.errorDetails || null;
        if (transfer.retryCount < transfer.maxRetries) {
          transfer.retryCount += 1;
          const delay = getRetryDelayMs(transfer.retryCount);
          transfer.state = "retrying";
          transfer.nextRetryAt = new Date(Date.now() + delay).toISOString();
          publishTransferUpdate(transfer);
          worker.terminate();
          transfer.worker = null;
          setTimeout(() => {
            const queuedTransfer = transfers.get(id);
            if (!queuedTransfer) return;
            const payload = createTransferPayload(queuedTransfer);
            if (!payload) return;
            queueTransferJob(queuedTransfer, payload, queuedTransfer.connection, {
              priority: "high",
              immediate: true,
            });
            scheduleQueuedTransfers();
          }, delay);
          return;
        }
        transfer.state = "error";
        transfer.endedAt = new Date().toISOString();
      }
      publishTransferUpdate(transfer);
      worker.terminate();
      if (transfer) transfer.worker = null;
      transfers.delete(id);
      scheduleQueuedTransfers();
    }
  });
}

function startUpload({ filePath, key, bucket, id: existingId, connection, priority, immediate }) {
  ensureStores();
  const cfg = connection || configStore.getActiveConnection();
  const id = existingId || uid();
  return enqueueOrStartTransfer({
    id,
    type: "upload",
    payload: { filePath, key, bucket, maxRetries: cfg?.maxRetries },
    connection: cfg,
    priority,
    immediate,
  });
}

function startDownload({ key, bucket, dest, id: existingId, connection, priority, immediate }) {
  ensureStores();
  const cfg = connection || configStore.getActiveConnection();
  const id = existingId || uid();
  return enqueueOrStartTransfer({
    id,
    type: "download",
    payload: { key, bucket, dest, maxRetries: cfg?.maxRetries },
    connection: cfg,
    priority,
    immediate,
  });
}

async function abortMultipartUpload(transfer) {
  if (!transfer) return;
  try {
    const resumeInfo =
      resumeStore.getUpload({
        bucket: transfer.bucket,
        key: transfer.key,
        filePath: transfer.filePath,
      }) || {};
    const uploadId = transfer.uploadId || resumeInfo.uploadId;
    if (!uploadId) return;
    const client = buildS3Client(transfer.connection || null);
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: transfer.bucket,
        Key: transfer.key,
        UploadId: uploadId,
      })
    );
  } catch (err) {
    console.warn("Failed to abort multipart upload", err);
  }
}

app.whenReady().then(() => {
  ensureStores();
  app.setAppUserModelId("com.example.s3client");
  createAppMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("config:get", () => {
  ensureStores();
  return configStore.getState();
});
ipcMain.handle("config:save", (_evt, payload) => {
  ensureStores();
  configStore.update(payload);
  return configStore.getState();
});
ipcMain.handle("connection:save", (_evt, payload) => {
  validateIpcPayload(payload, ["endpoint", "accessKeyId"]);
  ensureStores();
  return configStore.upsertConnection(payload);
});
ipcMain.handle("connection:setActive", (_evt, id) => {
  if (!id || typeof id !== "string") throw new Error("Invalid payload: connection id is required");
  ensureStores();
  configStore.setActiveConnection(id);
  return configStore.getState();
});
ipcMain.handle("connection:list", () => {
  ensureStores();
  return configStore.getState();
});
ipcMain.handle("connection:delete", (_evt, id) => {
  if (!id || typeof id !== "string") throw new Error("Invalid payload: connection id is required");
  ensureStores();
  configStore.removeConnection(id);
  return configStore.getState();
});
ipcMain.handle("connection:listAvailableBuckets", async () => {
  try {
    const client = buildS3Client();
    const result = await client.send(new ListBucketsCommand({}));
    return (result.Buckets || []).map((b) => ({
      name: b.Name,
      creationDate: b.CreationDate,
    }));
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to list buckets"));
  }
});

ipcMain.handle("file:pick", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openFile"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("dir:pick", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("path:downloads", () => app.getPath("downloads"));

function getWindowsVolumeNames() {
  // Use execFile to avoid shell escaping issues. PowerShell's Get-Volume is
  // reliable on Windows 10/11 and outputs one "LETTER=Label" line per drive.
  return new Promise((resolve) => {
    execFile(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='SilentlyContinue'; Get-Volume | Where-Object { $_.DriveLetter } | ForEach-Object { $_.DriveLetter + '=' + $_.FileSystemLabel }",
      ],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) { resolve({}); return; }
        const result = {};
        for (const line of stdout.split(/\r?\n/)) {
          const trimmed = line.trim();
          const eq = trimmed.indexOf("=");
          if (eq > 0 && /^[A-Z]$/i.test(trimmed[0])) {
            result[trimmed[0].toUpperCase()] = trimmed.slice(eq + 1).trim();
          }
        }
        resolve(result);
      }
    );
  });
}

ipcMain.handle("local:listRoots", async () => {
  if (process.platform === "win32") {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const activeDrives = [];
    for (const letter of letters) {
      const drivePath = `${letter}:\\`;
      try {
        // eslint-disable-next-line no-await-in-loop
        await fsp.access(drivePath, fs.constants.F_OK);
        activeDrives.push({ letter, path: drivePath });
      } catch {
        // Ignore missing drives.
      }
    }
    const volumeNames = await getWindowsVolumeNames().catch(() => ({}));
    return activeDrives.map(({ letter, path: drivePath }) => {
      const volName = volumeNames[letter];
      return { label: volName ? `${letter}: (${volName})` : `${letter}:`, path: drivePath };
    });
  }

  return [{ label: "/", path: "/" }];
});

ipcMain.handle("local:list", async (_evt, payload) => {
  const requested = typeof payload?.path === "string" && payload.path.trim() ? payload.path.trim() : os.homedir();
  let targetPath = requested;
  try {
    const stats = await fsp.stat(targetPath);
    if (!stats.isDirectory()) {
      targetPath = path.dirname(targetPath);
    }
  } catch {
    targetPath = os.homedir();
  }
  let entries = [];
  try {
    const dirents = await fsp.readdir(targetPath, { withFileTypes: true });
    entries = await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = path.join(targetPath, dirent.name);
        let size = null;
        let modified = null;
        try {
          const stats = await fsp.stat(fullPath);
          if (stats.isFile()) {
            size = stats.size;
          }
          modified = stats.mtime;
        } catch {
          /* ignore stat errors */
        }
        return {
          name: dirent.name,
          fullPath,
          isDirectory: dirent.isDirectory(),
          size,
          modified,
        };
      })
    );
  } catch (err) {
    return {
      path: targetPath,
      parentPath: path.dirname(targetPath),
      entries: [],
      error: err.message,
    };
  }

  entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const parsed = path.parse(targetPath);
  const parentPath = targetPath === parsed.root ? null : path.dirname(targetPath);
  return { path: targetPath, parentPath, entries };
});

ipcMain.handle("local:getEntryMeta", async (_evt, payload) => {
  const fullPath = payload?.path;
  if (!fullPath) throw new Error("Path is required.");
  const stats = await fsp.stat(fullPath);
  return {
    name: path.basename(fullPath),
    fullPath,
    isDirectory: stats.isDirectory(),
    size: stats.isFile() ? stats.size : null,
    modified: stats.mtime,
  };
});

ipcMain.handle("local:createFolder", async (_evt, payload) => {
  validateIpcPayload(payload, ["parentPath", "name"]);
  const parentPath = payload.parentPath;
  const rawName = payload.name;
  const sanitized = rawName.replace(/[\\/]/g, "").trim();
  if (!sanitized) throw new Error("Folder name is invalid.");
  const target = path.join(parentPath, sanitized);
  await fsp.mkdir(target, { recursive: false });
  return { fullPath: target };
});

ipcMain.handle("local:deleteEntry", async (_evt, payload) => {
  validateIpcPayload(payload, ["fullPath"]);
  const fullPath = payload.fullPath;
  const permanent = Boolean(payload?.permanent);
  if (permanent) {
    await fsp.rm(fullPath, { recursive: true, force: true });
    return { success: true, mode: "permanent" };
  }
  await shell.trashItem(fullPath);
  return { success: true, mode: "trash" };
});

ipcMain.handle("local:renameEntry", async (_evt, payload) => {
  validateIpcPayload(payload, ["fullPath", "newName"]);
  const { fullPath, newName: newNameRaw } = payload;
  const sanitized = newNameRaw.replace(/[\\/]/g, "").trim();
  if (!sanitized) throw new Error("New name is invalid.");
  const newPath = path.join(path.dirname(fullPath), sanitized);
  await fsp.rename(fullPath, newPath);
  return { fullPath: newPath };
});

ipcMain.handle("local:openExternal", async (_evt, payload) => {
  validateIpcPayload(payload, ["path"]);
  const targetPath = payload.path;
  const result = await shell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }
  return { success: true };
});

ipcMain.handle("upload:start", (_evt, payload) => {
  validateIpcPayload(payload, ["filePath", "key", "bucket"]);
  return renderableTransfer(startUpload(payload));
});
ipcMain.handle("download:start", (_evt, payload) => {
  validateIpcPayload(payload, ["key", "bucket", "dest"]);
  return renderableTransfer(startDownload(payload));
});
ipcMain.handle("transfers:list", () => {
  const queuedOrder = new Map(pendingTransfers.map((item, idx) => [item.id, idx]));
  const list = mergeTransferList();
  list.sort((a, b) => {
    if (a.state === "queued" && b.state === "queued") {
      return (queuedOrder.get(a.id) ?? 0) - (queuedOrder.get(b.id) ?? 0);
    }
    if (a.state === "queued") return 1;
    if (b.state === "queued") return -1;
    return 0;
  });
  return list.map(renderableTransfer);
});

ipcMain.handle("transfer:clearFinished", () => {
  ensureStores();
  transferHistoryStore.clearTerminal();
  return mergeTransferList().map(renderableTransfer);
});
ipcMain.handle("bucket:list", async (_evt, payload) => {
  try {
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload?.bucket || active.bucket;
    const prefix = payload?.prefix || "";
    const maxKeys = payload?.maxKeys || 200;
    const delimiter = payload?.delimiter || undefined;
    if (!bucket) throw new Error("Bucket is required");

    const client = buildS3Client();
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: payload?.continuationToken,
        MaxKeys: maxKeys,
        Delimiter: delimiter,
      })
    );

    const items = (res.Contents || []).map((obj) => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
    }));

    const folders = (res.CommonPrefixes || []).map((entry) => entry.Prefix).filter(Boolean);

    return {
      items,
      prefixes: folders,
      nextContinuationToken: res.NextContinuationToken || null,
      metrics: {
        bucket,
        objectCount: res.KeyCount || items.length,
        totalSize: (res.Contents || []).reduce((acc, obj) => acc + (obj.Size || 0), 0),
        truncated: res.IsTruncated || false,
      },
    };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to list bucket contents"));
  }
});

ipcMain.handle("bucket:delete", async (_evt, payload) => {
  try {
    validateIpcPayload(payload, ["key"]);
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload.bucket || active.bucket;
    const key = payload.key;
    if (!bucket) throw new Error("Bucket is required");
    const client = buildS3Client();
    await softDeleteObjects(client, bucket, [key], active);
    await deleteObjectsInBatches(client, bucket, [key]);
    return { success: true };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to delete object"));
  }
});

ipcMain.handle("bucket:listAll", async (_evt, payload) => {
  try {
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload?.bucket || active.bucket;
    const prefix = payload?.prefix || "";
    if (!bucket) throw new Error("Bucket is required");
    return {
      items: await listAllBucketObjects({ bucket, prefix }),
    };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to list bucket objects"));
  }
});

ipcMain.handle("bucket:deleteMany", async (_evt, payload) => {
  try {
    if (!payload || !Array.isArray(payload?.keys) || !payload.keys.length) {
      throw new Error("Invalid payload: keys must be a non-empty array");
    }
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload.bucket || active.bucket;
    const keys = Array.from(new Set(payload.keys.filter(Boolean)));
    if (!bucket || !keys.length) throw new Error("Bucket and keys are required");
    const client = buildS3Client();
    await softDeleteObjects(client, bucket, keys, active);
    await deleteObjectsInBatches(client, bucket, keys);
    return { success: true, deleted: keys.length };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to delete objects"));
  }
});

ipcMain.handle("bucket:rename", async (_evt, payload) => {
  try {
    validateIpcPayload(payload, ["key", "newKey"]);
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload.bucket || active.bucket;
    const sourceKey = payload.key;
    const destinationKey = payload.newKey;
    if (!bucket) throw new Error("Bucket is required");
    const client = buildS3Client();
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destinationKey,
        CopySource: `/${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, "/")}`,
      })
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: sourceKey }));
    return { success: true };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to rename object"));
  }
});

ipcMain.handle("bucket:createFolder", async (_evt, payload) => {
  try {
    validateIpcPayload(payload, ["name"]);
    ensureStores();
    const active = configStore.getActiveConnection();
    const bucket = payload.bucket || active.bucket;
    const prefix = payload.prefix || "";
    const rawName = payload.name;
    if (!bucket || !rawName.trim()) throw new Error("Bucket and folder name are required.");
    const sanitizedName = rawName.replace(/^\/+|\/+$/g, "").replace(/[\\]/g, "").trim();
    if (!sanitizedName) throw new Error("Folder name is invalid.");
    const normalizedPrefix = prefix ? prefix.replace(/^\/+/, "") : "";
    const base = normalizedPrefix && !normalizedPrefix.endsWith("/") ? `${normalizedPrefix}/` : normalizedPrefix;
    let key = `${base || ""}${sanitizedName}`;
    if (!key.endsWith("/")) key += "/";
    const client = buildS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "",
      })
    );
    return { success: true };
  } catch (err) {
    throw new Error(normalizeError(err, "Unable to create folder"));
  }
});

ipcMain.handle("transfer:cancel", async (_evt, id) => {
  const transfer = transfers.get(id);
  if (!transfer) return { success: false };
  removePendingTransfer(id);
  if (transfer.worker) {
    transfer.worker.terminate();
    transfer.worker = null;
  }
  transfer.state = "cancelled";
  transfer.endedAt = new Date().toISOString();
  publishTransferUpdate(transfer);
  if (transfer.type === "upload") {
    await abortMultipartUpload(transfer);
    resumeStore.clearUpload({
      bucket: transfer.bucket,
      key: transfer.key,
      filePath: transfer.filePath,
    });
  } else if (transfer.type === "download") {
    resumeStore.clearDownload({
      bucket: transfer.bucket,
      key: transfer.key,
      filePath: transfer.dest,
    });
  }
  transfers.delete(id);
  scheduleQueuedTransfers();
  return { success: true };
});

ipcMain.handle("transfer:pause", (_evt, id) => {
  const transfer = transfers.get(id);
  if (transfer?.worker) {
    transfer.worker.terminate();
    transfer.worker = null;
    transfer.state = "paused";
    publishTransferUpdate(transfer);
    scheduleQueuedTransfers();
  }
});

ipcMain.handle("transfer:resume", (_evt, id) => {
  const transfer = transfers.get(id);
  if (!transfer) return null;
  const queuedIndex = pendingTransfers.findIndex((entry) => entry.id === id);
  if (queuedIndex >= 0) {
    pendingTransfers[queuedIndex].priority = "high";
    pendingTransfers[queuedIndex].createdAt = Date.now();
    transfer.queuePriority = "high";
    transfer.state = "queued";
    publishTransferUpdate(transfer);
    scheduleQueuedTransfers();
    return renderableTransfer(transfer);
  }
  if (transfer.type === "upload") {
    return renderableTransfer(
      startUpload({
        filePath: transfer.filePath,
        key: transfer.key,
        bucket: transfer.bucket,
        id: transfer.id,
        connection: transfer.connection,
        priority: "high",
        immediate: true,
      })
    );
  }
  if (transfer.type === "download") {
    return renderableTransfer(
      startDownload({
        key: transfer.key,
        bucket: transfer.bucket,
        dest: transfer.dest,
        id: transfer.id,
        connection: transfer.connection,
        priority: "high",
        immediate: true,
      })
    );
  }
  return null;
});

ipcMain.handle("transfer:retry", (_evt, payload) => {
  ensureStores();
  if (!payload || !payload.type || !payload.bucket || !payload.key) {
    throw new Error("Invalid transfer payload for retry");
  }
  if (payload.type === "upload") {
    if (!payload.filePath) throw new Error("Upload retry requires filePath");
    return renderableTransfer(
      startUpload({
        filePath: payload.filePath,
        key: payload.key,
        bucket: payload.bucket,
        connection: payload.connection || null,
        priority: "high",
      })
    );
  }
  if (payload.type === "download") {
    if (!payload.dest) throw new Error("Download retry requires destination path");
    return renderableTransfer(
      startDownload({
        key: payload.key,
        bucket: payload.bucket,
        dest: payload.dest,
        connection: payload.connection || null,
        priority: "high",
      })
    );
  }
  throw new Error(`Unsupported transfer type: ${payload.type}`);
});

ipcMain.handle("transfer:priority", (_evt, payload) => {
  const id = payload?.id;
  const priority = normalizeQueuePriority(payload?.priority);
  if (!id) return null;
  const transfer = transfers.get(id);
  if (!transfer) return null;
  transfer.queuePriority = priority;
  const queued = pendingTransfers.find((entry) => entry.id === id);
  if (queued) {
    queued.priority = priority;
    queued.createdAt = Date.now();
    transfer.state = "queued";
    publishTransferUpdate(transfer);
    scheduleQueuedTransfers();
    return renderableTransfer(transfer);
  }
  return renderableTransfer(transfer);
});

ipcMain.handle("transfer:reorder", (_evt, payload) => {
  const id = payload?.id;
  const targetIndex = Number.parseInt(`${payload?.targetIndex ?? ""}`, 10);
  if (!id || !Number.isFinite(targetIndex)) return null;
  const from = pendingTransfers.findIndex((entry) => entry.id === id);
  if (from < 0) return null;
  const [item] = pendingTransfers.splice(from, 1);
  const clamped = Math.max(0, Math.min(targetIndex, pendingTransfers.length));
  pendingTransfers.splice(clamped, 0, item);
  item.createdAt = Date.now();
  scheduleQueuedTransfers();
  return { success: true };
});

ipcMain.handle("transfer:queueBulkDownloads", (_evt, payload) => {
  if (!payload || !Array.isArray(payload?.items) || !payload.items.length) {
    throw new Error("Invalid payload: items must be a non-empty array");
  }
  if (!payload.destinationRoot) {
    throw new Error("Invalid payload: destinationRoot is required");
  }
  ensureStores();
  const active = configStore.getActiveConnection();
  const bucket = payload.bucket || active?.bucket;
  const destinationRoot = payload.destinationRoot;
  const items = payload.items;
  if (!bucket) throw new Error("Bucket is required");
  return items.map((item) => {
    const safeRelativePath = sanitizeRelativePath(
      item.relativePath,
      path.basename(item.key || "download.bin")
    );
    const dest = path.join(destinationRoot, ...safeRelativePath.split("/"));
    return renderableTransfer(
      startDownload({
        key: item.key,
        bucket,
        dest,
        connection: active,
        priority: item.priority || "normal",
      })
    );
  });
});
