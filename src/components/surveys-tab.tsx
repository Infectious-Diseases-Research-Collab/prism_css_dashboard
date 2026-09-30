"use client";

import { fmtInt, pct, sum } from "@/lib/format";
import { EXCLUSION_REASONS } from "@/lib/labels";
import type { SurveyPoint, SurveyRow } from "@/lib/types";
import { BarList, TimeChart } from "./charts";
import { DataTable, type Column } from "./data-table";
import { Card, ChartGrid, Kpi, KpiRow } from "./ui";

const COLUMNS: Column<SurveyRow>[] = [
  { label: "HH visited", value: (r) => r.enumerated, title: "Household records in the survey data (each visited and closed out)" },
  { label: "HHs approached*", value: (r) => r.approached, title: "Visited households excluding dwellings destroyed/not found and vacant" },
  { label: "HHs enrolled", value: (r) => r.enrolled },
  {
    label: "HH residents",
    value: (r) => r.residents,
    title: "Household members recorded in enrolled households",
  },
  {
    group: "Enrolled HH",
    label: "With children 2–10",
    value: (r) => r.hh_with_child,
    title: "At least one member aged 2–10 (inclusive). Only these households count towards the target.",
  },
  { group: "Enrolled HH", label: "Without children 2–10", value: (r) => r.hh_without_child },
  { group: "Excluded", label: "Total", value: (r) => r.excluded },
  ...[1, 2, 3, 4, 5, 6].map(
    (k): Column<SurveyRow> => ({
      group: "Excluded",
      label: EXCLUSION_REASONS[k],
      value: (r) => r[`excl_${k}` as keyof SurveyRow] as number,
    }),
  ),
  { label: "Target HH", value: (r) => r.target_hh, format: (v) => (v ? fmtInt(v as number) : "–") },
  {
    label: "% of target",
    value: (r) => (r.target_hh ? r.hh_with_child / r.target_hh : null),
    format: (_v, r) => (r.target_hh ? pct(r.hh_with_child, r.target_hh) : "–"),
    title: "Enrolled households with a child aged 2–10, as % of the target",
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
  "excl_5", "excl_6", "hh_with_samples", "hh_pending_clinical",
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
  // Only enrolled households with a member aged 2-10 count towards the target.
  const qualifying = sum(rows, "hh_with_child");
  const target = sum(rows, "target_hh");
  const sitesWithTarget = rows.filter((r) => r.target_hh).length;

  const cumulative = series.reduce<
    { period: string; qualifying: number; enrolled: number; enumerated: number }[]
  >((acc, p) => {
    const prev = acc[acc.length - 1];
    acc.push({
      period: p.period,
      qualifying: (prev?.qualifying ?? 0) + p.hh_with_child,
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
          value: r.hh_with_child / r.target_hh!,
          display: pct(r.hh_with_child, r.target_hh!),
          note: `${fmtInt(r.hh_with_child)} of ${fmtInt(r.target_hh)} HH with a child 2–10`,
        }))
        .sort((a, b) => b.value - a.value)
    : rows
        .map((r) => ({ label: r.mrc, value: r.hh_with_child, display: fmtInt(r.hh_with_child) }))
        .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Households visited" value={fmtInt(sum(rows, "enumerated"))} detail={`${fmtInt(sum(rows, "approached"))} approached (occupied dwellings)`} />
        <Kpi
          label="Enrolled HH with a child 2–10"
          value={fmtInt(qualifying)}
          detail={target ? `${pct(qualifying, target)} of target (${fmtInt(target)})` : "No targets set yet"}
        />
        <Kpi
          label="Households enrolled"
          value={fmtInt(enrolled)}
          detail={`${fmtInt(enrolled - qualifying)} without a child 2–10`}
        />
        <Kpi label="Residents in enrolled HH" value={fmtInt(sum(rows, "residents"))} detail={`${fmtInt(sum(rows, "residents_reported"))} reported`} />
        <Kpi label="Households excluded" value={fmtInt(sum(rows, "excluded"))} detail={`${fmtInt(sum(rows, "excl_6"))} refused / no consent`} />
        <Kpi
          label="Blood smears / filter papers"
          value={`${fmtInt(sum(rows, "samples_bs"))} / ${fmtInt(sum(rows, "samples_fp"))}`}
          detail={`${fmtInt(sum(rows, "hh_with_samples"))} HH with samples`}
        />
      </KpiRow>

      <Card
        title="Survey progress by MRC"
        subtitle="Target: enrolled households with at least one child aged 2–10. *Approached = visited households excluding dwellings destroyed/not found and vacant. HH visited by Entomology is not captured in the survey data."
      >
        <DataTable rows={rows} columns={COLUMNS} filename="css-survey-progress.csv" sumKeys={SUM_KEYS} />
      </Card>

      <ChartGrid>
        <Card
          title="Cumulative households"
          subtitle={
            target
              ? `Dashed line: combined target for ${sitesWithTarget} MRC(s), counted in enrolled households with a child 2–10`
              : undefined
          }
        >
          <TimeChart
            data={cumulative}
            grain={grain}
            kind="line"
            series={[
              { key: "qualifying", label: "Enrolled with child 2–10", color: "var(--series-1)" },
              { key: "enrolled", label: "Enrolled", color: "var(--series-2)" },
              { key: "enumerated", label: "Visited", color: "var(--series-3)" },
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
        title={sitesWithTarget ? "Progress to target by MRC" : "Enrolled households with a child 2–10 by MRC"}
        subtitle={
          sitesWithTarget
            ? "Enrolled households with a child aged 2–10, as % of target"
            : "Set mrc.target_hh in Supabase to show % of target"
        }
      >
        <div className="columns-1 gap-8 lg:columns-2">
          <BarList items={progress} max={sitesWithTarget ? Math.max(1, ...progress.map((p) => p.value)) : undefined} />
        </div>
      </Card>
    </div>
  );
}
