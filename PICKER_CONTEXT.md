# Picker dashboard: project context

_Written 2026-09-24 from the code, the git history, `replit.md`, the Replit agent's notes in
`.agents/memory/`, and a pull of the live feed. No earlier Claude transcripts exist for this project.
Where this file and `replit.md` disagree about how the system works, check the code. Items marked
**unverified** are inferences that nobody has confirmed yet._

---

## 1. What it is

A performance dashboard for the **warehouse order pickers** at Car Parts Warehouse. The pickers pull
internet orders (mostly Rock Auto) and log each order by hand in a Google Sheet. The dashboard turns
that sheet into lines per hour, gaps, scores and trends for each picker and for the team.

- **Repo:** `github.com/CarPartsKing/picker-dashboard-backend`, branch `main`. This one repo holds both
  the Render backend and the Replit monorepo.
- **Built:** April 2026 in Replit (account `tonydifiore1234`). Backend fixes were made in Claude Code
  sessions in late April and early May 2026. Since July 2026 every change has come from **Replit Agent**,
  apart from the 2026-09-24 name fix.
- The original product brief is `attached_assets/Pasted-What-this-is-A-performance-tracking-dashboard…txt`.

---

## 2. How data flows

```
Google Sheet (one tab per day)
   │  Apps Script, daily 7 PM Eastern  (fixes/CPW_Picker_Export.gs)
   ▼
Render: picker-dashboard-backend.onrender.com   (backend_server.py, FastAPI)
   │  upsert on (date, picker)
   ▼
Supabase table picker_data
   ▲
   │  GET /api/picker-data  (Render reads Supabase and returns JSON)
   │
Replit api-server  GET /api/dashboard/live-data  (proxies Render, archives into Replit Postgres)
   │
   ▼
Replit picker-dashboard (React)  ← also accepts a dragged-in .xlsx and reads saved rows from Replit Postgres
```

Three sources are merged in the browser. When two sources have a row for the same **picker + date**,
the higher priority wins:
1. an `.xlsx` parsed in this browser session
2. the live Render feed
3. saved rows in Replit Postgres (`dashboard_stats`), which hold uploads and archived live pulls

### 2.1 The Google Sheet

- **One tab per day.** Tab names are date digits: `412026` = 4/1/2026 and `4102026` = 4/10/2026.
- **Wide layout.** Row 1 holds the picker names. Each picker takes three columns: **order number,
  lines picked, time**. Each row below is one order, in time order.
- **Times are typed by hand and messy:** `759`, `1202`, `6;23`, `5:09` (meaning 5:09 PM), Excel
  fractions, and stray `` ` `` or `,` characters.
- **Designators in the time cell:**
  - `LF` (look-for): the time is subtracted from the L/Hr denominator.
  - `RP` and `SO`: counted, but the time is not subtracted. No policy has been set for them.
  - A designator can carry a time: `LF1142` means a look-for that started at 11:42.
- Header columns skipped by the export: TIME, TEAM GOALS, JSC, PULLER.

### 2.2 Apps Script: `fixes/CPW_Picker_Export.gs`

- **Version `2026-09-25-v5`** is the copy to use. v4 added the shift-hours rule for 12-hour times (§3);
  v5 recomputes gaps when one name has two columns on a day. The Replit asset metadata still labels v3
  "Use This Copy"; ignore that. **A new version only takes effect once someone pastes it into the
  Sheet** (see below). Tony pasted v4 on 2026-09-25.
  It runs daily at **7 PM Eastern** (`setupTriggers()`), reads **every dated tab**, merges duplicates,
  and uploads in batches of 100 with retries.
- **Emails:**
  - "Completed With Parsing Warnings": the upload worked and only the listed cells were ignored.
  - HTTP 500: the batch failed.
  - "No Data Found": nothing was uploaded.
- **Pasting it into the Sheet is manual**, done by the sheet owner. The 2026-09-01 logs in
  `attached_assets/` show a run that uploaded 377 records with 3 warnings, down from 145 before the fix.
  The live feed was exported **2026-09-24 23:30 UTC**, so the daily trigger is running.
- It sends an `x-api-key` header only when the Script Property `API_KEY` is set.

### 2.3 Render backend: `backend_server.py` (FastAPI)

- `POST /api/picker-data` takes the Apps Script payload (camelCase fields).
  - If `API_KEY` is set on Render, the request must carry a matching `x-api-key` header.
  - Duplicate picker+date rows within one batch are merged: counts are added, the time window is the
    earliest start to the latest end, and rates are recomputed.
  - Rows are upserted into Supabase on `(date, picker)`.
  - Then **`is_lf_specialist` is recalculated** for each picker in the batch and written to every row
    for that picker. A picker qualifies when **average LF orders ≥ 10, average LF % of shift ≥ 30,
    and at least 15 days have LF orders**.
- `GET /api/picker-data` is public. It returns the Supabase rows ordered by date (newest first), then
  picker.
- Environment: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_TABLE` (default `picker_data`), `API_KEY`,
  `ALLOWED_ORIGINS`. Python dependencies are in `requirements.txt`.
