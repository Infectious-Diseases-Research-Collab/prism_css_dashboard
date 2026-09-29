"use client";

import { fmtInt, pct, sum } from "@/lib/format";
import { EXCLUSION_REASONS } from "@/lib/labels";
import type { SurveyPoint, SurveyRow } from "@/lib/types";
import { BarList, TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, ChartGrid, Kpi, KpiRow } from "./ui";

const COLUMNS: Column<SurveyRow>[] = [
  { label: "HH enumerated", value: (r) => r.enumerated },
  { label: "HHs approached*", value: (r) => r.approached, title: "Excludes dwellings destroyed/not found and vacant" },
  { label: "HHs enrolled", value: (r) => r.enrolled },
  {
    label: "HH residents",
    value: (r) => r.residents,
    title: "Household members recorded in enrolled households",
  },
  { group: "Enrolled HH", label: "With children 2–10", value: (r) => r.hh_with_child },
  { group: "Enrolled HH", label: "Without children 2–10", value: (r) => r.hh_without_child },
  { group: "Excluded", label: "Total", value: (r) => r.excluded },
  ...[1, 2, 3, 4, 5, 6].map(
    (k): Column<SurveyRow> => ({
      group: "Excluded",
      label: EXCLUSION_REASONS[k],
      value: (r) => r[`excl_${k}` as keyof SurveyRow] as number,
    }),
  ),
  {
    label: "Not yet closed out",
    value: (r) => r.not_closed_out,
    title: "No adult located with fewer than 3 visits, or enrolment not recorded",
  },
  { label: "Target HH", value: (r) => r.target_hh, format: (v) => (v ? fmtInt(v as number) : "–") },
  {
    label: "% of target",
    value: (r) => (r.target_hh ? r.enrolled / r.target_hh : null),
    format: (_v, r) => (r.target_hh ? pct(r.enrolled, r.target_hh) : "–"),
  },
  { label: "HHs with samples drawn", value: (r) => r.hh_with_samples },
  {
    label: "HH pending clinical surveys",
    value: (r) => r.hh_pending_clinical,
    title: "Enrolled households with fewer member records than reported residents",
  },
  { group: "Samples collected", label: "Blood smear", value: (r) => r.samples_bs },
  { group: "Samples collected", label: "Filter paper", value: (r) => r.samples_fp },
];

const SUM_KEYS: (keyof SurveyRow & string)[] = [
  "target_hh", "enumerated", "approached", "enrolled", "residents", "residents_reported",
  "hh_with_child", "hh_without_child", "excluded", "excl_1", "excl_2", "excl_3", "excl_4",
  "excl_5", "excl_6", "not_closed_out", "hh_with_samples", "hh_pending_clinical",
  "samples_bs", "samples_fp",
];

