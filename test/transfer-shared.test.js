const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chunkArray,
  clampConcurrency,
  clampPartSize,
  getMaxRetries,
  getRetryDelayMs,
  normalizeQueuePriority,
  sanitizeRelativePath,
} = require("../src/transferShared");

test("transferShared clamps part size and concurrency", () => {
  assert.equal(clampPartSize(1024), 5 * 1024 * 1024);
  assert.equal(clampPartSize(10 * 1024 * 1024), 10 * 1024 * 1024);
  assert.equal(clampConcurrency(0), 2);
  assert.equal(clampConcurrency(99), 16);
});

test("transferShared normalizes retries and queue priority", () => {
  assert.equal(getMaxRetries(undefined), 3);
  assert.equal(getMaxRetries(50), 10);
  assert.equal(normalizeQueuePriority("high"), "high");
  assert.equal(normalizeQueuePriority("unexpected"), "normal");
  assert.equal(getRetryDelayMs(1), 1000);
  assert.equal(getRetryDelayMs(6), 30000);
});

test("transferShared sanitizes relative paths and chunks arrays", () => {
  assert.equal(sanitizeRelativePath("../unsafe\\path?.txt"), "unsafe/path_.txt");
  assert.equal(sanitizeRelativePath("", "fallback.txt"), "fallback.txt");
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
