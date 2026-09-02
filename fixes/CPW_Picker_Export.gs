const BACKEND_URL = "https://picker-dashboard-backend.onrender.com/api/picker-data";
const ALERT_EMAIL = "tonydifiore1234567890@gmail.com";
const EXPORT_TIME_ZONE = "America/New_York";
const EXPORT_HOUR = 19;
const UPLOAD_BATCH_SIZE = 100;
const MAX_ERROR_DETAILS = 100;
const SCRIPT_VERSION = "2026-09-02-v3";

/**
 * Optional security:
 * In Apps Script Project Settings > Script Properties, add API_KEY only if the
 * Render backend is configured to require the x-api-key header.
 */
function getApiKey_() {
  return PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
}

// Run once to confirm that Apps Script has permission to send email.
function testEmail() {
  sendAlert_("CPW Export — Test Alert", "Email alerts are working correctly.");
}

// Run once to replace existing project triggers with the daily export trigger.
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  ScriptApp.newTrigger("exportPickerData")
    .timeBased()
    .atHour(EXPORT_HOUR)
    .everyDays(1)
    .inTimezone(EXPORT_TIME_ZONE)
    .create();

  Logger.log("Daily export trigger created for 7 PM Eastern.");
}

function exportPickerData() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Another export is already running; this run was skipped.");
    return;
  }

  try {
    runExport_();
  } catch (error) {
    const message = error && error.stack ? error.stack : String(error);
    Logger.log("Fatal export error: " + message);
    sendAlert_(
      "CPW Picker Export FAILED",
      "Export failed at " + new Date().toISOString() + "\n\n" + message
    );
    throw error;
  } finally {
    lock.releaseLock();
  }
}

// Kept for compatibility with the old script's manually-run function.
function testExport() {
  exportPickerData();
}

function runExport_() {
  const startedAt = new Date();
  Logger.log(
    "=== STARTING EXPORT " + SCRIPT_VERSION + " === " + startedAt.toISOString()
  );

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("No active spreadsheet is attached to this Apps Script project.");
  }

  const allRecords = [];
  const allErrors = [];

  spreadsheet.getSheets().forEach(function (sheet) {
    const dateLabel = parseSheetDate_(sheet.getName());
    if (!dateLabel || sheet.getLastRow() < 2) return;

    Logger.log("Processing " + sheet.getName() + " as " + dateLabel);
    const values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) return;

    const result = parseSheetWithErrors(values, dateLabel);
    allRecords.push.apply(allRecords, result.records);
    allErrors.push.apply(allErrors, result.sheetErrors);
    Logger.log(
      "  -> " + result.records.length + " pickers, " +
      result.sheetErrors.length + " parse warnings"
    );
  });

  const records = mergeDuplicateRecords_(allRecords);
  Logger.log(
    "Prepared " + records.length + " unique records with " +
    allErrors.length + " parse warnings."
  );

  if (records.length === 0) {
    const message = "No picker data was found. Nothing was uploaded.";
    sendAlert_("CPW Picker Export — No Data Found", message);
    Logger.log(message);
    return;
  }

  const exportedAt = new Date().toISOString();
  let uploaded = 0;

  for (let start = 0; start < records.length; start += UPLOAD_BATCH_SIZE) {
    const batch = records.slice(start, start + UPLOAD_BATCH_SIZE);
    uploadBatchWithRetry_(batch, exportedAt, start / UPLOAD_BATCH_SIZE + 1);
    uploaded += batch.length;
  }

  if (allErrors.length > 0) {
    sendParsingWarning_(uploaded, allErrors);
  }

  Logger.log(
    "=== EXPORT COMPLETE === uploaded=" + uploaded +
    " warnings=" + allErrors.length +
    " finished=" + new Date().toISOString()
  );
}

function parseSheetDate_(sheetName) {
  const match = String(sheetName).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;

  return (
    year + "-" +
    String(month).padStart(2, "0") + "-" +
    String(day).padStart(2, "0")
  );
}

