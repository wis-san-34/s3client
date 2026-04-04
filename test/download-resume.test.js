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
