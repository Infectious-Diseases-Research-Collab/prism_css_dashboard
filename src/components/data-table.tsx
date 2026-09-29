"use client";

import { downloadCsv } from "@/lib/format";


export type Column<T> = {
  label: string;
  group?: string;
  // Receives a data row, or for subtotal/total rows the numeric fields summed.
  value: (r: T) => number | string | null;
  format?: (v: number | string | null, r: T) => string;
  title?: string;
};

type Site = { mrccode: number; mrc: string; district: string };

// Per-MRC table grouped by district, with district subtotals, a grand total and CSV export.
export function DataTable<T extends Site>({
  rows,
  columns,
  filename,
  sumKeys,
}: {
  rows: T[];
  columns: Column<T>[];
  filename: string;
  sumKeys: (keyof T & string)[];
}) {
  const aggregate = (rs: T[], label: string): T => {
    const out = { mrccode: -1, mrc: label, district: "" } as T;
    for (const k of sumKeys) {
      (out as Record<string, unknown>)[k as string] = rs.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    }
    return out;
  };

  const districts = [...new Set(rows.map((r) => r.district))];
  const multiDistrict = districts.length > 1;
  const body: { row: T; kind: "mrc" | "subtotal" }[] = [];
  for (const d of districts) {
    const rs = rows.filter((r) => r.district === d);
    rs.forEach((row) => body.push({ row, kind: "mrc" }));
    if (multiDistrict && rs.length > 1) body.push({ row: aggregate(rs, `${d} subtotal`), kind: "subtotal" });
  }
  const total = aggregate(rows, "Total");
  const show = (c: Column<T>, r: T) => {
    const v = c.value(r);
    return c.format ? c.format(v, r) : v == null ? "–" : typeof v === "number" ? v.toLocaleString("en-GB") : v;
  };

  // Header groups: consecutive columns sharing a group label get one spanning cell.
  const groups: { label: string; span: number }[] = [];
  for (const c of columns) {
    const g = c.group ?? "";
    if (groups.length && groups[groups.length - 1].label === g) groups[groups.length - 1].span++;
    else groups.push({ label: g, span: 1 });
  }
  const hasGroups = groups.some((g) => g.label);

  const exportCsv = () => {
    const header = ["District", "MRC", ...columns.map((c) => (c.group ? `${c.group}: ${c.label}` : c.label))];
    const data = [...body.map((b) => b.row), total].map((r) => [r.district, r.mrc, ...columns.map((c) => show(c, r))]);
    downloadCsv(filename, header, data);
  };

  const th = "border-b border-line px-2 py-2 text-right align-bottom text-xs font-medium text-ink-2";
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button onClick={exportCsv} className="rounded-md border border-line px-3 py-1.5 text-xs hover:bg-surface-2">
          Download CSV
        </button>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-line">
        <table className="tabular w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2">
            {hasGroups && (
              <tr>
                <th colSpan={2} className="bg-surface-2" />
                {groups.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    className={`border-b border-line px-2 pt-2 text-center text-xs font-medium text-ink-2 ${g.label ? "border-l" : ""}`}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              <th className={`${th} sticky left-0 bg-surface-2 text-left`}>District</th>
              <th className={`${th} bg-surface-2 text-left`}>MRC</th>
              {columns.map((c, i) => (
                <th key={i} className={`${th} min-w-20`} title={c.title}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map(({ row, kind }, i) => (
              <tr
                key={`${row.district}-${row.mrccode}-${i}`}
                className={kind === "subtotal" ? "bg-surface-2/60 font-medium" : "hover:bg-surface-2/50"}
              >
                <td className="sticky left-0 border-b border-line bg-inherit px-2 py-1.5 text-ink-2">
                  {kind === "mrc" ? row.district : ""}
                </td>
                <td className="border-b border-line px-2 py-1.5 whitespace-nowrap">{row.mrc}</td>
                {columns.map((c, j) => (
                  <td key={j} className="border-b border-line px-2 py-1.5 text-right">
                    {show(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-surface-2 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={2}>
                Total ({rows.length} MRC{rows.length === 1 ? "" : "s"})
              </td>
              {columns.map((c, j) => (
                <td key={j} className="px-2 py-2 text-right">
                  {show(c, total)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
