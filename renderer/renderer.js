// renderer.js
// Application bootstrap, navigation, and event listener wiring.
// All feature logic lives in the renderer-*.js modules loaded before this file.

// ── IPC: live transfer updates from main process ──────────────────────────────
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

// ── Connection settings form ───────────────────────────────────────────────────
function getSelectedConnectionType() {
  if (els.ftpConnectionLayout && !els.ftpConnectionLayout.hidden) {
    return els.ftpProtocol?.value === "ftps" ? "ftps" : "ftp";
  }
  return "s3";
}

function buildConnectionPayload() {
  const type = getSelectedConnectionType();
  if (type === "ftp" || type === "ftps") {
    const password = els.ftpPassword?.value?.trim() || "";
    const payload = {
      type,
      name: els.connectionName.value.trim(),
      host: els.ftpHost.value.trim(),
      port: Math.max(1, Math.min(65535, Number(els.ftpPort?.value) || 21)),
      username: els.ftpUsername.value.trim(),
      remotePath: (els.ftpRemotePath?.value || "/").trim() || "/",
      secureMode: type === "ftps" ? els.ftpSecureMode?.value || "explicit" : "none",
      rejectUnauthorized: Boolean(els.ftpRejectUnauthorized?.checked),
      allowLegacyTls: Boolean(els.ftpAllowLegacyTls?.checked),
      protectDataChannel: els.ftpProtectDataChannel?.checked !== false,
    };
    if (password) {
      payload.password = password;
    } else if (els.ftpPassword?.dataset.hasSecret !== "true") {
      payload.password = "";
    }
    return payload;
  }

  const transferSettings = validateTransferSettings();
  if (!transferSettings) return null;
  const secretValue = els.secretAccessKey.value.trim();
  const payload = {
    type: "s3",
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
  return payload;
}

document.getElementById("save-config").addEventListener("click", async () => {
  const payload = buildConnectionPayload();
  if (!payload) return;
  const saved = await window.api.saveConnection(payload);
  const state = await window.api.listConnections();
  renderConnections(state);
  connectionSelect.value = saved.id;
  setSecretInputState(Boolean(saved.hasSecret));
  els.configStatus.innerText = `Saved ${saved.name || "connection"}.`;
  setTimeout(() => (els.configStatus.innerText = ""), 1500);
  if (saved.type === "ftp" || saved.type === "ftps") {
    els.configStatus.innerText = `Saved ${saved.name || "FTP connection"}.`;
  } else {
    refreshBucket();
  }
  addLog(`Saved connection: ${saved.name || saved.endpoint || saved.host || "unnamed"}`);
});

if (els.connectionTypeS3) {
  els.connectionTypeS3.addEventListener("click", () => setConnectionTypeLayout("s3"));
}
if (els.connectionTypeFtp) {
  els.connectionTypeFtp.addEventListener("click", () => setConnectionTypeLayout(els.ftpProtocol?.value || "ftp"));
}
if (els.ftpProtocol) {
  els.ftpProtocol.addEventListener("change", () => {
    const isFtps = els.ftpProtocol.value === "ftps";
    if (els.ftpSecureMode) els.ftpSecureMode.value = isFtps ? "explicit" : "none";
    setConnectionTypeLayout(els.ftpProtocol.value);
  });
}

// ── Dashboard upload form ──────────────────────────────────────────────────────
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

// ── Explorer filter inputs ─────────────────────────────────────────────────────
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

// ── Global drag-and-drop (dashboard upload drop zone) ────────────────────────
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

// ── Dashboard download form ────────────────────────────────────────────────────
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

// ── Transfer queue controls ────────────────────────────────────────────────────
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

// ── Dashboard bucket controls ──────────────────────────────────────────────────
document.getElementById("bucket-refresh").addEventListener("click", () => refreshBucket({ append: false }));
if (bucketUpBtn) {
  bucketUpBtn.addEventListener("click", () => {
    openDashboardBucketPrefix(isFtpConnection() ? remoteParentPath(els.bucketPrefix.value.trim()) : bucketParentPrefix(els.bucketPrefix.value.trim()));
  });
}
bucketMoreBtn.addEventListener("click", () => refreshBucket({ append: true }));
els.bucketPrefix.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    openDashboardBucketPrefix(els.bucketPrefix.value);
  }
});

if (bucketSelectAllEl) {
  bucketSelectAllEl.addEventListener("change", () => {
    const objectRows = Array.from(bucketBody.querySelectorAll("tr[data-type='object']"));
    objectRows.forEach((row) => {
      const cb = row.querySelector("input[type=checkbox]");
      if (bucketSelectAllEl.checked) {
        dashboardSelectedKeys.add(row.dataset.key);
        if (cb) cb.checked = true;
      } else {
        dashboardSelectedKeys.delete(row.dataset.key);
        if (cb) cb.checked = false;
      }
    });
    updateDashboardSelectionToolbar();
  });
}

