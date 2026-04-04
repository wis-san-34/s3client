# S3 Desktop Client

Electron-based uploader/downloader for Amazon S3 or any S3-compatible endpoint (Cloudflare R2, MinIO, etc.). Supports multipart upload with resume, range-based download resume, and per-transfer progress on Windows 10/11.

## Prereqs
- Node.js 18+ and npm
- S3 credentials (Access Key ID, Secret, and the endpoint URL such as `https://s3.us-east-1.amazonaws.com` or your custom gateway)

## Install
```bash
npm install
```

## Run in dev
```bash
npm run dev
```

## Run tests
```bash
npm test
```

## Build installer
```bash
npm run build
```
Outputs go to `dist/` via electron-builder (NSIS installer + zip).

## Usage
1) Open the app, fill Endpoint/Access Key/Secret/Bucket, and click **Save**.
2) Upload: choose a local file and set the destination key (e.g., `backups/db.dump`), then **Start Upload**. Multipart uploads persist their uploadId/parts under the app data folder so a restart can resume.
3) Download: enter the object key, pick a destination folder, optional filename override, then **Start Download**. If the file already exists, the app requests the remaining range.
4) Transfers table shows progress, bytes, and lets you cancel running jobs.

## Notes
- Resume data is stored at `%APPDATA%/s3-desktop/resume.json`; config lives beside it in `config.json`.
- Multipart part size and concurrency are configurable (default 8 MB, concurrency 2) and now clamp to AWS' required range (5 MB–5 GB, max concurrency 16) so transfers fail fast locally instead of mid-flight.
- Downloads use the same multi-part worker as uploads: you can pause/resume them, they survive restarts, and they honor the concurrency knob just like uploads.
- The region defaults to `auto` so Cloudflare R2 and other gateways work without extra input. If you rely on a specific region, adjust in `src/store.js` or expose it in the UI.
- Access keys are encrypted via Electron `safeStorage` before hitting disk, so `config.json` never holds plaintext secrets.
- The Explorer view supports breadcrumbs, multi-select with shift/ctrl, bulk actions, and a draggable splitter so you can resize local vs. bucket panes to suit your workflow.
