// renderer-logs.js
// In-memory log store, log rendering, and error-detail panel.
// Depends on: renderer-utils.js (logs array, DOM refs, fmtDate, maskSensitiveText)

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
