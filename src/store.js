const fs = require("fs");
const path = require("path");
const { safeStorage } = require("electron");
const {
  clampConcurrency,
  clampPartSize,
  getMaxRetries,
  normalizeQueuePriority,
} = require("./transferShared");
let keytar = null;
try {
  // Optional dependency; used when available for OS credential vault storage.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  keytar = require("keytar");
} catch (err) {
  keytar = null;
}

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const ACCESS_LABEL = /access[\s_-]*key[\s_-]*id/;
const SECRET_LABEL = /secret[\s_-]*access[\s_-]*key/;

const KEYTAR_SERVICE = "s3-desktop-client";

function canEncryptSecrets() {
  return Boolean(safeStorage?.isEncryptionAvailable?.() && safeStorage.isEncryptionAvailable());
}

function keytarAccountForId(id) {
  return `connection:${id || "legacy"}`;
}

function encryptSecret(secret) {
  if (!secret) return { hasSecret: false, secretAccessKeyEncrypted: "" };
  try {
    if (canEncryptSecrets()) {
      return {
        hasSecret: true,
        secretAccessKeyEncrypted: safeStorage.encryptString(secret).toString("base64"),
      };
    }
    return {
      hasSecret: true,
      secretAccessKeyEncrypted: Buffer.from(secret, "utf-8").toString("base64"),
    };
  } catch (err) {
    console.warn("Failed to encrypt secret", err);
    return { hasSecret: false, secretAccessKeyEncrypted: "" };
  }
}

function decryptSecret(record) {
  if (!record?.secretAccessKeyEncrypted) return "";
  try {
    const buffer = Buffer.from(record.secretAccessKeyEncrypted, "base64");
    if (canEncryptSecrets()) {
      return safeStorage.decryptString(buffer);
    }
    return buffer.toString("utf-8");
  } catch (err) {
    console.warn("Failed to decrypt secret", err);
    return "";
  }
}

async function setVaultSecret(id, secret) {
  if (!keytar || !id) return false;
  try {
    await keytar.setPassword(KEYTAR_SERVICE, keytarAccountForId(id), secret);
    return true;
  } catch (err) {
    console.warn("Failed to store secret in OS vault", err);
    return false;
  }
}

async function getVaultSecret(id) {
  if (!keytar || !id) return "";
  try {
    return (await keytar.getPassword(KEYTAR_SERVICE, keytarAccountForId(id))) || "";
  } catch (err) {
    console.warn("Failed to read secret from OS vault", err);
    return "";
  }
}

async function deleteVaultSecret(id) {
  if (!keytar || !id) return false;
  try {
    await keytar.deletePassword(KEYTAR_SERVICE, keytarAccountForId(id));
    return true;
  } catch (err) {
    console.warn("Failed to delete secret from OS vault", err);
    return false;
  }
}

const clampPartSizeBytes = clampPartSize;

function parseCredentialJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        accessKeyId:
          parsed.accessKeyId ||
          parsed.access_key_id ||
          parsed.aws_access_key_id ||
          parsed.AWSAccessKeyId ||
          parsed.key ||
          parsed.AccessKeyId,
        secretAccessKey:
          parsed.secretAccessKey ||
          parsed.secret_access_key ||
          parsed.SecretAccessKey ||
          parsed.secret ||
          parsed.secretKey,
      };
    }
  } catch (err) {
    /* noop */
  }
  return {};
}

