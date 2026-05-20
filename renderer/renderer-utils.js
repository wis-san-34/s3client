// renderer-utils.js
// Shared DOM references, global state, constants, and pure utility functions.
// Must be loaded first — all other renderer modules depend on these globals.

// ── DOM element references ────────────────────────────────────────────────────
const transferBody = document.getElementById("transfer-body");
const bucketBody = document.getElementById("bucket-body");
const bucketMoreBtn = document.getElementById("bucket-more");
const bucketUpBtn = document.getElementById("bucket-up");
const bucketSelectAllEl = document.getElementById("bucket-select-all");
const bucketDeleteSelectedBtn = document.getElementById("bucket-delete-selected");
const bucketDashboardBreadcrumb = document.getElementById("bucket-dashboard-breadcrumb");
const connectionSelect = document.getElementById("connection-select");
const loadConnectionBtn = document.getElementById("load-connection");
const localBrowserBody = document.getElementById("local-browser-body");
const localBrowserStatus = document.getElementById("local-browser-status");
const localPathInput = document.getElementById("local-browser-path");
const localDriveSelect = document.getElementById("local-drive-select");
const localPathGoBtn = document.getElementById("local-path-go");
const localRefreshBtn = document.getElementById("local-refresh");
const localChooseBtn = document.getElementById("local-choose-folder");
const localUpBtn = document.getElementById("local-up");
const localNewFolderBtn = document.getElementById("local-new-folder");
const localRenameBtn = document.getElementById("local-rename");
const localDeleteBtn = document.getElementById("local-delete");
const localUploadBtn = document.getElementById("local-upload-selected");
const localOpenExplorerBtn = document.getElementById("local-open-explorer");
const localExplorerFilterInput = document.getElementById("local-explorer-filter");
const localExplorerSummary = document.getElementById("local-explorer-summary");
const localInspectorLocation = document.getElementById("local-inspector-location");
const localInspectorSelection = document.getElementById("local-inspector-selection");
const localInspectorDetails = document.getElementById("local-inspector-details");
const bucketExplorerBody = document.getElementById("bucket-explorer-body");
const bucketExplorerStatus = document.getElementById("bucket-explorer-status");
const bucketExplorerDropzone = document.getElementById("bucket-explorer-dropzone");
const bucketExplorerScroll = document.getElementById("bucket-explorer-scroll");
const bucketExplorerMoreBtn = document.getElementById("bucket-explorer-more");
const bucketExplorerPrefixInput = document.getElementById("bucket-explorer-prefix");
const bucketExplorerFilterInput = document.getElementById("bucket-explorer-filter");
const bucketExplorerSummary = document.getElementById("bucket-explorer-summary");
const bucketInspectorLocation = document.getElementById("bucket-inspector-location");
const bucketInspectorSelection = document.getElementById("bucket-inspector-selection");
const bucketInspectorDetails = document.getElementById("bucket-inspector-details");
const bucketPrefixGoBtn = document.getElementById("bucket-prefix-go");
const bucketExplorerRefreshBtn = document.getElementById("bucket-explorer-refresh");
const bucketExplorerUpBtn = document.getElementById("bucket-explorer-up");
const bucketNewFolderBtn = document.getElementById("bucket-explorer-new-folder");
const bucketRenameBtn = document.getElementById("bucket-explorer-rename");
const bucketDeleteBtn = document.getElementById("bucket-explorer-delete");
const bucketDownloadBtn = document.getElementById("bucket-explorer-download");
const localBreadcrumb = document.getElementById("local-breadcrumb");
const bucketBreadcrumb = document.getElementById("bucket-breadcrumb");
const toastContainer = document.getElementById("toast-container");
const explorerDivider = document.getElementById("explorer-divider");
const explorerSplit = document.getElementById("explorer-split");
const pages = {
  dashboard: document.getElementById("page-dashboard"),
  explorer: document.getElementById("page-explorer"),
  logs: document.getElementById("page-logs"),
  connections: document.getElementById("page-connections"),
};

