// mainUtils.js
// Pure, Electron-free utility functions extracted from main.js for testability.

/**
 * Format an error object into a human-readable string.
 * @param {unknown} err
 * @param {string} [fallbackMessage]
 * @returns {string}
 */
function normalizeError(err, fallbackMessage = "Unexpected error") {
  if (!err) return fallbackMessage;
  const parts = [];
  const message = err.message || String(err);
  if (message) parts.push(message);
  if (err.name && !message.includes(err.name)) {
    parts.push(`type=${err.name}`);
  }
  if (err.$metadata?.httpStatusCode) {
    parts.push(`status=${err.$metadata.httpStatusCode}`);
  }
  if (err.$metadata?.requestId) {
    parts.push(`requestId=${err.$metadata.requestId}`);
  }
  return parts.join(" | ");
}

/**
 * Validate IPC payload fields.
 * @param {unknown} payload - The payload from the renderer.
 * @param {string[]} required - Field names that must be non-empty strings or numbers.
 * @throws {Error} if any required field is missing or invalid.
 */
function validateIpcPayload(payload, required) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Invalid payload: expected an object, got ${Array.isArray(payload) ? "array" : typeof payload}`);
  }
  for (const field of required) {
    const value = payload[field];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Invalid payload: field "${field}" is required`);
    }
    if (typeof value === "string" && !value.trim()) {
      throw new Error(`Invalid payload: field "${field}" must not be blank`);
    }
  }
}

/**
 * Create a serializable snapshot of a connection object (no methods, no sensitive state beyond secretAccessKey).
 * @param {object|null} connection
 * @returns {object|null}
 */
function snapshotConnection(connection) {
  if (!connection) return null;
  return {
    endpoint: connection.endpoint,
    accessKeyId: connection.accessKeyId,
    secretAccessKey: connection.secretAccessKey,
    region: connection.region || "auto",
    rejectUnauthorized: connection.rejectUnauthorized !== false,
    partSize: connection.partSize,
    concurrency: connection.concurrency,
    maxActiveTransfers: connection.maxActiveTransfers,
    maxActiveUploads: connection.maxActiveUploads,
    maxActiveDownloads: connection.maxActiveDownloads,
    maxRetries: connection.maxRetries,
    softDeleteEnabled: connection.softDeleteEnabled,
    trashPrefix: connection.trashPrefix,
  };
}

/**
 * Strip the non-serializable worker thread reference from a transfer object.
 * @param {object|null|undefined} transfer
 * @returns {object|null|undefined}
 */
function renderableTransfer(transfer) {
  if (!transfer) return transfer;
  const { worker, ...rest } = transfer;
  return rest;
}

/**
 * Create a snapshot of a transfer safe for long-term persistence (no workers, no secrets).
 * @param {object|null} transfer
 * @returns {object|null}
 */
function persistentTransferSnapshot(transfer) {
  if (!transfer) return null;
  const snapshot = renderableTransfer(transfer);
  if (!snapshot) return null;
  if (snapshot.connection) {
    snapshot.connection = {
      ...snapshot.connection,
      secretAccessKey: undefined,
    };
    delete snapshot.connection.secretAccessKey;
  }
  return snapshot;
}

/**
 * Build the worker payload for a transfer job.
 * @param {object|null} transfer
 * @returns {object|null}
 */
function createTransferPayload(transfer) {
  if (!transfer) return null;
  if (transfer.type === "upload") {
    return {
      filePath: transfer.filePath,
      key: transfer.key,
      bucket: transfer.bucket,
      maxRetries: transfer.maxRetries,
    };
  }
  if (transfer.type === "download") {
    return {
      key: transfer.key,
      bucket: transfer.bucket,
      dest: transfer.dest,
      maxRetries: transfer.maxRetries,
    };
  }
  return null;
}

/**
 * Build a structured error detail object from an error and context.
 * @param {unknown} err
 * @param {object} [context]
 * @returns {object}
 */
function buildErrorDetails(err, context = {}) {
  return {
    operation: context.operation || "",
    bucket: context.bucket || "",
    key: context.key || "",
    requestId: err?.$metadata?.requestId || context.requestId || "",
    httpStatus: err?.$metadata?.httpStatusCode || context.httpStatus || "",
    type: err?.name || context.type || "",
    message: err?.message || context.message || String(err || "Unknown error"),
  };
}

module.exports = {
  normalizeError,
  validateIpcPayload,
  snapshotConnection,
  renderableTransfer,
  persistentTransferSnapshot,
  createTransferPayload,
  buildErrorDetails,
};
