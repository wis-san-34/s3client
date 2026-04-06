const transferBody = document.getElementById("transfer-body");
const bucketBody = document.getElementById("bucket-body");
const bucketMoreBtn = document.getElementById("bucket-more");
const bucketUpBtn = document.getElementById("bucket-up");
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

function changeSort(scope, field) {
  const config = sortState[scope];
  if (!config) return;
  if (config.field === field) {
    config.direction = config.direction === "asc" ? "desc" : "asc";
  } else {
    config.field = field;
    config.direction = "asc";
  }
  if (scope === "local") {
    renderLocalExplorerRows(explorerState.localEntries);
  } else {
    renderBucketExplorerRows(explorerState.bucketEntries);
  }
}

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
  bucketPrefix: document.getElementById("bucket-prefix"),
  bucketStatus: document.getElementById("bucket-status"),
  uploadFile: document.getElementById("upload-file"),
  uploadKey: document.getElementById("upload-key"),
  uploadStatus: document.getElementById("upload-status"),
  downloadKey: document.getElementById("download-key"),
  downloadFolder: document.getElementById("download-folder"),
  downloadFilename: document.getElementById("download-filename"),
  downloadStatus: document.getElementById("download-status"),
};
let latestErrorDetails = null;
let draggedQueuedTransferId = "";
let isConnectionPanelCollapsed = false;
const transferStore = window.S3TransferStore.createTransferStore();
const { showInputPrompt, confirmDeletion } = window.S3Dialogs;

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

function setSecretInputState(hasSecret) {
  if (!els.secretAccessKey) return;
  els.secretAccessKey.dataset.hasSecret = hasSecret ? "true" : "false";
  els.secretAccessKey.placeholder = hasSecret ? "Secret stored securely" : "";
  if (hasSecret) {
    els.secretAccessKey.value = "";
  }
}
setSecretInputState(false);

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
  const bucketName = els.bucket.value.trim() || "Bucket";
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

function renderBucketBreadcrumb(prefix) {
  renderBreadcrumb(bucketBreadcrumb, buildBucketBreadcrumbSegments(prefix), (value) => loadBucketExplorer(value));
}

function renderDashboardBucketBreadcrumb(prefix) {
  renderBreadcrumb(bucketDashboardBreadcrumb, buildBucketBreadcrumbSegments(prefix), (value) =>
    openDashboardBucketPrefix(value)
  );
}

function loadExplorerPrefs() {
  try {
    const raw = window?.localStorage?.getItem(EXPLORER_PREFS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    // Ignore malformed local storage value.
  }
  return {};
}

function persistExplorerPrefs(partial) {
  if (!activeConnectionId || !partial || typeof partial !== "object") return;
  const current = loadExplorerPrefs();
  const activePrefs = current[activeConnectionId] || {};
  current[activeConnectionId] = { ...activePrefs, ...partial };
  try {
    window?.localStorage?.setItem(EXPLORER_PREFS_STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    // Ignore storage write failures.
  }
}

function getExplorerPrefsForActiveConnection() {
  if (!activeConnectionId) return {};
  const current = loadExplorerPrefs();
  const prefs = current[activeConnectionId];
  return prefs && typeof prefs === "object" ? prefs : {};
}

function sortEntries(entries, config, type) {
  const dirMultiplier = config.direction === "desc" ? -1 : 1;
  const clone = [...entries];
  clone.sort((a, b) => {
    const isDirA = type === "local" ? Boolean(a.isDirectory) : a.type === "folder";
    const isDirB = type === "local" ? Boolean(b.isDirectory) : b.type === "folder";
    if (isDirA !== isDirB) {
      return isDirA ? -1 : 1;
    }
    let comparison = 0;
    switch (config.field) {
      case "size": {
        const sizeA = a.size || 0;
        const sizeB = b.size || 0;
        comparison = sizeA - sizeB;
        break;
      }
      case "modified": {
        const timeA = a.modified ? new Date(a.modified).getTime() : 0;
        const timeB = b.modified ? new Date(b.modified).getTime() : 0;
        comparison = timeA - timeB;
        break;
      }
      default: {
        const nameA = (a.name || a.key || "").toLowerCase();
        const nameB = (b.name || b.key || "").toLowerCase();
        comparison = nameA.localeCompare(nameB);
        break;
      }
    }
    if (comparison === 0) {
      const fallbackA = (a.fullPath || a.key || "").toLowerCase();
      const fallbackB = (b.fullPath || b.key || "").toLowerCase();
      comparison = fallbackA.localeCompare(fallbackB);
    }
    return comparison * dirMultiplier;
  });
  return clone;
}

function updateSortIndicators(scope, config) {
  const selector = scope === "local" ? "[data-local-sort]" : "[data-bucket-sort]";
  document.querySelectorAll(selector).forEach((th) => {
    const column = scope === "local" ? th.dataset.localSort : th.dataset.bucketSort;
    th.dataset.sort = column === config.field ? config.direction : "";
  });
}

function filterEntries(entries, query, scope) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [...entries];
  return entries.filter((entry) => {
    if (scope === "local") {
      const haystack = `${entry.name || ""} ${entry.fullPath || ""} ${entry.isDirectory ? "folder" : "file"}`.toLowerCase();
      return haystack.includes(term);
    }
    const haystack = `${entry.name || ""} ${entry.key || ""} ${entry.prefix || ""} ${entry.type || ""}`.toLowerCase();
    return haystack.includes(term);
  });
}

function renderSummaryPills(container, values) {
  if (!container) return;
  container.innerHTML = "";
  values.forEach(({ label, value }) => {
    const pill = document.createElement("span");
    pill.className = "summary-pill";
    const strong = document.createElement("strong");
    strong.innerText = label;
    const text = document.createElement("span");
    text.innerText = value;
    pill.appendChild(strong);
    pill.appendChild(text);
    container.appendChild(pill);
  });
}

function describeSelection(entries, scope) {
  if (!entries.length) {
    return {
      selection: "No selection",
      details: scope === "local" ? "Browse a folder or select an entry." : "Select an object or folder to inspect it.",
    };
  }
  if (entries.length > 1) {
    const folderCount = entries.filter((entry) => (scope === "local" ? entry.isDirectory : entry.type === "folder")).length;
    const fileCount = entries.length - folderCount;
    const totalSize = entries.reduce((sum, entry) => sum + (entry.size || 0), 0);
    const parts = [];
    if (folderCount) parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
    if (fileCount) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
    return {
      selection: `${entries.length} selected`,
      details: `${parts.join(", ")}${fileCount ? `, ${fmtBytes(totalSize)}` : ""}`,
    };
  }
  const entry = entries[0];
  const isFolder = scope === "local" ? entry.isDirectory : entry.type === "folder";
  const modified = entry.modified || entry.lastModified;
  const location = scope === "local" ? entry.fullPath : entry.key || entry.prefix;
  return {
    selection: entry.name || baseName(location) || location || "Selected item",
    details: [
      isFolder ? "Folder" : "File",
      !isFolder && entry.size != null ? fmtBytes(entry.size) : null,
      modified ? fmtDate(modified) : null,
      location || null,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

function updateLocalExplorerChrome() {
  const total = explorerState.localEntries.length;
  const shown = explorerState.localDisplayEntries.length;
  const selection = getLocalSelectionEntries();
  renderSummaryPills(localExplorerSummary, [
    { label: "Shown", value: `${shown}${shown !== total ? ` of ${total}` : ""}` },
    { label: "Selected", value: `${selection.length}` },
    {
      label: "Payload",
      value: selection.length ? fmtBytes(selection.reduce((sum, entry) => sum + (entry.size || 0), 0)) : "-",
    },
  ]);
  if (localInspectorLocation) {
    localInspectorLocation.innerText = explorerState.localPath || "-";
  }
  renderLocalDriveOptions();
  const descriptor = describeSelection(selection, "local");
  if (localInspectorSelection) {
    localInspectorSelection.innerText = descriptor.selection;
    localInspectorSelection.classList.toggle("muted", selection.length === 0);
  }
  if (localInspectorDetails) {
    localInspectorDetails.innerText = descriptor.details;
    localInspectorDetails.classList.toggle("muted", selection.length === 0);
  }
  if (localBrowserStatus) {
    const suffix = explorerState.localFilter ? `, filtered by "${explorerState.localFilter}"` : "";
    localBrowserStatus.innerText = `${shown} item${shown === 1 ? "" : "s"}${shown !== total ? ` shown of ${total}` : ""}${suffix}`;
  }
}

function updateBucketExplorerChrome() {
  const total = explorerState.bucketEntries.length;
  const shown = explorerState.bucketDisplayEntries.length;
  const selection = getBucketSelectionEntries();
  renderSummaryPills(bucketExplorerSummary, [
    { label: "Shown", value: `${shown}${shown !== total ? ` of ${total}` : ""}` },
    { label: "Selected", value: `${selection.length}` },
    {
      label: "Payload",
      value: selection.length ? fmtBytes(selection.reduce((sum, entry) => sum + (entry.size || 0), 0)) : "-",
    },
  ]);
  if (bucketInspectorLocation) {
    bucketInspectorLocation.innerText = explorerState.bucketPrefix || "/";
  }
  const descriptor = describeSelection(selection, "bucket");
  if (bucketInspectorSelection) {
    bucketInspectorSelection.innerText = descriptor.selection;
    bucketInspectorSelection.classList.toggle("muted", selection.length === 0);
  }
  if (bucketInspectorDetails) {
    bucketInspectorDetails.innerText = descriptor.details;
    bucketInspectorDetails.classList.toggle("muted", selection.length === 0);
  }
  if (bucketExplorerStatus) {
    const suffix = explorerState.bucketFilter ? `, filtered by "${explorerState.bucketFilter}"` : "";
    bucketExplorerStatus.innerText = `${shown} item${shown === 1 ? "" : "s"}${shown !== total ? ` shown of ${total}` : ""}${explorerState.bucketNextToken ? " (more available)" : ""}${suffix}`;
  }
}

function getLocalSelectionEntries() {
  return explorerState.localDisplayEntries.filter((entry) =>
    explorerState.selectedLocalPaths.has(entry.fullPath)
  );
}

function getBucketSelectionEntries() {
  return explorerState.bucketDisplayEntries.filter((entry) => {
    const key = entry.key || entry.prefix;
    return explorerState.selectedBucketKeys.has(key);
  });
}

function pruneSelection(set, entries, keyFn) {
  const allowed = new Set(entries.map(keyFn));
  Array.from(set).forEach((value) => {
    if (!allowed.has(value)) {
      set.delete(value);
    }
  });
}

function syncLocalSelectionStyles() {
  if (!localBrowserBody) return;
  Array.from(localBrowserBody.querySelectorAll("tr")).forEach((row) => {
    const isSelected = explorerState.selectedLocalPaths.has(row.dataset.path);
    row.classList.toggle("selected", isSelected);
    const checkbox = row.querySelector(".entry-checkbox");
    if (checkbox) checkbox.checked = isSelected;
  });
}

function syncBucketSelectionStyles() {
  if (!bucketExplorerBody) return;
  Array.from(bucketExplorerBody.querySelectorAll("tr")).forEach((row) => {
    const key = row.dataset.key;
    const isSelected = explorerState.selectedBucketKeys.has(key);
    row.classList.toggle("selected", isSelected);
    const checkbox = row.querySelector(".entry-checkbox");
    if (checkbox) checkbox.checked = isSelected;
  });
}

function updateSelection({ type, id, index, event }) {
  const isLocal = type === "local";
  const selectionSet = isLocal ? explorerState.selectedLocalPaths : explorerState.selectedBucketKeys;
  const entries = isLocal ? explorerState.localDisplayEntries : explorerState.bucketDisplayEntries;
  const lastIndexKey = isLocal ? "lastLocalIndex" : "lastBucketIndex";
  if (event.shiftKey && explorerState[lastIndexKey] != null) {
    const start = Math.min(explorerState[lastIndexKey], index);
    const end = Math.max(explorerState[lastIndexKey], index);
    selectionSet.clear();
    for (let i = start; i <= end; i++) {
      const entryId = isLocal ? entries[i].fullPath : entries[i].key || entries[i].prefix;
      selectionSet.add(entryId);
    }
  } else if (event.ctrlKey || event.metaKey) {
    if (selectionSet.has(id)) {
      selectionSet.delete(id);
    } else {
      selectionSet.add(id);
    }
    explorerState[lastIndexKey] = index;
  } else {
    selectionSet.clear();
    selectionSet.add(id);
    explorerState[lastIndexKey] = index;
  }
  if (isLocal) {
    syncLocalSelectionStyles();
    updateLocalExplorerChrome();
  } else {
    syncBucketSelectionStyles();
    updateBucketExplorerChrome();
  }
}

function handleLocalRowClick(entry, event, index) {
  const id = entry.fullPath;
  updateSelection({ type: "local", id, index, event });
}

function handleBucketRowClick(entry, event, index) {
  const id = entry.key || entry.prefix;
  updateSelection({ type: "bucket", id, index, event });
}

function updateExplorerTransferIndicators(transfer) {
  if (!transfer) return;
  const state = transfer.state || "running";
  if (transfer.type === "upload") {
    const key = transfer.filePath;
    if (!key) return;
    if (state === "running" || state === "paused") {
      activeLocalTransfers.set(key, state);
    } else if (state === "error") {
      activeLocalTransfers.set(key, "error");
    } else {
      activeLocalTransfers.delete(key);
    }
    if (explorerState.localEntries.length) {
      renderLocalExplorerRows(explorerState.localEntries);
    }
  } else if (transfer.type === "download") {
    const bucketKey = transfer.key;
    if (!bucketKey) return;
    if (state === "running" || state === "paused") {
      activeBucketTransfers.set(bucketKey, state);
    } else if (state === "error") {
      activeBucketTransfers.set(bucketKey, "error");
    } else {
      activeBucketTransfers.delete(bucketKey);
    }
    if (explorerState.bucketEntries.length) {
      renderBucketExplorerRows(explorerState.bucketEntries);
    }
  }
}

function inferLogLevel(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("error") || text.includes("failed") || text.includes("unable")) return "error";
  if (text.includes("deleted") || text.includes("warning") || text.includes("cancel")) return "warn";
  if (
    text.includes("saved") ||
    text.includes("completed") ||
    text.includes("started") ||
    text.includes("queued") ||
    text.includes("loaded") ||
    text.includes("switched")
  ) {
    return "success";
  }
  return "info";
}

function maskSensitiveText(input) {
  let text = String(input || "");
  text = text.replace(/(secret[\w\s_-]*key\s*[:=]\s*)([^\s]+)/gi, "$1***REDACTED***");
  text = text.replace(/(access[\w\s_-]*key[\w\s_-]*id\s*[:=]\s*)([^\s]+)/gi, "$1***REDACTED***");
  text = text.replace(/\b(AKIA|ASIA)[A-Z0-9]{12,}\b/g, "***REDACTED_ACCESS_KEY***");
  text = text.replace(/\b[0-9A-Za-z/+]{32,}={0,2}\b/g, "***REDACTED_TOKEN***");
  return text;
}

function normalizeLogEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    return {
      timestamp: new Date(),
      level: inferLogLevel(entry),
      message: entry,
    };
  }
  return {
    timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
    level: entry.level || inferLogLevel(entry.message),
    message: entry.message || "",
  };
}

function addLog(message) {
  logs.unshift({
    timestamp: new Date().toISOString(),
    level: inferLogLevel(message),
    message: maskSensitiveText(message),
  });
  if (logs.length > 1000) {
    logs.length = 1000;
  }
  renderLogs();
}

function setErrorDetails(details) {
  latestErrorDetails = details || null;
  if (!errorPanel) return;
  if (!details) {
    errorPanel.innerText = "No errors yet.";
    return;
  }
  const lines = [
    `Operation: ${details.operation || "-"}`,
    `Bucket: ${details.bucket || "-"}`,
    `Key: ${details.key || "-"}`,
    `HTTP Status: ${details.httpStatus || "-"}`,
    `Request ID: ${details.requestId || "-"}`,
    `Type: ${details.type || "-"}`,
    `Message: ${maskSensitiveText(details.message || "-")}`,
  ];
  errorPanel.innerText = lines.join("\n");
}

function renderLogs() {
  if (!logContainer) return;
  const query = logSearchInput?.value?.trim().toLowerCase() || "";
  const level = logLevelFilter?.value || "all";
  const visible = logs
    .map(normalizeLogEntry)
    .filter((entry) => entry)
    .filter((entry) => (level === "all" ? true : entry.level === level))
    .filter((entry) => (query ? entry.message.toLowerCase().includes(query) : true))
    .slice(0, 300);

  logContainer.innerHTML = "";
  if (logCountEl) {
    logCountEl.innerText = `${visible.length} entr${visible.length === 1 ? "y" : "ies"}`;
  }

  if (!visible.length) {
    const div = document.createElement("div");
    div.className = "muted";
    div.style.padding = "8px 2px";
    div.innerText = logs.length ? "No log entries match the current filter." : "No log entries yet.";
    logContainer.appendChild(div);
    return;
  }

  visible.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "log-row";

    const time = document.createElement("span");
    time.className = "log-time";
    time.innerText = new Date(entry.timestamp).toLocaleString();

    const levelPill = document.createElement("span");
    levelPill.className = `log-level ${entry.level}`;
    levelPill.innerText = entry.level;

    const msg = document.createElement("span");
    msg.className = "log-message";
    msg.innerText = entry.message;

    row.appendChild(time);
    row.appendChild(levelPill);
    row.appendChild(msg);
    logContainer.appendChild(row);
  });
}

