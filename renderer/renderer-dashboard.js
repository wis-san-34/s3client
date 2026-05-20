// renderer-dashboard.js
// Dashboard page: bucket object table, metrics, upload/download forms, refresh.
// Depends on: renderer-utils.js, renderer-logs.js, renderer-connections.js, renderer-explorer.js

// ── Multi-select state for bulk delete ────────────────────────────────────────
let dashboardSelectedKeys = new Set();

function updateDashboardSelectionToolbar() {
  const count = dashboardSelectedKeys.size;
  if (bucketDeleteSelectedBtn) {
    bucketDeleteSelectedBtn.style.display = count > 0 ? "inline-block" : "none";
    bucketDeleteSelectedBtn.innerText = count > 0 ? `Delete Selected (${count})` : "Delete Selected";
  }
  if (bucketSelectAllEl) {
    const objectRows = Array.from(bucketBody.querySelectorAll("tr[data-type='object']"));
    if (objectRows.length === 0) {
      bucketSelectAllEl.checked = false;
      bucketSelectAllEl.indeterminate = false;
    } else {
      const checkedCount = objectRows.filter((r) => dashboardSelectedKeys.has(r.dataset.key)).length;
      bucketSelectAllEl.checked = checkedCount === objectRows.length;
      bucketSelectAllEl.indeterminate = checkedCount > 0 && checkedCount < objectRows.length;
    }
  }
}

function toggleDashboardKey(key, checked) {
  if (checked) {
    dashboardSelectedKeys.add(key);
  } else {
    dashboardSelectedKeys.delete(key);
  }
  updateDashboardSelectionToolbar();
}

function clearDashboardSelection() {
  dashboardSelectedKeys.clear();
  Array.from(bucketBody.querySelectorAll("input[type=checkbox]")).forEach((cb) => { cb.checked = false; });
  updateDashboardSelectionToolbar();
}

// ── Dashboard bucket metrics bar ──────────────────────────────────────────────
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

// ── Dashboard bucket table ────────────────────────────────────────────────────
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

    if (item.type === "object") row.dataset.size = item.size || 0;

    const selectCell = document.createElement("td");
    selectCell.style.width = "30px";
    if (item.type === "object") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = dashboardSelectedKeys.has(item.key);
      checkbox.onclick = (e) => {
        e.stopPropagation();
        toggleDashboardKey(item.key, checkbox.checked);
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
  const nextPrefix = isFtpConnection() ? normalizeRemotePath(prefix || "/") : normalizePrefix(prefix || "");
  els.bucketPrefix.value = nextPrefix;
  persistExplorerPrefs({ dashboardBucketPrefix: nextPrefix });
  clearDashboardSelection();
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

// ── Dashboard bucket refresh ───────────────────────────────────────────────────
async function refreshBucket({ append = false } = {}) {
  const activeConn = getActiveConnection();
  if (isFtpConnection(activeConn)) {
    try {
      const requestSeq = ++dashboardBucketRequestSeq;
      els.bucketStatus.innerText = "Loading remote directory...";
      const requestedPath = normalizeRemotePath(els.bucketPrefix.value.trim() || activeConn.remotePath || "/");
      const res = await window.api.listFtp({ path: requestedPath });
      if (requestSeq !== dashboardBucketRequestSeq) return;
      dashboardBucketPrefix = res.path || requestedPath;
      if (els.bucketPrefix.value !== dashboardBucketPrefix) {
        els.bucketPrefix.value = dashboardBucketPrefix;
      }
      bucketNextToken = null;
      bucketMoreBtn.style.display = "none";
      clearDashboardSelection();
      renderBucketRows(res.entries || [], { append: false });
      const entries = res.entries || [];
      const folderCount = entries.filter((entry) => entry.type === "folder").length;
      const objectCount = entries.filter((entry) => entry.type === "object").length;
      els.bucketStatus.innerText = `Loaded ${entries.length} item${entries.length === 1 ? "" : "s"} (${folderCount} folder${folderCount === 1 ? "" : "s"}, ${objectCount} file${objectCount === 1 ? "" : "s"}).`;
      renderDashboardBucketBreadcrumb(dashboardBucketPrefix);
      updateBucketMetrics(res.metrics);
      setErrorDetails(null);
    } catch (err) {
      els.bucketStatus.innerText = err.message || "Failed to list FTP directory.";
      bucketMoreBtn.style.display = "none";
      updateBucketMetrics(null);
      setErrorDetails({
        operation: "ftp:list",
        bucket: activeConn?.host || "",
        key: els.bucketPrefix.value.trim(),
        message: err.message || "Failed to list FTP directory",
      });
    }
    return;
  }
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
      clearDashboardSelection();
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

// ── Dashboard upload/download actions ─────────────────────────────────────────
async function queueDashboardUploadsFromPaths(paths) {
  const activeConn = getActiveConnection();
  const bucket = els.bucket.value.trim();
  if (!isFtpConnection(activeConn) && !bucket) {
    els.uploadStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  try {
    const targetPrefix = isFtpConnection(activeConn)
      ? normalizeRemotePath(els.bucketPrefix.value.trim() || activeConn.remotePath || "/")
      : "";
    const queue = await buildUploadQueueFromPaths(paths, targetPrefix);
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

async function startUploadTransfer(filePath, keyInput) {
  if (!filePath) {
    els.uploadStatus.innerText = "Pick a file to upload.";
    return;
  }
  const activeConn = getActiveConnection();
  const bucket = els.bucket.value.trim();
  if (!isFtpConnection(activeConn) && !bucket) {
    els.uploadStatus.innerText = "Set a bucket before uploading.";
    return;
  }
  const basenameFromFile = baseName(filePath);
  const rawInput = (keyInput || "").trim();
  const sanitizedInput = rawInput && /[\\:]/.test(rawInput) ? baseName(rawInput) : rawInput;
  const finalKey = isFtpConnection(activeConn)
    ? normalizeRemotePath(sanitizedInput || `${normalizeRemotePath(els.bucketPrefix.value.trim() || activeConn.remotePath || "/")}/${basenameFromFile}`)
    : sanitizedInput || basenameFromFile;
  els.uploadKey.value = finalKey;
  try {
    const transfer = await window.api.startUpload({
      filePath,
      key: finalKey,
      bucket: isFtpConnection(activeConn) ? activeConn.host || activeConn.name || "FTP" : bucket,
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
    tr.style.background = tr.dataset.key === selectedKey ? "rgba(34,211,238,0.08)" : "";
  });
}