function uploadBatchWithRetry_(records, exportedAt, batchNumber) {
  const payload = JSON.stringify({
    exportedAt: exportedAt,
    recordCount: records.length,
    data: records
  });

  const headers = {};
  const apiKey = getApiKey_();
  if (apiKey) headers["x-api-key"] = apiKey;

  let lastFailure = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = UrlFetchApp.fetch(BACKEND_URL, {
        method: "POST",
        contentType: "application/json",
        headers: headers,
        payload: payload,
        muteHttpExceptions: true
      });

      const code = response.getResponseCode();
      const body = response.getContentText();
      if (code >= 200 && code < 300) {
        Logger.log("Batch " + batchNumber + " uploaded: " + body.slice(0, 500));
        return;
      }

      lastFailure = "HTTP " + code + "\n" + body.slice(0, 2000);
      Logger.log(
        "Batch " + batchNumber + " attempt " + attempt + " failed: " + lastFailure
      );

      // Retrying malformed/authenticated requests will not help.
      if (code >= 400 && code < 500) break;
    } catch (error) {
      lastFailure = error && error.stack ? error.stack : String(error);
      Logger.log(
        "Batch " + batchNumber + " attempt " + attempt +
        " threw: " + lastFailure
      );
    }

    if (attempt < 3) Utilities.sleep(attempt * 5000);
  }

  throw new Error(
    "Upload batch " + batchNumber + " failed after retries.\n" + lastFailure
  );
}

function sendParsingWarning_(recordCount, errors) {
  const shown = errors.slice(0, MAX_ERROR_DETAILS);
  const details = shown.map(function (error) {
    return (
      "Date: " + error.date +
      " | Picker: " + error.picker +
      " | Time column: " + error.col +
      " | Value: " + JSON.stringify(error.rawValue) +
      " | Issue: " + error.issue
    );
  }).join("\n");

  const omitted = errors.length - shown.length;
  const suffix = omitted > 0
    ? "\n\n" + omitted + " additional warnings were omitted from this email."
    : "";

  sendAlert_(
    "CPW Picker Export — Completed With Parsing Warnings",
    "The export completed successfully, but " + errors.length +
    " time values were ignored.\n\nRecords exported: " + recordCount +
    "\n\n" + details + suffix
  );
}

function sendAlert_(subject, body) {
  try {
    MailApp.sendEmail(ALERT_EMAIL, subject, body);
    Logger.log("Alert sent: " + subject);
  } catch (error) {
    Logger.log("Could not send alert email: " + error.message);
  }
}