// ── Global mutable state ──────────────────────────────────────────────────────
let uploadFilePath = "";
let bucketNextToken = null;
let dashboardBucketPrefix = "";
let dashboardBucketRequestSeq = 0;
let bucketExplorerRequestSeq = 0;
let connections = [];
const logs = [];
let selectedKey = "";
const connectionBody = document.getElementById("connection-body");
const connectionSearchInput = document.getElementById("connection-search");
const connectionCountEl = document.getElementById("connection-count");
const connectionActiveEl = document.getElementById("connection-active");
const connectionFilterStatus = document.getElementById("connection-filter-status");
const connectionImportBtn = document.getElementById("connection-import");
const connectionExportBtn = document.getElementById("connection-export");
const logContainer = document.getElementById("log-container");
const logSearchInput = document.getElementById("log-search");
const logLevelFilter = document.getElementById("log-level-filter");
const logCountEl = document.getElementById("log-count");
const errorPanel = document.getElementById("error-panel");
const copyErrorDetailsBtn = document.getElementById("copy-error-details");
const dropzone = document.getElementById("global-dropzone");
const metricBucketEl = document.getElementById("metric-bucket");
const metricObjectsEl = document.getElementById("metric-objects");
const metricSizeEl = document.getElementById("metric-size");
const connectionCard = document.getElementById("connection-card");
const toggleConnectionPanelBtn = document.getElementById("toggle-connection-panel");
const toggleThemeBtn = document.getElementById("toggle-theme");
const transferFilterEl = document.getElementById("transfer-filter");
const transferSearchEl = document.getElementById("transfer-search");
const transferSummaryEl = document.getElementById("transfer-summary");

const explorerState = {
  localPath: "",
  localParent: null,
  localRoots: [],
  localEntries: [],
  localDisplayEntries: [],
  bucketEntries: [],
  bucketDisplayEntries: [],
  selectedLocalPaths: new Set(),
  selectedBucketKeys: new Set(),
  lastLocalIndex: null,
  lastBucketIndex: null,
  bucketPrefix: "",
  bucketNextToken: null,
  bucketLoading: false,
  localFilter: "",
  bucketFilter: "",
};
const activeLocalTransfers = new Map();
const activeBucketTransfers = new Map();
let activeConnectionId = null;
const sortState = {
  local: { field: "name", direction: "asc" },
  bucket: { field: "name", direction: "asc" },
};

