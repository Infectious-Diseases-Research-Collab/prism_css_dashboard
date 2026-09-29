export const fmtInt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-GB"));

export function pct(num: number, den: number, digits = 0): string {
  if (!den) return "–";
  return `${((num / den) * 100).toFixed(digits)}%`;
}

export const ratio = (num: number, den: number) => (den ? num / den : null);

export function fmtPeriod(iso: string, grain: "week" | "month"): string {
  const d = new Date(`${iso}T00:00:00`);
  return grain === "month"
    ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

export function sum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