function extractCredentialBlob(input) {
  if (!input || typeof input !== "string") return {};
  const trimmed = input.trim();
  if (!trimmed) return {};

  const result = {};
  const assign = (key, value) => {
    if (!result[key] && typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  };

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    trimmed.includes('"access') ||
    trimmed.includes("'access")
  ) {
    const fromJson = parseCredentialJson(trimmed);
    assign("accessKeyId", fromJson.accessKeyId);
    assign("secretAccessKey", fromJson.secretAccessKey);
  }

  const kvPatterns = [
    {
      key: "accessKeyId",
      regex: /(aws|cloudflare|r2)?[_\s-]*access[_\s-]*key[_\s-]*id\s*[:=]\s*([A-Za-z0-9+\/=_-]+)/i,
    },
    {
      key: "secretAccessKey",
      regex: /(aws|cloudflare|r2)?[_\s-]*secret[_\s-]*access[_\s-]*key\s*[:=]\s*([A-Za-z0-9+\/=_-]+)/i,
    },
  ];

  kvPatterns.forEach(({ key, regex }) => {
    if (result[key]) return;
    const match = regex.exec(trimmed);
    if (match && match[2]) {
      assign(key, match[2]);
    }
  });

  const labeledLines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = 0; i < labeledLines.length; i++) {
    const line = labeledLines[i];
    const lower = line.toLowerCase();
    if (!result.accessKeyId && ACCESS_LABEL.test(lower)) {
      const inline = line.split(/[:=]/)[1];
      if (inline && inline.trim()) {
        assign("accessKeyId", inline);
      } else if (labeledLines[i + 1]) {
        assign("accessKeyId", labeledLines[i + 1]);
        i++;
      }
      continue;
    }
    if (!result.secretAccessKey && SECRET_LABEL.test(lower)) {
      const inline = line.split(/[:=]/)[1];
      if (inline && inline.trim()) {
        assign("secretAccessKey", inline);
      } else if (labeledLines[i + 1]) {
        assign("secretAccessKey", labeledLines[i + 1]);
        i++;
      }
    }
  }

  if (
    !result.accessKeyId &&
    /^[A-Za-z0-9+\/=_-]{16,128}$/.test(trimmed) &&
    !SECRET_LABEL.test(trimmed.toLowerCase())
  ) {
    assign("accessKeyId", trimmed);
  }
  if (
    !result.secretAccessKey &&
    /^[A-Za-z0-9+\/=_-]{16,512}$/.test(trimmed) &&
    !ACCESS_LABEL.test(trimmed.toLowerCase())
  ) {
    assign("secretAccessKey", trimmed);
  }

  return result;
}

function sanitizeConnectionCredentials(conn = {}) {
  const access = typeof conn.accessKeyId === "string" ? conn.accessKeyId : "";
  const secret = typeof conn.secretAccessKey === "string" ? conn.secretAccessKey : "";
  const combined = extractCredentialBlob([access, secret].filter(Boolean).join("\n"));
  const sanitizedAccess =
    combined.accessKeyId || extractCredentialBlob(access).accessKeyId || access.trim();
  const sanitizedSecret =
    combined.secretAccessKey || extractCredentialBlob(secret).secretAccessKey || secret.trim();

  return {
    ...conn,
    accessKeyId: sanitizedAccess || "",
    secretAccessKey: sanitizedSecret || "",
  };
}