function getVisibleLogText() {
  const query = logSearchInput?.value?.trim().toLowerCase() || "";
  const level = logLevelFilter?.value || "all";
  return logs
    .map(normalizeLogEntry)
    .filter((entry) => entry)
    .filter((entry) => (level === "all" ? true : entry.level === level))
    .filter((entry) => (query ? entry.message.toLowerCase().includes(query) : true))
    .map((entry) => `[${new Date(entry.timestamp).toLocaleString()}] [${entry.level.toUpperCase()}] ${maskSensitiveText(entry.message)}`)
    .join("\n");
}

function setConnectionPanelCollapsed(collapsed, { persist = true } = {}) {
  if (!connectionCard || !toggleConnectionPanelBtn) return;
  isConnectionPanelCollapsed = collapsed;
  connectionCard.classList.toggle("collapsed", collapsed);
  toggleConnectionPanelBtn.innerText = collapsed ? "Show Settings" : "Hide Settings";
  toggleConnectionPanelBtn.setAttribute("aria-expanded", (!collapsed).toString());
  if (persist) {
    try {
      if (window?.localStorage) {
        window.localStorage.setItem("connectionPanelCollapsed", collapsed ? "1" : "0");
      }
    } catch (err) {
      console.warn("Unable to persist connection panel state", err);
    }
  }
}

function syncConnectionPanelCollapsed(hasSavedConnections) {
  let storedValue = null;
  try {
    storedValue = window?.localStorage?.getItem("connectionPanelCollapsed");
  } catch (err) {
    storedValue = null;
  }
  if (storedValue === "1") {
    setConnectionPanelCollapsed(true, { persist: false });
  } else if (storedValue === "0") {
    setConnectionPanelCollapsed(false, { persist: false });
  } else {
    setConnectionPanelCollapsed(Boolean(hasSavedConnections), { persist: false });
  }
}

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

async function loadLocalExplorer(pathOverride) {
  if (!localBrowserBody) return;
  const target = typeof pathOverride === "string" && pathOverride.trim() ? pathOverride.trim() : explorerState.localPath;
  try {
    if (localBrowserStatus) localBrowserStatus.innerText = "Loading...";
    const res = await window.api.listLocalEntries({ path: target });
    const nextPath = res.path;
    const pathChanged = explorerState.localPath !== nextPath;
    explorerState.localPath = nextPath;
    explorerState.localParent = res.parentPath;
    persistExplorerPrefs({ localPath: nextPath });
    if (pathChanged) {
      explorerState.selectedLocalPaths.clear();
      explorerState.lastLocalIndex = null;
    }
    if (localPathInput) localPathInput.value = res.path || "";
    renderLocalExplorerRows(res.entries || []);
  } catch (err) {
    if (localBrowserStatus) localBrowserStatus.innerText = err.message || "Unable to load local files.";
  }
}

function renderLocalExplorerRows(entries = []) {
  if (!localBrowserBody) return;
  const list = Array.isArray(entries) ? entries : [];
  explorerState.localEntries = list;
  const filtered = filterEntries(list, explorerState.localFilter, "local");
  pruneSelection(explorerState.selectedLocalPaths, filtered, (item) => item.fullPath);
  const sorted = sortEntries(filtered, sortState.local, "local");
  explorerState.localDisplayEntries = sorted;
  localBrowserBody.innerHTML = "";
  sorted.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.dataset.path = entry.fullPath;
    row.dataset.type = entry.isDirectory ? "dir" : "file";
    row.dataset.index = index;
    row.tabIndex = 0;
    row.draggable = true;
    row.addEventListener("dragstart", (e) => handleLocalDragStart(e, entry));
    row.addEventListener("click", (event) => handleLocalRowClick(entry, event, index));
    row.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = event.key === "ArrowDown" ? index + 1 : index - 1;
        if (nextIndex < 0 || nextIndex >= explorerState.localDisplayEntries.length) return;
        const nextEntry = explorerState.localDisplayEntries[nextIndex];
        updateSelection({
          type: "local",
          id: nextEntry.fullPath,
          index: nextIndex,
          event: { shiftKey: false, ctrlKey: false, metaKey: false },
        });
        localBrowserBody.querySelector(`tr[data-index="${nextIndex}"]`)?.focus();
      } else if (event.key === "Enter" && entry.isDirectory) {
        event.preventDefault();
        loadLocalExplorer(entry.fullPath);
      } else if (event.key === "Backspace" && explorerState.localParent) {
        event.preventDefault();
        loadLocalExplorer(explorerState.localParent);
      }
    });
    row.addEventListener("dblclick", () => {
      if (entry.isDirectory) {
        loadLocalExplorer(entry.fullPath);
      }
    });

    const selectCell = document.createElement("td");
    const selectWrap = document.createElement("div");
    selectWrap.className = "entry-cell";
    const dragGrip = createDragGrip(entry);
    dragGrip.draggable = true;
    dragGrip.addEventListener("dragstart", (event) => handleLocalDragStart(event, entry));
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "entry-checkbox";
    checkbox.checked = explorerState.selectedLocalPaths.has(entry.fullPath);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      updateSelection({ type: "local", id: entry.fullPath, index, event });
    });
    checkbox.addEventListener("dragstart", (event) => event.preventDefault());
    selectWrap.appendChild(dragGrip);
    selectWrap.appendChild(checkbox);
    selectWrap.appendChild(createEntryIcon(entry.isDirectory ? "folder" : "file"));
    selectCell.appendChild(selectWrap);

    const nameCell = document.createElement("td");
    nameCell.draggable = true;
    nameCell.addEventListener("dragstart", (event) => handleLocalDragStart(event, entry));
    nameCell.innerText = entry.name;
    const badgeState = activeLocalTransfers.get(entry.fullPath);
    if (badgeState && badgeState !== "done") {
      const badge = document.createElement("span");
      badge.className = `transfer-badge ${badgeState === "error" ? "error" : ""}`;
      badge.innerText = badgeState;
      nameCell.appendChild(badge);
    }
    const sizeCell = document.createElement("td");
    sizeCell.innerText = entry.isDirectory ? "-" : fmtBytes(entry.size);
    const modifiedCell = document.createElement("td");
    modifiedCell.innerText = entry.modified ? fmtDate(entry.modified) : "-";

    row.appendChild(selectCell);
    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(modifiedCell);
    localBrowserBody.appendChild(row);
  });
  syncLocalSelectionStyles();
  renderLocalBreadcrumb(explorerState.localPath);
  updateSortIndicators("local", sortState.local);
  updateLocalExplorerChrome();
}

