---
name: Render live-feed quirks
description: External picker-data feed (user-controlled Render backend) limits and known data bugs
---
The dashboard's live data comes from a user-controlled external backend (picker-dashboard-backend.onrender.com), fed by Google Sheets via Apps Script. Changes to the Apps Script must be pasted and run by the sheet owner.

**Rolling cap:** The feed exports at most ~1000 records (rolling window). Older days silently fall off. **Why:** discovered Jul 2026 when April data vanished. The api-server's live-data route now auto-archives every pull into `dashboard_stats` — that DB is the only durable history.

**Known upstream bugs (owner = user/Render, not our code):**
- Gap detection sorts raw time strings instead of parsed minutes → gaps that start exactly at first_time_mins (~33 records). L/Hr parsing was fixed separately; the gap path was not.
- Pickers type 12-hour colon times (e.g. "5:09" = 5:09 PM); Render converts to 24h. Some pickers' formats still fail (Brandon, Bryan never get L/Hr).
- Sherri's active windows are systematically tiny → inflated L/Hr (>100).
- Name duplicates come from the sheet: Ossie vs 0ssie (digit zero), Taurean/Taureen, Will/William, Andy/Andy!, etc. Our normalizeName does Title Case but doesn't strip punctuation.

**How to apply:** when data looks wrong, first check whether it's a feed-side bug (audit via `curl localhost:80/api/dashboard/live-data`) before touching dashboard code.

**Export health:** a “Completed With Parsing Warnings” email means the batch reached Render and only listed cells were ignored; an HTTP 500 email means the batch failed. Confirm the feed’s `exportedAt` before assuming an alert means the whole feed is stale.

**Designators:** Sheet time cells can carry designators instead of times: LF (look-for, time subtracted from L/Hr denominator), RP and SO (recognized and counted, but time NOT subtracted — no policy set). As of Jul 2026 the feed exposes rp_/so_ fields but all values are zero.

**Canonical L/Hr formula (all sources):** lines ÷ max((last − first) − lfMinutes, 1) × 60. The feed's own lines_per_hr uses the raw window — never trust it; recompute. Weekly day-of-week team rate is hours-weighted (total lines ÷ total effective hours), not an average of daily averages.

**Sheet layout:** Each picker occupies a repeating three-column block: order number, line count, then exact order-start timestamp. Rows descend chronologically; the interval between consecutive timestamps represents pull duration. Activity values can combine a code and timestamp (for example, LF1142 means an LF order starting at 11:42).

**Why:** The time column is not merely a shift-start/shift-end source. Dropping timestamps embedded in LF/RP/SO entries distorts both the work timeline and LF duration.

**How to apply:** Preserve every valid activity timestamp in chronological calculations. For LF duration, start at the LF entry's own embedded timestamp and end at the next ordinary pick timestamp; only fall back to the preceding pick for legacy LF values without a timestamp.
