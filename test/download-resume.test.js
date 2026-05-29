const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCompletedDownloadParts } = require("../src/downloadResume");

test("download resume keeps matching resume parts", () => {
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 0,
    etag: "etag-1",
    resumeInfo: {
      etag: "etag-1",
      parts: [
        { PartNumber: 1, size: 8 * 1024 * 1024 },
        { PartNumber: 2, size: 8 * 1024 * 1024 },
      ],
    },
  });

  assert.equal(result.completedParts.size, 2);
  assert.equal(result.loaded, 16 * 1024 * 1024);
});

test("download resume ignores stale etag parts and derives completed parts from file size", () => {
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 16 * 1024 * 1024,
    etag: "etag-2",
    resumeInfo: {
      etag: "etag-1",
      parts: [{ PartNumber: 1, size: 8 * 1024 * 1024 }],
    },
  });

  assert.equal(result.completedParts.size, 2);
  assert.equal(result.loaded, 16 * 1024 * 1024);
});

test("download resume with null resumeInfo and zero existingSize returns empty state", () => {
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 0,
    etag: "etag-1",
    resumeInfo: null,
  });
  assert.equal(result.completedParts.size, 0);
  assert.equal(result.loaded, 0);
});

test("download resume clamps existingSize > total to zero", () => {
  const result = buildCompletedDownloadParts({
    total: 10 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 20 * 1024 * 1024,
    etag: "etag-1",
    resumeInfo: null,
  });
  assert.equal(result.completedParts.size, 0);
  assert.equal(result.loaded, 0);
});

test("download resume derives from file size when resumeInfo has a matching etag but empty parts", () => {
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 16 * 1024 * 1024,
    etag: "etag-1",
    resumeInfo: { etag: "etag-1", parts: [] },
  });
  // completedParts starts empty -> derives 2 parts from floor(16 MB / 8 MB)
  assert.equal(result.completedParts.size, 2);
  assert.equal(result.loaded, 16 * 1024 * 1024);
});

test("download resume filters out parts missing PartNumber or size", () => {
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 8 * 1024 * 1024,
    existingSize: 0,
    etag: "etag-1",
    resumeInfo: {
      etag: "etag-1",
      parts: [
        { PartNumber: 1, size: 8 * 1024 * 1024 }, // valid
        { size: 8 * 1024 * 1024 },                 // missing PartNumber -> skipped
        { PartNumber: 3 },                          // missing size -> skipped
      ],
    },
  });
  assert.equal(result.completedParts.size, 1);
  assert.ok(result.completedParts.has(1));
});

test("download resume keeps single part for a file smaller than partSize", () => {
  const total = 3 * 1024 * 1024;
  const partSize = 8 * 1024 * 1024;
  const result = buildCompletedDownloadParts({
    total,
    partSize,
    existingSize: 0,
    etag: "etag-small",
    resumeInfo: { etag: "etag-small", parts: [{ PartNumber: 1, size: total }] },
  });
  assert.equal(result.completedParts.size, 1);
  assert.equal(result.loaded, total);
});

test("download resume normalizes invalid partSize via clampPartSize", () => {
  // 1024 bytes is below the 5 MB minimum and gets clamped to 5 MB
  const result = buildCompletedDownloadParts({
    total: 20 * 1024 * 1024,
    partSize: 1024,
    existingSize: 10 * 1024 * 1024,
    etag: "etag-1",
    resumeInfo: null,
  });
  assert.equal(result.normalizedPartSize, 5 * 1024 * 1024);
  // floor(10 MB / 5 MB) = 2 derived parts
  assert.equal(result.completedParts.size, 2);
});
