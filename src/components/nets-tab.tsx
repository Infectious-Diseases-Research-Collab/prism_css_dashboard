"use client";

import { fmtInt, pct, sum } from "@/lib/format";
import { NET_BRANDS } from "@/lib/labels";
import type { NetBrand, NetPoint, NetRow } from "@/lib/types";
import { BarList, TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, ChartGrid, Kpi, KpiRow } from "./ui";

const COLUMNS: Column<NetRow>[] = [
  { label: "Enrolled HH", value: (r) => r.hh_enrolled },
  { group: "Households", label: "≥1 net", value: (r) => r.hh_with_net, format: (_v, r) => pct(r.hh_with_net, r.hh_enrolled) },
  {
    group: "Households",
    label: "Received UCC nets",
    value: (r) => r.hh_received_ucc,
    format: (_v, r) => pct(r.hh_received_ucc, r.hh_enrolled),
  },
  {
    group: "Households",
    label: "1 net per 2 people",
    value: (r) => r.hh_universal_coverage,
    format: (_v, r) => pct(r.hh_universal_coverage, r.hh_enrolled),
    title: "Households with at least one net for every two residents",
  },
  {
    group: "Households",
    label: "Nets per HH",
    value: (r) => (r.hh_enrolled ? r.nets_reported / r.hh_enrolled : null),
    format: (v) => (v == null ? "–" : (v as number).toFixed(1)),
  },
  { group: "Residents", label: "Recorded", value: (r) => r.residents },
  {
    group: "Residents",
    label: "Slept under net",
    value: (r) => r.slept_under_net,
    format: (_v, r) => pct(r.slept_under_net, r.residents),
    title: "Residents listed as sleeping under a net last night",
  },
  { group: "Nets", label: "Recorded", value: (r) => r.nets_recorded },
  { group: "Nets", label: "From 2026 UCC", value: (r) => r.nets_ucc, format: (_v, r) => pct(r.nets_ucc, r.nets_recorded) },
  { group: "Nets", label: "Used last night", value: (r) => r.nets_used, format: (_v, r) => pct(r.nets_used, r.nets_recorded) },
  {
    group: "Nets",
    label: "Hanging (observed)",
    value: (r) => r.nets_hanging,
    format: (_v, r) => pct(r.nets_hanging, r.nets_observed),
  },
];

const SUM_KEYS: (keyof NetRow & string)[] = [
  "hh_enrolled", "hh_with_net", "hh_received_ucc", "hh_universal_coverage", "nets_reported",
  "residents", "slept_under_net", "nets_recorded", "nets_observed", "nets_hanging", "nets_ucc", "nets_used",
];

export function NetsTab({
  rows,
  series,
  brands,
  grain,
}: {
  rows: NetRow[];
  series: NetPoint[];
  brands: NetBrand[];
  grain: "week" | "month";
}) {
  const hh = sum(rows, "hh_enrolled");
  const residents = sum(rows, "residents");
  const nets = sum(rows, "nets_recorded");

  const trend = series.map((p) => ({
    period: p.period,
    hh_net_pct: p.hh_enrolled ? (p.hh_with_net / p.hh_enrolled) * 100 : null,
    slept_pct: p.residents ? (p.slept_under_net / p.residents) * 100 : null,
  }));

  // Top brands; the long tail folds into "Other".
  const sorted = [...brands].sort((a, b) => b.nets - a.nets);
  const top = sorted.slice(0, 7);
  const rest = sorted.slice(7).reduce((s, b) => s + b.nets, 0);
  const brandItems = [
    ...top.map((b) => ({
      label: b.brandnet == null ? "Not recorded" : (NET_BRANDS[b.brandnet] ?? `Code ${b.brandnet}`),
      value: b.nets,
    })),
    ...(rest ? [{ label: "Other brands", value: rest }] : []),
  ].map((x) => ({ ...x, display: `${fmtInt(x.value)} (${pct(x.value, nets)})` }));

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="HH with ≥1 net" value={pct(sum(rows, "hh_with_net"), hh)} detail={`of ${fmtInt(hh)} enrolled HH`} />
        <Kpi label="HH received UCC nets" value={pct(sum(rows, "hh_received_ucc"), hh)} />
        <Kpi label="HH with 1 net per 2 people" value={pct(sum(rows, "hh_universal_coverage"), hh)} />
        <Kpi label="Slept under a net" value={pct(sum(rows, "slept_under_net"), residents)} detail={`of ${fmtInt(residents)} residents`} />
        <Kpi label="Nets recorded" value={fmtInt(nets)} detail={`${pct(sum(rows, "nets_ucc"), nets)} from 2026 UCC`} />
        <Kpi label="Observed nets hanging" value={pct(sum(rows, "nets_hanging"), sum(rows, "nets_observed"))} />
      </KpiRow>
      <ChartGrid>
        <Card title={`Net coverage per ${grain}`}>
          <TimeChart
            data={trend}
            grain={grain}
            kind="line"
            percent
            series={[
              { key: "hh_net_pct", label: "HH with ≥1 net", color: "var(--series-1)" },
              { key: "slept_pct", label: "Residents slept under net", color: "var(--series-2)" },
            ]}
          />
        </Card>
        <Card title="Net brands" subtitle={`${fmtInt(nets)} nets recorded`}>
          <BarList items={brandItems} />
        </Card>
      </ChartGrid>
      <Card title="Bed net indicators by MRC">
        <DataTable rows={rows} columns={COLUMNS} filename="css-net-indicators.csv" sumKeys={SUM_KEYS} />
      </Card>
    </div>
  );
}
