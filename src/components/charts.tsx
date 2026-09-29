"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtPeriod } from "@/lib/format";
import { Empty } from "./ui";

export type Series = { key: string; label: string; color: string };

const AXIS = { fontSize: 11, fill: "var(--muted)" };

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

type TipPayload = { dataKey?: string | number; value?: number | string; color?: string };

function ChartTip({
  active,
  payload,
  label,
  series,
  percent,
  grain,
  extra,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
  series: Series[];
  percent?: boolean;
  grain: "week" | "month";
  extra?: (period: string) => string | null;
}) {
  if (!active || !payload?.length || !label) return null;
  const note = extra?.(label);
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink">
        {grain === "week" ? "Week of " : ""}
        {fmtPeriod(label, grain)}
      </p>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        const v = typeof p.value === "number" ? p.value : null;
        return (
          <p key={s.key} className="flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label}:{" "}
            <span className="tabular font-medium text-ink">
              {v == null ? "–" : percent ? `${v.toFixed(1)}%` : v.toLocaleString("en-GB")}
            </span>
          </p>
        );
      })}
      {note && <p className="mt-1 text-muted">{note}</p>}
    </div>
  );
}

// Time series by week/month. kind: "line" | "bar" (grouped) | "stacked".
export function TimeChart({
  data,
  series,
  kind,
  grain,
  percent,
  reference,
  tooltipExtra,
  height = 260,
}: {
  data: Record<string, number | string | null>[];
  series: Series[];
  kind: "line" | "bar" | "stacked";
  grain: "week" | "month";
  percent?: boolean;
  reference?: { y: number; label: string } | null;
  tooltipExtra?: (period: string) => string | null;
  height?: number;
}) {
  if (!data.length) return <Empty />;
  const common = {
    data,
    margin: { top: 8, right: 12, bottom: 0, left: 0 },
  };
  const xAxis = (
    <XAxis
      dataKey="period"
      tickFormatter={(v: string) => fmtPeriod(v, grain)}
      tick={AXIS}
      tickLine={false}
      axisLine={{ stroke: "var(--axis)" }}
      minTickGap={16}
    />
  );
  const yAxis = (
    <YAxis
      tick={AXIS}
      tickLine={false}
      axisLine={false}
      width={44}
      allowDecimals={false}
      tickCount={5}
      domain={percent ? [0, (max: number) => Math.min(100, Math.max(20, Math.ceil(max / 20) * 20))] : [0, "auto"]}
      tickFormatter={(v: number) => (percent ? `${v}%` : v.toLocaleString("en-GB"))}
    />
  );
  const grid = <CartesianGrid vertical={false} stroke="var(--grid)" />;
  const tip = (
    <Tooltip
      cursor={kind === "line" ? { stroke: "var(--axis)" } : { fill: "var(--surface-2)" }}
      content={<ChartTip series={series} percent={percent} grain={grain} extra={tooltipExtra} />}
    />
  );
  const ref = reference ? (
    <ReferenceLine
      y={reference.y}
      stroke="var(--ink-2)"
      strokeDasharray="4 4"
      ifOverflow="extendDomain"
      label={{ value: reference.label, position: "insideTopLeft", fontSize: 11, fill: "var(--ink-2)" }}
    />
  ) : null;

  return (
    <div>
      <Legend series={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart {...common}>
              {grid}
              {xAxis}
              {yAxis}
              {tip}
              {ref}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={data.length <= 12 ? { r: 3, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                  activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart {...common} barCategoryGap="20%" barGap={2}>
              {grid}
              {xAxis}
              {yAxis}
              {tip}
              {ref}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  fill={s.color}
                  stackId={kind === "stacked" ? "a" : undefined}
                  radius={kind === "stacked" && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
                  stroke="var(--surface)"
                  strokeWidth={kind === "stacked" ? 1 : 0}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Horizontal bars for ranked categories (per MRC, per reason). Direct-labelled.
export function BarList({
  items,
  color = "var(--series-1)",
  max,
  empty,
}: {
  items: { label: string; value: number; display: string; note?: string }[];
  color?: string;
  max?: number;
  empty?: string;
}) {
  if (!items.length) return <Empty>{empty}</Empty>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li
          key={it.label}
          className="group grid break-inside-avoid grid-cols-[minmax(6rem,9rem)_1fr_auto] items-center gap-2 text-xs"
          title={it.note ? `${it.label}: ${it.display} (${it.note})` : `${it.label}: ${it.display}`}
        >
          <span className="truncate text-ink-2">{it.label}</span>
          <span className="h-3.5 rounded-r bg-surface-2">
            <span
              className="block h-full rounded-r-[4px] group-hover:opacity-80"
              style={{ width: `${Math.min(100, (it.value / top) * 100)}%`, background: color }}
            />
          </span>
          <span className="tabular min-w-12 text-right text-ink">{it.display}</span>
        </li>
      ))}
    </ul>
  );
}
