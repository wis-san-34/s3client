// renderer-connections.js
// Connection management: per-connection explorer prefs, connection panel collapse,
// connection table rendering, and applyConnection (wires a loaded connection to all panels).
// Depends on: renderer-utils.js, renderer-logs.js

// ── Per-connection explorer preferences ───────────────────────────────────────
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

// ── Connection panel collapse ──────────────────────────────────────────────────
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

// ── Connection list rendering ──────────────────────────────────────────────────
function renderConnections(state) {
  connections = state.connections || [];
  activeConnectionId = state.activeConnectionId || null;
  connectionSelect.innerHTML = "";
  connections.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.innerText = `${(c.type || "s3").toUpperCase()} - ${c.name || c.endpoint || c.host}`;
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

function renderConnectionTable() {
  if (!connectionBody) return;
  connectionBody.innerHTML = "";
  const query = connectionSearchInput?.value?.trim().toLowerCase() || "";
  const filteredConnections = query
    ? connections.filter((c) => {
        const haystack = `${c.name || ""} ${c.endpoint || ""} ${c.host || ""} ${c.bucket || ""} ${c.remotePath || ""} ${c.type || ""}`.toLowerCase();
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
    const connectionTarget = c.type === "ftp" || c.type === "ftps" ? `${c.host || c.endpoint}:${c.port || 21}` : c.endpoint;
    endpoint.innerText = connectionTarget;
    endpoint.title = connectionTarget || "";
    const bucket = document.createElement("td");
    bucket.innerText = c.type === "ftp" || c.type === "ftps" ? c.remotePath || "/" : c.bucket || "-";
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
      addLog(`Loaded connection: ${c.name || c.endpoint || c.host}`);
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
      addLog(`Deleted connection: ${c.name || c.endpoint || c.host}`);
    };

    const targetBtn = document.createElement("button");
    targetBtn.className = "secondary";
    targetBtn.style.width = "auto";
    targetBtn.style.padding = "6px 10px";
    targetBtn.innerText = c.type === "ftp" || c.type === "ftps" ? "Set Path" : "Set Bucket";
    targetBtn.onclick = async () => {
      const isFtp = c.type === "ftp" || c.type === "ftps";
      const value = await showInputPrompt({
        title: isFtp ? "Remote path" : "Bucket name",
        defaultValue: isFtp ? c.remotePath || "/" : c.bucket || "",
      });
      if (value) {
        await window.api.saveConnection(isFtp ? { ...c, remotePath: value, id: c.id } : { ...c, bucket: value, id: c.id });
        const state = await window.api.listConnections();
        renderConnections(state);
        applyConnection(state.current || state);
        addLog(`Updated ${isFtp ? "remote path" : "bucket"} for ${c.name || c.endpoint || c.host}: ${value}`);
      }
    };

    const exportBtn = document.createElement("button");
    exportBtn.className = "secondary";
    exportBtn.style.width = "auto";
    exportBtn.style.padding = "6px 10px";
    exportBtn.innerText = "Export";
    exportBtn.onclick = async () => {
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
        const result = await window.api.exportConnections({ id: c.id, passphrase });
        if (result?.canceled) return;
        addLog(`Exported connection${result.encrypted ? " with encryption" : ""}: ${c.name || c.endpoint || c.host}`);
      } catch (err) {
        addLog(`Export failed for ${c.name || c.endpoint || c.host}: ${err.message}`);
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
        addLog(`Switched connection: ${c.name || c.endpoint || c.host}`);
      };
      actions.appendChild(setActiveBtn);
    }
    actions.appendChild(targetBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(delBtn);

    row.appendChild(name);
    row.appendChild(endpoint);
    row.appendChild(bucket);
    row.appendChild(status);
    row.appendChild(actions);
    connectionBody.appendChild(row);
  });
}

function setConnectionTypeLayout(type) {
  const isFtp = type === "ftp" || type === "ftps";
  if (els.connectionTypeS3) els.connectionTypeS3.classList.toggle("active", !isFtp);
  if (els.connectionTypeFtp) els.connectionTypeFtp.classList.toggle("active", isFtp);
  if (els.s3ConnectionLayout) els.s3ConnectionLayout.hidden = isFtp;
  if (els.ftpConnectionLayout) els.ftpConnectionLayout.hidden = !isFtp;
  if (els.s3AdvancedSettings) els.s3AdvancedSettings.hidden = isFtp;
}

function getActiveConnection() {
  return connections.find((conn) => conn.id === activeConnectionId) || null;
}

function isFtpConnection(conn = getActiveConnection()) {
  return conn?.type === "ftp" || conn?.type === "ftps";
}

// ── Apply active connection to all panels ─────────────────────────────────────
function applyConnection(conn) {
  if (!conn) return;
  const connectionType = conn.type || "s3";
  setConnectionTypeLayout(connectionType);
  if (els.ftpProtocol) els.ftpProtocol.value = connectionType === "ftps" ? "ftps" : "ftp";
  if (els.ftpHost) els.ftpHost.value = conn.host || "";
  if (els.ftpPort) els.ftpPort.value = `${conn.port || 21}`;
  if (els.ftpUsername) els.ftpUsername.value = conn.username || "";
  if (els.ftpPassword) {
    els.ftpPassword.dataset.hasSecret = conn.hasSecret ? "true" : "false";
    els.ftpPassword.placeholder = conn.hasSecret ? "Password stored securely" : "";
    els.ftpPassword.value = conn.hasSecret ? "" : conn.secretAccessKey || "";
  }
  if (els.ftpRemotePath) els.ftpRemotePath.value = conn.remotePath || "/";
  if (els.ftpSecureMode) els.ftpSecureMode.value = conn.secureMode || (connectionType === "ftps" ? "explicit" : "none");
  if (els.ftpRejectUnauthorized) els.ftpRejectUnauthorized.checked = conn.rejectUnauthorized !== false;
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
  if (connectionType === "ftp" || connectionType === "ftps") {
    if (els.configStatus) els.configStatus.innerText = "FTP/FTPS browsing is enabled in the Explorer remote pane.";
    if (bucketBody) bucketBody.innerHTML = "";
    if (bucketExplorerBody) bucketExplorerBody.innerHTML = "";
    loadLocalExplorer(prefs.localPath || explorerState.localPath || undefined);
    loadBucketExplorer(conn.remotePath || "/", { force: true });
    return;
  }
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
