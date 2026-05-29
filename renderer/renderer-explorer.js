// renderer-explorer.js
// Local filesystem browser and S3 bucket explorer: sorting, filtering, selection,
// drag-and-drop, upload/download queuing from the explorer panel.
// Depends on: renderer-utils.js, renderer-logs.js, renderer-connections.js

// -- Sort ----------------------------------------------------------------------
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

// -- Summary pills and selection description -----------------------------------
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

// -- Chrome updates (status bars, inspector panels) ----------------------------
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

// -- Selection helpers ---------------------------------------------------------
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

// -- Transfer indicator badges on explorer rows --------------------------------
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

// -- Local file explorer -------------------------------------------------------
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

// -- Bucket explorer -----------------------------------------------------------
function bucketParentPrefix(prefix) {
  if (!prefix) return "";
  const trimmed = prefix.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx === -1) return "";
  return `${trimmed.slice(0, idx + 1)}`;
}

function normalizeRemotePath(input = "/") {
  let value = String(input || "/").trim().replace(/\\/g, "/");
  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/+/g, "/");
  if (value.length > 1) value = value.replace(/\/+$/, "");
  return value || "/";
}

function remoteParentPath(remotePath) {
  const normalized = normalizeRemotePath(remotePath);
  if (normalized === "/") return "/";
  const idx = normalized.lastIndexOf("/");
  return idx <= 0 ? "/" : normalized.slice(0, idx);
}

async function loadBucketExplorer(prefixOverride, options = {}) {
  if (!bucketExplorerBody) return;
  const activeConn = getActiveConnection();
  if (isFtpConnection(activeConn)) {
    const force = Boolean(options.force);
    const targetPath = normalizeRemotePath(
      typeof prefixOverride === "string" ? prefixOverride : explorerState.bucketPrefix || activeConn.remotePath || "/"
    );
    if (explorerState.bucketLoading && !force) return;
    const requestSeq = ++bucketExplorerRequestSeq;
    try {
      explorerState.bucketLoading = true;
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Loading remote directory...";
      const res = await window.api.listFtp({ path: targetPath });
      if (requestSeq !== bucketExplorerRequestSeq) return;
      const pathChanged = explorerState.bucketPrefix !== res.path;
      explorerState.bucketPrefix = res.path || targetPath;
      persistExplorerPrefs({ bucketPrefix: explorerState.bucketPrefix });
      if (pathChanged) {
        explorerState.selectedBucketKeys.clear();
        explorerState.lastBucketIndex = null;
      }
      if (bucketExplorerPrefixInput) bucketExplorerPrefixInput.value = explorerState.bucketPrefix;
      explorerState.bucketNextToken = null;
      if (bucketExplorerMoreBtn) bucketExplorerMoreBtn.style.display = "none";
      renderBucketExplorerRows(res.entries || []);
      setErrorDetails(null);
      return;
    } catch (err) {
      if (requestSeq !== bucketExplorerRequestSeq) return;
      setErrorDetails({
        operation: "ftp:list",
        bucket: activeConn.host || activeConn.endpoint || "",
        key: targetPath,
        message: err.message || "Unable to load FTP directory",
      });
      if (bucketExplorerStatus) bucketExplorerStatus.innerText = err.message || "Unable to load FTP directory.";
      return;
    } finally {
      if (requestSeq === bucketExplorerRequestSeq) {
        explorerState.bucketLoading = false;
      }
    }
  }
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
        loadBucketExplorer(isFtpConnection() ? remoteParentPath(explorerState.bucketPrefix) : bucketParentPrefix(explorerState.bucketPrefix));
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

// -- Path utilities -------------------------------------------------------------
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

// -- Recursive file listing ----------------------------------------------------
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

// -- Upload queue builder ------------------------------------------------------
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

// -- Explorer upload/download actions -----------------------------------------
async function queueBucketUploadsFromPaths(paths, prefix = explorerState.bucketPrefix || "") {
  const activeConn = getActiveConnection();
  const bucket = els.bucket.value.trim();
  if (!isFtpConnection(activeConn) && !bucket) {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  try {
    const targetPrefix = isFtpConnection(activeConn) ? normalizeRemotePath(prefix || activeConn.remotePath || "/") : prefix;
    const queue = await buildUploadQueueFromPaths(paths, targetPrefix);
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

async function startExplorerUpload(filePath, keyOverride = "") {
  if (!filePath) {
    if (localBrowserStatus) localBrowserStatus.innerText = "Select a file to upload.";
    return;
  }
  const activeConn = getActiveConnection();
  const bucket = els.bucket.value.trim();
  if (!isFtpConnection(activeConn) && !bucket) {
    if (bucketExplorerStatus) bucketExplorerStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  const key = isFtpConnection(activeConn)
    ? normalizeRemotePath(keyOverride || `${normalizeRemotePath(explorerState.bucketPrefix || activeConn.remotePath || "/")}/${baseName(filePath)}`)
    : keyOverride || joinBucketKey(explorerState.bucketPrefix || "", baseName(filePath));
  const transfer = await window.api.startUpload({
    filePath,
    key,
    bucket: isFtpConnection(activeConn) ? activeConn.host || activeConn.name || "FTP" : bucket,
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
