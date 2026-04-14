// renderer-transfers.js
// Transfer queue rendering and refresh.
// Depends on: renderer-utils.js, renderer-logs.js

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

async function refreshTransfers() {
  const list = await window.api.listTransfers();
  transferStore.replaceAll(list);
  renderTransfers();
}