- **Render does not normalise names** and **does not subtract LF time** from `lines_per_hr`. The
  dashboard recomputes both.

### 2.4 Replit side: the pnpm monorepo

| Path | What |
|---|---|
| `artifacts/picker-dashboard` | **The dashboard.** React + Vite. `App.tsx` (~3,400 lines, all tabs), `parseUtils.ts` (xlsx parsing, `parseTime`, `normalizeName`), `parseWorker.ts` (parses in a Web Worker), `apiClient.ts` |
| `artifacts/api-server` | Express 5. `routes/dashboard.ts` covers stats, upload, clear-all and live-data. `analytics/pickers/picks` routes serve the older app |
| `artifacts/picker-efficiency` | An older, separate picker app on its own `pickers`/`picks` tables. Not the dashboard |
| `artifacts/mockup-sandbox` | Replit scaffolding |
| `lib/db` | Drizzle schema. The dashboard uses `dashboard_stats` (unique on picker_name + date_str, `source` = `upload` or `live`) and `dashboard_uploads` |

**api-server routes for the dashboard:**
- `GET /api/dashboard/stats?from=&to=` is public.
- `POST /api/dashboard/upload` and `DELETE /api/dashboard/stats` (clears **everything**) need the
  `x-upload-password` header, checked against `DASHBOARD_UPLOAD_PASSWORD` in Replit Secrets.
- `GET /api/dashboard/live-data` proxies Render (`EXTERNAL_API_URL`). It then upserts the feed into
  `dashboard_stats` with `source = live`, **at most once every 10 minutes**, and only when someone
  loads the dashboard.
- An upload overwrites a `live` row for the same picker and date. A live pull never overwrites an
  `upload` row.

**Dashboard tabs:** Overview, Picker Detail, Weekly, Compare, Score, Gap Flags.
- **Score** is 0 to 100:
  - pick rate 30
  - consistency 25
  - uptime 20
  - batch efficiency 10
  - trend 10
  - look-for contribution 10
- **Bands:** Elite 85+, Strong 70–84, Solid 55–69, Developing 40–54, Needs Focus under 40.

---

## 3. Rules the numbers follow

- **L/Hr, the same formula for every source:** `lines ÷ max((last − first) − LF minutes, 1) × 60`.
  Minutes are rounded the same way on the server and in the browser, so live and archived rows agree.
- **30-minute minimum for a rate** (Tony, 2026-09-25). A day with less than 30 minutes of picking time
  (window minus LF minutes) gets **no L/Hr or orders/hr**, but its lines and orders still count. This
  lives in `MIN_RATE_WINDOW_MINS` in `App.tsx` and in the api-server archive, and is also applied when
  saved rows are read. On the full feed it removes 43 of 2,293 rates. Days over 100 L/Hr drop from
  16 to 7, and the maximum falls from 480 to 141.
  - The 7 left are 30–45 minute windows with 50–80 orders (Scott Aug 26, Jhai Jul 21, Sherri May 10 and
    Apr 12), or Anthony's LF-heavy days in old exports. They are real high rates or old AM/PM
    mistakes, not tiny windows.
- **Team and weekly rates are weighted by hours:** total lines ÷ total effective hours. They are
  not an average of daily rates.
- **12-hour times and shift hours.** Pickers write times without AM/PM. The shift runs from **6 AM to
  about 8 PM** (Tony, 2026-09-25). Each picker's times are read in sheet-row order, which is time order:
  - **before 6:00:** PM (`1:07` means 1:07 PM)
  - **6:00 to 8:30:** PM once the day has reached noon, otherwise AM
  - **8:31 to 11:59, and 12:00 onward:** as written

  The rule lives in two places that must stay in sync: `resolveTimeEntries_` in the Apps Script (the
  live feed) and `resolveShiftTimes` in `parseUtils.ts` (dragged-in .xlsx files). On 2026-09-25 both
  copies agreed on 20,000 random sequences. The dashboard's old "phantom timestamp" filter, which
  dropped times before 4 AM, was removed as dead code on 2026-09-25.
