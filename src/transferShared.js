const MIN_PART_SIZE = 5 * 1024 * 1024;
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024;
const DEFAULT_PART_SIZE = 8 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_MAX_DELAY_MS = 30000;
const PRIORITY_WEIGHT = {
  low: 0,
  normal: 1,
  high: 2,
};

function clampPartSize(size) {
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_PART_SIZE;
  return Math.min(Math.max(size, MIN_PART_SIZE), MAX_PART_SIZE);
}

function clampConcurrency(value) {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_CONCURRENCY;
  return Math.min(Math.floor(value), 16);
}

function normalizeQueuePriority(value) {
  if (value === "high" || value === "low") return value;
  return "normal";
}

function getMaxRetries(value) {
  const parsed = Number.parseInt(`${value ?? ""}`, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.min(parsed, 10);
  return DEFAULT_MAX_RETRIES;
}

function getRetryDelayMs(retryCount) {
  const normalizedCount = Math.max(0, Number.parseInt(`${retryCount ?? 0}`, 10) || 0);
  return Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, normalizedCount - 1)),
    RETRY_MAX_DELAY_MS
  );
}

function chunkArray(items, size) {
  const normalizedSize = Math.max(1, Number.parseInt(`${size ?? 1}`, 10) || 1);
  const chunks = [];
  for (let idx = 0; idx < items.length; idx += normalizedSize) {
    chunks.push(items.slice(idx, idx + normalizedSize));
  }
  return chunks;
}

function sanitizeRelativePath(relativePath, fallbackName = "download.bin") {
  const source = typeof relativePath === "string" && relativePath.trim() ? relativePath : fallbackName;
  const segments = source
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[<>:"|?*]/g, "_"));

  if (!segments.length) {
    return fallbackName;
  }
  return segments.join("/");
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  MAX_PART_SIZE,
  MIN_PART_SIZE,
  PRIORITY_WEIGHT,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  chunkArray,
  clampConcurrency,
  clampPartSize,
  getMaxRetries,
  getRetryDelayMs,
  normalizeQueuePriority,
  sanitizeRelativePath,
};