function handleLocalDragStart(event, entry) {
  if (!entry || !event.dataTransfer) return;
  const selectedEntries = explorerState.selectedLocalPaths.has(entry.fullPath)
    ? getLocalSelectionEntries()
    : [entry];
  const dragEntries = selectedEntries.length ? selectedEntries : [entry];
  const payload = dragEntries.map((item) => ({
    fullPath: item.fullPath,
    name: item.name,
    isDirectory: Boolean(item.isDirectory),
  }));
  event.dataTransfer.setData("text/x-local-paths", JSON.stringify(payload));
  event.dataTransfer.setData("text/x-local-path", entry.fullPath);
  event.dataTransfer.setData("text/plain", entry.fullPath);
  event.dataTransfer.effectAllowed = "copy";
  const dragLabel = document.createElement("div");
  dragLabel.style.padding = "6px 10px";
  dragLabel.style.borderRadius = "8px";
  dragLabel.style.background = "rgba(15, 23, 42, 0.92)";
  dragLabel.style.color = "#fff";
  dragLabel.style.fontSize = "12px";
  dragLabel.style.position = "absolute";
  dragLabel.style.top = "-1000px";
  dragLabel.style.left = "-1000px";
  dragLabel.innerText = dragEntries.length === 1 ? dragEntries[0].name : `${dragEntries.length} items`;
  document.body.appendChild(dragLabel);
  event.dataTransfer.setDragImage(dragLabel, 16, 16);
  setTimeout(() => dragLabel.remove(), 0);
}

function bucketParentPrefix(prefix) {
  if (!prefix) return "";
  const trimmed = prefix.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1) return "";
  return `${trimmed.slice(0, idx + 1)}`;
}

async function loadBucketExplorer(prefixOverride, options = {}) {
  if (!bucketExplorerBody) return;
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    bucketExplorerBody.innerHTML = "";
    explorerState.bucketEntries = [];
    explorerState.bucketDisplayEntries = [];
    explorerState.selectedBucketKeys.clear();
    explorerState.bucketNextToken = null;
    if (bucketExplorerMoreBtn) bucketExplorerMoreBtn.style.display = "none";
    updateBucketExplorerChrome();
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket to browse objects.";
    return;
  }
  const append = Boolean(options.append);
  const force = Boolean(options.force);
  const targetPrefix = normalizePrefix(
    typeof prefixOverride === "string" ? prefixOverride : explorerState.bucketPrefix
  );
  if (explorerState.bucketLoading && !force) return;
  const requestSeq = ++bucketExplorerRequestSeq;
  const samePrefix = explorerState.bucketPrefix === targetPrefix;
  const effectiveAppend = append && samePrefix && Boolean(explorerState.bucketNextToken);
  try {
    explorerState.bucketLoading = true;
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Loading...";
    const res = await window.api.listBucket({
      bucket,
      prefix: targetPrefix,
      delimiter: "/",
      continuationToken: effectiveAppend ? explorerState.bucketNextToken : undefined,
      maxKeys: 500,
    });
    if (requestSeq !== bucketExplorerRequestSeq) return;
    const prefixChanged = explorerState.bucketPrefix !== targetPrefix || !effectiveAppend;
    explorerState.bucketPrefix = targetPrefix;
    persistExplorerPrefs({ bucketPrefix: targetPrefix });
    if (prefixChanged) {
      explorerState.selectedBucketKeys.clear();
      explorerState.lastBucketIndex = null;
    }
    if (bucketExplorerPrefixInput) bucketExplorerPrefixInput.value = targetPrefix;
    const entries = effectiveAppend ? [...explorerState.bucketEntries] : [];
    (res.prefixes || []).forEach((prefix) => {
      const relative = targetPrefix ? prefix.replace(targetPrefix, "") : prefix;
      entries.push({
        type: "folder",
        name: relative.replace(/\/$/, "") || prefix.replace(/\/$/, ""),
        prefix,
      });
    });
    (res.items || []).forEach((item) => {
      const relative = targetPrefix ? item.key.replace(targetPrefix, "") : item.key;
      if (!relative) return;
      if (relative.endsWith("/") && (!item.size || item.size === 0)) return;
      entries.push({
        type: "object",
        name: relative,
        key: item.key,
        size: item.size,
        lastModified: item.lastModified,
      });
    });
    const dedupedEntries = Array.from(
      new Map(entries.map((entry) => [entry.key || entry.prefix, entry])).values()
    );
    explorerState.bucketNextToken = res.nextContinuationToken || null;
    if (bucketExplorerMoreBtn) {
      bucketExplorerMoreBtn.style.display = explorerState.bucketNextToken ? "inline-block" : "none";
    }
    renderBucketExplorerRows(dedupedEntries);
  } catch (err) {
    if (requestSeq !== bucketExplorerRequestSeq) return;
    setErrorDetails({
      operation: "bucket:list",
      bucket,
      key: targetPrefix,
      message: err.message || "Unable to load bucket",
    });
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = err.message || "Unable to load bucket.";
  } finally {
    if (requestSeq === bucketExplorerRequestSeq) {
      explorerState.bucketLoading = false;
    }
  }
}

function renderBucketExplorerRows(entries = []) {
  if (!bucketExplorerBody) return;
  const list = Array.isArray(entries) ? entries : [];
  explorerState.bucketEntries = list;
  const filtered = filterEntries(list, explorerState.bucketFilter, "bucket");
  pruneSelection(explorerState.selectedBucketKeys, filtered, (item) => item.key || item.prefix);
  const sorted = sortEntries(filtered, sortState.bucket, "bucket");
  explorerState.bucketDisplayEntries = sorted;
  bucketExplorerBody.innerHTML = "";
  sorted.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.dataset.type = entry.type;
    row.dataset.key = entry.key || entry.prefix;
    row.dataset.index = index;
    row.tabIndex = 0;
    row.addEventListener("click", (event) => handleBucketRowClick(entry, event, index));
    row.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = event.key === "ArrowDown" ? index + 1 : index - 1;
        if (nextIndex < 0 || nextIndex >= explorerState.bucketDisplayEntries.length) return;
        const nextEntry = explorerState.bucketDisplayEntries[nextIndex];
        updateSelection({
          type: "bucket",
          id: nextEntry.key || nextEntry.prefix,
          index: nextIndex,
          event: { shiftKey: false, ctrlKey: false, metaKey: false },
        });
        bucketExplorerBody.querySelector(`tr[data-index="${nextIndex}"]`)?.focus();
      } else if (event.key === "Enter" && entry.type === "folder") {
        event.preventDefault();
        loadBucketExplorer(entry.prefix);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        loadBucketExplorer(bucketParentPrefix(explorerState.bucketPrefix));
      }
    });
    row.addEventListener("dblclick", () => {
      if (entry.type === "folder") {
        loadBucketExplorer(entry.prefix);
      }
    });

    const selectCell = document.createElement("td");
    const selectWrap = document.createElement("div");
    selectWrap.className = "entry-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "entry-checkbox";
    checkbox.checked = explorerState.selectedBucketKeys.has(entry.key || entry.prefix);
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      updateSelection({
        type: "bucket",
        id: entry.key || entry.prefix,
        index,
        event,
      });
    });
    selectWrap.appendChild(checkbox);
    selectWrap.appendChild(createEntryIcon(entry.type === "folder" ? "folder" : "file"));
    selectCell.appendChild(selectWrap);

    const nameCell = document.createElement("td");
    nameCell.innerText = entry.name;
    const transferKey = entry.key || entry.prefix;
    const badgeState = activeBucketTransfers.get(transferKey);
    if (badgeState && badgeState !== "done") {
      const badge = document.createElement("span");
      badge.className = `transfer-badge ${badgeState === "error" ? "error" : ""}`;
      badge.innerText = badgeState;
      nameCell.appendChild(badge);
    }
    const sizeCell = document.createElement("td");
    sizeCell.innerText = entry.type === "folder" ? "-" : fmtBytes(entry.size);
    const modifiedCell = document.createElement("td");
    modifiedCell.innerText = entry.type === "folder" ? "-" : fmtDate(entry.lastModified);

    row.appendChild(selectCell);
    row.appendChild(nameCell);
    row.appendChild(sizeCell);
    row.appendChild(modifiedCell);
    bucketExplorerBody.appendChild(row);
  });
  syncBucketSelectionStyles();
  renderBucketBreadcrumb(explorerState.bucketPrefix);
  updateSortIndicators("bucket", sortState.bucket);
  updateBucketExplorerChrome();
}