class JsonStore {
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.data = defaults;
    ensureDirExists(filePath);
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw);
      } catch (err) {
        console.warn("Failed to read store", this.filePath, err);
      }
    }
  }

  save() {
    ensureDirExists(this.filePath);
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

class ResumeStore extends JsonStore {
  constructor(filePath) {
    super(filePath, { uploads: {}, downloads: {} });
  }

  makeKey({ bucket, key, filePath }) {
    return `${bucket}|${key}|${filePath}`;
  }

  getUpload(info) {
    return this.data.uploads[this.makeKey(info)];
  }

  setUpload(info, payload) {
    this.data.uploads[this.makeKey(info)] = payload;
    this.save();
  }

  clearUpload(info) {
    delete this.data.uploads[this.makeKey(info)];
    this.save();
  }

  getDownload(info) {
    return this.data.downloads[this.makeKey(info)];
  }

  setDownload(info, payload) {
    this.data.downloads[this.makeKey(info)] = payload;
    this.save();
  }

  clearDownload(info) {
    delete this.data.downloads[this.makeKey(info)];
    this.save();
  }
}

class TransferHistoryStore extends JsonStore {
  constructor(filePath, { limit = 500 } = {}) {
    super(filePath, { items: [] });
    this.limit = Math.max(1, Math.min(5000, Number.parseInt(`${limit}`, 10) || 500));
    if (!Array.isArray(this.data.items)) {
      this.data.items = [];
      this.save();
    }
  }

  list() {
    return Array.isArray(this.data.items) ? [...this.data.items] : [];
  }

  upsert(entry) {
    if (!entry?.id) return null;
    const sanitized = this.sanitizeEntry(entry);
    const items = this.list().filter((item) => item.id !== sanitized.id);
    items.unshift(sanitized);
    this.data.items = items.slice(0, this.limit);
    this.save();
    return sanitized;
  }

  remove(id) {
    if (!id) return;
    this.data.items = this.list().filter((entry) => entry.id !== id);
    this.save();
  }

  clearTerminal() {
    this.data.items = this.list().filter((entry) =>
      !["done", "cancelled", "error"].includes(entry.state)
    );
    this.save();
  }

  sanitizeEntry(entry) {
    const next = {
      id: entry.id,
      type: entry.type || "",
      key: entry.key || "",
      bucket: entry.bucket || "",
      filePath: entry.filePath || "",
      dest: entry.dest || "",
      loaded: Number.isFinite(entry.loaded) ? entry.loaded : 0,
      total: Number.isFinite(entry.total) ? entry.total : null,
      state: entry.state || "queued",
      queuePriority: normalizeQueuePriority(entry.queuePriority),
      retryCount: Number.isFinite(entry.retryCount) ? entry.retryCount : 0,
      maxRetries: getMaxRetries(entry.maxRetries),
      nextRetryAt: entry.nextRetryAt || null,
      error: entry.error || "",
      errorDetails: entry.errorDetails || null,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString(),
      startedAt: entry.startedAt || null,
      endedAt: entry.endedAt || null,
    };
    if (entry.connection) {
      next.connection = {
        endpoint: entry.connection.endpoint || "",
        accessKeyId: entry.connection.accessKeyId || "",
        region: entry.connection.region || "auto",
        partSize: entry.connection.partSize,
        concurrency: entry.connection.concurrency,
        maxActiveTransfers: entry.connection.maxActiveTransfers,
        maxActiveUploads: entry.connection.maxActiveUploads,
        maxActiveDownloads: entry.connection.maxActiveDownloads,
        maxRetries: entry.connection.maxRetries,
        softDeleteEnabled: entry.connection.softDeleteEnabled,
        trashPrefix: entry.connection.trashPrefix,
      };
    }
    return next;
  }
}

class ConfigStore extends JsonStore {
  constructor(filePath) {
    super(filePath, {
      endpoint: "",
      accessKeyId: "",
      bucket: "",
      region: "auto",
      partSize: 8 * 1024 * 1024,
      concurrency: 2,
      maxActiveTransfers: 3,
      maxActiveUploads: 2,
      maxActiveDownloads: 2,
      maxRetries: 3,
      softDeleteEnabled: false,
      trashPrefix: ".trash/",
      connections: [],
      activeConnectionId: null,
      secretAccessKeyEncrypted: "",
      hasLegacySecret: false,
    });
    this.secretCache = new Map();
    this.initializeStore();
  }

  initializeStore() {
    if (!Array.isArray(this.data.connections)) {
      this.data.connections = [];
    }
    this.migrateLegacySecrets();
    this.sanitizeStoredCredentials();
  }

  migrateLegacySecrets() {
    let changed = false;
    this.data.connections = (this.data.connections || []).map((conn) => {
      const next = { ...conn };
      if (next.secretAccessKey && !next.secretAccessKeyEncrypted) {
        const encrypted = encryptSecret(next.secretAccessKey);
        next.secretAccessKeyEncrypted = encrypted.secretAccessKeyEncrypted;
        next.hasSecret = encrypted.hasSecret;
        delete next.secretAccessKey;
        changed = true;
      }
      if (next.secretAccessKeyEncrypted && next.hasSecret == null) {
        next.hasSecret = true;
      }
      return next;
    });
    if (this.data.secretAccessKey && !this.data.secretAccessKeyEncrypted) {
      const encrypted = encryptSecret(this.data.secretAccessKey);
      this.data.secretAccessKeyEncrypted = encrypted.secretAccessKeyEncrypted;
      this.data.hasLegacySecret = encrypted.hasSecret;
      delete this.data.secretAccessKey;
      changed = true;
    }
    if (this.data.hasLegacySecret == null) {
      this.data.hasLegacySecret = Boolean(this.data.secretAccessKeyEncrypted);
    }
    if (changed) {
      this.save();
    }
  }

  sanitizeStoredCredentials() {
    let changed = false;
    this.data.partSize = clampPartSizeBytes(this.data.partSize);
    this.data.concurrency = clampConcurrency(this.data.concurrency);
    this.data.maxActiveTransfers = Number.isFinite(this.data.maxActiveTransfers)
      ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveTransfers)))
      : 3;
    this.data.maxActiveUploads = Number.isFinite(this.data.maxActiveUploads)
      ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveUploads)))
      : 2;
    this.data.maxActiveDownloads = Number.isFinite(this.data.maxActiveDownloads)
      ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveDownloads)))
      : 2;
    this.data.maxRetries = Number.isFinite(this.data.maxRetries) ? Math.max(0, Math.min(10, Math.floor(this.data.maxRetries))) : 3;
    this.data.softDeleteEnabled = Boolean(this.data.softDeleteEnabled);
    this.data.trashPrefix = (this.data.trashPrefix || ".trash/").toString();
    this.data.connections = (this.data.connections || []).map((conn) => {
      const sanitized = { ...conn };
      sanitized.partSize = clampPartSizeBytes(sanitized.partSize || this.data.partSize);
      sanitized.concurrency = clampConcurrency(sanitized.concurrency || this.data.concurrency);
      sanitized.maxActiveTransfers = Number.isFinite(sanitized.maxActiveTransfers)
        ? Math.max(1, Math.min(16, Math.floor(sanitized.maxActiveTransfers)))
        : this.data.maxActiveTransfers;
      sanitized.maxActiveUploads = Number.isFinite(sanitized.maxActiveUploads)
        ? Math.max(1, Math.min(16, Math.floor(sanitized.maxActiveUploads)))
        : this.data.maxActiveUploads;
      sanitized.maxActiveDownloads = Number.isFinite(sanitized.maxActiveDownloads)
        ? Math.max(1, Math.min(16, Math.floor(sanitized.maxActiveDownloads)))
        : this.data.maxActiveDownloads;
      sanitized.maxRetries = Number.isFinite(sanitized.maxRetries)
        ? Math.max(0, Math.min(10, Math.floor(sanitized.maxRetries)))
        : this.data.maxRetries;
      sanitized.softDeleteEnabled = Boolean(
        sanitized.softDeleteEnabled != null ? sanitized.softDeleteEnabled : this.data.softDeleteEnabled
      );
      sanitized.trashPrefix = (sanitized.trashPrefix || this.data.trashPrefix || ".trash/").toString();
      sanitized.accessKeyId = (sanitized.accessKeyId || "").trim();
      sanitized.endpoint = (sanitized.endpoint || "").trim();
      sanitized.bucket = (sanitized.bucket || "").trim();
      sanitized.region = sanitized.region || "auto";
      if (sanitized.hasSecret == null) {
        sanitized.hasSecret = Boolean(sanitized.secretAccessKeyEncrypted);
      }
      if (JSON.stringify(sanitized) !== JSON.stringify(conn)) {
        changed = true;
      }
      return sanitized;
    });
    if (!Array.isArray(this.data.connections)) {
      this.data.connections = [];
      changed = true;
    }
    if (this.data.hasLegacySecret == null) {
      this.data.hasLegacySecret = Boolean(this.data.secretAccessKeyEncrypted);
      changed = true;
    }
    if (changed) {
      this.save();
    }
  }

  prepareSecretFields(existingRecord, candidateSecret, id = null) {
    if (candidateSecret === undefined) {
      if (existingRecord?.secretAccessKeyEncrypted) {
        return {
          hasSecret: Boolean(existingRecord.hasSecret ?? existingRecord.secretAccessKeyEncrypted),
          secretAccessKeyEncrypted: existingRecord.secretAccessKeyEncrypted,
        };
      }
      if (existingRecord?.secretAccessKey) {
        return encryptSecret(existingRecord.secretAccessKey);
      }
      return { hasSecret: false, secretAccessKeyEncrypted: "" };
    }
    const trimmed = typeof candidateSecret === "string" ? candidateSecret.trim() : "";
    if (!trimmed) {
      if (id) {
        this.secretCache.delete(id);
        void deleteVaultSecret(id);
      }
      return { hasSecret: false, secretAccessKeyEncrypted: "" };
    }
    if (id) {
      this.secretCache.set(id, trimmed);
      void setVaultSecret(id, trimmed);
    }
    return encryptSecret(trimmed);
  }

  hydrateConnection(conn, { includeSecret = false } = {}) {
    if (!conn) return null;
    const normalized = {
      id: conn.id,
      name: conn.name || "",
      endpoint: conn.endpoint || "",
      accessKeyId: conn.accessKeyId || "",
      bucket: conn.bucket || "",
      region: conn.region || "auto",
      partSize: clampPartSizeBytes(conn.partSize || this.data.partSize),
      concurrency: clampConcurrency(conn.concurrency || this.data.concurrency),
      maxActiveTransfers: Number.isFinite(conn.maxActiveTransfers)
        ? Math.max(1, Math.min(16, Math.floor(conn.maxActiveTransfers)))
        : this.data.maxActiveTransfers,
      maxActiveUploads: Number.isFinite(conn.maxActiveUploads)
        ? Math.max(1, Math.min(16, Math.floor(conn.maxActiveUploads)))
        : this.data.maxActiveUploads,
      maxActiveDownloads: Number.isFinite(conn.maxActiveDownloads)
        ? Math.max(1, Math.min(16, Math.floor(conn.maxActiveDownloads)))
        : this.data.maxActiveDownloads,
      maxRetries: Number.isFinite(conn.maxRetries)
        ? Math.max(0, Math.min(10, Math.floor(conn.maxRetries)))
        : this.data.maxRetries,
      softDeleteEnabled: Boolean(
        conn.softDeleteEnabled != null ? conn.softDeleteEnabled : this.data.softDeleteEnabled
      ),
      trashPrefix: (conn.trashPrefix || this.data.trashPrefix || ".trash/").toString(),
      hasSecret: Boolean(conn.hasSecret && conn.secretAccessKeyEncrypted),
    };
    if (includeSecret) {
      normalized.secretAccessKey =
        this.secretCache.get(normalized.id) || decryptSecret(conn);
      if (!this.secretCache.has(normalized.id) && keytar && normalized.id) {
        void getVaultSecret(normalized.id).then((secret) => {
          if (secret) this.secretCache.set(normalized.id, secret);
        });
      }
    }
    return normalized;
  }

  getLegacyConnection({ includeSecret = false } = {}) {
    const base = {
      endpoint: this.data.endpoint || "",
      accessKeyId: this.data.accessKeyId || "",
      bucket: this.data.bucket || "",
      region: this.data.region || "auto",
      partSize: clampPartSizeBytes(this.data.partSize || 8 * 1024 * 1024),
      concurrency: clampConcurrency(this.data.concurrency || 2),
      maxActiveTransfers: Number.isFinite(this.data.maxActiveTransfers)
        ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveTransfers)))
        : 3,
      maxActiveUploads: Number.isFinite(this.data.maxActiveUploads)
        ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveUploads)))
        : 2,
      maxActiveDownloads: Number.isFinite(this.data.maxActiveDownloads)
        ? Math.max(1, Math.min(16, Math.floor(this.data.maxActiveDownloads)))
        : 2,
      maxRetries: Number.isFinite(this.data.maxRetries)
        ? Math.max(0, Math.min(10, Math.floor(this.data.maxRetries)))
        : 3,
      softDeleteEnabled: Boolean(this.data.softDeleteEnabled),
      trashPrefix: (this.data.trashPrefix || ".trash/").toString(),
      hasSecret: Boolean(this.data.hasLegacySecret && this.data.secretAccessKeyEncrypted),
    };
    if (includeSecret) {
      base.secretAccessKey = base.hasSecret ? decryptSecret(this.data) : "";
    }
    return base;
  }

  update(partial = {}) {
    const sanitized = sanitizeConnectionCredentials(partial);
    const secretFields = this.prepareSecretFields(this.data, sanitized.secretAccessKey);
    const merged = {
      ...this.data,
      ...sanitized,
    };
    merged.partSize = clampPartSizeBytes(
      partial.partSize != null ? partial.partSize : this.data.partSize
    );
    merged.concurrency = clampConcurrency(
      partial.concurrency != null ? partial.concurrency : this.data.concurrency
    );
    merged.maxActiveTransfers =
      partial.maxActiveTransfers != null
        ? Math.max(1, Math.min(16, Math.floor(Number(partial.maxActiveTransfers) || 1)))
        : this.data.maxActiveTransfers;
    merged.maxActiveUploads =
      partial.maxActiveUploads != null
        ? Math.max(1, Math.min(16, Math.floor(Number(partial.maxActiveUploads) || 1)))
        : this.data.maxActiveUploads;
    merged.maxActiveDownloads =
      partial.maxActiveDownloads != null
        ? Math.max(1, Math.min(16, Math.floor(Number(partial.maxActiveDownloads) || 1)))
        : this.data.maxActiveDownloads;
    merged.maxRetries =
      partial.maxRetries != null
        ? Math.max(0, Math.min(10, Math.floor(Number(partial.maxRetries) || 0)))
        : this.data.maxRetries;
    merged.softDeleteEnabled = Boolean(
      partial.softDeleteEnabled != null ? partial.softDeleteEnabled : this.data.softDeleteEnabled
    );
    merged.trashPrefix = (partial.trashPrefix != null ? partial.trashPrefix : this.data.trashPrefix || ".trash/").toString();
    merged.secretAccessKeyEncrypted = secretFields.secretAccessKeyEncrypted;
    merged.hasLegacySecret = secretFields.hasSecret;
    delete merged.secretAccessKey;
    this.data = merged;
    this.save();
  }

  upsertConnection(conn) {
    if (!Array.isArray(this.data.connections)) {
      this.data.connections = [];
    }
    const id = conn.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const existingIndex = this.data.connections.findIndex((c) => c.id === id);
    const base = {
      id,
      name: conn.name || `Connection ${this.data.connections.length + 1}`,
      endpoint: conn.endpoint || "",
      accessKeyId: conn.accessKeyId || "",
      bucket: conn.bucket || "",
      region: conn.region || "auto",
      partSize: conn.partSize != null ? conn.partSize : this.data.partSize,
      concurrency: conn.concurrency != null ? conn.concurrency : this.data.concurrency,
      maxActiveTransfers:
        conn.maxActiveTransfers != null ? conn.maxActiveTransfers : this.data.maxActiveTransfers,
      maxActiveUploads:
        conn.maxActiveUploads != null ? conn.maxActiveUploads : this.data.maxActiveUploads,
      maxActiveDownloads:
        conn.maxActiveDownloads != null ? conn.maxActiveDownloads : this.data.maxActiveDownloads,
      maxRetries: conn.maxRetries != null ? conn.maxRetries : this.data.maxRetries,
      softDeleteEnabled:
        conn.softDeleteEnabled != null ? Boolean(conn.softDeleteEnabled) : this.data.softDeleteEnabled,
      trashPrefix: (conn.trashPrefix != null ? conn.trashPrefix : this.data.trashPrefix || ".trash/").toString(),
    };
    const sanitizedCreds = sanitizeConnectionCredentials({
      accessKeyId: base.accessKeyId,
      secretAccessKey: conn.secretAccessKey,
    });
    base.accessKeyId = sanitizedCreds.accessKeyId;
    base.partSize = clampPartSizeBytes(base.partSize);
    base.concurrency = clampConcurrency(base.concurrency);
    const existingRecord = existingIndex >= 0 ? this.data.connections[existingIndex] : null;
    const secretFields = this.prepareSecretFields(
      existingRecord,
      sanitizedCreds.secretAccessKey !== "" ? sanitizedCreds.secretAccessKey : undefined,
      id
    );
    const record = {
      ...existingRecord,
      ...base,
      id,
      hasSecret: secretFields.hasSecret,
      secretAccessKeyEncrypted: secretFields.secretAccessKeyEncrypted,
    };
    if (existingIndex >= 0) {
      this.data.connections[existingIndex] = record;
    } else {
      this.data.connections.push(record);
    }
    this.data.activeConnectionId = id;
    this.persistLegacyFields(record);
    this.save();
    return this.hydrateConnection(record, { includeSecret: true });
  }

  persistLegacyFields(record) {
    this.data.endpoint = record.endpoint;
    this.data.accessKeyId = record.accessKeyId;
    this.data.bucket = record.bucket;
    this.data.region = record.region;
    this.data.partSize = record.partSize;
    this.data.concurrency = record.concurrency;
    this.data.maxActiveTransfers = record.maxActiveTransfers;
    this.data.maxActiveUploads = record.maxActiveUploads;
    this.data.maxActiveDownloads = record.maxActiveDownloads;
    this.data.maxRetries = record.maxRetries;
    this.data.softDeleteEnabled = record.softDeleteEnabled;
    this.data.trashPrefix = record.trashPrefix;
    this.data.secretAccessKeyEncrypted = record.secretAccessKeyEncrypted;
    this.data.hasLegacySecret = record.hasSecret;
  }

  setActiveConnection(id) {
    this.data.activeConnectionId = id;
    this.save();
  }

  removeConnection(id) {
    if (!Array.isArray(this.data.connections)) {
      this.data.connections = [];
      return;
    }
    this.data.connections = this.data.connections.filter((c) => c.id !== id);
    this.secretCache.delete(id);
    void deleteVaultSecret(id);
    if (this.data.activeConnectionId === id) {
      this.data.activeConnectionId = this.data.connections[0]?.id || null;
    }
    this.save();
  }

  getActiveConnection(options = { includeSecret: true }) {
    const includeSecret = options.includeSecret !== false;
    if (!Array.isArray(this.data.connections)) {
      this.data.connections = [];
    }
    const activeIndex = this.data.connections.findIndex(
      (c) => c.id === this.data.activeConnectionId
    );
    if (activeIndex >= 0) {
      return this.hydrateConnection(this.data.connections[activeIndex], { includeSecret });
    }
    if (this.data.connections.length > 0) {
      const first = this.data.connections[0];
      this.data.activeConnectionId = first.id;
      this.save();
      return this.hydrateConnection(first, { includeSecret });
    }
    return this.getLegacyConnection({ includeSecret });
  }

  getState() {
    const current = this.getActiveConnection({ includeSecret: false }) || this.getLegacyConnection();
    return {
      activeConnectionId: this.data.activeConnectionId,
      connections: this.data.connections.map((conn) =>
        this.hydrateConnection(conn, { includeSecret: false })
      ),
      current,
    };
  }
}

module.exports = { ResumeStore, TransferHistoryStore, ConfigStore };
