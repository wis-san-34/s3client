const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { ConfigStore, ResumeStore, TransferHistoryStore } = require("../src/store");

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

// -- ResumeStore ---------------------------------------------------------------

test("ResumeStore stores, retrieves, and clears upload resume data", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ResumeStore(path.join(dir, "resume.json"));
  const info = { bucket: "my-bucket", key: "my-key", filePath: "/tmp/file.txt" };
  const payload = { uploadId: "mp-id", parts: [{ PartNumber: 1, ETag: "tag1" }] };

  store.setUpload(info, payload);
  assert.deepEqual(store.getUpload(info), payload);

  store.clearUpload(info);
  assert.equal(store.getUpload(info), undefined);
});

test("ResumeStore stores, retrieves, and clears download resume data", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ResumeStore(path.join(dir, "resume.json"));
  const info = { bucket: "b", key: "k", filePath: "/tmp/dl.bin" };
  const payload = { etag: "etag-1", parts: [{ PartNumber: 1, size: 8 * 1024 * 1024 }] };

  store.setDownload(info, payload);
  assert.deepEqual(store.getDownload(info), payload);

  store.clearDownload(info);
  assert.equal(store.getDownload(info), undefined);
});

test("ResumeStore keeps upload and download namespaces isolated", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ResumeStore(path.join(dir, "resume.json"));
  const info = { bucket: "b", key: "k", filePath: "/f" };
  store.setUpload(info, { type: "upload" });
  store.setDownload(info, { type: "download" });

  assert.equal(store.getUpload(info).type, "upload");
  assert.equal(store.getDownload(info).type, "download");
});

test("ResumeStore persists data across instances", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "resume.json");
  const info = { bucket: "b", key: "k", filePath: "/f" };
  const payload = { uploadId: "uid-xyz" };

  new ResumeStore(filePath).setUpload(info, payload);
  assert.deepEqual(new ResumeStore(filePath).getUpload(info), payload);
});

// -- ConfigStore edge cases ----------------------------------------------------

test("ConfigStore.getActiveConnection returns a legacy-shaped object when no connections exist", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ConfigStore(path.join(dir, "config.json"));
  const conn = store.getActiveConnection({ includeSecret: false });

  assert.ok(conn !== null);
  assert.equal(typeof conn.endpoint, "string");
  assert.equal(typeof conn.accessKeyId, "string");
});

test("ConfigStore.getActiveConnection falls back to first connection on stale activeConnectionId", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ConfigStore(path.join(dir, "config.json"));
  const saved = store.upsertConnection({
    name: "C1",
    endpoint: "https://s3.example.com",
    accessKeyId: "KEY1",
    secretAccessKey: "SECRET1",
  });

  // Corrupt the active id so it points to nothing
  store.data.activeConnectionId = "stale-nonexistent-id";
  const conn = store.getActiveConnection({ includeSecret: false });
  assert.equal(conn.id, saved.id);
});

test("ConfigStore.removeConnection reassigns activeConnectionId to first remaining", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ConfigStore(path.join(dir, "config.json"));
  const c1 = store.upsertConnection({ name: "C1", endpoint: "https://e1.com", accessKeyId: "K1", secretAccessKey: "S1" });
  const c2 = store.upsertConnection({ name: "C2", endpoint: "https://e2.com", accessKeyId: "K2", secretAccessKey: "S2" });

  // c2 is active (last upserted)
  store.removeConnection(c2.id);
  assert.equal(store.data.connections.length, 1);
  assert.equal(store.data.activeConnectionId, c1.id);
});

test("ConfigStore.upsertConnection updates an existing connection when called with the same id", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ConfigStore(path.join(dir, "config.json"));
  const original = store.upsertConnection({
    name: "Original",
    endpoint: "https://old.example.com",
    accessKeyId: "OLD_KEY",
    secretAccessKey: "OLD_SECRET",
  });

  const updated = store.upsertConnection({
    id: original.id,
    name: "Updated",
    endpoint: "https://new.example.com",
    accessKeyId: "NEW_KEY",
    secretAccessKey: "NEW_SECRET",
  });

  assert.equal(updated.id, original.id);
  assert.equal(updated.name, "Updated");
  assert.equal(updated.endpoint, "https://new.example.com");
  assert.equal(store.data.connections.length, 1); // still only one entry
});

test("ConfigStore persists FTP and FTPS connection fields without plaintext password", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "config.json");
  const store = new ConfigStore(filePath);
  const saved = store.upsertConnection({
    type: "ftps",
    name: "FTPS Site",
    host: " ftp.example.com ",
    port: 990,
    username: " deploy ",
    password: " SECRET-PASSWORD ",
    remotePath: "/public_html",
    secureMode: "implicit",
    rejectUnauthorized: false,
    allowLegacyTls: true,
    protectDataChannel: false,
  });

  assert.equal(saved.type, "ftps");
  assert.equal(saved.host, "ftp.example.com");
  assert.equal(saved.endpoint, "ftp.example.com");
  assert.equal(saved.port, 990);
  assert.equal(saved.username, "deploy");
  assert.equal(saved.accessKeyId, "deploy");
  assert.equal(saved.secretAccessKey, "SECRET-PASSWORD");
  assert.equal(saved.remotePath, "/public_html");
  assert.equal(saved.secureMode, "implicit");
  assert.equal(saved.rejectUnauthorized, false);
  assert.equal(saved.allowLegacyTls, true);
  assert.equal(saved.protectDataChannel, false);

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(raw.connections[0].password, undefined);
  assert.equal(raw.connections[0].secretAccessKey, undefined);
  assert.ok(raw.connections[0].secretAccessKeyEncrypted);
});