export function SurveysTab({
  rows,
  series,
  grain,
}: {
  rows: SurveyRow[];
  series: SurveyPoint[];
  grain: "week" | "month";
}) {
  const enrolled = sum(rows, "enrolled");
  const target = sum(rows, "target_hh");
  const sitesWithTarget = rows.filter((r) => r.target_hh).length;

  const cumulative = series.reduce<{ period: string; enrolled: number; enumerated: number }[]>((acc, p) => {
    const prev = acc[acc.length - 1];
    acc.push({
      period: p.period,
      enrolled: (prev?.enrolled ?? 0) + p.enrolled,
      enumerated: (prev?.enumerated ?? 0) + p.enumerated,
    });
    return acc;
  }, []);

  const reasons = [1, 2, 3, 4, 5, 6]
    .map((k) => ({ k, v: sum(rows, `excl_${k}` as keyof SurveyRow) }))
    .map(({ k, v }) => ({ label: EXCLUSION_REASONS[k], value: v, display: fmtInt(v) }))
    .sort((a, b) => b.value - a.value);

  const progress = sitesWithTarget
    ? rows
        .filter((r) => r.target_hh)
        .map((r) => ({
          label: r.mrc,
          value: r.enrolled / r.target_hh!,
          display: pct(r.enrolled, r.target_hh!),
          note: `${fmtInt(r.enrolled)} of ${fmtInt(r.target_hh)} HH`,
        }))
        .sort((a, b) => b.value - a.value)
    : rows
        .map((r) => ({ label: r.mrc, value: r.enrolled, display: fmtInt(r.enrolled) }))
        .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Households enumerated" value={fmtInt(sum(rows, "enumerated"))} detail={`${fmtInt(sum(rows, "approached"))} approached`} />
        <Kpi
          label="Households enrolled"
          value={fmtInt(enrolled)}
          detail={target ? `${pct(enrolled, target)} of target (${fmtInt(target)})` : "No targets set yet"}
        />
        <Kpi label="Residents in enrolled HH" value={fmtInt(sum(rows, "residents"))} detail={`${fmtInt(sum(rows, "residents_reported"))} reported`} />
        <Kpi label="Households excluded" value={fmtInt(sum(rows, "excluded"))} detail={`${fmtInt(sum(rows, "not_closed_out"))} not yet closed out`} />
        <Kpi label="Blood smears" value={fmtInt(sum(rows, "samples_bs"))} detail={`${fmtInt(sum(rows, "hh_with_samples"))} HH with samples`} />
        <Kpi label="Filter papers" value={fmtInt(sum(rows, "samples_fp"))} detail={`${fmtInt(sum(rows, "hh_pending_clinical"))} HH pending clinical`} />
      </KpiRow>

      <Card
        title="Survey progress by MRC"
        subtitle="*Approached excludes dwellings destroyed/not found and vacant households. HH visited by Entomology is not captured in the survey data."
      >
        <DataTable rows={rows} columns={COLUMNS} filename="css-survey-progress.csv" sumKeys={SUM_KEYS} />
      </Card>

      <ChartGrid>
        <Card
          title="Cumulative households"
          subtitle={target ? `Dashed line: combined target for ${sitesWithTarget} MRC(s) with a target set` : undefined}
        >
          <TimeChart
            data={cumulative}
            grain={grain}
            kind="line"
            series={[
              { key: "enrolled", label: "Enrolled", color: "var(--series-1)" },
              { key: "enumerated", label: "Enumerated", color: "var(--series-2)" },
            ]}
            reference={target ? { y: target, label: `Target ${fmtInt(target)}` } : null}
          />
        </Card>
        <Card title={`Households surveyed per ${grain}`}>
          <TimeChart
            data={series}
            grain={grain}
            kind="stacked"
            series={[
              { key: "enrolled", label: "Enrolled", color: "var(--series-1)" },
              { key: "excluded", label: "Excluded", color: "var(--series-2)" },
            ]}
          />
        </Card>
        <Card title={`Samples collected per ${grain}`}>
          <TimeChart
            data={series}
            grain={grain}
            kind="bar"
            series={[
              { key: "samples_bs", label: "Blood smear", color: "var(--series-1)" },
              { key: "samples_fp", label: "Filter paper", color: "var(--series-2)" },
            ]}
          />
        </Card>
        <Card title="Reasons for exclusion" subtitle={`${fmtInt(sum(rows, "excluded"))} excluded households`}>
          <BarList items={reasons} color="var(--series-2)" />
        </Card>
      </ChartGrid>
      <Card
        title={sitesWithTarget ? "Progress to target by MRC" : "Households enrolled by MRC"}
        subtitle={sitesWithTarget ? "Enrolled households as % of target" : "Set mrc.target_hh in Supabase to show % of target"}
      >
        <div className="columns-1 gap-8 lg:columns-2">
          <BarList items={progress} max={sitesWithTarget ? Math.max(1, ...progress.map((p) => p.value)) : undefined} />
        </div>
      </Card>
    </div>
  );
}