- **Gap flags:** a gap of 90 minutes or more is flagged. Low under 120, Med 120–179, High 180+.
  Times are sorted as numbers before gaps are found, everywhere.
- **Picking totals leave out** LF, RP and SO orders. Those are counted separately.
- **Names** (`normalizeName` in `parseUtils.ts`, copied in `api-server/src/routes/dashboard.ts`, keep
  the two in sync):
  - Title Case.
  - Stray punctuation is dropped (`Andy!` becomes `Andy`).
  - A zero next to letters becomes O (`0ssie` becomes `Ossie`).
  - Number-only words are dropped (`Eric 356025562` becomes `Eric`).
  - Then `PICKER_NAME_ALIASES` is applied.
  - **Before adding an alias, check every date the two names share:**
    - **Figures differ** (different times or order counts): two columns, so two people. Don't merge.
    - **Figures identical:** the same column was exported under two spellings because its header was
      retyped between exports, and Supabase kept both rows. Safe to merge.
    - **No shared dates:** usually safe; ask Tony.
  - After name rules, the dashboard and the archive keep **one row per picker per day**: the most
    recently exported one (`latestPerPickerDay` in `App.tsx`, and the archive dedupe in
    `dashboard.ts`). Before this, Ossie on 2026-05-06 and Andy on 2026-05-01 were counted twice.

---

## 4. Known problems and traps

- **The "~1,000 record rolling cap" was Supabase's default row limit, not lost data. Fixed and
  confirmed 2026-09-25.**
  - Render's GET used to ask Supabase for every row in a single request. Supabase returns at most
    1,000 rows per request, so the feed stopped at exactly 1,000 (Jul 3 to Sep 24). The Replit agent
    read that as "older days fall off" and built the archive to cope.
  - `backend_server.py` (commit `3d39081`) now pages with `limit`/`offset` until it gets an empty page,
    using `_select_all`. `GET /api/picker-data` and the LF specialist recalculation both use it. Picker
    names in the LF in-list are quoted, because a comma in a raw sheet name used to break the query.
  - **Confirmed live:** after the deploy the feed returned **2,424 records from 2026-04-01**, with one
    row per picker per day, across 167 days. Supabase holds the full history, because the Apps Script
    upserts and never deletes.
  - The Replit archive (`source = live`) is now a second copy, not the only one. It's still useful as
    a fallback if Render or Supabase is down.
  - The feed grows by about 15 rows a day, and Render takes about 0.5 s per 1,000 rows. That is far
    inside the Replit proxy's 15 s timeout, but if the feed ever gets slow, add `from`/`to` filters
    to the Render GET.
  - LF specialist flags are only recalculated when an export arrives, so the first post-fix
    recalculation over the full history is the 2026-09-25 7 PM export.
- **The "gap detection sorts time strings" bug does not exist** in the v3 or v4 script. Both sort as
  numbers. The real cause of bad gaps was **afternoon times read as early morning**:
  - In the 2026-09-24 export, **202 of 670 picker-days started before 6 AM** (76 at 1 AM, 64 at 2 AM).
  - v3 only moved a day's small numbers to PM when that looked closer to its unambiguous times, so it
    often guessed wrong. Darrell on Sep 21 read as 1:07–8:00 AM. A 6:30 AM to 7:50 PM day read as
    3:15 AM to 2:00 PM.
  - **Fixed in v4 (2026-09-25)** with the shift-hours rule (§3).
  - **Old rows keep the wrong times.** 1,754 of the 2,424 rows come from exports on May 3, Jun 30 and
    Jul 23. Their sheet tabs are no longer exported, so v4 can't reach them. Only the raw sheet tabs
    could fix them.
- **Two columns with the same name on one tab** (fixed 2026-09-25):
  - The Apps Script used to join the two columns' gap lists, which produced overlapping gaps (Anthony,
    Jul 20–23). v5 keeps each column's times (`_times`, stripped before upload) and recomputes gaps on
    the combined timeline.
  - The dashboard's xlsx parser used to keep only the last column, silently dropping the other's
    orders. It now combines them.
  - Render's `_dedup` still joins gap lists, but it only sees duplicates the Apps Script has already
    merged, so it no longer matters.
  - Before August, the two columns may have been two different Anthonys both writing "Anthony".
