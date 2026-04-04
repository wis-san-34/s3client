(function attachTransferStore(globalScope) {
  function createTransferStore() {
    const items = new Map();

    return {
      clear() {
        items.clear();
      },
      replaceAll(list = []) {
        items.clear();
        list.forEach((entry) => {
          if (entry?.id) {
            items.set(entry.id, entry);
          }
        });
      },
      upsert(entry) {
        if (!entry?.id) return;
        items.set(entry.id, entry);
      },
      remove(id) {
        if (!id) return;
        items.delete(id);
      },
      values() {
        return Array.from(items.values());
      },
      filtered({ state = "all", query = "" } = {}) {
        const normalizedQuery = (query || "").trim().toLowerCase();
        return this.values().filter((entry) => {
          const matchesState =
            state === "all" ||
            (state === "active" &&
              ["queued", "running", "paused", "retrying"].includes(entry.state)) ||
            (state === "finished" && ["done", "cancelled"].includes(entry.state)) ||
            (state === "errors" && entry.state === "error");
          if (!matchesState) return false;
          if (!normalizedQuery) return true;
          const haystack = `${entry.type || ""} ${entry.key || ""} ${entry.bucket || ""} ${entry.state || ""}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        });
      },
    };
  }

  globalScope.S3TransferStore = {
    createTransferStore,
  };
})(window);
