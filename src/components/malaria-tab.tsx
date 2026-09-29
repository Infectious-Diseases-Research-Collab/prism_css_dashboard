"use client";

import { fmtInt, pct, sum } from "@/lib/format";
import type { MalariaPoint, MalariaRow } from "@/lib/types";
import { BarList, TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, ChartGrid, Kpi, KpiRow } from "./ui";

// Hb mean can't be summed, so carry the Hb total and divide on subtotal rows.
type Row = MalariaRow & { u5_hb_sum: number };

const COLUMNS: Column<Row>[] = [
  { label: "Members", value: (r) => r.members },
  { group: "Fever", label: "Febrile", value: (r) => r.febrile, title: "Fever in last 48h or temperature ≥ 38°C" },
  { group: "Fever", label: "% febrile", value: (r) => r.febrile, format: (_v, r) => pct(r.febrile, r.members, 1) },
  { group: "RDT", label: "Tested", value: (r) => r.rdt_done },
  { group: "RDT", label: "Positive", value: (r) => r.rdt_pos },
  { group: "RDT", label: "% positive", value: (r) => r.rdt_pos, format: (_v, r) => pct(r.rdt_pos, r.rdt_done, 1) },
  { group: "RDT", label: "Pf only", value: (r) => r.rdt_pf },
  { group: "RDT", label: "Pan only", value: (r) => r.rdt_pan },
  { group: "RDT", label: "Pf + Pan", value: (r) => r.rdt_mixed },
  {
    label: "AL given to RDT+",
    value: (r) => r.rdt_pos_al,
    format: (_v, r) => pct(r.rdt_pos_al, r.rdt_pos),
    title: "Share of RDT-positive members prescribed AL",
  },
  { group: "Children under 5", label: "Hb tested", value: (r) => r.u5_hb_tested },
  {
    group: "Children under 5",
    label: "Mean Hb (g/dL)",
    value: (r) => (r.u5_hb_tested ? r.u5_hb_sum / r.u5_hb_tested : null),
    format: (v) => (v == null ? "–" : (v as number).toFixed(1)),
  },
  {
    group: "Children under 5",
    label: "% Hb < 11",
    value: (r) => r.u5_anaemic,
    format: (_v, r) => pct(r.u5_anaemic, r.u5_hb_tested),
  },
  {
    group: "Treated for malaria (6 mo)",
    label: "% of members",
    value: (r) => r.treated_6m,
    format: (_v, r) => pct(r.treated_6m, r.members),
  },
  {
    group: "Treated for malaria (6 mo)",
    label: "% diagnosed at MRC",
    value: (r) => r.treated_at_mrc,
    format: (_v, r) => pct(r.treated_at_mrc, r.treated_6m),
  },
];

const SUM_KEYS: (keyof Row & string)[] = [
  "members", "febrile", "rdt_done", "rdt_pos", "rdt_pf", "rdt_pan", "rdt_mixed", "febrile_al",
  "rdt_pos_al", "u5_hb_tested", "u5_hb_sum", "u5_anaemic", "treated_6m", "treated_at_mrc",
];

export function MalariaTab({
  rows: raw,
  series,
  grain,
}: {
  rows: MalariaRow[];
  series: MalariaPoint[];
  grain: "week" | "month";
}) {
  const rows: Row[] = raw.map((r) => ({ ...r, u5_hb_sum: (r.u5_hb_mean ?? 0) * r.u5_hb_tested }));
  const tested = sum(rows, "rdt_done");
  const pos = sum(rows, "rdt_pos");
  const hbN = sum(rows, "u5_hb_tested");

  const trend = series.map((p) => ({
    period: p.period,
    rdt_pos_pct: p.rdt_done ? (p.rdt_pos / p.rdt_done) * 100 : null,
    febrile_pct: p.members ? (p.febrile / p.members) * 100 : null,
  }));
  const countsByPeriod = new Map(series.map((p) => [p.period, p]));

  const byMrc = rows
    .filter((r) => r.rdt_done)
    .map((r) => ({
      label: r.mrc,
      value: r.rdt_pos / r.rdt_done,
      display: pct(r.rdt_pos, r.rdt_done),
      note: `${fmtInt(r.rdt_pos)} of ${fmtInt(r.rdt_done)} tested`,
    }))
    .sort((a, b) => b.value - a.value);

  const results = [
    { label: "Pf only", value: sum(rows, "rdt_pf") },
    { label: "Pf + Pan", value: sum(rows, "rdt_mixed") },
    { label: "Pan only", value: sum(rows, "rdt_pan") },
    { label: "Negative", value: tested - pos },
  ].map((x) => ({ ...x, display: `${fmtInt(x.value)} (${pct(x.value, tested)})` }));

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Members surveyed" value={fmtInt(sum(rows, "members"))} />
        <Kpi label="RDTs done" value={fmtInt(tested)} />
        <Kpi label="RDT positivity" value={pct(pos, tested, 1)} detail={`${fmtInt(pos)} positive`} />
        <Kpi label="Febrile" value={pct(sum(rows, "febrile"), sum(rows, "members"), 1)} detail={`${fmtInt(sum(rows, "febrile"))} members`} />
        <Kpi
          label="Mean Hb, under 5s"
          value={hbN ? `${(sum(rows, "u5_hb_sum") / hbN).toFixed(1)} g/dL` : "–"}
          detail={`${pct(sum(rows, "u5_anaemic"), hbN)} below 11 g/dL`}
        />
        <Kpi label="AL given to RDT+" value={pct(sum(rows, "rdt_pos_al"), pos)} />
      </KpiRow>

      <ChartGrid>
        <Card title={`RDT positivity and fever per ${grain}`} subtitle="% of RDTs positive; % of members febrile">
          <TimeChart
            data={trend}
            grain={grain}
            kind="line"
            percent
            series={[
              { key: "rdt_pos_pct", label: "RDT positive", color: "var(--series-1)" },
              { key: "febrile_pct", label: "Febrile", color: "var(--series-2)" },
            ]}
            tooltipExtra={(period) => {
              const p = countsByPeriod.get(period);
              return p ? `${fmtInt(p.rdt_done)} tested, ${fmtInt(p.members)} members` : null;
            }}
          />
        </Card>
        <Card title="RDT results" subtitle={`${fmtInt(tested)} RDTs`}>
          <BarList items={tested ? results : []} />
        </Card>
      </ChartGrid>
      <Card title="RDT positivity by MRC">
        <div className="columns-1 gap-8 lg:columns-2">
          <BarList items={byMrc} max={1} />
        </div>
      </Card>
      <Card title="Malaria indicators by MRC">
        <DataTable rows={rows} columns={COLUMNS} filename="css-malaria-indicators.csv" sumKeys={SUM_KEYS} />
      </Card>
    </div>
  );
}
