# S3 Desktop Client

A Windows desktop app for uploading and downloading files to Amazon S3, S3-compatible storage, FTP, and FTPS servers. Built with Electron.

**Key features:**
- Resumable multipart uploads and range-based download resumption for S3
- Dual-pane Explorer with drag-and-drop, breadcrumbs, live filtering, multi-select, and bulk actions
- S3-compatible endpoint support with optional TLS certificate verification for self-signed/private endpoints
- FTP/FTPS browsing and uploads with an FTP-focused remote file view
- Legacy FTPS options for older servers, including legacy TLS and optional plain data channel mode
- Per-transfer progress table with pause/cancel support, speed/ETA display, retry controls, and size verification
- Credentials encrypted at rest via Electron `safeStorage`; no plaintext secrets on disk
- Connection diagnostics, activity logs, and safer connection export without secrets by default
- Works with AWS S3, S3-compatible endpoints, FTP, and FTPS

---

## Getting Started

1. Install or extract the app from the [Releases](../../releases) page.
2. Open **Connections** and create an S3-compatible, FTP, or FTPS connection.
3. For S3, enter endpoint, access key, secret, and bucket. For private/self-signed endpoints, open **Advanced Transfer & Safety Settings** and disable **Verify TLS certificate**.
4. For FTP/FTPS, enter host, port, username, password, remote path, and TLS options.
5. Use **Test** on a saved connection to verify bucket/list access, FTP login/list access, and optional S3 write/delete access.
6. Upload from the dashboard or drag files/folders into the Explorer remote pane.
7. Download by selecting remote files and choosing a local destination folder.

### Compatible Storage Providers

| Provider | Endpoint format |
|----------|----------------|
| Amazon S3 | `https://s3.<region>.amazonaws.com` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |
| MinIO | `http://localhost:9000` or your server |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` |
| FTP / FTPS | Hostname or IP plus port, usually `21` or `990` |

The S3 region defaults to `auto` so R2 and other gateways work without extra configuration.

### S3-Compatible TLS

S3-compatible appliances and private MinIO deployments often use a self-signed certificate or an internal certificate authority. For those endpoints:

- Edit the S3 connection.
- Open **Advanced Transfer & Safety Settings**.
- Disable **Verify TLS certificate**.
- Save the connection and refresh the bucket explorer.

AWS endpoints remain strict by default. Disabling certificate verification should only be used for trusted private endpoints or test environments.

### FTP and FTPS

FTP/FTPS connections support:

- Saved FTP and FTPS profiles
- Explicit TLS, implicit TLS, and plain FTP
- Remote directory browsing in the Explorer pane
- Uploading files and folders to the active remote path
- Legacy TLS mode for older servers such as Xlight FTP Server 3.x
- Optional unencrypted FTPS data channel mode for older servers that reset encrypted `LIST` or upload data connections

---

### Safety and Diagnostics

- Destructive actions use in-app confirmation dialogs, with stronger confirmation for large deletes.
- Local deletes go to the recycle bin by default.
- S3 soft delete can copy objects to a configured trash prefix before deleting.
- Connection export excludes secrets by default; exporting saved secrets requires explicit confirmation and can be passphrase-encrypted.
- Completed S3 transfers are verified by file/object size and display verification status in the transfer table.

---

## Building From Source

**Requirements:** Node.js 18+ and npm

```bash
npm install
npm run dev
node --test --test-concurrency=1
npm run build
```

Build output is written to `dist/`.

The default test run includes a renderer smoke test. A real Electron process smoke test is available on machines with a usable display/GPU environment:

```bash
S3_RUN_ELECTRON_SMOKE=1 node --test test/electron-smoke.test.js
```

---

## Configuration and Data Storage

| File | Location | Contents |
|------|----------|----------|
| `config.json` | `%APPDATA%/s3-desktop/` | Connection settings with encrypted secrets |
| `resume.json` | `%APPDATA%/s3-desktop/` | In-progress S3 upload/download state |

- Multipart part size defaults to 8 MB with concurrency 2.
- Multipart settings are clamped to AWS limits: 5 MB to 5 GB, max 16 concurrent parts.
- S3 resume data is written automatically so interrupted transfers can continue later.
- S3 TLS verification is stored per connection.

---

## License

MIT
