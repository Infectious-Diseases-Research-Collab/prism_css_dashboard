"use client";

import { downloadCsv, fmtInt, pct, sum } from "@/lib/format";
import type { TrackerDay, TrackerPoint, TrackerRow } from "@/lib/types";
import { TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, Empty, Kpi, KpiRow } from "./ui";

const COLUMNS: Column<TrackerRow>[] = [
  { label: "Days reported", value: (r) => r.days_reported, title: "Distinct report dates" },
  { label: "Reports", value: (r) => r.reports, title: "Daily tracker forms submitted" },
  { label: "HHs approached", value: (r) => r.approached },
  { label: "HHs enrolled", value: (r) => r.enrolled },
  {
    label: "% enrolled",
    value: (r) => (r.approached ? r.enrolled / r.approached : null),
    format: (_v, r) => pct(r.enrolled, r.approached),
    title: "Enrolled as % of approached",
  },
  { label: "Last report", value: (r) => r.last_report ?? null, format: (v) => (v ? String(v) : "–") },
];

// Not days_reported: summed across MRCs it would count MRC-days, not days.
const SUM_KEYS: (keyof TrackerRow & string)[] = ["reports", "approached", "enrolled"];

export function TrackerTab({
  rows,
  days,
  series,
  grain,
}: {
  rows: TrackerRow[];
  days: TrackerDay[];
  series: TrackerPoint[];
  grain: "week" | "month";
}) {
  const approached = sum(rows, "approached");
  const enrolled = sum(rows, "enrolled");
  const reporting = rows.filter((r) => r.reports > 0).length;
  const latest = days[0]?.report_date ?? null;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Households approached" value={fmtInt(approached)} detail="As reported by interviewers" />
        <Kpi label="Households enrolled" value={fmtInt(enrolled)} detail={`${pct(enrolled, approached)} of approached`} />
        <Kpi label="Reports" value={fmtInt(sum(rows, "reports"))} detail={`${fmtInt(days.length)} MRC-days`} />
        <Kpi label="MRCs reporting" value={`${reporting} of ${rows.length}`} detail={latest ? `Latest report ${latest}` : "No reports yet"} />
      </KpiRow>

      <Card
        title="Daily reports"
        subtitle="Interviewers' own daily counts, one row per report date and MRC (Reports > 1 means several interviewers reported for that MRC that day). Use the MRC and date filters above to narrow it down, e.g. From and To on the same day."
      >
        <DailyTable days={days} />
      </Card>

      <Card title="Totals by MRC" subtitle="Over the selected period. MRCs with no reports show zeros.">
        <DataTable rows={rows} columns={COLUMNS} filename="css-daily-tracker-by-mrc.csv" sumKeys={SUM_KEYS} />
      </Card>

      <Card title={`Households approached and enrolled per ${grain}`} subtitle="From the daily tracker reports">
        <TimeChart
          data={series}
          grain={grain}
          kind="bar"
          series={[
            { key: "approached", label: "Approached", color: "var(--series-1)" },
            { key: "enrolled", label: "Enrolled", color: "var(--series-2)" },
          ]}
        />
      </Card>
    </div>
  );
}

function DailyTable({ days }: { days: TrackerDay[] }) {
  if (!days.length) return <Empty>No daily tracker reports for the current filters.</Empty>;

  const exportCsv = () =>
    downloadCsv(
      "css-daily-tracker.csv",
      ["Report date", "District", "MRC", "Reports", "HHs approached", "HHs enrolled"],
      days.map((d) => [d.report_date, d.district, d.mrc, d.reports, d.approached, d.enrolled]),
    );

  const th = "border-b border-line px-2 py-2 text-xs font-medium text-ink-2";
  const td = "border-b border-line px-2 py-1.5";
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
            <tr>
              <th className={`${th} text-left`}>Report date</th>
              <th className={`${th} text-left`}>District</th>
              <th className={`${th} text-left`}>MRC</th>
              <th className={`${th} text-right`}>Reports</th>
              <th className={`${th} text-right`}>HHs approached</th>
              <th className={`${th} text-right`}>HHs enrolled</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={`${d.report_date}-${d.mrccode}`} className="hover:bg-surface-2/50">
                <td className={`${td} whitespace-nowrap`}>{d.report_date}</td>
                <td className={`${td} text-ink-2`}>{d.district}</td>
                <td className={`${td} whitespace-nowrap`}>{d.mrc}</td>
                <td className={`${td} text-right`}>{fmtInt(d.reports)}</td>
                <td className={`${td} text-right`}>{fmtInt(d.approached)}</td>
                <td className={`${td} text-right`}>{fmtInt(d.enrolled)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-surface-2 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={3}>
                Total ({fmtInt(days.length)} MRC-days)
              </td>
              <td className="px-2 py-2 text-right">{fmtInt(sum(days, "reports"))}</td>
              <td className="px-2 py-2 text-right">{fmtInt(sum(days, "approached"))}</td>
              <td className="px-2 py-2 text-right">{fmtInt(sum(days, "enrolled"))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
