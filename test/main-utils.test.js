const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeError,
  validateIpcPayload,
  snapshotConnection,
  renderableTransfer,
  persistentTransferSnapshot,
  createTransferPayload,
  buildErrorDetails,
} = require("../src/mainUtils");

// -- normalizeError ------------------------------------------------------------

test("normalizeError returns fallback for falsy inputs", () => {
  assert.equal(normalizeError(null), "Unexpected error");
  assert.equal(normalizeError(undefined), "Unexpected error");
  assert.equal(normalizeError(0), "Unexpected error");
  assert.equal(normalizeError(null, "custom fallback"), "custom fallback");
});

test("normalizeError formats plain Error with message and type", () => {
  const err = new Error("Connection refused");
  const result = normalizeError(err);
  assert.ok(result.includes("Connection refused"), "should include message");
  assert.ok(result.includes("type=Error"), "should append type when name not in message");
});

test("normalizeError omits type when message already contains the error name", () => {
  const err = { message: "TypeError: bad input", name: "TypeError" };
  const result = normalizeError(err);
  assert.ok(result.includes("TypeError: bad input"));
  assert.ok(!result.includes("type="), "should not duplicate name in type= suffix");
});

test("normalizeError includes AWS SDK metadata when present", () => {
  const err = {
    message: "Access denied",
    name: "AccessDeniedException",
    $metadata: { httpStatusCode: 403, requestId: "req-abc-123" },
  };
  const result = normalizeError(err);
  assert.ok(result.includes("status=403"));
  assert.ok(result.includes("requestId=req-abc-123"));
});

test("normalizeError handles non-Error string input", () => {
  assert.equal(normalizeError("bare string error"), "bare string error");
});

test("normalizeError omits status/requestId when metadata is absent", () => {
  const err = { message: "oops", name: "OopsError" };
  const result = normalizeError(err);
  assert.ok(!result.includes("status="));
  assert.ok(!result.includes("requestId="));
});

// -- validateIpcPayload --------------------------------------------------------

test("validateIpcPayload throws for null, undefined, array, and string inputs", () => {
  assert.throws(() => validateIpcPayload(null, []), /expected an object/);
  assert.throws(() => validateIpcPayload(undefined, []), /expected an object/);
  assert.throws(() => validateIpcPayload(["a"], ["0"]), /expected an object.*array/);
  assert.throws(() => validateIpcPayload("string", []), /expected an object/);
  assert.throws(() => validateIpcPayload(42, []), /expected an object/);
});

test("validateIpcPayload throws for missing, null, and empty-string fields", () => {
  assert.throws(
    () => validateIpcPayload({ key: "k" }, ["bucket"]),
    /field "bucket" is required/
  );
  assert.throws(
    () => validateIpcPayload({ bucket: null }, ["bucket"]),
    /field "bucket" is required/
  );
  assert.throws(
    () => validateIpcPayload({ bucket: "" }, ["bucket"]),
    /field "bucket" is required/
  );
});

test("validateIpcPayload throws for whitespace-only string fields", () => {
  assert.throws(
    () => validateIpcPayload({ bucket: "   " }, ["bucket"]),
    /must not be blank/
  );
  assert.throws(
    () => validateIpcPayload({ bucket: "\t\n" }, ["bucket"]),
    /must not be blank/
  );
});

test("validateIpcPayload passes for valid string and numeric fields", () => {
  assert.doesNotThrow(() =>
    validateIpcPayload({ bucket: "my-bucket", key: "file.txt" }, ["bucket", "key"])
  );
  assert.doesNotThrow(() => validateIpcPayload({ n: 42 }, ["n"]));
  assert.doesNotThrow(() => validateIpcPayload({ flag: false }, ["flag"]));
});

test("validateIpcPayload validates multiple fields and stops at first failure", () => {
  assert.throws(
    () => validateIpcPayload({ bucket: "b" }, ["bucket", "key"]),
    /field "key" is required/
  );
});

// -- snapshotConnection --------------------------------------------------------

test("snapshotConnection returns null for falsy input", () => {
  assert.equal(snapshotConnection(null), null);
  assert.equal(snapshotConnection(undefined), null);
});

test("snapshotConnection copies exactly the expected fields", () => {
  const conn = {
    endpoint: "https://s3.example.com",
    accessKeyId: "KEY123",
    secretAccessKey: "SECRET456",
    region: "us-east-1",
    rejectUnauthorized: false,
    partSize: 10 * 1024 * 1024,
    concurrency: 4,
    maxActiveTransfers: 3,
    maxActiveUploads: 2,
    maxActiveDownloads: 2,
    maxRetries: 5,
    softDeleteEnabled: true,
    trashPrefix: ".trash/",
    extraField: "should not appear",
  };
  const snap = snapshotConnection(conn);
  assert.equal(snap.endpoint, conn.endpoint);
  assert.equal(snap.accessKeyId, conn.accessKeyId);
  assert.equal(snap.secretAccessKey, conn.secretAccessKey);
  assert.equal(snap.region, "us-east-1");
  assert.equal(snap.rejectUnauthorized, false);
  assert.equal(snap.partSize, conn.partSize);
  assert.equal(snap.concurrency, 4);
  assert.equal(snap.softDeleteEnabled, true);
  assert.equal(snap.trashPrefix, ".trash/");
  assert.ok(!("extraField" in snap), "should not include unknown fields");
});