// ── Form element references ───────────────────────────────────────────────────
const els = {
  endpoint: document.getElementById("endpoint"),
  accessKeyId: document.getElementById("accessKeyId"),
  secretAccessKey: document.getElementById("secretAccessKey"),
  bucket: document.getElementById("bucket"),
  partSize: document.getElementById("partSize"),
  concurrency: document.getElementById("concurrency"),
  maxActiveTransfers: document.getElementById("maxActiveTransfers"),
  maxActiveUploads: document.getElementById("maxActiveUploads"),
  maxActiveDownloads: document.getElementById("maxActiveDownloads"),
  maxRetries: document.getElementById("maxRetries"),
  softDeleteEnabled: document.getElementById("softDeleteEnabled"),
  trashPrefix: document.getElementById("trashPrefix"),
  configStatus: document.getElementById("config-status"),
  connectionName: document.getElementById("connection-name"),
  connectionTypeS3: document.getElementById("connection-type-s3"),
  connectionTypeFtp: document.getElementById("connection-type-ftp"),
  s3ConnectionLayout: document.getElementById("s3-connection-layout"),
  ftpConnectionLayout: document.getElementById("ftp-connection-layout"),
  s3AdvancedSettings: document.getElementById("s3-advanced-settings"),
  ftpProtocol: document.getElementById("ftp-protocol"),
  ftpHost: document.getElementById("ftp-host"),
  ftpPort: document.getElementById("ftp-port"),
  ftpUsername: document.getElementById("ftp-username"),
  ftpPassword: document.getElementById("ftp-password"),
  ftpRemotePath: document.getElementById("ftp-remote-path"),
  ftpSecureMode: document.getElementById("ftp-secure-mode"),
  ftpRejectUnauthorized: document.getElementById("ftp-reject-unauthorized"),
  ftpAllowLegacyTls: document.getElementById("ftp-allow-legacy-tls"),
  ftpProtectDataChannel: document.getElementById("ftp-protect-data-channel"),
  bucketPrefix: document.getElementById("bucket-prefix"),
  bucketBrowserTitle: document.getElementById("bucket-browser-title"),
  bucketBrowserSubtitle: document.getElementById("bucket-browser-subtitle"),
  metricBucketLabel: document.getElementById("metric-bucket-label"),
  metricObjectsLabel: document.getElementById("metric-objects-label"),
  bucketStatus: document.getElementById("bucket-status"),
  uploadFile: document.getElementById("upload-file"),
  uploadKey: document.getElementById("upload-key"),
  uploadKeyLabel: document.getElementById("upload-key-label"),
  uploadStatus: document.getElementById("upload-status"),
  downloadKey: document.getElementById("download-key"),
  downloadKeyLabel: document.getElementById("download-key-label"),
  downloadFolder: document.getElementById("download-folder"),
  downloadFilename: document.getElementById("download-filename"),
  downloadStatus: document.getElementById("download-status"),
  localPaneSubtitle: document.getElementById("local-pane-subtitle"),
  bucketPaneTitle: document.getElementById("bucket-pane-title"),
  bucketPaneSubtitle: document.getElementById("bucket-pane-subtitle"),
  bucketPrefixLabel: document.getElementById("bucket-prefix-label"),
  bucketInspectorLocationLabel: document.getElementById("bucket-inspector-location-label"),
  bucketExplorerDropzone: document.getElementById("bucket-explorer-dropzone"),
};

let latestErrorDetails = null;
let draggedQueuedTransferId = "";
let isConnectionPanelCollapsed = false;
const transferStore = window.S3TransferStore.createTransferStore();
const { showInputPrompt, showConfirmPrompt, confirmDeletion } = window.S3Dialogs;

// ── Constants ─────────────────────────────────────────────────────────────────
const MB = 1024 * 1024;
const TRANSFER_LIMITS = {
  minPartSizeMb: 5,
  maxPartSizeMb: 5120,
  maxConcurrency: 16,
};
const EXPLORER_SPLIT_STORAGE_KEY = "explorerSplitRatio";
const EXPLORER_PREFS_STORAGE_KEY = "explorerPrefsByConnectionV1";
const UI_THEME_STORAGE_KEY = "uiTheme";
const EXPLORER_MIN_PANE_WIDTH = 320;
const EXPLORER_MIN_RATIO = 0.2;
const EXPLORER_MAX_RATIO = 0.8;

// ── Secret input state ────────────────────────────────────────────────────────
function setSecretInputState(hasSecret) {
  if (!els.secretAccessKey) return;
  els.secretAccessKey.dataset.hasSecret = hasSecret ? "true" : "false";
  els.secretAccessKey.placeholder = hasSecret ? "Secret stored securely" : "";
  if (hasSecret) {
    els.secretAccessKey.value = "";
  }
}
setSecretInputState(false);

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", resolved);
  if (toggleThemeBtn) {
    toggleThemeBtn.innerText = resolved === "dark" ? "Light Mode" : "Dark Mode";
  }
}

function loadInitialTheme() {
  let stored = null;
  try {
    stored = window?.localStorage?.getItem(UI_THEME_STORAGE_KEY);
  } catch (err) {
    stored = null;
  }
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
    return;
  }
  const preferredDark = window?.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(preferredDark ? "dark" : "light");
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    window?.localStorage?.setItem(UI_THEME_STORAGE_KEY, next);
  } catch (err) {
    // Ignore theme persistence errors.
  }
}

