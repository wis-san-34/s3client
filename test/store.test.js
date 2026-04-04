const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ConfigStore, TransferHistoryStore } = require("../src/store");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "s3-desktop-tests-"));
}

test("ConfigStore sanitizes and persists connections without plaintext secrets", async (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "config.json");
  const store = new ConfigStore(filePath);
  const saved = store.upsertConnection({
    name: "Test",
    endpoint: "https://example.com",
    accessKeyId: " ACCESS123 ",
    secretAccessKey: " SECRET456 ",
    bucket: "bucket-a",
    partSize: 1024,
    concurrency: 99,
    maxRetries: 99,
  });

  assert.equal(saved.accessKeyId, "ACCESS123");
  assert.equal(saved.secretAccessKey, "SECRET456");
  assert.equal(saved.partSize, 5 * 1024 * 1024);
  assert.equal(saved.concurrency, 16);
  assert.equal(saved.maxRetries, 10);

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(raw.connections.length, 1);
  assert.equal(raw.connections[0].secretAccessKey, undefined);
  assert.ok(raw.connections[0].secretAccessKeyEncrypted);
  assert.equal(raw.activeConnectionId, raw.connections[0].id);
});

test("TransferHistoryStore keeps latest entries and clears terminal states", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "history.json");
  const store = new TransferHistoryStore(filePath, { limit: 3 });
  store.upsert({ id: "1", state: "done", key: "a.txt" });
  store.upsert({ id: "2", state: "running", key: "b.txt" });
  store.upsert({ id: "3", state: "error", key: "c.txt" });
  store.upsert({ id: "4", state: "queued", key: "d.txt" });

  assert.deepEqual(store.list().map((entry) => entry.id), ["4", "3", "2"]);

  store.clearTerminal();
  assert.deepEqual(store.list().map((entry) => entry.id), ["4", "2"]);
});