function buildLocalDestPath(base, name) {
  if (!base) return name;
  if (base.endsWith("\\") || base.endsWith("/")) {
    return `${base}${name}`;
  }
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base}${separator}${name}`;
}

function getDirname(fullPath) {
  if (!fullPath) return "";
  let normalized = fullPath;
  if (normalized.endsWith("\\") || normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  const idx = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (idx === -1) return normalized;
  return normalized.slice(0, idx) || normalized;
}

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function looksLikeAbsolutePath(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^[A-Za-z]:[\\/]/.test(text) || /^\\\\/.test(text) || /^\//.test(text);
}

function joinBucketKey(prefix, relativePath) {
  const normalizedPrefix = normalizePrefix(prefix || "");
  const cleanRelative = toPosixPath(relativePath || "").replace(/^\/+/, "");
  return `${normalizedPrefix}${cleanRelative}`;
}

function relativeLocalPath(basePath, fullPath) {
  const normalizedBase = toPosixPath(basePath || "").replace(/\/+$/, "");
  const normalizedFull = toPosixPath(fullPath || "");
  if (!normalizedBase) return normalizedFull;
  if (normalizedFull.toLowerCase().startsWith(`${normalizedBase.toLowerCase()}/`)) {
    return normalizedFull.slice(normalizedBase.length + 1);
  }
  return normalizedFull.split("/").pop() || normalizedFull;
}

async function listLocalFilesRecursively(rootPath) {
  const files = [];
  const queue = [rootPath];
  while (queue.length) {
    const current = queue.shift();
    // eslint-disable-next-line no-await-in-loop
    const res = await window.api.listLocalEntries({ path: current });
    (res.entries || []).forEach((entry) => {
      if (entry.isDirectory) {
        queue.push(entry.fullPath);
      } else {
        files.push(entry);
      }
    });
  }
  return files;
}

async function listBucketObjectsRecursively(bucket, prefix) {
  const res = await window.api.listAllBucketObjects({ bucket, prefix });
  return res.items || [];
}

async function getLocalEntryMeta(fullPath) {
  return window.api.getLocalEntryMeta({ path: fullPath });
}

async function buildUploadQueueFromPaths(paths, targetPrefix = "") {
  const queue = [];
  const seen = new Set();
  for (const fullPath of paths) {
    if (!fullPath || seen.has(fullPath)) continue;
    seen.add(fullPath);
    // eslint-disable-next-line no-await-in-loop
    const meta = await getLocalEntryMeta(fullPath);
    if (!meta?.isDirectory) {
      queue.push({
        fullPath,
        bucketKey: joinBucketKey(targetPrefix, meta?.name || baseName(fullPath)),
      });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const nestedFiles = await listLocalFilesRecursively(fullPath);
    nestedFiles.forEach((file) => {
      const rel = relativeLocalPath(fullPath, file.fullPath);
      const key = joinBucketKey(targetPrefix, `${meta.name}/${toPosixPath(rel)}`);
      queue.push({ fullPath: file.fullPath, bucketKey: key });
    });
  }
  return queue;
}

function getDroppedLocalPaths(dataTransfer) {
  if (!dataTransfer) return [];
  const jsonPayload = dataTransfer.getData("text/x-local-paths");
  if (jsonPayload) {
    try {
      const parsed = JSON.parse(jsonPayload);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => item?.fullPath).filter(Boolean);
      }
    } catch (err) {
      // Ignore malformed payload and fall through to simpler formats.
    }
  }
  const customPath = dataTransfer.getData("text/x-local-path");
  if (customPath) {
    return [customPath.trim()].filter(Boolean);
  }
  const filePaths = Array.from(dataTransfer.files || [])
    .map((file) => window.api.getPathForFile?.(file) || file?.path || "")
    .filter(Boolean);
  if (filePaths.length) {
    return filePaths;
  }
  const plainText = dataTransfer.getData("text/plain");
  if (looksLikeAbsolutePath(plainText)) {
    return [plainText.trim()];
  }
  return [];
}

async function queueBucketUploadsFromPaths(paths, prefix = explorerState.bucketPrefix || "") {
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  try {
    const queue = await buildUploadQueueFromPaths(paths, prefix);
    if (!queue.length) {
      showToast("No files found in dropped item(s).", "info");
      return;
    }
    for (const item of queue) {
      // eslint-disable-next-line no-await-in-loop
      await startExplorerUpload(item.fullPath, item.bucketKey);
    }
    showToast(`Queued ${queue.length} upload${queue.length === 1 ? "" : "s"}.`, "success");
    if (bucketExplorerStatus) {
      bucketExplorerStatus.innerText = `Queued ${queue.length} upload${queue.length === 1 ? "" : "s"} from drop.`;
    }
  } catch (err) {
    const message = err?.message || "Unable to queue dropped upload.";
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = message;
    showToast(message, "error");
    addLog(`Explorer drop upload failed: ${message}`);
  }
}

async function queueDashboardUploadsFromPaths(paths) {
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    els.uploadStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  try {
    const queue = await buildUploadQueueFromPaths(paths, "");
    if (!queue.length) {
      showToast("No files found in dropped item(s).", "info");
      return;
    }
    uploadFilePath = queue[0].fullPath;
    els.uploadFile.value = baseName(queue[0].fullPath);
    els.uploadKey.value = queue[0].bucketKey;
    for (const item of queue) {
      // eslint-disable-next-line no-await-in-loop
      await startUploadTransfer(item.fullPath, item.bucketKey);
    }
    showToast(`Queued ${queue.length} upload${queue.length === 1 ? "" : "s"}.`, "success");
    els.uploadStatus.innerText = `Queued ${queue.length} upload${queue.length === 1 ? "" : "s"} from drop.`;
  } catch (err) {
    const message = err?.message || "Unable to queue dropped upload.";
    els.uploadStatus.innerText = message;
    showToast(message, "error");
    addLog(`Dashboard drop upload failed: ${message}`);
  }
}

async function startExplorerUpload(filePath, keyOverride = "") {
  if (!filePath) {
    if (localBrowserStatus) localBrowserStatus.innerText = "Select a file to upload.";
    return;
  }
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  const key = keyOverride || joinBucketKey(explorerState.bucketPrefix || "", baseName(filePath));
  const transfer = await window.api.startUpload({
    filePath,
    key,
    bucket,
  });
  transferStore.upsert(transfer);
  renderTransfers();
  addLog(`Explorer upload queued: ${filePath} -> ${key}`);
  loadBucketExplorer(explorerState.bucketPrefix);
}

async function startExplorerDownload(entry) {
  if (!entry || entry.type !== "object") {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Select an object to download.";
    return;
  }
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket before downloading.";
    return;
  }
  if (!explorerState.localPath) {
    if (localBrowserStatus) localBrowserStatus.innerText = "Pick a local folder to download into.";
    return;
  }
  const dest = buildLocalDestPath(explorerState.localPath, baseName(entry.key));
  const transfer = await window.api.startDownload({
    key: entry.key,
    bucket,
    dest,
  });
  transferStore.upsert(transfer);
  renderTransfers();
  addLog(`Explorer download queued: ${entry.key} -> ${dest}`);
}

async function startExplorerDownloadToRelativeKey(objectKey, relativePath) {
  const bucket = els.bucket.value.trim();
  if (!bucket || !objectKey || !explorerState.localPath) return;
  const relative = toPosixPath(relativePath || baseName(objectKey)).replace(/^\/+/, "");
  const localRelative = relative.replace(/\//g, "\\");
  const dest = buildLocalDestPath(explorerState.localPath, localRelative);
  const transfer = await window.api.startDownload({
    key: objectKey,
    bucket,
    dest,
  });
  transferStore.upsert(transfer);
  renderTransfers();
}

function renderBucketRows(items, { append = false } = {}) {
  if (!append) bucketBody.innerHTML = "";
  const startIndex = append ? bucketBody.children.length : 0;
  items.forEach((item, itemIndex) => {
    const row = document.createElement("tr");
    const rowKey = item.key || item.prefix || "";
    row.dataset.key = rowKey;
    row.dataset.type = item.type || "object";
    row.dataset.index = `${startIndex + itemIndex}`;
    row.tabIndex = 0;
    if (rowKey && rowKey === selectedKey) {
      row.style.background = "rgba(34,211,238,0.08)";
    }

    const selectCell = document.createElement("td");
    selectCell.style.width = "30px";
    if (item.type === "object") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.key === selectedKey;
      checkbox.onclick = (e) => {
        e.stopPropagation();
        setSelectedKey(checkbox.checked ? item.key : "");
      };
      selectCell.appendChild(checkbox);
    }

    const name = document.createElement("td");
    const entryWrap = document.createElement("div");
    entryWrap.className = "entry-cell";
    entryWrap.appendChild(createEntryIcon(item.type === "folder" ? "folder" : "file"));
    const nameText = document.createElement("span");
    nameText.innerText = item.name || item.key;
    entryWrap.appendChild(nameText);
    name.appendChild(entryWrap);
    name.style.cursor = "pointer";
    if (item.type === "folder") {
      name.onclick = () => {
        openDashboardBucketPrefix(item.prefix || "");
      };
    } else {
      name.onclick = () => {
        setSelectedKey(item.key);
      };
    }

    const size = document.createElement("td");
    size.innerText = item.type === "folder" ? "-" : fmtBytes(item.size);
    const modified = document.createElement("td");
    modified.innerText = item.type === "folder" ? "-" : fmtDate(item.lastModified);
    const actions = document.createElement("td");

    if (item.type === "folder") {
      const openBtn = document.createElement("button");
      openBtn.className = "secondary";
      openBtn.style.width = "auto";
      openBtn.style.padding = "6px 10px";
      openBtn.innerText = "Open";
      openBtn.onclick = () => {
        openDashboardBucketPrefix(item.prefix || "");
      };
      actions.appendChild(openBtn);
    } else {
      const dlBtn = document.createElement("button");
      dlBtn.className = "secondary";
      dlBtn.style.width = "auto";
      dlBtn.style.padding = "6px 10px";
      dlBtn.innerText = "Download";
      dlBtn.onclick = () => {
        els.downloadKey.value = item.key;
        els.downloadFilename.value = item.key.split("/").pop();
        els.uploadKey.value = item.key;
        if (els.downloadFolder.value) {
          const filename = els.downloadFilename.value || item.key.split("/").pop();
          const dest = `${els.downloadFolder.value.replace(/\\$/, "")}\\${filename}`;
          window.api
            .startDownload({ key: item.key, bucket: els.bucket.value.trim(), dest })
            .then(renderTransferRow);
          addLog(`Download started: ${item.key} -> ${dest}`);
        }
      };

      const renameBtn = document.createElement("button");
      renameBtn.className = "secondary";
      renameBtn.style.width = "auto";
      renameBtn.style.padding = "6px 10px";
      renameBtn.style.marginLeft = "6px";
      renameBtn.innerText = "Rename";
      renameBtn.onclick = async () => {
        const currentName = item.key;
        const newName = await showInputPrompt({ title: "Rename object", defaultValue: currentName });
        if (newName && newName !== currentName) {
          await window.api.renameObject({ key: currentName, newKey: newName, bucket: els.bucket.value.trim() });
          refreshBucket({ append: false });
          addLog(`Renamed object: ${currentName} -> ${newName}`);
        }
      };

      const delBtn = document.createElement("button");
      delBtn.className = "secondary danger";
      delBtn.style.width = "auto";
      delBtn.style.padding = "6px 10px";
      delBtn.style.marginLeft = "6px";
      delBtn.innerText = "Delete";
      delBtn.onclick = async () => {
        const bucketName = els.bucket.value.trim();
        const allowed = await confirmDeletion({
          label: `"${item.key}"`,
          count: 1,
          totalSize: item.size || 0,
          bucketName,
          formatBytes: fmtBytes,
          notify: showToast,
        });
        if (!allowed) return;
        await window.api.deleteObject({ key: item.key, bucket: bucketName });
        refreshBucket({ append: false });
        addLog(`Deleted object: ${item.key}`);
      };

      actions.appendChild(dlBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
    }

    row.onclick = (e) => {
      if (e.target.closest("button,input")) return;
      if (item.type === "folder") {
        openDashboardBucketPrefix(item.prefix || "");
        return;
      }
      setSelectedKey(item.key);
    };
    row.onkeydown = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = Number.parseInt(row.dataset.index || "0", 10);
        const delta = e.key === "ArrowDown" ? 1 : -1;
        bucketBody.querySelector(`tr[data-index="${currentIndex + delta}"]`)?.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (item.type === "folder") {
          openDashboardBucketPrefix(item.prefix || "");
        } else {
          setSelectedKey(item.key);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        openDashboardBucketPrefix(bucketParentPrefix(els.bucketPrefix.value.trim()));
      }
    };

    row.appendChild(selectCell);
    row.appendChild(name);
    row.appendChild(size);
    row.appendChild(modified);
    row.appendChild(actions);
    bucketBody.appendChild(row);
  });
}

function openDashboardBucketPrefix(prefix) {
  const nextPrefix = normalizePrefix(prefix || "");
  els.bucketPrefix.value = nextPrefix;
  persistExplorerPrefs({ dashboardBucketPrefix: nextPrefix });
  refreshBucket({ append: false });
}

function buildDashboardBucketEntries({ prefixes = [], items = [] }, currentPrefix = "") {
  const entries = [];
  const normalizedPrefix = normalizePrefix(currentPrefix);
  prefixes.forEach((prefix) => {
    const relative = normalizedPrefix ? prefix.replace(normalizedPrefix, "") : prefix;
    entries.push({
      type: "folder",
      name: relative.replace(/\/$/, "") || prefix.replace(/\/$/, ""),
      prefix,
    });
  });
  items.forEach((item) => {
    const relative = normalizedPrefix ? item.key.replace(normalizedPrefix, "") : item.key;
    if (!relative) return;
    if (relative.endsWith("/") && (!item.size || item.size === 0)) return;
    entries.push({
      type: "object",
      name: relative,
      key: item.key,
      size: item.size,
      lastModified: item.lastModified,
    });
  });
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });
  return entries;
}

function renderTransferRow(transfer) {
  let row = transferBody.querySelector(`tr[data-id="${transfer.id}"]`);
  if (!row) {
    row = document.createElement("tr");
    row.dataset.id = transfer.id;
    row.innerHTML = `
      <td class="type"></td>
      <td class="key"></td>
      <td class="state"></td>
      <td class="progress"></td>
      <td class="actions"></td>
    `;
    transferBody.appendChild(row);
  }

  row.querySelector(".type").innerText = transfer.type;
  row.querySelector(".key").innerText = transfer.key;
  const stateCell = row.querySelector(".state");
  stateCell.innerText = transfer.state || "pending";

  const loaded = transfer.loaded || 0;
  const total = transfer.total || 0;
  const pct = total ? Math.min(100, (loaded / total) * 100).toFixed(1) : "-";
  const progressCell = row.querySelector(".progress");
  progressCell.innerHTML = `
    <div class="progress-bar"><span style="width:${total ? pct : 0}%;"></span></div>
    <div class="muted">${fmtBytes(loaded)} / ${total ? fmtBytes(total) : "?"} (${pct}%)</div>
  `;

  const actions = row.querySelector(".actions");
  actions.innerHTML = "";
  row.draggable = transfer.state === "queued";
  row.classList.toggle("queued-row", transfer.state === "queued");
  row.ondragstart = null;
  row.ondragover = null;
  row.ondrop = null;
  if (transfer.state === "queued") {
    row.ondragstart = (event) => {
      draggedQueuedTransferId = transfer.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", transfer.id);
    };
    row.ondragover = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    };
    row.ondrop = async (event) => {
      event.preventDefault();
      const sourceId = draggedQueuedTransferId || event.dataTransfer.getData("text/plain");
      if (!sourceId || sourceId === transfer.id) return;
      const queuedRows = Array.from(transferBody.querySelectorAll("tr.queued-row"));
      const targetIndex = queuedRows.findIndex((queuedRow) => queuedRow.dataset.id === transfer.id);
      if (targetIndex < 0) return;
      await window.api.reorderTransfer({ id: sourceId, targetIndex });
      refreshTransfers();
    };
  }
  if (transfer.state === "running") {
    const pause = document.createElement("button");
    pause.className = "secondary";
    pause.style.width = "auto";
    pause.style.padding = "6px 10px";
    pause.innerText = "Pause";
    pause.onclick = () => window.api.pauseTransfer(transfer.id);
    actions.appendChild(pause);

    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.style.width = "auto";
    cancel.style.padding = "6px 10px";
    cancel.style.marginLeft = "6px";
    cancel.innerText = "Cancel";
    cancel.onclick = () => window.api.cancelTransfer(transfer.id);
    actions.appendChild(cancel);
  } else if (transfer.state === "paused") {
    const resume = document.createElement("button");
    resume.className = "secondary";
    resume.style.width = "auto";
    resume.style.padding = "6px 10px";
    resume.innerText = "Resume";
    resume.onclick = async () => {
      const resumed = await window.api.resumeTransfer(transfer.id);
      if (resumed) {
        transferStore.upsert(resumed);
        renderTransfers();
      }
    };
    actions.appendChild(resume);

    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.style.width = "auto";
    cancel.style.padding = "6px 10px";
    cancel.style.marginLeft = "6px";
    cancel.innerText = "Cancel";
    cancel.onclick = () => window.api.cancelTransfer(transfer.id);
    actions.appendChild(cancel);
  } else if (transfer.state === "queued") {
    const queued = document.createElement("span");
    queued.className = "muted";
    queued.innerText = `Queued (${transfer.queuePriority || "normal"})`;
    actions.appendChild(queued);

    const boost = document.createElement("button");
    boost.className = "secondary";
    boost.style.width = "auto";
    boost.style.padding = "6px 10px";
    boost.style.marginLeft = "6px";
    boost.innerText = "Prioritize";
    boost.onclick = async () => {
      await window.api.setTransferPriority({ id: transfer.id, priority: "high" });
    };
    actions.appendChild(boost);

    const cancel = document.createElement("button");
    cancel.className = "secondary";
    cancel.style.width = "auto";
    cancel.style.padding = "6px 10px";
    cancel.style.marginLeft = "6px";
    cancel.innerText = "Cancel";
    cancel.onclick = () => window.api.cancelTransfer(transfer.id);
    actions.appendChild(cancel);
  } else if (transfer.state === "retrying") {
    const retrying = document.createElement("span");
    retrying.className = "muted";
    const eta = transfer.nextRetryAt ? new Date(transfer.nextRetryAt).toLocaleTimeString() : "soon";
    retrying.innerText = `Retrying (${transfer.retryCount || 0}/${transfer.maxRetries || 0}) at ${eta}`;
    actions.appendChild(retrying);
  } else if (transfer.state === "error") {
    const msg = document.createElement("span");
    msg.className = "muted";
    msg.innerText = transfer.error || "Failed";
    actions.appendChild(msg);

    const retry = document.createElement("button");
    retry.className = "secondary";
    retry.style.width = "auto";
    retry.style.padding = "6px 10px";
    retry.style.marginLeft = "6px";
    retry.innerText = "Retry";
    retry.onclick = async () => {
      try {
        const restarted = await window.api.retryTransfer(transfer);
        if (restarted) {
          transferStore.upsert(restarted);
          renderTransfers();
          addLog(`Retry started: ${transfer.type} ${transfer.key}`);
        }
      } catch (err) {
        addLog(`Retry failed: ${transfer.type} ${transfer.key} - ${err.message || err}`);
      }
    };
    actions.appendChild(retry);
    setErrorDetails(transfer.errorDetails || {
      operation: transfer.type || "",
      bucket: transfer.bucket || "",
      key: transfer.key || "",
      message: transfer.error || "Failed",
    });
  }
}

function updateTransferSummary(list) {
  if (!transferSummaryEl) return;
  const activeCount = list.filter((entry) =>
    ["queued", "running", "paused", "retrying"].includes(entry.state)
  ).length;
  const errorCount = list.filter((entry) => entry.state === "error").length;
  transferSummaryEl.innerText = `${list.length} shown, ${activeCount} active, ${errorCount} error${errorCount === 1 ? "" : "s"}. Drag queued rows to reorder.`;
}

function renderTransfers() {
  if (!transferBody) return;
  transferBody.innerHTML = "";
  const filteredTransfers = transferStore.filtered({
    state: transferFilterEl?.value || "all",
    query: transferSearchEl?.value || "",
  });
  filteredTransfers.forEach(renderTransferRow);
  updateTransferSummary(filteredTransfers);
}

function renderConnections(state) {
  connections = state.connections || [];
  activeConnectionId = state.activeConnectionId || null;
  connectionSelect.innerHTML = "";
  connections.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.innerText = c.name || c.endpoint;
    if (c.id === activeConnectionId) opt.selected = true;
    connectionSelect.appendChild(opt);
  });
  if (connections.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.innerText = "No saved connections";
    connectionSelect.appendChild(opt);
  }
  syncConnectionPanelCollapsed(connections.length > 0);
  renderConnectionTable();
}

function updateBucketMetrics(metrics) {
  if (!metricBucketEl) return;
  if (!metrics) {
    metricBucketEl.innerText = "-";
    metricObjectsEl.innerText = "-";
    metricSizeEl.innerText = "-";
    return;
  }
  metricBucketEl.innerText = metrics.bucket || "-";
  metricObjectsEl.innerText = metrics.objectCount != null ? metrics.objectCount.toLocaleString() : "-";
  metricSizeEl.innerText = metrics.totalSize != null ? fmtBytes(metrics.totalSize) : "-";
}

function applyConnection(conn) {
  if (!conn) return;
  els.endpoint.value = conn.endpoint || "";
  els.accessKeyId.value = conn.accessKeyId || "";
  setSecretInputState(Boolean(conn.hasSecret));
  if (!conn.hasSecret && conn.secretAccessKey) {
    els.secretAccessKey.value = conn.secretAccessKey;
  }
  els.bucket.value = conn.bucket || "";
  const partSizeMb = Math.round((conn.partSize || 8 * MB) / MB);
  els.partSize.value = Math.min(Math.max(partSizeMb, TRANSFER_LIMITS.minPartSizeMb), TRANSFER_LIMITS.maxPartSizeMb);
  els.concurrency.value = Math.min(
    Math.max(conn.concurrency || 2, 1),
    TRANSFER_LIMITS.maxConcurrency
  );
  if (els.maxActiveTransfers) els.maxActiveTransfers.value = `${conn.maxActiveTransfers || 3}`;
  if (els.maxActiveUploads) els.maxActiveUploads.value = `${conn.maxActiveUploads || 2}`;
  if (els.maxActiveDownloads) els.maxActiveDownloads.value = `${conn.maxActiveDownloads || 2}`;
  if (els.maxRetries) els.maxRetries.value = `${conn.maxRetries ?? 3}`;
  if (els.softDeleteEnabled) els.softDeleteEnabled.checked = Boolean(conn.softDeleteEnabled);
  if (els.trashPrefix) els.trashPrefix.value = conn.trashPrefix || ".trash/";
  els.connectionName.value = conn.name || "";
  const prefs = getExplorerPrefsForActiveConnection();
  const dashboardPrefix = normalizePrefix(prefs.dashboardBucketPrefix || "");
  const explorerPrefix = normalizePrefix(prefs.bucketPrefix || "");
  if (els.bucketPrefix) {
    els.bucketPrefix.value = dashboardPrefix;
  }
  dashboardBucketPrefix = dashboardPrefix;
  bucketNextToken = null;
  dashboardBucketRequestSeq += 1;
  bucketExplorerRequestSeq += 1;
  explorerState.localFilter = "";
  explorerState.bucketFilter = "";
  explorerState.bucketNextToken = null;
  explorerState.bucketLoading = false;
  explorerState.selectedBucketKeys.clear();
  explorerState.lastBucketIndex = null;
  explorerState.selectedLocalPaths.clear();
  explorerState.lastLocalIndex = null;
  if (localExplorerFilterInput) localExplorerFilterInput.value = "";
  if (bucketExplorerFilterInput) bucketExplorerFilterInput.value = "";
  refreshBucket();
  loadBucketExplorer(explorerPrefix, { force: true });
  loadLocalExplorer(prefs.localPath || explorerState.localPath || undefined);
}

async function refreshTransfers() {
  const list = await window.api.listTransfers();
  transferStore.replaceAll(list);
  renderTransfers();
}

async function refreshBucket({ append = false } = {}) {
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    els.bucketStatus.innerText = "Set a bucket name first.";
    bucketBody.innerHTML = "";
    bucketMoreBtn.style.display = "none";
    renderDashboardBucketBreadcrumb("");
    updateBucketMetrics(null);
    return;
  }
  try {
    const requestSeq = ++dashboardBucketRequestSeq;
    els.bucketStatus.innerText = "Loading...";
    const requestedPrefix = normalizePrefix(els.bucketPrefix.value.trim());
    const prefixChanged = dashboardBucketPrefix !== requestedPrefix;
    const effectiveAppend = append && !prefixChanged;
    if (!effectiveAppend) {
      bucketNextToken = null;
      if (selectedKey && !selectedKey.startsWith(requestedPrefix)) {
        setSelectedKey("");
      }
    }
    const res = await window.api.listBucket({
      bucket,
      prefix: requestedPrefix,
      delimiter: "/",
      continuationToken: effectiveAppend ? bucketNextToken : undefined,
    });
    if (requestSeq !== dashboardBucketRequestSeq) return;
    dashboardBucketPrefix = requestedPrefix;
    persistExplorerPrefs({ dashboardBucketPrefix: requestedPrefix });
    if (els.bucketPrefix.value !== requestedPrefix) {
      els.bucketPrefix.value = requestedPrefix;
    }
    bucketNextToken = res.nextContinuationToken;
    bucketMoreBtn.style.display = bucketNextToken ? "inline-block" : "none";
    const entries = buildDashboardBucketEntries(res, requestedPrefix);
    renderBucketRows(entries, { append: effectiveAppend });
    const folderCount = entries.filter((entry) => entry.type === "folder").length;
    const objectCount = entries.filter((entry) => entry.type === "object").length;
    const prefixLabel = requestedPrefix ? ` for prefix ${requestedPrefix}` : "";
    els.bucketStatus.innerText = `${effectiveAppend ? "Loaded more" : "Loaded"} ${entries.length} item${
      entries.length === 1 ? "" : "s"
    } (${folderCount} folder${folderCount === 1 ? "" : "s"}, ${objectCount} object${
      objectCount === 1 ? "" : "s"
    })${prefixLabel}.`;
    renderDashboardBucketBreadcrumb(requestedPrefix);
    updateBucketMetrics(res.metrics);
  } catch (err) {
    if (requestSeq !== dashboardBucketRequestSeq) return;
    setErrorDetails({
      operation: "bucket:list",
      bucket,
      key: requestedPrefix,
      message: err.message || "Failed to list bucket",
    });
    els.bucketStatus.innerText = err.message || "Failed to list bucket.";
    bucketMoreBtn.style.display = "none";
    renderDashboardBucketBreadcrumb(els.bucketPrefix.value.trim());
    updateBucketMetrics(null);
  }
}

window.api.onTransferUpdate((transfer) => {
  transferStore.upsert(transfer);
  renderTransfers();
  updateExplorerTransferIndicators(transfer);
  if (transfer?.type === "upload" && transfer.state === "done") {
    refreshBucket({ append: false });
  }
  if (transfer?.state === "done") {
    addLog(`Transfer completed: ${transfer.type} ${transfer.key}`);
  }
  if (transfer?.state === "error") {
    addLog(`Transfer error: ${transfer.type} ${transfer.key} - ${transfer.error || "unknown error"}`);
  }
});

document.getElementById("save-config").addEventListener("click", async () => {
  const transferSettings = validateTransferSettings();
  if (!transferSettings) return;
  const secretValue = els.secretAccessKey.value.trim();
  const payload = {
    endpoint: els.endpoint.value.trim(),
    accessKeyId: els.accessKeyId.value.trim(),
    bucket: els.bucket.value.trim(),
    partSize: transferSettings.partSizeBytes,
    concurrency: transferSettings.concurrency,
    maxActiveTransfers: Math.max(1, Math.min(16, Number(els.maxActiveTransfers?.value) || 3)),
    maxActiveUploads: Math.max(1, Math.min(16, Number(els.maxActiveUploads?.value) || 2)),
    maxActiveDownloads: Math.max(1, Math.min(16, Number(els.maxActiveDownloads?.value) || 2)),
    maxRetries: Math.max(0, Math.min(10, Number(els.maxRetries?.value) || 3)),
    softDeleteEnabled: Boolean(els.softDeleteEnabled?.checked),
    trashPrefix: (els.trashPrefix?.value || ".trash/").trim() || ".trash/",
    name: els.connectionName.value.trim(),
  };
  if (secretValue) {
    payload.secretAccessKey = secretValue;
  } else if (els.secretAccessKey.dataset.hasSecret !== "true") {
    payload.secretAccessKey = "";
  }
  const saved = await window.api.saveConnection(payload);
  const state = await window.api.listConnections();
  renderConnections(state);
  connectionSelect.value = saved.id;
  setSecretInputState(Boolean(saved.hasSecret));
  els.configStatus.innerText = `Saved ${saved.name || "connection"}.`;
  setTimeout(() => (els.configStatus.innerText = ""), 1500);
  refreshBucket();
  addLog(`Saved connection: ${saved.name || saved.endpoint || "unnamed"}`);
});

document.getElementById("pick-upload").addEventListener("click", async () => {
  const file = await window.api.pickFile();
  if (file) {
    uploadFilePath = file;
    const basename = baseName(file);
    els.uploadFile.value = basename;
    els.uploadKey.value = basename;
  }
});

els.uploadFile.addEventListener("input", () => {
  const name = baseName(els.uploadFile.value);
  els.uploadFile.value = name;
  if (!els.uploadKey.value) {
    els.uploadKey.value = name;
  }
});

if (els.partSize) {
  els.partSize.addEventListener("blur", () => {
    const result = validateTransferSettings({ quiet: true });
    if (result) {
      els.partSize.value = Math.round(result.partSizeBytes / MB);
    }
  });
}
if (els.concurrency) {
  els.concurrency.addEventListener("blur", () => {
    const result = validateTransferSettings({ quiet: true });
    if (result) {
      els.concurrency.value = result.concurrency;
    }
  });
}
if (localExplorerFilterInput) {
  localExplorerFilterInput.addEventListener("input", () => {
    explorerState.localFilter = localExplorerFilterInput.value.trim();
    explorerState.lastLocalIndex = null;
    renderLocalExplorerRows(explorerState.localEntries);
  });
}
if (bucketExplorerFilterInput) {
  bucketExplorerFilterInput.addEventListener("input", () => {
    explorerState.bucketFilter = bucketExplorerFilterInput.value.trim();
    explorerState.lastBucketIndex = null;
    renderBucketExplorerRows(explorerState.bucketEntries);
  });
}

window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (dropzone) dropzone.classList.add("dragging");
});

window.addEventListener("dragleave", (e) => {
  if (e.target === document || e.target === document.body) {
    if (dropzone) dropzone.classList.remove("dragging");
  }
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (dropzone) dropzone.classList.remove("dragging");
  const droppedPaths = getDroppedLocalPaths(e.dataTransfer);
  if (!droppedPaths.length) return;
  if (!droppedPaths[0]) {
    addLog("Dropped item missing path (try dropping from Explorer).");
    return;
  }
  const label = droppedPaths.length === 1 ? baseName(droppedPaths[0]) : `${droppedPaths.length} items`;
  addLog(`Dropped ${label} for upload`);
  queueDashboardUploadsFromPaths(droppedPaths);
});

document.getElementById("start-upload").addEventListener("click", async () => {
  await startUploadTransfer(uploadFilePath, els.uploadKey.value);
});

document.getElementById("pick-download-folder").addEventListener("click", async () => {
  const folder = await window.api.pickDir();
  if (folder) {
    els.downloadFolder.value = folder;
  }
});

document.getElementById("start-download").addEventListener("click", async () => {
  if (!els.downloadKey.value || !els.downloadFolder.value) {
    els.downloadStatus.innerText = "Enter key and choose destination folder.";
    return;
  }
  const filename = els.downloadFilename.value.trim() || els.downloadKey.value.split("/").pop();
  const folder = els.downloadFolder.value.replace(/\\$/, "");
  const dest = `${folder}\\${filename}`;
  try {
    const transfer = await window.api.startDownload({
      key: els.downloadKey.value,
      bucket: els.bucket.value.trim(),
      dest,
    });
    transferStore.upsert(transfer);
    renderTransfers();
    els.downloadStatus.innerText = `Saving to ${dest}`;
    addLog(`Download started: ${els.downloadKey.value} -> ${dest}`);
    setErrorDetails(null);
  } catch (err) {
    els.downloadStatus.innerText = err.message || "Unable to start download.";
    setErrorDetails({
      operation: "download:start",
      bucket: els.bucket.value.trim(),
      key: els.downloadKey.value,
      message: err.message || "Unable to start download",
    });
  }
});

document.getElementById("refresh-btn").addEventListener("click", refreshTransfers);
document.getElementById("clear-finished").addEventListener("click", async () => {
  const list = await window.api.clearFinishedTransfers();
  transferStore.replaceAll(list);
  renderTransfers();
});
if (transferFilterEl) {
  transferFilterEl.addEventListener("change", () => renderTransfers());
}
if (transferSearchEl) {
  transferSearchEl.addEventListener("input", () => renderTransfers());
}

document.getElementById("bucket-refresh").addEventListener("click", () => refreshBucket({ append: false }));
if (bucketUpBtn) {
  bucketUpBtn.addEventListener("click", () => {
    openDashboardBucketPrefix(bucketParentPrefix(els.bucketPrefix.value.trim()));
  });
}
bucketMoreBtn.addEventListener("click", () => refreshBucket({ append: true }));
els.bucketPrefix.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    openDashboardBucketPrefix(els.bucketPrefix.value);
  }
});

loadConnectionBtn.addEventListener("click", async () => {
  const selectedId = connectionSelect.value;
  if (!selectedId) return;
  const state = await window.api.setActiveConnection(selectedId);
  renderConnections(state);
  applyConnection(state.current);
  addLog(`Switched connection: ${state.current?.name || state.current?.endpoint || selectedId}`);
});

if (toggleConnectionPanelBtn) {
  toggleConnectionPanelBtn.addEventListener("click", () => {
    setConnectionPanelCollapsed(!isConnectionPanelCollapsed);
  });
}
if (toggleThemeBtn) {
  toggleThemeBtn.addEventListener("click", toggleTheme);
}

function setActivePage(page) {
  Object.entries(pages).forEach(([key, node]) => {
    if (!node) return;
    node.style.display = key === page ? "" : "none";
  });
}

document.getElementById("nav-dashboard").addEventListener("click", () => {
  setActivePage("dashboard");
});

document.getElementById("nav-explorer").addEventListener("click", () => {
  setActivePage("explorer");
  loadLocalExplorer(explorerState.localPath || undefined);
  loadBucketExplorer(explorerState.bucketPrefix || "");
});

document.getElementById("nav-connections").addEventListener("click", async () => {
  setActivePage("connections");
  const state = await window.api.listConnections();
  renderConnections(state);
});

document.getElementById("nav-logs").addEventListener("click", () => {
  setActivePage("logs");
  renderLogs();
});

document.getElementById("clear-logs").addEventListener("click", () => {
  logs.length = 0;
  renderLogs();
});
if (logSearchInput) {
  logSearchInput.addEventListener("input", () => renderLogs());
}
if (logLevelFilter) {
  logLevelFilter.addEventListener("change", () => renderLogs());
}
const copyLogsBtn = document.getElementById("copy-logs");
if (copyLogsBtn) {
  copyLogsBtn.addEventListener("click", async () => {
    const text = getVisibleLogText();
    if (!text) {
      showToast("No log entries to copy.", "info");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Logs copied to clipboard.", "success");
    } catch (err) {
      showToast("Unable to copy logs.", "error");
    }
  });
}
const exportLogsBtn = document.getElementById("export-logs");
if (exportLogsBtn) {
  exportLogsBtn.addEventListener("click", () => {
    const text = getVisibleLogText();
    if (!text) {
      showToast("No log entries to export.", "info");
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `s3-client-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Logs exported.", "success");
  });
}
if (copyErrorDetailsBtn) {
  copyErrorDetailsBtn.addEventListener("click", async () => {
    if (!latestErrorDetails) {
      showToast("No error details available.", "info");
      return;
    }
    const text = [
      `Operation: ${latestErrorDetails.operation || "-"}`,
      `Bucket: ${latestErrorDetails.bucket || "-"}`,
      `Key: ${latestErrorDetails.key || "-"}`,
      `HTTP Status: ${latestErrorDetails.httpStatus || "-"}`,
      `Request ID: ${latestErrorDetails.requestId || "-"}`,
      `Type: ${latestErrorDetails.type || "-"}`,
      `Message: ${maskSensitiveText(latestErrorDetails.message || "-")}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Error details copied.", "success");
    } catch (err) {
      showToast("Unable to copy error details.", "error");
    }
  });
}

document.getElementById("connection-refresh").addEventListener("click", async () => {
  const state = await window.api.listConnections();
  renderConnections(state);
  applyConnection(state.current || state);
});
if (connectionSearchInput) {
  connectionSearchInput.addEventListener("input", () => renderConnectionTable());
}
document.getElementById("connection-add").addEventListener("click", async () => {
  const transferSettings = validateTransferSettings();
  if (!transferSettings) return;
  const name = await showInputPrompt({
    title: "Connection name",
    defaultValue: "New S3 connection",
    okLabel: "Next",
  });
  if (!name) return;
  const endpoint = await showInputPrompt({ title: "Endpoint URL", defaultValue: "", okLabel: "Next" });
  if (!endpoint) return;
  const accessKeyId = await showInputPrompt({ title: "Access Key ID", defaultValue: "", okLabel: "Next" });
  if (!accessKeyId) return;
  const secretAccessKey = await showInputPrompt({
    title: "Secret Access Key",
    defaultValue: "",
    okLabel: "Next",
  });
  if (!secretAccessKey) return;
  let bucket = await showInputPrompt({ title: "Bucket name (optional)", defaultValue: "", okLabel: "Add" });
  if (!bucket) {
    const buckets = await window.api.listAvailableBuckets();
    if (buckets?.length) {
      const options = buckets.map((b, idx) => `${idx + 1}. ${b.name}`).join("\n");
      const choice = await showInputPrompt({
        title: `Select bucket number or type name:\n${options}`,
        defaultValue: "",
        okLabel: "Add",
      });
      const idx = Number(choice);
      if (!Number.isNaN(idx) && buckets[idx - 1]) {
        bucket = buckets[idx - 1].name;
      } else if (choice) {
        bucket = choice;
      }
    }
  }
  await window.api.saveConnection({
    name,
    endpoint: endpoint.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucket: bucket?.trim(),
    partSize: transferSettings.partSizeBytes,
    concurrency: transferSettings.concurrency,
    maxActiveTransfers: Math.max(1, Math.min(16, Number(els.maxActiveTransfers?.value) || 3)),
    maxActiveUploads: Math.max(1, Math.min(16, Number(els.maxActiveUploads?.value) || 2)),
    maxActiveDownloads: Math.max(1, Math.min(16, Number(els.maxActiveDownloads?.value) || 2)),
    maxRetries: Math.max(0, Math.min(10, Number(els.maxRetries?.value) || 3)),
    softDeleteEnabled: Boolean(els.softDeleteEnabled?.checked),
    trashPrefix: (els.trashPrefix?.value || ".trash/").trim() || ".trash/",
  });
  const state = await window.api.listConnections();
  renderConnections(state);
  applyConnection(state.current || state);
  addLog(`Added connection: ${name}`);
});

if (localPathGoBtn) {
  localPathGoBtn.addEventListener("click", () => {
    loadLocalExplorer(localPathInput?.value);
  });
}
if (localPathInput) {
  localPathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loadLocalExplorer(localPathInput.value);
    }
  });
}
if (localDriveSelect) {
  localDriveSelect.addEventListener("change", () => {
    const target = localDriveSelect.value;
    if (target) {
      loadLocalExplorer(target);
    }
  });
}
if (localRefreshBtn) {
  localRefreshBtn.addEventListener("click", () => loadLocalExplorer());
}
if (localChooseBtn) {
  localChooseBtn.addEventListener("click", async () => {
    const folder = await window.api.pickDir();
    if (folder) loadLocalExplorer(folder);
  });
}
if (localUpBtn) {
  localUpBtn.addEventListener("click", () => {
    if (explorerState.localParent) {
      loadLocalExplorer(explorerState.localParent);
    }
  });
}
if (localNewFolderBtn) {
  localNewFolderBtn.addEventListener("click", async () => {
    if (!explorerState.localPath) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Pick a base folder first.";
      return;
    }
    const name = await showInputPrompt({ title: "Folder name", defaultValue: "New Folder" });
    if (!name) return;
    try {
      await window.api.createLocalFolder({ parentPath: explorerState.localPath, name });
      loadLocalExplorer();
    } catch (err) {
      if (localBrowserStatus) localBrowserStatus.innerText = err.message || "Unable to create folder.";
    }
  });
}
if (localRenameBtn) {
  localRenameBtn.addEventListener("click", async () => {
    const selection = getLocalSelectionEntries();
    if (selection.length === 0) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Select an entry to rename.";
      showToast("Select a single entry to rename.", "info");
      return;
    }
    if (selection.length > 1) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Select only one entry to rename.";
      showToast("Rename works on one entry at a time.", "info");
      return;
    }
    const entry = selection[0];
    const newName = await showInputPrompt({
      title: `Rename ${entry.isDirectory ? "folder" : "file"}`,
      defaultValue: entry.name,
    });
    if (!newName || newName === entry.name) return;
    try {
      await window.api.renameLocalEntry({ fullPath: entry.fullPath, newName });
      loadLocalExplorer();
    } catch (err) {
      if (localBrowserStatus) localBrowserStatus.innerText = err.message || "Unable to rename.";
    }
  });
}
if (localDeleteBtn) {
  localDeleteBtn.addEventListener("click", async () => {
    const selection = getLocalSelectionEntries();
    if (!selection.length) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Select entries to delete.";
      showToast("Select one or more entries to delete.", "info");
      return;
    }
    const label = selection.length === 1 ? `"${selection[0].name}"` : `${selection.length} items`;
    const totalSize = selection.reduce((acc, entry) => acc + (entry.size || 0), 0);
    const confirmed = await confirmDeletion({
      label,
      count: selection.length,
      totalSize,
      bucketName: "",
      formatBytes: fmtBytes,
      notify: showToast,
    });
    if (!confirmed) return;
    try {
      for (const entry of selection) {
        // eslint-disable-next-line no-await-in-loop
        await window.api.deleteLocalEntry({ fullPath: entry.fullPath });
      }
      loadLocalExplorer();
      showToast(
        `Moved ${selection.length} item${selection.length === 1 ? "" : "s"} to the recycle bin.`,
        "success"
      );
    } catch (err) {
      if (localBrowserStatus) localBrowserStatus.innerText = err.message || "Unable to delete entry.";
      showToast(err.message || "Unable to delete entry.", "error");
    }
  });
}
if (localUploadBtn) {
  localUploadBtn.addEventListener("click", async () => {
    const selection = getLocalSelectionEntries();
    if (!selection.length) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Select at least one file or folder to upload.";
      showToast("Select one or more files/folders to upload.", "info");
      return;
    }
    const fileQueue = [];
    for (const entry of selection) {
      if (!entry.isDirectory) {
        fileQueue.push({
          fullPath: entry.fullPath,
          bucketKey: joinBucketKey(explorerState.bucketPrefix || "", entry.name),
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const nestedFiles = await listLocalFilesRecursively(entry.fullPath);
      nestedFiles.forEach((file) => {
        const rel = relativeLocalPath(entry.fullPath, file.fullPath);
        const key = joinBucketKey(explorerState.bucketPrefix || "", `${entry.name}/${toPosixPath(rel)}`);
        fileQueue.push({ fullPath: file.fullPath, bucketKey: key });
      });
    }
    if (!fileQueue.length) {
      if (localBrowserStatus) localBrowserStatus.innerText = "No files found to upload.";
      showToast("No files found in selected folder(s).", "info");
      return;
    }
    fileQueue.forEach((file) => startExplorerUpload(file.fullPath, file.bucketKey));
    showToast(`Queued ${fileQueue.length} upload${fileQueue.length === 1 ? "" : "s"}.`, "success");
  });
}
if (localOpenExplorerBtn) {
  localOpenExplorerBtn.addEventListener("click", async () => {
    const firstSelected = getLocalSelectionEntries()[0];
    const target = firstSelected?.fullPath || explorerState.localPath;
    if (!target) {
      if (localBrowserStatus) localBrowserStatus.innerText = "Pick a folder first.";
      return;
    }
    try {
      const launchPath =
        firstSelected && !firstSelected.isDirectory ? getDirname(target) : target;
      await window.api.openLocalInExplorer({ path: launchPath });
    } catch (err) {
      if (localBrowserStatus) localBrowserStatus.innerText = err.message || "Unable to open Explorer.";
    }
  });
}

document.querySelectorAll("[data-local-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const field = th.dataset.localSort;
    if (!field) return;
    changeSort("local", field);
  });
});

if (bucketPrefixGoBtn) {
  bucketPrefixGoBtn.addEventListener("click", () => {
    loadBucketExplorer(bucketExplorerPrefixInput?.value || "");
  });
}
if (bucketExplorerPrefixInput) {
  bucketExplorerPrefixInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      loadBucketExplorer(bucketExplorerPrefixInput.value);
    }
  });
}
if (bucketExplorerRefreshBtn) {
  bucketExplorerRefreshBtn.addEventListener("click", () => loadBucketExplorer());
}
if (bucketExplorerMoreBtn) {
  bucketExplorerMoreBtn.addEventListener("click", () =>
    loadBucketExplorer(explorerState.bucketPrefix, { append: true })
  );
}
if (bucketExplorerScroll) {
  bucketExplorerScroll.addEventListener("scroll", () => {
    if (!explorerState.bucketNextToken || explorerState.bucketLoading) return;
    const distanceFromBottom =
      bucketExplorerScroll.scrollHeight - bucketExplorerScroll.scrollTop - bucketExplorerScroll.clientHeight;
    if (distanceFromBottom < 120) {
      loadBucketExplorer(explorerState.bucketPrefix, { append: true });
    }
  });
}
if (bucketExplorerUpBtn) {
  bucketExplorerUpBtn.addEventListener("click", () => {
    loadBucketExplorer(bucketParentPrefix(explorerState.bucketPrefix));
  });
}
if (bucketNewFolderBtn) {
  bucketNewFolderBtn.addEventListener("click", async () => {
    const name = await showInputPrompt({ title: "New folder name", defaultValue: "folder" });
    if (!name) return;
    try {
      await window.api.createBucketFolder({
        prefix: explorerState.bucketPrefix || "",
        name,
        bucket: els.bucket.value.trim(),
      });
      loadBucketExplorer();
      setErrorDetails(null);
    } catch (err) {
      setErrorDetails({
        operation: "bucket:createFolder",
        bucket: els.bucket.value.trim(),
        key: explorerState.bucketPrefix || "",
        message: err.message || "Unable to create folder",
      });
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = err.message || "Unable to create folder.";
    }
  });
}
if (bucketRenameBtn) {
  bucketRenameBtn.addEventListener("click", async () => {
    const objects = getBucketSelectionEntries().filter((entry) => entry.type === "object");
    if (!objects.length) {
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Select an object to rename.";
      showToast("Select a single object to rename.", "info");
      return;
    }
    if (objects.length > 1) {
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Select only one object to rename.";
      showToast("Rename works on one object at a time.", "info");
      return;
    }
    const entry = objects[0];
    const newName = await showInputPrompt({ title: "Rename object", defaultValue: entry.name });
    if (!newName || newName === entry.name) return;
    const currentPrefix = entry.key.includes("/") ? entry.key.slice(0, entry.key.lastIndexOf("/") + 1) : "";
    const nextKey = `${currentPrefix}${newName.replace(/^\/+/, "")}`;
    try {
      await window.api.renameObject({
        key: entry.key,
        newKey: nextKey,
        bucket: els.bucket.value.trim(),
      });
      loadBucketExplorer();
      addLog(`Explorer rename: ${entry.key} -> ${nextKey}`);
      setErrorDetails(null);
    } catch (err) {
      setErrorDetails({
        operation: "bucket:rename",
        bucket: els.bucket.value.trim(),
        key: entry.key,
        message: err.message || "Unable to rename object",
      });
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = err.message || "Unable to rename object.";
    }
  });
}
if (bucketDeleteBtn) {
  bucketDeleteBtn.addEventListener("click", async () => {
    const selection = getBucketSelectionEntries();
    if (!selection.length) {
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Select objects or folders to delete.";
      showToast("Select one or more objects/folders to delete.", "info");
      return;
    }
    const objects = selection.filter((entry) => entry.type === "object");
    const folders = selection.filter((entry) => entry.type === "folder");
    const expandedObjects = [...objects];
    for (const folder of folders) {
      // eslint-disable-next-line no-await-in-loop
      const folderObjects = await listBucketObjectsRecursively(els.bucket.value.trim(), folder.prefix);
      folderObjects.forEach((obj) =>
        expandedObjects.push({
          type: "object",
          key: obj.key,
          name: obj.key.split("/").pop(),
          size: obj.size,
        })
      );
    }
    const deduped = Array.from(new Map(expandedObjects.map((entry) => [entry.key, entry])).values());
    if (!deduped.length) {
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "No objects found to delete.";
      showToast("No objects found under selected folders.", "info");
      return;
    }
    const label = deduped.length === 1 ? deduped[0].name : `${deduped.length} objects`;
    const totalSize = deduped.reduce((acc, entry) => acc + (entry.size || 0), 0);
    const confirmed = await confirmDeletion({
      label,
      count: deduped.length,
      totalSize,
      bucketName: els.bucket.value.trim(),
      formatBytes: fmtBytes,
      notify: showToast,
    });
    if (!confirmed) return;
    try {
      await window.api.deleteManyObjects({
        bucket: els.bucket.value.trim(),
        keys: deduped.map((entry) => entry.key),
      });
      loadBucketExplorer();
      addLog(`Deleted ${deduped.length} object${deduped.length === 1 ? "" : "s"} from explorer`);
      showToast(`Deleted ${deduped.length} object${deduped.length === 1 ? "" : "s"}.`, "success");
      setErrorDetails(null);
    } catch (err) {
      setErrorDetails({
        operation: "bucket:delete",
        bucket: els.bucket.value.trim(),
        key: deduped[0]?.key || "",
        message: err.message || "Unable to delete object",
      });
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = err.message || "Unable to delete object.";
      showToast(err.message || "Unable to delete object.", "error");
    }
  });
}
if (bucketDownloadBtn) {
  bucketDownloadBtn.addEventListener("click", async () => {
    const entries = getBucketSelectionEntries();
    if (!entries.length) {
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Select objects or folders to download.";
      showToast("Select one or more objects/folders to download.", "info");
      return;
    }
    const objects = entries.filter((entry) => entry.type === "object");
    const folders = entries.filter((entry) => entry.type === "folder");
    const queue = objects.map((entry) => ({
      key: entry.key,
      relativePath: entry.name || baseName(entry.key),
    }));
    for (const folder of folders) {
      // eslint-disable-next-line no-await-in-loop
      const nested = await listBucketObjectsRecursively(els.bucket.value.trim(), folder.prefix);
      nested.forEach((obj) => {
        const rel = obj.key.startsWith(folder.prefix) ? obj.key.slice(folder.prefix.length) : obj.key;
        queue.push({
          key: obj.key,
          relativePath: `${folder.name}/${rel}`,
        });
      });
    }
    const deduped = Array.from(new Map(queue.map((entry) => [entry.key, entry])).values());
    const transfers = await window.api.queueBulkDownloads({
      bucket: els.bucket.value.trim(),
      destinationRoot: explorerState.localPath,
      items: deduped,
    });
    (transfers || []).forEach((transfer) => transferStore.upsert(transfer));
    renderTransfers();
    showToast(`Queued ${deduped.length} download${deduped.length === 1 ? "" : "s"}.`, "success");
  });
}

document.querySelectorAll("[data-bucket-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const field = th.dataset.bucketSort;
    if (!field) return;
    changeSort("bucket", field);
  });
});

if (explorerDivider && explorerSplit) {
  let isDragging = false;

  const clampExplorerRatio = (value) => Math.min(EXPLORER_MAX_RATIO, Math.max(EXPLORER_MIN_RATIO, value));

  const applyExplorerSplit = (ratio, { persist = true } = {}) => {
    const rect = explorerSplit.getBoundingClientRect();
    if (!rect.width) return;
    const splitterCssWidth = Number.parseFloat(
      getComputedStyle(explorerSplit).getPropertyValue("--splitter-size")
    ) || 10;
    const maxPx = Math.max(
      EXPLORER_MIN_PANE_WIDTH,
      rect.width - EXPLORER_MIN_PANE_WIDTH - splitterCssWidth
    );
    const requestedPx = rect.width * clampExplorerRatio(ratio);
    const clampedPx = Math.min(maxPx, Math.max(EXPLORER_MIN_PANE_WIDTH, requestedPx));
    const finalRatio = clampExplorerRatio(clampedPx / rect.width);
    explorerSplit.style.setProperty("--explorer-left", `${Math.round(clampedPx)}px`);
    explorerDivider.setAttribute("aria-valuemin", `${Math.round(EXPLORER_MIN_RATIO * 100)}`);
    explorerDivider.setAttribute("aria-valuemax", `${Math.round(EXPLORER_MAX_RATIO * 100)}`);
    explorerDivider.setAttribute("aria-valuenow", `${Math.round(finalRatio * 100)}`);
    if (persist) {
      try {
        window?.localStorage?.setItem(EXPLORER_SPLIT_STORAGE_KEY, finalRatio.toFixed(4));
      } catch (err) {
        // Ignore storage failures; resize still works for this session.
      }
    }
  };

  const applyExplorerSplitFromPointer = (clientX, options) => {
    const rect = explorerSplit.getBoundingClientRect();
    if (!rect.width) return;
    applyExplorerSplit((clientX - rect.left) / rect.width, options);
  };

  const loadStoredExplorerSplit = () => {
    try {
      const raw = window?.localStorage?.getItem(EXPLORER_SPLIT_STORAGE_KEY);
      const parsed = Number.parseFloat(raw || "");
      if (Number.isFinite(parsed)) {
        applyExplorerSplit(parsed, { persist: false });
        return;
      }
    } catch (err) {
      // Ignore storage read errors and use default ratio.
    }
    applyExplorerSplit(0.5, { persist: false });
  };

  loadStoredExplorerSplit();
  window.addEventListener("resize", () => loadStoredExplorerSplit());

  explorerDivider.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    isDragging = true;
    explorerDivider.setPointerCapture(event.pointerId);
    explorerDivider.classList.add("active");
    applyExplorerSplitFromPointer(event.clientX);
    event.preventDefault();
  });
  explorerDivider.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    applyExplorerSplitFromPointer(event.clientX);
  });
  const stopResize = (event) => {
    if (!isDragging) return;
    isDragging = false;
    explorerDivider.classList.remove("active");
    if (event.pointerId != null && explorerDivider.hasPointerCapture(event.pointerId)) {
      explorerDivider.releasePointerCapture(event.pointerId);
    }
  };
  explorerDivider.addEventListener("pointerup", stopResize);
  explorerDivider.addEventListener("pointercancel", stopResize);
  explorerDivider.addEventListener("dblclick", () => applyExplorerSplit(0.5));
  explorerDivider.addEventListener("keydown", (event) => {
    const current = Number.parseFloat(explorerDivider.getAttribute("aria-valuenow") || "50") / 100;
    if (event.key === "ArrowLeft") {
      applyExplorerSplit(current - 0.03);
      event.preventDefault();
    }
    if (event.key === "ArrowRight") {
      applyExplorerSplit(current + 0.03);
      event.preventDefault();
    }
    if (event.key === "Home") {
      applyExplorerSplit(EXPLORER_MIN_RATIO);
      event.preventDefault();
    }
    if (event.key === "End") {
      applyExplorerSplit(EXPLORER_MAX_RATIO);
      event.preventDefault();
    }
  });
}
if (bucketExplorerDropzone) {
  const clearDragState = () => bucketExplorerDropzone.classList.remove("dragging");
  bucketExplorerDropzone.addEventListener("dragover", (e) => {
    if (
      e.dataTransfer?.types?.includes("Files") ||
      e.dataTransfer?.types?.includes("text/x-local-path") ||
      e.dataTransfer?.types?.includes("text/x-local-paths")
    ) {
      e.preventDefault();
      e.stopPropagation();
      bucketExplorerDropzone.classList.add("dragging");
      e.dataTransfer.dropEffect = "copy";
    }
  });
  bucketExplorerDropzone.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !bucketExplorerDropzone.contains(e.relatedTarget)) {
      clearDragState();
    }
  });
  bucketExplorerDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearDragState();
    const droppedPaths = getDroppedLocalPaths(e.dataTransfer);
    if (droppedPaths.length) {
      queueBucketUploadsFromPaths(droppedPaths);
      return;
    }
  });
}

async function bootstrap() {
  loadInitialTheme();
  await loadLocalRoots();
  if (!els.downloadFolder.value.trim()) {
    try {
      const defaultDownloadFolder = await window.api.getDefaultDownloadFolder();
      if (defaultDownloadFolder) {
        els.downloadFolder.value = defaultDownloadFolder;
      }
    } catch (err) {
      // Ignore lookup failures and keep manual folder selection.
    }
  }
  const state = await window.api.listConnections();
  renderConnections(state);
  applyConnection(state.current || state);
  const cfg = state.current || state;
  els.connectionName.value = cfg.name || "";
  refreshTransfers();
  loadLocalExplorer();
}

bootstrap();
refreshTransfers();

async function startUploadTransfer(filePath, keyInput) {
  if (!filePath) {
    els.uploadStatus.innerText = "Pick a file to upload.";
    return;
  }
  const bucket = els.bucket.value.trim();
  if (!bucket) {
    els.uploadStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  const basenameFromFile = baseName(filePath);
  const rawInput = (keyInput || "").trim();
  const sanitizedInput = rawInput && /[\\:]/.test(rawInput) ? baseName(rawInput) : rawInput;
  const finalKey = sanitizedInput || basenameFromFile;
  els.uploadKey.value = finalKey;
  try {
    const transfer = await window.api.startUpload({
      filePath,
      key: finalKey,
      bucket,
    });
    transferStore.upsert(transfer);
    renderTransfers();
    els.uploadStatus.innerText = "Upload started.";
    addLog(`Upload started: ${finalKey}`);
    setErrorDetails(null);
  } catch (err) {
    els.uploadStatus.innerText = err.message || "Unable to start upload.";
    setErrorDetails({
      operation: "upload:start",
      bucket,
      key: finalKey,
      message: err.message || "Unable to start upload",
    });
  }
}

function setSelectedKey(key) {
  selectedKey = key;
  els.downloadKey.value = key || "";
  els.downloadFilename.value = key ? baseName(key) : "";
  els.uploadKey.value = key ? baseName(key) : els.uploadKey.value;
  Array.from(bucketBody.children).forEach((tr) => {
    const rowKey = tr.dataset.key;
    if (rowKey === selectedKey) {
      tr.style.background = "rgba(34,211,238,0.08)";
      const cb = tr.querySelector("input[type=checkbox]");
      if (cb) cb.checked = true;
    } else {
      tr.style.background = "";
      const cb = tr.querySelector("input[type=checkbox]");
      if (cb) cb.checked = false;
    }
  });
}

function renderConnectionTable() {
  if (!connectionBody) return;
  connectionBody.innerHTML = "";
  const query = connectionSearchInput?.value?.trim().toLowerCase() || "";
  const filteredConnections = query
    ? connections.filter((c) => {
        const haystack = `${c.name || ""} ${c.endpoint || ""} ${c.bucket || ""}`.toLowerCase();
        return haystack.includes(query);
      })
    : connections;

  if (connectionCountEl) {
    connectionCountEl.innerText = `${connections.length}`;
  }
  if (connectionActiveEl) {
    const activeConn = connections.find((c) => c.id === activeConnectionId);
    connectionActiveEl.innerText = activeConn ? activeConn.name || activeConn.endpoint : "None";
  }
  if (connectionFilterStatus) {
    if (!connections.length) {
      connectionFilterStatus.innerText = "No saved connections yet.";
    } else if (query) {
      connectionFilterStatus.innerText = `Showing ${filteredConnections.length} of ${connections.length}.`;
    } else {
      connectionFilterStatus.innerText = "";
    }
  }

  if (!filteredConnections.length) {
    const emptyRow = document.createElement("tr");
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 5;
    emptyCell.className = "muted";
    emptyCell.style.padding = "14px 10px";
    emptyCell.innerText = query ? "No connections match your search." : "No saved connections yet.";
    emptyRow.appendChild(emptyCell);
    connectionBody.appendChild(emptyRow);
    return;
  }

  filteredConnections.forEach((c) => {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.innerText = c.name || "(unnamed)";
    const endpoint = document.createElement("td");
    endpoint.className = "endpoint-cell";
    endpoint.innerText = c.endpoint;
    endpoint.title = c.endpoint || "";
    const bucket = document.createElement("td");
    bucket.innerText = c.bucket || "-";
    const status = document.createElement("td");
    const statusPill = document.createElement("span");
    const isActive = c.id === activeConnectionId;
    statusPill.className = `connection-status-pill${isActive ? " active" : ""}`;
    statusPill.innerText = isActive ? "Active" : "Saved";
    status.appendChild(statusPill);
    const actions = document.createElement("td");
    actions.className = "connection-actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "secondary";
    loadBtn.style.width = "auto";
    loadBtn.style.padding = "6px 10px";
    loadBtn.innerText = "Load";
    loadBtn.onclick = async () => {
      await window.api.setActiveConnection(c.id);
      const state = await window.api.listConnections();
      renderConnections(state);
      applyConnection(state.current);
      addLog(`Loaded connection: ${c.name || c.endpoint}`);
      setActivePage("dashboard");
    };

    const delBtn = document.createElement("button");
    delBtn.className = "secondary danger";
    delBtn.style.width = "auto";
    delBtn.style.padding = "6px 10px";
    delBtn.innerText = "Delete";
    delBtn.onclick = async () => {
      await window.api.deleteConnection(c.id);
      const state = await window.api.listConnections();
      renderConnections(state);
      applyConnection(state.current || state);
      addLog(`Deleted connection: ${c.name || c.endpoint}`);
    };

    const bucketBtn = document.createElement("button");
    bucketBtn.className = "secondary";
    bucketBtn.style.width = "auto";
    bucketBtn.style.padding = "6px 10px";
    bucketBtn.innerText = "Set Bucket";
    bucketBtn.onclick = async () => {
      const newBucket = await showInputPrompt({
        title: "Bucket name",
        defaultValue: c.bucket || "",
      });
      if (newBucket) {
        await window.api.saveConnection({ ...c, bucket: newBucket, id: c.id });
        const state = await window.api.listConnections();
        renderConnections(state);
        applyConnection(state.current || state);
        addLog(`Updated bucket for ${c.name || c.endpoint}: ${newBucket}`);
      }
    };

    actions.appendChild(loadBtn);
    if (!isActive) {
      const setActiveBtn = document.createElement("button");
      setActiveBtn.className = "secondary";
      setActiveBtn.style.width = "auto";
      setActiveBtn.style.padding = "6px 10px";
      setActiveBtn.innerText = "Set Active";
      setActiveBtn.onclick = async () => {
        const state = await window.api.setActiveConnection(c.id);
        renderConnections(state);
        applyConnection(state.current);
        addLog(`Switched connection: ${c.name || c.endpoint}`);
      };
      actions.appendChild(setActiveBtn);
    }
    actions.appendChild(bucketBtn);
    actions.appendChild(delBtn);

    row.appendChild(name);
    row.appendChild(endpoint);
    row.appendChild(bucket);
    row.appendChild(status);
    row.appendChild(actions);
    connectionBody.appendChild(row);
  });
}