test("ConfigStore exports portable connections with secrets and imports them", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const source = new ConfigStore(path.join(dir, "source.json"));
  const s3 = source.upsertConnection({
    name: "S3",
    endpoint: "https://s3.example.com",
    accessKeyId: "KEY",
    secretAccessKey: "SECRET",
    bucket: "bucket-a",
    rejectUnauthorized: false,
  });
  source.upsertConnection({
    type: "ftps",
    name: "FTPS",
    host: "ftp.example.com",
    username: "deploy",
    password: "FTP_SECRET",
    remotePath: "/site",
  });
  source.setActiveConnection(s3.id);

  const publicExport = source.exportConnections();
  assert.equal(publicExport.connections[0].secretAccessKey, undefined);
  assert.equal(publicExport.connections[1].password, undefined);

  const exported = source.exportConnections({ includeSecrets: true });
  assert.equal(exported.format, "s3-desktop-client-connections");
  assert.equal(exported.connections.length, 2);
  assert.equal(exported.connections[0].secretAccessKey, "SECRET");
  assert.equal(exported.connections[0].rejectUnauthorized, false);
  assert.equal(exported.connections[1].password, "FTP_SECRET");
  assert.equal(exported.connections[1].secretAccessKeyEncrypted, undefined);

  const target = new ConfigStore(path.join(dir, "target.json"));
  const summary = target.importConnections(exported);
  assert.deepEqual(summary, { imported: 2, skipped: 0 });

  const state = target.getState();
  assert.equal(state.connections.length, 2);
  assert.equal(state.activeConnectionId, s3.id);
  assert.equal(target.getActiveConnection({ includeSecret: false }).rejectUnauthorized, false);
  assert.equal(target.getActiveConnection({ includeSecret: true }).secretAccessKey, "SECRET");
  assert.equal(
    target.hydrateConnection(target.data.connections.find((c) => c.type === "ftps"), { includeSecret: true }).secretAccessKey,
    "FTP_SECRET"
  );

  const raw = JSON.parse(fs.readFileSync(path.join(dir, "target.json"), "utf8"));
  assert.equal(raw.connections[0].secretAccessKey, undefined);
  assert.equal(raw.connections[1].password, undefined);
});

test("ConfigStore exports one selected connection", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new ConfigStore(path.join(dir, "config.json"));
  store.upsertConnection({
    name: "First",
    endpoint: "https://first.example.com",
    accessKeyId: "KEY1",
    secretAccessKey: "SECRET1",
  });
  const second = store.upsertConnection({
    name: "Second",
    endpoint: "https://second.example.com",
    accessKeyId: "KEY2",
    secretAccessKey: "SECRET2",
  });

  const publicExport = store.exportConnection(second.id);
  assert.equal(publicExport.connections.length, 1);
  assert.equal(publicExport.connections[0].secretAccessKey, undefined);

  const exported = store.exportConnection(second.id, { includeSecrets: true });
  assert.equal(exported.connections.length, 1);
  assert.equal(exported.activeConnectionId, second.id);
  assert.equal(exported.connections[0].name, "Second");
  assert.equal(exported.connections[0].secretAccessKey, "SECRET2");
});

// -- TransferHistoryStore edge cases -------------------------------------------

test("TransferHistoryStore.upsert ignores entries without an id", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new TransferHistoryStore(path.join(dir, "history.json"));
  const result = store.upsert({ state: "done", key: "a.txt" }); // no id
  assert.equal(result, null);
  assert.equal(store.list().length, 0);
});

test("TransferHistoryStore.upsert sanitizes entry fields and defaults missing values", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = new TransferHistoryStore(path.join(dir, "history.json"));
  store.upsert({ id: "1", state: "running", key: "a.txt", loaded: null, retryCount: NaN });

  const entry = store.list()[0];
  assert.equal(entry.id, "1");
  assert.equal(entry.state, "running");
  assert.equal(entry.loaded, 0);      // null -> 0
  assert.equal(entry.retryCount, 0);  // NaN -> 0
  assert.equal(entry.queuePriority, "normal");
});

test("TransferHistoryStore recovers from corrupted JSON file", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "history.json");
  fs.writeFileSync(filePath, "{ not valid json {{{{");

  const store = new TransferHistoryStore(filePath);
  // Should not throw; items array must be present after recovery
  assert.ok(Array.isArray(store.list()));
});

test("ConfigStore recovers from corrupted JSON file", (t) => {
  const dir = createTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, "config.json");
  fs.writeFileSync(filePath, "not json at all");

  const store = new ConfigStore(filePath);
  assert.ok(Array.isArray(store.data.connections));
});