test("snapshotConnection defaults region to 'auto' when not provided", () => {
  const snap = snapshotConnection({ endpoint: "https://e.com", accessKeyId: "k" });
  assert.equal(snap.region, "auto");
  assert.equal(snap.rejectUnauthorized, true);
});

// -- renderableTransfer --------------------------------------------------------

test("renderableTransfer returns the value unchanged for null/undefined", () => {
  assert.equal(renderableTransfer(null), null);
  assert.equal(renderableTransfer(undefined), undefined);
});

test("renderableTransfer strips the worker property", () => {
  const transfer = { id: "t1", state: "running", worker: { terminate() {} }, key: "f.txt" };
  const result = renderableTransfer(transfer);
  assert.ok(!("worker" in result));
  assert.equal(result.id, "t1");
  assert.equal(result.state, "running");
  assert.equal(result.key, "f.txt");
});

test("renderableTransfer does not mutate the original transfer object", () => {
  const transfer = { id: "t1", worker: {}, key: "f.txt" };
  renderableTransfer(transfer);
  assert.ok("worker" in transfer, "original should still have worker");
});

// -- persistentTransferSnapshot ------------------------------------------------

test("persistentTransferSnapshot returns null for null input", () => {
  assert.equal(persistentTransferSnapshot(null), null);
});

test("persistentTransferSnapshot strips worker and secretAccessKey from nested connection", () => {
  const transfer = {
    id: "t1",
    worker: {},
    connection: {
      endpoint: "https://s3.example.com",
      accessKeyId: "KEY",
      secretAccessKey: "DO_NOT_PERSIST",
    },
  };
  const result = persistentTransferSnapshot(transfer);
  assert.ok(!("worker" in result));
  assert.ok(!("secretAccessKey" in result.connection));
  assert.equal(result.connection.endpoint, "https://s3.example.com");
  assert.equal(result.connection.accessKeyId, "KEY");
});

test("persistentTransferSnapshot handles transfer without connection", () => {
  const transfer = { id: "t1", state: "done", worker: {} };
  const result = persistentTransferSnapshot(transfer);
  assert.equal(result.id, "t1");
  assert.equal(result.state, "done");
  assert.ok(!("worker" in result));
});

// -- createTransferPayload -----------------------------------------------------

test("createTransferPayload returns null for null input and unknown type", () => {
  assert.equal(createTransferPayload(null), null);
  assert.equal(createTransferPayload({ type: "other", key: "k", bucket: "b" }), null);
  assert.equal(createTransferPayload({ type: undefined }), null);
});

test("createTransferPayload returns correct upload payload", () => {
  const transfer = {
    type: "upload",
    filePath: "/tmp/file.txt",
    key: "file.txt",
    bucket: "my-bucket",
    maxRetries: 3,
    extraField: "ignored",
  };
  const payload = createTransferPayload(transfer);
  assert.deepEqual(payload, {
    filePath: "/tmp/file.txt",
    key: "file.txt",
    bucket: "my-bucket",
    maxRetries: 3,
  });
  assert.ok(!("extraField" in payload));
});

test("createTransferPayload returns correct download payload", () => {
  const transfer = {
    type: "download",
    key: "dir/file.txt",
    bucket: "my-bucket",
    dest: "/tmp/file.txt",
    maxRetries: 5,
    filePath: "should not appear",
  };
  const payload = createTransferPayload(transfer);
  assert.deepEqual(payload, {
    key: "dir/file.txt",
    bucket: "my-bucket",
    dest: "/tmp/file.txt",
    maxRetries: 5,
  });
  assert.ok(!("filePath" in payload));
});

// -- buildErrorDetails ---------------------------------------------------------

test("buildErrorDetails returns empty fields for null error and empty context", () => {
  const details = buildErrorDetails(null, {});
  assert.equal(details.operation, "");
  assert.equal(details.bucket, "");
  assert.equal(details.key, "");
  assert.equal(details.requestId, "");
  assert.equal(details.httpStatus, "");
  assert.equal(details.type, "");
  assert.equal(details.message, "Unknown error");
});

test("buildErrorDetails extracts all fields from err and context", () => {
  const err = {
    message: "S3 upload failed",
    name: "S3ServiceException",
    $metadata: { httpStatusCode: 500, requestId: "req-xyz" },
  };
  const details = buildErrorDetails(err, {
    operation: "upload",
    bucket: "my-bucket",
    key: "file.txt",
  });
  assert.equal(details.operation, "upload");
  assert.equal(details.bucket, "my-bucket");
  assert.equal(details.key, "file.txt");
  assert.equal(details.requestId, "req-xyz");
  assert.equal(details.httpStatus, 500);
  assert.equal(details.type, "S3ServiceException");
  assert.equal(details.message, "S3 upload failed");
});

test("buildErrorDetails falls back to context values when err lacks metadata", () => {
  const err = { message: "generic error" };
  const details = buildErrorDetails(err, {
    operation: "download",
    requestId: "fallback-req",
    httpStatus: 503,
    type: "FallbackType",
  });
  assert.equal(details.requestId, "fallback-req");
  assert.equal(details.httpStatus, 503);
  assert.equal(details.type, "FallbackType");
  assert.equal(details.message, "generic error");
});

test("buildErrorDetails uses context message when err has no message", () => {
  const err = { name: "NoMessageError" };
  const details = buildErrorDetails(err, { message: "context fallback message" });
  assert.equal(details.message, "context fallback message");
  assert.equal(details.type, "NoMessageError");
});