// ── Transfer settings validation ──────────────────────────────────────────────
function validateTransferSettings({ quiet = false } = {}) {
  const partSizeMb = Number(els.partSize.value);
  const concurrency = Number(els.concurrency.value);
  const setError = (message) => {
    if (!quiet && els.configStatus) {
      els.configStatus.innerText = message;
    }
  };
  if (!Number.isFinite(partSizeMb)) {
    setError("Enter a valid part size in MB.");
    return null;
  }
  if (partSizeMb < TRANSFER_LIMITS.minPartSizeMb) {
    setError(`Part size must be at least ${TRANSFER_LIMITS.minPartSizeMb} MB.`);
    return null;
  }
  if (partSizeMb > TRANSFER_LIMITS.maxPartSizeMb) {
    setError(`Part size cannot exceed ${TRANSFER_LIMITS.maxPartSizeMb} MB.`);
    return null;
  }
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    setError("Concurrency must be at least 1.");
    return null;
  }
  if (concurrency > TRANSFER_LIMITS.maxConcurrency) {
    setError(`Concurrency cannot exceed ${TRANSFER_LIMITS.maxConcurrency}.`);
    return null;
  }
  if (!quiet && els.configStatus) {
    els.configStatus.innerText = "";
  }
  return {
    partSizeBytes: Math.round(partSizeMb * MB),
    concurrency: Math.max(1, Math.floor(concurrency)),
  };
}

// ── Utility functions ─────────────────────────────────────────────────────────
function baseName(p) {
  if (!p) return "";
  return p.split(/[\\/]/).pop();
}

