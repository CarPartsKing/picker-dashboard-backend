const API_BASE = "/api";

export interface ApiDayStat {
  id: number;
  pickerName: string;
  dateStr: string;
  totalLines: number;
  totalOrders: number;
  linesPerHour: number | null;
  ordersPerHour: number | null;
  avgLinesPerOrder: number | null;
  activeWindowMinutes: number | null;
  gapFlags: Array<{
    pickerName: string;
    dateStr: string;
    fromMinutes: number;
    toMinutes: number;
    gapMinutes: number;
    severity: "Low" | "Med" | "High";
  }>;
  performanceRating: string | null;
  createdAt: string;
}

export interface ApiUploadRecord {
  id: number;
  fileName: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  rowsInserted: number;
  rowsSkipped: number;
  uploadedAt: string;
}

export interface UploadPayload {
  fileName: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  stats: Array<{
    pickerName: string;
    dateStr: string;
    totalLines: number;
    totalOrders: number;
    linesPerHour: number | null;
    ordersPerHour: number | null;
    avgLinesPerOrder: number;
    activeWindowMinutes: number | null;
    gapFlags: unknown[];
    performanceRating?: string;
  }>;
}

export interface UploadResult {
  rowsInserted: number;
  rowsSkipped: number;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, init);
  return res;
}

export async function fetchStats(from?: string, to?: string): Promise<ApiDayStat[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(`/dashboard/stats${query}`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function uploadStats(payload: UploadPayload, password: string): Promise<UploadResult> {
  const res = await apiFetch("/dashboard/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-upload-password": password,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error("WRONG_PASSWORD");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchUploads(): Promise<ApiUploadRecord[]> {
  const res = await apiFetch("/dashboard/uploads");
  if (!res.ok) throw new Error(`Failed to fetch uploads: ${res.status}`);
  return res.json();
}