- **Days with no usable timing:** 131 across the full history.
  - Every value in the pre-v3 warnings email (`attached_assets/Pasted--tonydifiore…txt`) parses in v4
    except one garbled `\11553`.
  - The 24 such days in the 2026-09-25 export are columns with no times, or only one (Belle Sep 20,
    82 orders; Larone Aug 9, 58 orders). The v4/v5 warnings email names the cells; it's needed to fix
    them.
  - Brandon's and Nani's days are all in old frozen exports.
  - **Sherri's** tiny windows come from the old AM/PM misreads.
- **`is_lf_specialist` has two sources.** Render calculates it, and the Replit archive copies whatever
  Render sent. Don't add a third rule.
- **The archive runs only when the dashboard is opened.** Now that the cap looks like a read limit,
  this matters less.
- **Replit republishing:** the "Published your App" commits are made by hand in Replit. **Unverified**
  whether Replit pulls from GitHub on its own. Assume a pushed change is live only after someone
  republishes in Replit.
- `project.tar.gz` (136 MB) is tracked through Git LFS. It's an old Replit snapshot from 2026-04-27.
- **pnpm 12 on the T14s rewrites `pnpm-workspace.yaml`** every time it runs (`onlyBuiltDependencies`
  becomes `allowBuilds`), then stops with `ERR_PNPM_IGNORED_BUILDS` for esbuild. Discard the rewrite;
  Replit uses its own pnpm.

---

## 5. Open decisions (Tony)

**Merged:** 0ssie → Ossie, Andy! → Andy, Eric + number → Eric, Jreremy → Jeremy, Jaypitt → Jay Pitt,
Anthony a → Anthonya (2026-09-24); Nas → Nasir, Ken → Kenneth, Taureen → Taurean, Armanip → Armani,
Phil → Phillip (2026-09-25).

**Name merges not yet decided.** Checked against the full feed, 2,424 rows from Apr 1, on 2026-09-25:

| Variants | Evidence | Question |
|---|---|---|
| Ahthony | Differs from Anthony on Jul 16 (different orders) | Anthony A, Anthony D, or its own person? |
| Jay, Jay M, Jayy, Jy | No shared days | One person or several? |
| Tay (2 days) | No shared days with Taylor or Tayja | Which one? |
| Will/William, Kal/Kalel, Reggie/Reginald, Carlos/Carlos J, Tony/Tonya, Jorge/"Jorge W.call" | No shared days | Same person? |
| Sherri (Apr 5–May 13), Shari (Jun 3–Jul 3) | **Kept separate (Tony, 2026-09-25).** For one person: the names never overlap, and they are the only two of 52 pickers who usually start 6:10–6:25 with 50–70 orders a day. Against: a 3-week gap between them, Sherri works Sundays while Shari works Saturdays, and lines per order are 1.36 vs 1.59. Sherri's ~7 AM finish is an old AM/PM mistake, so don't use it as evidence | Revisit only if Tony confirms it's one person |
| Bryan/Bryant | Differ on May 26 (29 vs 4 orders) | Probably two people |

**Confirmed as different people** (different figures on shared dates): Anthony, Anthonya and
Anthonyd; Tayja and Taylor; Tyler and Tyler B; David and Davion.

**Also open:**
- whether RP/SO time should be subtracted like LF

---

## 6. Working on it

- Commit as Tony DiFiore with the Claude co-author trailer, and push to `main`. Replit Agent commits
  there too, so **pull before starting.**
- **Typecheck on the T14s without pnpm** (`pnpm run typecheck` fails there, see §4). Use the
  installed `tsc`:
  - from the repo root: `node_modules/.bin/tsc --build` (the shared libraries)
  - in `artifacts/picker-dashboard` and `artifacts/api-server`: `../../node_modules/.bin/tsc -p tsconfig.json --noEmit`

  All three passed on 2026-09-24.
- **Tests:** `node --test src/*.test.ts` in `artifacts/picker-dashboard`, or `pnpm --filter
  @workspace/picker-dashboard run test`. They cover parseTime, the shift rule, name rules, tab dates and
  parseSheet, using Node's built-in runner, so nothing extra to install. Add a test with every parser
  change.
- `vite build` can't run on the T14s: the Rollup Windows binary isn't installed, because the packages
  were installed for Replit's Linux. Rely on typecheck and tests locally; Replit builds on publish.
- Check the live feed quickly by opening `https://picker-dashboard-backend.onrender.com/api/picker-data`.
  Render's free tier may take a minute to wake up.
