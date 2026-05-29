const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  saveConnection: (conn) => ipcRenderer.invoke("connection:save", conn),
  setActiveConnection: (id) => ipcRenderer.invoke("connection:setActive", id),
  listConnections: () => ipcRenderer.invoke("connection:list"),
  exportConnections: (options) => ipcRenderer.invoke("connection:export", options),
  importConnections: (options) => ipcRenderer.invoke("connection:import", options),
  listAvailableBuckets: () => ipcRenderer.invoke("connection:listAvailableBuckets"),
  testConnection: (options) => ipcRenderer.invoke("connection:test", options),
  deleteConnection: (id) => ipcRenderer.invoke("connection:delete", id),
  listFtp: (payload) => ipcRenderer.invoke("ftp:list", payload),
  pickFile: () => ipcRenderer.invoke("file:pick"),
  pickDir: () => ipcRenderer.invoke("dir:pick"),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (err) {
      return "";
    }
  },
  getDefaultDownloadFolder: () => ipcRenderer.invoke("path:downloads"),
  listLocalRoots: () => ipcRenderer.invoke("local:listRoots"),
  listLocalEntries: (payload) => ipcRenderer.invoke("local:list", payload),
  getLocalEntryMeta: (payload) => ipcRenderer.invoke("local:getEntryMeta", payload),
  createLocalFolder: (payload) => ipcRenderer.invoke("local:createFolder", payload),
  deleteLocalEntry: (payload) => ipcRenderer.invoke("local:deleteEntry", payload),
  renameLocalEntry: (payload) => ipcRenderer.invoke("local:renameEntry", payload),
  openLocalInExplorer: (payload) => ipcRenderer.invoke("local:openExternal", payload),
  startUpload: (payload) => ipcRenderer.invoke("upload:start", payload),
  startDownload: (payload) => ipcRenderer.invoke("download:start", payload),
  listTransfers: () => ipcRenderer.invoke("transfers:list"),
  clearFinishedTransfers: () => ipcRenderer.invoke("transfer:clearFinished"),
  listBucket: (payload) => ipcRenderer.invoke("bucket:list", payload),
  listAllBucketObjects: (payload) => ipcRenderer.invoke("bucket:listAll", payload),
  deleteObject: (payload) => ipcRenderer.invoke("bucket:delete", payload),
  deleteManyObjects: (payload) => ipcRenderer.invoke("bucket:deleteMany", payload),
  renameObject: (payload) => ipcRenderer.invoke("bucket:rename", payload),
  createBucketFolder: (payload) => ipcRenderer.invoke("bucket:createFolder", payload),
  cancelTransfer: (id) => ipcRenderer.invoke("transfer:cancel", id),
  pauseTransfer: (id) => ipcRenderer.invoke("transfer:pause", id),
  resumeTransfer: (id) => ipcRenderer.invoke("transfer:resume", id),
  retryTransfer: (payload) => ipcRenderer.invoke("transfer:retry", payload),
  setTransferPriority: (payload) => ipcRenderer.invoke("transfer:priority", payload),
  reorderTransfer: (payload) => ipcRenderer.invoke("transfer:reorder", payload),
  queueBulkDownloads: (payload) => ipcRenderer.invoke("transfer:queueBulkDownloads", payload),
  onTransferUpdate: (callback) => {
    ipcRenderer.on("transfer-update", (_event, data) => callback(data));
  },
});
