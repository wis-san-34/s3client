(function attachDialogs(globalScope) {
  function showInputPrompt({ title, defaultValue = "", okLabel = "Rename", inputType = "text" }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,0.4)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "9999";

      const box = document.createElement("div");
      box.style.background = "#0f172a";
      box.style.border = "1px solid #1f2937";
      box.style.borderRadius = "10px";
      box.style.padding = "16px";
      box.style.minWidth = "360px";
      box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";

      const titleEl = document.createElement("div");
      titleEl.innerText = title || "Rename";
      titleEl.style.color = "#e2e8f0";
      titleEl.style.fontWeight = "600";
      titleEl.style.marginBottom = "10px";

      const input = document.createElement("input");
      input.type = inputType || "text";
      input.value = defaultValue;
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.padding = "10px";
      input.style.borderRadius = "8px";
      input.style.border = "1px solid #334155";
      input.style.background = "#0b1628";
      input.style.color = "#e2e8f0";
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") resolveAndClose(input.value.trim());
        if (event.key === "Escape") resolveAndClose(null);
      });

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.marginTop = "12px";
      actions.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary";
      cancelBtn.innerText = "Cancel";
      cancelBtn.style.width = "auto";
      cancelBtn.style.padding = "8px 12px";
      cancelBtn.onclick = () => resolveAndClose(null);

      const okBtn = document.createElement("button");
      okBtn.innerText = okLabel || "OK";
      okBtn.style.width = "auto";
      okBtn.style.padding = "8px 12px";
      okBtn.onclick = () => resolveAndClose(input.value.trim());

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(titleEl);
      box.appendChild(input);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);

      function resolveAndClose(value) {
        overlay.remove();
        resolve(value);
      }
    });
  }

  function showConfirmPrompt({ title, message = "", okLabel = "OK", cancelLabel = "Cancel" }) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,0.4)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "9999";

      const box = document.createElement("div");
      box.style.background = "#0f172a";
      box.style.border = "1px solid #1f2937";
      box.style.borderRadius = "10px";
      box.style.padding = "16px";
      box.style.minWidth = "360px";
      box.style.maxWidth = "460px";
      box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";

      const titleEl = document.createElement("div");
      titleEl.innerText = title || "Confirm";
      titleEl.style.color = "#e2e8f0";
      titleEl.style.fontWeight = "600";
      titleEl.style.marginBottom = "8px";

      const messageEl = document.createElement("div");
      messageEl.innerText = message;
      messageEl.style.color = "#94a3b8";
      messageEl.style.fontSize = "13px";
      messageEl.style.lineHeight = "1.4";

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.marginTop = "14px";
      actions.style.gap = "8px";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary";
      cancelBtn.innerText = cancelLabel || "Cancel";
      cancelBtn.style.width = "auto";
      cancelBtn.style.padding = "8px 12px";
      cancelBtn.onclick = () => resolveAndClose(false);

      const okBtn = document.createElement("button");
      okBtn.innerText = okLabel || "OK";
      okBtn.style.width = "auto";
      okBtn.style.padding = "8px 12px";
      okBtn.onclick = () => resolveAndClose(true);

      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Enter") resolveAndClose(true);
        if (event.key === "Escape") resolveAndClose(false);
      });

      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      box.appendChild(titleEl);
      if (message) box.appendChild(messageEl);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.tabIndex = -1;
      window.setTimeout(() => overlay.focus(), 0);

      function resolveAndClose(value) {
        overlay.remove();
        resolve(value);
      }
    });
  }

  async function confirmDeletion({
    label,
    count = 1,
    totalSize = 0,
    bucketName = "",
    localPath = "",
    hardConfirmLabel = "Confirm",
    formatBytes = (value) => `${value} B`,
    notify = null,
  }) {
    const summary = `${count} item${count === 1 ? "" : "s"} (${formatBytes(totalSize || 0)})`;
    const baseConfirmed = await showConfirmPrompt({
      title: `Delete ${label}?`,
      message: localPath ? `${summary}\n${localPath}` : summary,
      okLabel: count > 1 ? "Delete Items" : "Delete",
      cancelLabel: "Cancel",
    });
    if (!baseConfirmed) return false;
    const needsHardConfirm = count >= 20 || totalSize >= 500 * 1024 * 1024;
    const expectedText = (bucketName || localPath || "").trim();
    if (!needsHardConfirm || !expectedText) return true;
    const typed = await showInputPrompt({
      title: `Type "${expectedText}" to confirm permanent delete`,
      defaultValue: "",
      okLabel: hardConfirmLabel,
    });
    const typedText = (typed || "").trim();
    if (typedText.toLowerCase() !== expectedText.toLowerCase()) {
      if (typeof notify === "function") {
        notify("Delete cancelled: confirmation text did not match.", "info");
      }
      return false;
    }
    return true;
  }

  globalScope.S3Dialogs = {
    confirmDeletion,
    showConfirmPrompt,
    showInputPrompt,
  };
})(window);