if (bucketDeleteSelectedBtn) {
  bucketDeleteSelectedBtn.addEventListener("click", async () => {
    const keys = Array.from(dashboardSelectedKeys);
    if (!keys.length) return;
    const bucket = els.bucket.value.trim();
    const selectedRows = Array.from(bucketBody.querySelectorAll("tr[data-type='object']"))
      .filter((row) => dashboardSelectedKeys.has(row.dataset.key));
    const totalSize = selectedRows.reduce((sum, row) => sum + Number(row.dataset.size || 0), 0);
    const allowed = await confirmDeletion({
      label: `${keys.length} object${keys.length === 1 ? "" : "s"}`,
      count: keys.length,
      totalSize,
      bucketName: bucket,
      formatBytes: fmtBytes,
      notify: showToast,
    });
    if (!allowed) return;
    try {
      await window.api.deleteManyObjects({ keys, bucket });
      addLog(`Deleted ${keys.length} object${keys.length === 1 ? "" : "s"} from ${bucket}`);
      clearDashboardSelection();
      refreshBucket({ append: false });
    } catch (err) {
      addLog(`Bulk delete failed: ${err.message || err}`);
      showToast(err.message || "Delete failed", "error");
    }
  });
}

// ── Connection selector ───────────────────────────────────────────────────────
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

// ── Page navigation ───────────────────────────────────────────────────────────
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

// ── Log panel controls ────────────────────────────────────────────────────────
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

// ── Connections page controls ─────────────────────────────────────────────────
document.getElementById("connection-refresh").addEventListener("click", async () => {
  const state = await window.api.listConnections();
  renderConnections(state);
  applyConnection(state.current || state);
});
if (connectionExportBtn) {
  connectionExportBtn.addEventListener("click", async () => {
    try {
      const encrypt = await showConfirmPrompt({
        title: "Encrypt export file?",
        message: "Use a passphrase to protect the exported connection secrets.",
        okLabel: "Encrypt",
        cancelLabel: "Export without encryption",
      });
      const passphrase = encrypt
        ? await showInputPrompt({
            title: "Export passphrase",
            defaultValue: "",
            okLabel: "Export",
            inputType: "password",
          })
        : "";
      if (encrypt && !passphrase) return;
      const result = await window.api.exportConnections({ passphrase });
      if (result?.canceled) return;
      addLog(`Exported ${result.count || 0} connection(s)${result.encrypted ? " with encryption" : ""} to ${result.filePath}`);
    } catch (err) {
      addLog(`Export failed: ${err.message}`);
    }
  });
}
if (connectionImportBtn) {
  connectionImportBtn.addEventListener("click", async () => {
    try {
      let result = await window.api.importConnections();
      if (result?.canceled) return;
      if (result?.needsPassphrase) {
        const passphrase = await showInputPrompt({
          title: "Import passphrase",
          defaultValue: "",
          okLabel: "Import",
          inputType: "password",
        });
        if (!passphrase) return;
        result = await window.api.importConnections({ passphrase });
      }
      renderConnections(result.state);
      applyConnection(result.state?.current);
      addLog(`Imported ${result.imported || 0} connection(s)${result.encrypted ? " from encrypted file" : ""} from ${result.filePath}${result.skipped ? ` (${result.skipped} skipped)` : ""}`);
    } catch (err) {
      addLog(`Import failed: ${err.message}`);
    }
  });
}
if (connectionSearchInput) {
  connectionSearchInput.addEventListener("input", () => renderConnectionTable());
}
document.getElementById("connection-add").addEventListener("click", async () => {
  setActivePage("dashboard");
  setConnectionPanelCollapsed(false);
  setConnectionTypeLayout("s3");
  els.connectionName.value = "";
  els.endpoint.value = "";
  els.accessKeyId.value = "";
  els.secretAccessKey.value = "";
  setSecretInputState(false);
  els.bucket.value = "";
  if (els.ftpHost) els.ftpHost.value = "";
  if (els.ftpUsername) els.ftpUsername.value = "";
  if (els.ftpPassword) {
    els.ftpPassword.value = "";
    els.ftpPassword.dataset.hasSecret = "false";
    els.ftpPassword.placeholder = "";
  }
  if (els.configStatus) els.configStatus.innerText = "Choose S3 or FTP / FTPS, then save the connection.";
  els.connectionName.focus();
});

// ── Local browser controls ────────────────────────────────────────────────────
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
    const activeConn = getActiveConnection();
    const isFtp = isFtpConnection(activeConn);
    const targetPrefix = isFtp ? normalizeRemotePath(explorerState.bucketPrefix || activeConn.remotePath || "/") : explorerState.bucketPrefix || "";
    const makeTargetKey = (relativePath) =>
      isFtp ? normalizeRemotePath(`${targetPrefix}/${toPosixPath(relativePath)}`) : joinBucketKey(targetPrefix, relativePath);
    for (const entry of selection) {
      if (!entry.isDirectory) {
        fileQueue.push({
          fullPath: entry.fullPath,
          bucketKey: makeTargetKey(entry.name),
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const nestedFiles = await listLocalFilesRecursively(entry.fullPath);
      nestedFiles.forEach((file) => {
        const rel = relativeLocalPath(entry.fullPath, file.fullPath);
        const key = makeTargetKey(`${entry.name}/${toPosixPath(rel)}`);
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

// ── Bucket explorer controls ──────────────────────────────────────────────────
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
    loadBucketExplorer(isFtpConnection() ? remoteParentPath(explorerState.bucketPrefix) : bucketParentPrefix(explorerState.bucketPrefix));
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

// ── Explorer split pane ───────────────────────────────────────────────────────
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

// ── Bucket explorer dropzone ──────────────────────────────────────────────────
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
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
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
