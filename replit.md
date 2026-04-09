# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### picker-dashboard (`artifacts/picker-dashboard`)
XLSX-upload warehouse picker analytics dashboard. Frontend-only React+Vite app with persistent backend storage via the shared api-server.

**Features:**
- Drag-and-drop `.xlsx` upload; parsed off main thread via Web Worker (zero-copy ArrayBuffer transfer)
- Six analytics tabs: Overview, Picker Detail, Weekly, Compare, Score, Gap Flags
- Team benchmark L/Hr indicators (✓/✗ badges, delta), performance score engine (0–100, 5 KPIs), gap flag detection
- **Persistent backend storage**: on every file parse, an upload modal prompts for a password and POSTs computed DayStats to the database
- **Duplicate protection**: UNIQUE constraint on `(picker_name, date_str)` — re-uploading the same file skips existing rows and reports how many were inserted vs. skipped
- **Date filter bar**: client-side filtering by date range with "All time", "Last 30d", "Last 90d" presets
- On mount: loads all saved stats from API and merges with any locally parsed data (local takes precedence for same picker+date)
- Color theme: `BG=#060D1F` (navy), `BRAND=#E8192C` (red), `AMBER=#38BDF8` (sky blue for data values)

**Upload password**: stored in env var `DASHBOARD_UPLOAD_PASSWORD` (default: `picktrack2025`). Change it in the Secrets tab.

**API routes** (on the shared api-server at `/api`):
- `GET /api/dashboard/stats?from=YYYY-MM-DD&to=YYYY-MM-DD` — public, returns all stored picker-day stats
- `POST /api/dashboard/upload` — password-protected (`x-upload-password` header), inserts DayStats rows
- `GET /api/dashboard/uploads` — public, returns upload history

**DB tables** (`lib/db/src/schema/dashboard.ts`):
- `dashboard_stats` — one row per picker per date; UNIQUE on `(picker_name, date_str)`
- `dashboard_uploads` — upload history with file name, date range, inserted/skipped counts

### picker-efficiency (`artifacts/picker-efficiency`)
Warehouse picker efficiency tracker. React+Vite frontend that calls the shared api-server for real-time pick data (pickers, picks, leaderboard, daily trends).

### api-server (`artifacts/api-server`)
Shared Express 5 backend. Routes at `/api/*`, served via Replit's shared proxy. Includes:
- Analytics: `/api/analytics/leaderboard`, `/api/analytics/summary`, `/api/analytics/daily-trend`
- Dashboard: `/api/dashboard/stats`, `/api/dashboard/upload`, `/api/dashboard/uploads`
- CRUD: pickers, picks
