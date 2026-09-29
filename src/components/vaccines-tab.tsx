"use client";

import { fmtInt, pct, sum } from "@/lib/format";
import type { VaccinePoint, VaccineRow } from "@/lib/types";
import { BarList, TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, ChartGrid, Kpi, KpiRow } from "./ui";

const of = (key: keyof VaccineRow, den: keyof VaccineRow = "children_u3"): Column<VaccineRow>["format"] =>
  (_v, r) => `${fmtInt(r[key] as number)} (${pct(r[key] as number, r[den] as number)})`;

const COLUMNS: Column<VaccineRow>[] = [
  { label: "Children < 3", value: (r) => r.children_u3 },
  { label: "Has vaccine card", value: (r) => r.with_card, format: of("with_card") },
  { group: "R21 malaria vaccine", label: "Any dose", value: (r) => r.r21_any, format: of("r21_any") },
  { group: "R21 malaria vaccine", label: "≥2 doses", value: (r) => r.r21_2, format: of("r21_2") },
  { group: "R21 malaria vaccine", label: "≥3 doses", value: (r) => r.r21_3, format: of("r21_3") },
  { group: "R21 malaria vaccine", label: "4 doses", value: (r) => r.r21_4, format: of("r21_4") },
  {
    group: "R21 malaria vaccine",
    label: "Card-verified",
    value: (r) => r.r21_card_verified,
    format: (_v, r) => pct(r.r21_card_verified, r.r21_any),
    title: "Share of vaccinated children whose dose count was verified on the card",
  },
  { group: "Hib", label: "Any dose", value: (r) => r.hib_any, format: of("hib_any") },
  { group: "Hib", label: "3 doses", value: (r) => r.hib_3, format: of("hib_3") },
];

const SUM_KEYS: (keyof VaccineRow & string)[] = [
  "children_u3", "with_card", "r21_any", "r21_1", "r21_2", "r21_3", "r21_4", "r21_card_verified", "hib_any", "hib_3",
];

export function VaccinesTab({
  rows,
  series,
  grain,
}: {
  rows: VaccineRow[];
  series: VaccinePoint[];
  grain: "week" | "month";
}) {
  const kids = sum(rows, "children_u3");
  const trend = series.map((p) => ({
    period: p.period,
    r21_pct: p.children_u3 ? (p.r21_any / p.children_u3) * 100 : null,
    hib_pct: p.children_u3 ? (p.hib_any / p.children_u3) * 100 : null,
  }));
  const counts = new Map(series.map((p) => [p.period, p]));

  const d = [sum(rows, "r21_1"), sum(rows, "r21_2"), sum(rows, "r21_3"), sum(rows, "r21_4")];
  const doses = [
    { label: "No doses", value: kids - d[0] },
    { label: "1 dose", value: d[0] - d[1] },
    { label: "2 doses", value: d[1] - d[2] },
    { label: "3 doses", value: d[2] - d[3] },
    { label: "4 doses", value: d[3] },
  ].map((x) => ({ ...x, display: `${fmtInt(x.value)} (${pct(x.value, kids)})` }));

  const byMrc = rows
    .filter((r) => r.children_u3)
    .map((r) => ({
      label: r.mrc,
      value: r.r21_any / r.children_u3,
      display: pct(r.r21_any, r.children_u3),
      note: `${fmtInt(r.r21_any)} of ${fmtInt(r.children_u3)} children`,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Children under 3" value={fmtInt(kids)} />
        <Kpi label="Any R21 dose" value={pct(sum(rows, "r21_any"), kids)} detail={`${fmtInt(sum(rows, "r21_any"))} children`} />
        <Kpi label="≥3 R21 doses" value={pct(d[2], kids)} />
        <Kpi label="R21 card-verified" value={pct(sum(rows, "r21_card_verified"), sum(rows, "r21_any"))} detail="of vaccinated" />
        <Kpi label="Any Hib dose" value={pct(sum(rows, "hib_any"), kids)} />
        <Kpi label="Has vaccine card" value={pct(sum(rows, "with_card"), kids)} />
      </KpiRow>
      <ChartGrid>
        <Card title={`Vaccine coverage per ${grain}`} subtitle="Children under 3 with at least one dose">
          <TimeChart
            data={trend}
            grain={grain}
            kind="line"
            percent
            series={[
              { key: "r21_pct", label: "R21", color: "var(--series-1)" },
              { key: "hib_pct", label: "Hib", color: "var(--series-2)" },
            ]}
            tooltipExtra={(period) => {
              const p = counts.get(period);
              return p ? `${fmtInt(p.children_u3)} children under 3` : null;
            }}
          />
        </Card>
        <Card title="R21 doses received" subtitle={`${fmtInt(kids)} children under 3`}>
          <BarList items={kids ? doses : []} />
        </Card>
      </ChartGrid>
      <Card title="Any R21 dose by MRC">
        <div className="columns-1 gap-8 lg:columns-2">
          <BarList items={byMrc} max={1} />
        </div>
      </Card>
      <Card title="Vaccine coverage by MRC (children under 3)">
        <DataTable rows={rows} columns={COLUMNS} filename="css-vaccine-coverage.csv" sumKeys={SUM_KEYS} />
      </Card>
    </div>
  );
}
