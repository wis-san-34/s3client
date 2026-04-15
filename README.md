# S3 Desktop Client

A Windows desktop app for uploading and downloading files to Amazon S3 or any S3-compatible storage (Cloudflare R2, MinIO, Backblaze B2, and more). Built with Electron.

**Key features:**
- Resumable multipart uploads and range-based download resumption — survive restarts and network drops
- Dual-pane Explorer with drag-and-drop, breadcrumbs, live filtering, multi-select, and bulk actions
- Per-transfer progress table with pause/cancel support
- Credentials encrypted at rest via Electron `safeStorage` — no plaintext secrets on disk
- Works with AWS S3 and any S3-compatible endpoint out of the box

---

## Screenshots

> _Add screenshots here to show the dashboard, explorer, and transfers view._

---

## Download

Pre-built installers for Windows 10/11 are available on the [Releases](../../releases) page.

| File | Description |
|------|-------------|
| `S3 Desktop Client Setup 0.3.0.exe` | One-click NSIS installer |

---

## Getting started

1. **Install or extract** the app from the [Releases](../../releases) page.
2. Open the app and go to **Connections** — fill in your Endpoint URL, Access Key ID, Secret, and Bucket name, then click **Save**.
3. **Upload**: pick a local file, set the destination key (e.g. `backups/db.dump`), and click **Start Upload**. You can also drag files or folders from Windows Explorer onto the dashboard dropzone or into the Explorer bucket pane.
4. **Download**: enter the object key, choose a destination folder, and click **Start Download**. If the file already exists the app resumes from where it left off.
5. The **Transfers** table shows live progress and lets you cancel running jobs.

### Compatible storage providers

| Provider | Endpoint format |
|----------|----------------|
| Amazon S3 | `https://s3.<region>.amazonaws.com` |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` |
| MinIO | `http://localhost:9000` (or your server) |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` |

The region defaults to `auto` so R2 and other gateways work without extra configuration.

---

## Building from source

**Requirements:** Node.js 18+ and npm

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build Windows installer (outputs to dist/)
npm run build
```

---

## Configuration and data storage

| File | Location | Contents |
|------|----------|----------|
| `config.json` | `%APPDATA%/s3-desktop/` | Connection settings (secrets encrypted) |
| `resume.json` | `%APPDATA%/s3-desktop/` | In-progress upload/download state |

- Multipart part size defaults to **8 MB** with **concurrency 2** (configurable, clamped to AWS limits: 5 MB–5 GB, max 16 concurrent parts).
- Resume data is written automatically — just restart the app and continue a transfer from where it stopped.

---

## License

MIT