function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let i = -1;
  let val = bytes;
  do {
    val /= 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(1)} ${units[i]}`;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleString();
}

function showToast(message, variant = "info", timeout = 3500) {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.innerText = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, timeout);
}

// ── Breadcrumb rendering ──────────────────────────────────────────────────────
function renderBreadcrumb(container, crumbs, onClick) {
  if (!container) return;
  container.innerHTML = "";
  if (!crumbs || crumbs.length === 0) {
    const empty = document.createElement("span");
    empty.innerText = "-";
    container.appendChild(empty);
    return;
  }
  crumbs.forEach((crumb, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = crumb.label || "/";
    btn.onclick = () => onClick(crumb.value);
    container.appendChild(btn);
    if (index < crumbs.length - 1) {
      const divider = document.createElement("span");
      divider.innerText = "›";
      divider.style.margin = "0 2px";
      container.appendChild(divider);
    }
  });
}

function buildLocalBreadcrumbSegments(fullPath) {
  if (!fullPath) return [];
  const normalized = fullPath.replace(/\//g, "\\").replace(/\\\\+/g, "\\\\").replace(/\\+/g, "\\");
  if (!normalized) return [];
  const crumbs = [];
  if (normalized.startsWith("\\\\")) {
    const parts = normalized.slice(2).split("\\").filter(Boolean);
    if (parts.length) {
      let accum = `\\\\${parts[0]}`;
      crumbs.push({ label: `\\\\${parts[0]}`, value: accum });
      for (let i = 1; i < parts.length; i++) {
        accum = `${accum}\\${parts[i]}`;
        crumbs.push({ label: parts[i], value: accum });
      }
      return crumbs;
    }
  }
  const parts = normalized.split("\\").filter((part, idx) => part || idx === 0);
  if (!parts.length) return [];
  let accum = "";
  parts.forEach((part, idx) => {
    if (idx === 0 && /^[A-Za-z]:$/.test(part)) {
      accum = `${part}\\`;
      crumbs.push({ label: part, value: accum });
      return;
    }
    if (!accum) {
      accum = part;
    } else {
      if (!accum.endsWith("\\")) {
        accum += "\\";
      }
      accum += part;
    }
    crumbs.push({ label: part || "\\", value: accum });
  });
  return crumbs;
}

function buildBucketBreadcrumbSegments(prefix) {
  const activeConn = typeof getActiveConnection === "function" ? getActiveConnection() : null;
  const bucketName = activeConn?.type === "ftp" || activeConn?.type === "ftps"
    ? activeConn.host || activeConn.name || "FTP"
    : els.bucket.value.trim() || "Bucket";
  const crumbs = [{ label: bucketName, value: "" }];
  if (!prefix) return crumbs;
  const clean = prefix.replace(/^\/+|\/+$/g, "");
  if (!clean) return crumbs;
  const parts = clean.split("/").filter(Boolean);
  let accum = "";
  parts.forEach((part) => {
    accum += `${part}/`;
    crumbs.push({ label: part, value: accum });
  });
  return crumbs;
}

function renderLocalBreadcrumb(path) {
  renderBreadcrumb(localBreadcrumb, buildLocalBreadcrumbSegments(path), (value) => loadLocalExplorer(value));
}

function renderBucketBreadcrumb(prefix) {
  renderBreadcrumb(bucketBreadcrumb, buildBucketBreadcrumbSegments(prefix), (value) => loadBucketExplorer(value));
}

function renderDashboardBucketBreadcrumb(prefix) {
  renderBreadcrumb(bucketDashboardBreadcrumb, buildBucketBreadcrumbSegments(prefix), (value) =>
    openDashboardBucketPrefix(value)
  );
}

// ── Local drive helpers ───────────────────────────────────────────────────────
function inferLocalRoot(fullPath) {
  const normalized = String(fullPath || "").replace(/\//g, "\\");
  if (/^[A-Za-z]:\\/.test(normalized)) {
    return normalized.slice(0, 3);
  }
  if (/^[A-Za-z]:$/.test(normalized)) {
    return `${normalized}\\`;
  }
  if (normalized.startsWith("\\\\")) {
    const parts = normalized.split("\\").filter(Boolean);
    if (parts.length >= 2) {
      return `\\\\${parts[0]}\\${parts[1]}\\`;
    }
  }
  return "/";
}

function renderLocalDriveOptions() {
  if (!localDriveSelect) return;
  localDriveSelect.innerHTML = "";
  const roots = explorerState.localRoots.length ? explorerState.localRoots : [{ label: "-", path: "" }];
  roots.forEach((root) => {
    const option = document.createElement("option");
    option.value = root.path;
    option.innerText = root.label;
    localDriveSelect.appendChild(option);
  });
  const currentRoot = inferLocalRoot(explorerState.localPath);
  const matching = roots.find((root) => root.path.toLowerCase() === currentRoot.toLowerCase());
  if (matching) {
    localDriveSelect.value = matching.path;
  }
}

async function loadLocalRoots() {
  if (!localDriveSelect) return;
  try {
    const roots = await window.api.listLocalRoots();
    explorerState.localRoots = Array.isArray(roots) ? roots : [];
  } catch {
    explorerState.localRoots = [];
  }
  renderLocalDriveOptions();
}

// ── DOM creation helpers ──────────────────────────────────────────────────────
function createEntryIcon(type) {
  const span = document.createElement("span");
  span.className = `entry-icon ${type === "folder" ? "folder" : "file"}`;
  return span;
}

function createDragGrip(entry) {
  const grip = document.createElement("span");
  grip.className = "drag-grip";
  grip.innerText = "⋮";
  grip.title = `Drag ${entry?.name || "item"}`;
  grip.setAttribute("aria-label", `Drag ${entry?.name || "item"}`);
  return grip;
}

function normalizePrefix(input) {
  if (!input) return "";
  let value = input.trim();
  value = value.replace(/^\/+/, "");
  if (value && !value.endsWith("/")) {
    value += "/";
  }
  return value;
}
