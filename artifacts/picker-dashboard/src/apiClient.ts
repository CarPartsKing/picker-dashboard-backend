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

async function parseJson<T>(res: Response, label: string): Promise<T> {
  try {
    return await res.json() as T;
  } catch {
    throw new Error(`${label}: response was not valid JSON (status ${res.status})`);
  }
}

export async function fetchStats(from?: string, to?: string): Promise<ApiDayStat[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(`/dashboard/stats${query}`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return parseJson<ApiDayStat[]>(res, 'fetchStats');
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
  return parseJson<UploadResult>(res, 'uploadStats');
}

export async function fetchUploads(): Promise<ApiUploadRecord[]> {
  const res = await apiFetch("/dashboard/uploads");
  if (!res.ok) throw new Error(`Failed to fetch uploads: ${res.status}`);
  return res.json();
}

export interface LivePickerRecord {
  id: number;
  date: string;
  picker: string;
  orders: number;
  total_lines: number;
  avg_lines_per_order: number;
  active_hrs: number | null;
  lines_per_hr: number | null;
  orders_per_hr: number | null;
  first_time_mins: number | null;
  last_time_mins: number | null;
  has_gaps: boolean;
  gaps: Array<{ fromMins: number; toMins: number; gapMins: number; severity?: string }>;
  order_detail: unknown[];
  exported_at: string;
  lf_orders: number | null;
  lf_lines: number | null;
  lf_minutes: number | null;
  lf_avg_mins_per_order: number | null;
  lf_pct_of_shift: number | null;
  is_lf_specialist: boolean;
}

export interface LivePickerResponse {
  exportedAt: string;
  recordCount: number;
  data: LivePickerRecord[];
}

export async function fetchLivePickerData(): Promise<LivePickerResponse> {
  const res = await apiFetch("/dashboard/live-data");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Live data fetch failed: ${res.status}`);
  }
  return parseJson<LivePickerResponse>(res, 'fetchLivePickerData');
}

export async function clearAllStats(password: string): Promise<void> {
  const res = await apiFetch("/dashboard/stats", {
    method: "DELETE",
    headers: { "x-upload-password": password },
  });
  if (res.status === 401) throw new Error("WRONG_PASSWORD");
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Clear failed: ${res.status}`);
  }
}
