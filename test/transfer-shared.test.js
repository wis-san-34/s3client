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

// ── clampPartSize edge cases ──────────────────────────────────────────────────

test("clampPartSize returns default for NaN, Infinity, negative, and zero", () => {
  const DEF = 8 * 1024 * 1024;
  assert.equal(clampPartSize(NaN), DEF);
  assert.equal(clampPartSize(Infinity), DEF);
  assert.equal(clampPartSize(-Infinity), DEF);
  assert.equal(clampPartSize(-1), DEF);
  assert.equal(clampPartSize(0), DEF);
});

test("clampPartSize clamps to [5 MB, 5 GB] at exact boundaries", () => {
  const MIN = 5 * 1024 * 1024;
  const MAX = 5 * 1024 * 1024 * 1024;
  assert.equal(clampPartSize(1), MIN);          // below min → min
  assert.equal(clampPartSize(MIN), MIN);         // exact min → min
  assert.equal(clampPartSize(MAX), MAX);         // exact max → max
  assert.equal(clampPartSize(MAX + 1), MAX);     // above max → max
  assert.equal(clampPartSize(10 * 1024 * 1024), 10 * 1024 * 1024); // mid-range passes through
});

// ── clampConcurrency edge cases ───────────────────────────────────────────────

test("clampConcurrency returns default for NaN, zero, and sub-1 values", () => {
  assert.equal(clampConcurrency(NaN), 2);
  assert.equal(clampConcurrency(0), 2);
  assert.equal(clampConcurrency(0.9), 2);
  assert.equal(clampConcurrency(-5), 2);
});

test("clampConcurrency clamps to [1, 16] and floors decimals", () => {
  assert.equal(clampConcurrency(1), 1);
  assert.equal(clampConcurrency(1.9), 1);   // floor
  assert.equal(clampConcurrency(16), 16);
  assert.equal(clampConcurrency(16.9), 16); // floor then max
  assert.equal(clampConcurrency(17), 16);
  assert.equal(clampConcurrency(100), 16);
});

// ── normalizeQueuePriority edge cases ─────────────────────────────────────────

test("normalizeQueuePriority only accepts exact lowercase 'high' and 'low'", () => {
  assert.equal(normalizeQueuePriority("high"), "high");
  assert.equal(normalizeQueuePriority("low"), "low");
  assert.equal(normalizeQueuePriority("normal"), "normal");
  assert.equal(normalizeQueuePriority("HIGH"), "normal");
  assert.equal(normalizeQueuePriority("Low"), "normal");
  assert.equal(normalizeQueuePriority(null), "normal");
  assert.equal(normalizeQueuePriority(undefined), "normal");
  assert.equal(normalizeQueuePriority(""), "normal");
  assert.equal(normalizeQueuePriority(42), "normal");
});

// ── getMaxRetries edge cases ──────────────────────────────────────────────────

test("getMaxRetries clamps to [0, 10] and defaults for invalid inputs", () => {
  assert.equal(getMaxRetries(0), 0);
  assert.equal(getMaxRetries(-1), 3);      // negative → default
  assert.equal(getMaxRetries(NaN), 3);
  assert.equal(getMaxRetries(null), 3);
  assert.equal(getMaxRetries(3.9), 3);     // parseInt truncates
  assert.equal(getMaxRetries(10), 10);     // exact max
  assert.equal(getMaxRetries(11), 10);     // over max → clamped
});

// ── getRetryDelayMs edge cases ────────────────────────────────────────────────

test("getRetryDelayMs treats 0 and negative counts as 0, grows exponentially, caps at 30 s", () => {
  assert.equal(getRetryDelayMs(0), 1000);    // 0 → 1000 * 2^0
  assert.equal(getRetryDelayMs(-5), 1000);   // negative → 0 → 1000
  assert.equal(getRetryDelayMs(NaN), 1000);  // NaN → 0 → 1000
  assert.equal(getRetryDelayMs(1), 1000);
  assert.equal(getRetryDelayMs(2), 2000);
  assert.equal(getRetryDelayMs(3), 4000);
  assert.equal(getRetryDelayMs(4), 8000);
  assert.equal(getRetryDelayMs(5), 16000);
  assert.equal(getRetryDelayMs(6), 30000);   // 32000 → capped
  assert.equal(getRetryDelayMs(10), 30000);  // still capped
});

// ── sanitizeRelativePath edge cases ──────────────────────────────────────────

test("sanitizeRelativePath handles absolute paths, double slashes, and Windows drive paths", () => {
  // leading slash stripped (empty segment filtered)
  assert.equal(sanitizeRelativePath("/absolute/path.txt"), "absolute/path.txt");
  // double slash collapsed
  assert.equal(sanitizeRelativePath("foo//bar.txt"), "foo/bar.txt");
  // Windows drive colon replaced with _
  assert.equal(sanitizeRelativePath("C:\\Users\\file.txt"), "C_/Users/file.txt");
  // path that reduces to only dots returns fallback
  assert.equal(sanitizeRelativePath("../../"), "download.bin");
  // custom fallback
  assert.equal(sanitizeRelativePath("", "custom.bin"), "custom.bin");
});

test("sanitizeRelativePath replaces all special characters", () => {
  assert.equal(sanitizeRelativePath('a<b>c:d"e|f?g*h.txt'), "a_b_c_d_e_f_g_h.txt");
});

// ── chunkArray edge cases ─────────────────────────────────────────────────────

test("chunkArray handles empty arrays and invalid chunk sizes", () => {
  assert.deepEqual(chunkArray([], 5), []);
  assert.deepEqual(chunkArray([1, 2, 3], 0), [[1], [2], [3]]);   // 0 → normalizes to 1
  assert.deepEqual(chunkArray([1, 2, 3], NaN), [[1], [2], [3]]); // NaN → 1
  assert.deepEqual(chunkArray([1, 2, 3], 1), [[1], [2], [3]]);
  assert.deepEqual(chunkArray([1, 2, 3, 4], 4), [[1, 2, 3, 4]]); // exact fit
});