function cleanTimeString_(raw) {
  return String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

function isBlankTimeMarker_(raw) {
  if (raw === null || raw === undefined || raw === "") return true;
  if (typeof raw !== "string") return false;
  const value = cleanTimeString_(raw);
  return (
    value === "" ||
    value === '"' ||
    value === "'" ||
    value === "\\" ||
    value === "." ||
    value === "-" ||
    value === "--" ||
    value.toUpperCase() === "N/A"
  );
}

function parseTimeMins(raw) {
  if (isBlankTimeMarker_(raw)) return null;

  if (raw instanceof Date) {
    const hours = raw.getHours();
    const minutes = raw.getMinutes();
    return isValidTimestamp(hours * 60 + minutes) ? hours * 60 + minutes : null;
  }

  if (typeof raw === "number" && isFinite(raw)) {
    // Google Sheets stores genuine time values as fractions of a day.
    if (raw >= 0 && raw < 1) return Math.round(raw * 1440) % 1440;

    // In a time column, whole numbers 1-23 mean an hour on the hour.
    if (Number.isInteger(raw) && raw >= 1 && raw <= 23) return raw * 60;

    // Decimal clock notation such as 5.30.
    if (raw >= 1 && raw < 24 && !Number.isInteger(raw)) {
      const hours = Math.floor(raw);
      const minutes = Math.round((raw - hours) * 100);
      if (minutes < 60) return hours * 60 + minutes;
    }

    const compact = String(Math.round(raw));
    const parsedCompact = parseCompactTime_(compact);
    if (parsedCompact !== null) return parsedCompact;

    // Common keypad slip: 7560 in a time cell means 7:56.
    if (compact.length === 4 && compact.endsWith("0")) {
      return parseCompactTime_(compact.slice(0, -1));
    }
    return null;
  }

  let value = cleanTimeString_(raw)
    .replace(/^[`\\]+/, "")
    .replace(/'/g, "")
    .replace(/,/g, "")
    .replace(/[.,]+$/, "");

  // Activity codes may be immediately followed by their exact start time:
  // LF1142, LF12:19, RP305, SO4:10 PM.
  value = value.replace(/^(LF|RP|SO)\s*/i, "");
  if (!value) return null;

  // Hour only, optionally with AM/PM: 1, 10, 5 PM.
  let match = value.match(/^(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (match) {
    return clockPartsToMinutes_(Number(match[1]), 0, match[2] || "");
  }

  // Standard/semi-standard clock values: 5:09, 5;09, 5:09 PM.
  match = value.match(/^(\d{1,2})\s*[:;.]\s*(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (match) {
    return clockPartsToMinutes_(
      Number(match[1]),
      Number(match[2]),
      match[3] || ""
    );
  }

  const parsedCompact = parseCompactTime_(value);
  if (parsedCompact !== null) return parsedCompact;

  // Last safe fallback for punctuation-damaged entries such as 12:,39 or
  // 10,:31. Only accept three or four digits so genuinely ambiguous values
  // such as 11553 remain warnings instead of being guessed.
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length === 3 || digitsOnly.length === 4) {
    return parseCompactTime_(digitsOnly);
  }

  return null;
}

function parseCompactTime_(value) {
  if (!/^\d{3,4}$/.test(value)) return null;
  const hours = value.length === 3
    ? Number(value.slice(0, 1))
    : Number(value.slice(0, 2));
  const minutes = Number(value.slice(-2));
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clockPartsToMinutes_(hours, minutes, period) {
  if (minutes < 0 || minutes > 59) return null;
  const normalizedPeriod = String(period).toLowerCase().replace(/\./g, "");

  if (normalizedPeriod) {
    if (hours < 1 || hours > 12) return null;
    if (normalizedPeriod === "pm" && hours !== 12) hours += 12;
    if (normalizedPeriod === "am" && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

function isValidTimestamp(value) {
  return typeof value === "number" && isFinite(value) && value >= 0 && value <= 1439;
}

function getActivityType(timeValue) {
  if (timeValue === null || timeValue === undefined || timeValue instanceof Date) {
    return "pick";
  }
  const value = cleanTimeString_(timeValue).toUpperCase();
  if (value.startsWith("LF")) return "lf";
  if (value.startsWith("RP")) return "rp";
  if (value.startsWith("SO")) return "so";
  return "pick";
}

function isKnownNonTimeValue_(value) {
  if (isBlankTimeMarker_(value)) return true;
  const upper = cleanTimeString_(value).toUpperCase();
  return (
    upper.startsWith("LF") ||
    upper.startsWith("RP") ||
    upper.startsWith("SO") ||
    upper === "PW"
  );
}

function isValidOrder(orderValue) {
  if (orderValue === null || orderValue === undefined) return false;
  return /\d/.test(String(orderValue).trim());
}

function resolveTimeEntries_(entries) {
  if (entries.length < 2) return entries.slice();

  const clear = entries
    .map(function (entry) { return entry.minutes; })
    .filter(function (minutes) { return minutes >= 360; })
    .sort(function (a, b) { return a - b; });

  const ambiguous = entries
    .map(function (entry) { return entry.minutes; })
    .filter(function (minutes) { return minutes < 360; })
    .sort(function (a, b) { return a - b; });

  if (!clear.length || !ambiguous.length) return entries.slice();

  const clearAnchor = median_(clear);
  const ambiguousAnchor = median_(ambiguous);
  const spread = ambiguous[ambiguous.length - 1] - ambiguous[0];
  const convertAll = (
    spread <= 480 &&
    ambiguousAnchor + 720 <= 1439 &&
    Math.abs(ambiguousAnchor + 720 - clearAnchor) <
      Math.abs(ambiguousAnchor - clearAnchor)
  );

  return entries.map(function (entry) {
    if (entry.minutes >= 360) return entry;
    const asPm = entry.minutes + 720;
    if (asPm > 1439) return entry;

    if (convertAll ||
        Math.abs(asPm - clearAnchor) < Math.abs(entry.minutes - clearAnchor)) {
      return Object.assign({}, entry, { minutes: asPm });
    }
    return entry;
  });
}

function median_(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

function removeOutliers(times) {
  if (times.length < 2) return times.slice();
  const sorted = times.slice().sort(function (a, b) { return a - b; });
  const totalSpan = sorted[sorted.length - 1] - sorted[0];

  if (totalSpan > 720) {
    let maximumGap = 0;
    let splitAt = 0;
    for (let index = 1; index < sorted.length; index++) {
      const gap = sorted[index] - sorted[index - 1];
      if (gap > maximumGap) {
        maximumGap = gap;
        splitAt = index;
      }
    }
    return splitAt <= sorted.length - splitAt
      ? sorted.slice(splitAt)
      : sorted.slice(0, splitAt);
  }

  if (sorted.length < 3) return sorted;
  const center = median_(sorted);
  return sorted.filter(function (time) {
    return Math.abs(time - center) <= 420;
  });
}

function parseSheetWithErrors(data, dateLabel) {
  const headerRow = data[0];
  const records = [];
  const sheetErrors = [];
  const skippedHeaders = ["TIME", "TEAM GOALS", "JSC", "PULLER"];

  for (let col = 0; col < headerRow.length - 2; col += 3) {
    if (typeof headerRow[col] !== "string") continue;
    const picker = headerRow[col].trim();
    const upperPicker = picker.toUpperCase();
    if (!picker || picker.length < 2) continue;
    if (skippedHeaders.some(function (value) {
      return upperPicker.indexOf(value) !== -1;
    })) continue;

    const rows = [];
    const timeEntries = [];

    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
      const orderValue = data[rowIndex][col];
      const linesValue = data[rowIndex][col + 1];
      const timeValue = data[rowIndex][col + 2];
      const activity = getActivityType(timeValue);
      const parsedTime = parseTimeMins(timeValue);

      if (
        !isKnownNonTimeValue_(timeValue) &&
        !(timeValue instanceof Date) &&
        parsedTime === null &&
        typeof timeValue !== "object"
      ) {
        sheetErrors.push({
          date: dateLabel,
          picker: picker,
          // Human-readable 1-based column of the actual time cell.
          col: col + 3,
          rawValue: timeValue,
          issue: "Unrecognized time format"
        });
      }

      const hasOrder = isValidOrder(orderValue);
      if (!hasOrder) {
        if (activity === "pick" && isValidTimestamp(parsedTime)) {
          timeEntries.push({
            key: "timestamp-" + rowIndex,
            minutes: parsedTime
          });
        }
        continue;
      }

      if (
        typeof orderValue === "string" &&
        isNaN(orderValue) &&
        /[A-Za-z]{3,}/.test(orderValue) &&
        !/^(LF|RP|SO)\b/i.test(orderValue.trim())
      ) continue;

      const lines = Number(linesValue);
      if (!isFinite(lines) || lines <= 0) continue;

      const row = {
        key: "row-" + rowIndex,
        lines: lines,
        activity: activity,
        timeMins: isValidTimestamp(parsedTime) ? parsedTime : null
      };
      rows.push(row);
      if (row.timeMins !== null) {
        timeEntries.push({ key: row.key, minutes: row.timeMins });
      }
    }

    const resolvedEntries = resolveTimeEntries_(timeEntries);
    const resolvedByKey = {};
    resolvedEntries.forEach(function (entry) {
      resolvedByKey[entry.key] = entry.minutes;
    });
    rows.forEach(function (row) {
      if (row.timeMins !== null && resolvedByKey[row.key] !== undefined) {
        row.timeMins = resolvedByKey[row.key];
      }
    });

    let totalLines = 0;
    let orderCount = 0;
    let lfLines = 0;
    let lfCount = 0;
    let rpLines = 0;
    let rpCount = 0;
    let soLines = 0;
    let soCount = 0;
    let lfMinutes = 0;
    let lastPickTime = null;
    let lfWindowStart = null;

    rows.forEach(function (row) {
      if (row.activity === "lf") {
        lfCount++;
        lfLines += row.lines;
        if (lfWindowStart === null) {
          // Prefer the LF order's own start timestamp. Fall back to the
          // preceding pick only for legacy LF entries without a timestamp.
          lfWindowStart = row.timeMins !== null ? row.timeMins : lastPickTime;
        }
        return;
      }
      if (row.activity === "rp") {
        rpCount++;
        rpLines += row.lines;
        return;
      }
      if (row.activity === "so") {
        soCount++;
        soLines += row.lines;
        return;
      }

      totalLines += row.lines;
      orderCount++;

      if (row.timeMins !== null) {
        if (lfWindowStart !== null) {
          const duration = row.timeMins - lfWindowStart;
          if (duration > 0 && duration < 480) lfMinutes += duration;
          lfWindowStart = null;
        }
        lastPickTime = row.timeMins;
      }
    });

    if (!orderCount && !lfCount && !rpCount && !soCount) continue;

    const times = removeOutliers_(
      resolvedEntries.map(function (entry) { return entry.minutes; })
    ).sort(function (a, b) { return a - b; });

    const first = times.length ? times[0] : null;
    const last = times.length ? times[times.length - 1] : null;
    const rawMinutes = first !== null && last !== null && last > first
      ? last - first
      : null;
    const effectiveMinutes = rawMinutes !== null
      ? Math.max(rawMinutes - lfMinutes, 1)
      : null;
    const activeHours = effectiveMinutes !== null ? effectiveMinutes / 60 : null;

    const gaps = [];
    for (let index = 1; index < times.length; index++) {
      const difference = times[index] - times[index - 1];
      if (difference < 90) continue;
      if (difference < 120 && lfCount > 0) continue;
      gaps.push({
        fromMins: times[index - 1],
        toMins: times[index],
        gapMins: difference,
        severity: difference >= 180 ? "high" : difference >= 120 ? "medium" : "low"
      });
    }

    records.push({
      date: dateLabel,
      picker: picker.charAt(0).toUpperCase() + picker.slice(1).toLowerCase(),
      orders: orderCount,
      totalLines: totalLines,
      avgLinesPerOrder: orderCount ? totalLines / orderCount : null,
      activeHrs: activeHours,
      linesPerHr: activeHours ? totalLines / activeHours : null,
      ordersPerHr: activeHours ? orderCount / activeHours : null,
      firstTimeMins: first,
      lastTimeMins: last,
      hasGaps: gaps.length > 0,
      gaps: gaps,
      lfOrders: lfCount,
      lfLines: lfLines,
      lfMinutes: lfMinutes,
      lfAvgMinsPerOrder: lfCount && lfMinutes ? lfMinutes / lfCount : null,
      lfPctOfShift: rawMinutes && lfMinutes ? lfMinutes / rawMinutes * 100 : null,
      rpOrders: rpCount,
      rpLines: rpLines,
      soOrders: soCount,
      soLines: soLines,
      orderDetail: []
    });
  }

  return { records: records, sheetErrors: sheetErrors };
}

function removeOutliers_(times) {
  return removeOutliers(times);
}

function mergeDuplicateRecords_(records) {
  const merged = {};

  records.forEach(function (record) {
    const key = record.date + "\u0000" + record.picker.toLowerCase();
    if (!merged[key]) {
      merged[key] = record;
      return;
    }

    const current = merged[key];
    current.orders += record.orders;
    current.totalLines += record.totalLines;
    current.lfOrders += record.lfOrders;
    current.lfLines += record.lfLines;
    current.lfMinutes += record.lfMinutes;
    current.rpOrders += record.rpOrders;
    current.rpLines += record.rpLines;
    current.soOrders += record.soOrders;
    current.soLines += record.soLines;
    current.gaps = current.gaps.concat(record.gaps);
    current.hasGaps = current.gaps.length > 0;

    if (record.firstTimeMins !== null) {
      current.firstTimeMins = current.firstTimeMins === null
        ? record.firstTimeMins
        : Math.min(current.firstTimeMins, record.firstTimeMins);
    }
    if (record.lastTimeMins !== null) {
      current.lastTimeMins = current.lastTimeMins === null
        ? record.lastTimeMins
        : Math.max(current.lastTimeMins, record.lastTimeMins);
    }

    const rawMinutes = (
      current.firstTimeMins !== null &&
      current.lastTimeMins !== null &&
      current.lastTimeMins > current.firstTimeMins
    ) ? current.lastTimeMins - current.firstTimeMins : null;
    const effectiveMinutes = rawMinutes !== null
      ? Math.max(rawMinutes - current.lfMinutes, 1)
      : null;
    current.activeHrs = effectiveMinutes !== null ? effectiveMinutes / 60 : null;
    current.avgLinesPerOrder = current.orders
      ? current.totalLines / current.orders
      : null;
    current.linesPerHr = current.activeHrs
      ? current.totalLines / current.activeHrs
      : null;
    current.ordersPerHr = current.activeHrs
      ? current.orders / current.activeHrs
      : null;
    current.lfAvgMinsPerOrder = current.lfOrders && current.lfMinutes
      ? current.lfMinutes / current.lfOrders
      : null;
    current.lfPctOfShift = rawMinutes && current.lfMinutes
      ? current.lfMinutes / rawMinutes * 100
      : null;
  });

  return Object.keys(merged).map(function (key) { return merged[key]; });
}

function parseSheet(data, dateLabel) {
  return parseSheetWithErrors(data, dateLabel).records;
}

// Optional diagnostic helper retained from the original script.
function debugTyler() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheets().find(function (item) {
    return item.getName() === "4/20/2026";
  });
  if (!sheet) {
    Logger.log("Sheet not found");
    return;
  }

  const data = sheet.getDataRange().getValues();
  const header = data[0];
  for (let col = 0; col < header.length; col++) {
    if (typeof header[col] === "string" &&
        header[col].trim().toUpperCase() === "TYLER") {
      Logger.log("TYLER begins at column " + (col + 1));
      for (let row = 1; row < data.length; row++) {
        const order = data[row][col];
        const lines = data[row][col + 1];
        const time = data[row][col + 2];
        if (order || lines || time) {
          Logger.log(
            "row=" + (row + 1) +
            " order=" + order +
            " lines=" + lines +
            " time=" + time +
            " parsed=" + parseTimeMins(time) +
            " type=" + typeof time
          );
        }
      }
    }
  }
}