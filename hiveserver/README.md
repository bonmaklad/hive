# Hive Server (Dev Mode)

This folder is an on-prem service that the Next.js app calls to start/stop a **Dev Mode** workspace for a site.

## What it does (today)
- Exposes authenticated HTTP endpoints: start/stop/restart a dev session.
- Creates a per-site workspace folder (by `site_id`) under `HIVESERVER_WORKSPACE_ROOT`.
- Returns `preview_url`, `editor_url` (optional), and `workspace_path` to the Next.js app.

## What it needs next (to fully “pull + run”)
- A runner implementation (git clone/pull, install deps, start framework dev server, optionally start code-server).
- A reverse proxy strategy (map each site session to a stable URL).

The included `index.js` intentionally ships with the runner **disabled by default**. Turn it on when you’re ready by setting `HIVESERVER_ENABLE_RUNNER=true`.

## Setup (on your on-prem server)
1) Copy this `hiveserver/` folder to the on-prem server (or clone the repo).
2) Set environment variables (example):
   - `HIVESERVER_TOKEN=...` (required, shared secret between Next.js and this service)
   - `HIVESERVER_PORT=8787` (optional)
   - `HIVESERVER_PUBLIC_BASE_URL=http://YOUR_SERVER_IP` (optional; used to build preview URLs)
   - `HIVESERVER_WORKSPACE_ROOT=/var/hive/workspaces` (optional; default is `hiveserver/workspaces`)
   - `HIVESERVER_ENABLE_RUNNER=true` (optional; default false)
3) Start it:
   - `cd hiveserver`
   - `node index.js`

## Configure the Next.js app
Set these on the Next.js server (never in `NEXT_PUBLIC_*`):
- `HIVESERVER_URL=http://YOUR_ONPREM_SERVER:8787`
- `HIVESERVER_TOKEN=...` (same value as the on-prem server)

## API
All endpoints require: `Authorization: Bearer $HIVESERVER_TOKEN`

### `POST /v1/dev-sessions/start`
Body:
```json
{ "site_id": "uuid", "repo": "owner/repo", "framework": "next", "branch": "main" }
```

### `POST /v1/dev-sessions/stop`
Body:
```json
{ "site_id": "uuid" }
```

### `POST /v1/dev-sessions/restart`
Body:
```json
{ "site_id": "uuid", "repo": "owner/repo", "framework": "next", "branch": "main" }
```

