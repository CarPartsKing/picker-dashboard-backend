// ─── WEB WORKER: XLSX PARSING ─────────────────────────────────────────────────
// Runs off the main thread so large Excel files don't freeze the UI.

import * as XLSX from 'xlsx';
import { parseSheet, PickerDayRaw } from './parseUtils';

interface WorkerInput {
  buffer: ArrayBuffer;
  fileName: string;
  fileIndex: number;
  fileCount: number;
}

interface WorkerOutput {
  entries: Record<string, PickerDayRaw>;
  fileName: string;
  fileIndex: number;
  fileCount: number;
  sheetCount: number;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { buffer, fileName, fileIndex, fileCount } = e.data;
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const entries: Record<string, PickerDayRaw> = {};
    for (const sheetName of wb.SheetNames) {
      const parsed = parseSheet(wb.Sheets[sheetName], sheetName);
      Object.assign(entries, parsed);
    }
    const out: WorkerOutput = { entries, fileName, fileIndex, fileCount, sheetCount: wb.SheetNames.length };
    self.postMessage(out);
  } catch (err) {
    const out: WorkerOutput = {
      entries: {}, fileName, fileIndex, fileCount, sheetCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(out);
  }
};
