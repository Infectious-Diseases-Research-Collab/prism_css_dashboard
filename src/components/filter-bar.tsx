"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toSearchParams, type Filters } from "@/lib/filters";
import type { Mrc } from "@/lib/types";

const control =
  "h-9 rounded-md border border-line bg-surface px-3 text-sm outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40";

export function FilterBar({ sites, filters }: { sites: Mrc[]; filters: Filters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (next: Partial<Filters>) => {
    const merged = { ...filters, ...next };
    // Drop MRCs that are outside the chosen districts.
    if (merged.districts.length) {
      merged.mrcs = merged.mrcs.filter((code) =>
        merged.districts.includes(sites.find((s) => s.mrccode === code)?.district ?? ""),
      );
    }
    const qs = toSearchParams(merged).toString();
    startTransition(() => router.replace(qs ? `/?${qs}` : "/", { scroll: false }));
  };

  const districts = [...new Set(sites.map((s) => s.district))].sort();
  const mrcOptions = sites
    .filter((s) => !filters.districts.length || filters.districts.includes(s.district))
    .sort((a, b) => a.mrcname.localeCompare(b.mrcname));

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const hasFilters = filters.districts.length || filters.mrcs.length || filters.from || filters.to;

  return (
    <div className="flex flex-wrap items-end gap-3 py-3" aria-busy={pending}>
      {districts.length > 1 && (
        <MultiSelect
          label="District"
          allLabel="All districts"
          options={districts.map((d) => ({ value: d, label: d }))}
          selected={filters.districts}
          onChange={(v) => apply({ districts: v })}
        />
      )}
      {sites.length > 1 && (
        <MultiSelect
          label="MRC"
          allLabel={filters.districts.length ? "All MRCs in district" : "All MRCs"}
          options={mrcOptions.map((s) => ({ value: String(s.mrccode), label: s.mrcname, hint: s.district }))}
          selected={filters.mrcs.map(String)}
          onChange={(v) => apply({ mrcs: v.map(Number) })}
        />
      )}
      <label className="flex flex-col text-xs font-medium text-ink-2">
        From
        <input
          type="date"
          className={`${control} mt-1 text-ink`}
          value={filters.from ?? ""}
          max={filters.to ?? undefined}
          onChange={(e) => apply({ from: e.target.value || null })}
        />
      </label>
      <label className="flex flex-col text-xs font-medium text-ink-2">
        To
        <input
          type="date"
          className={`${control} mt-1 text-ink`}
          value={filters.to ?? ""}
          min={filters.from ?? undefined}
          onChange={(e) => apply({ to: e.target.value || null })}
        />
      </label>
      <div className="flex gap-1">
        {[
          { label: "4 wks", from: daysAgo(28) },
          { label: "3 mo", from: daysAgo(91) },
          { label: "All", from: null },
        ].map((p) => (
          <button
            key={p.label}
            className={`${control} px-2.5 ${filters.from === p.from && !filters.to ? "border-accent" : ""}`}
            onClick={() => apply({ from: p.from, to: null })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col text-xs font-medium text-ink-2">
        Charts by
        <div className="mt-1 inline-flex rounded-md border border-line bg-surface p-0.5" role="group">
          {(["week", "month"] as const).map((g) => (
            <button
              key={g}
              aria-pressed={filters.grain === g}
              className={`h-8 rounded px-3 text-sm ${
                filters.grain === g ? "bg-accent text-accent-ink" : "text-ink hover:bg-surface-2"
              }`}
              onClick={() => apply({ grain: g })}
            >
              {g === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>
      {hasFilters ? (
        <button
          className="h-9 px-2 text-sm text-accent hover:underline"
          onClick={() => apply({ districts: [], mrcs: [], from: null, to: null })}
        >
          Reset filters
        </button>
      ) : null}
      {pending && <span className="h-9 content-center text-sm text-muted">Updating…</span>}
    </div>
  );
}

type Option = { value: string; label: string; hint?: string };

function MultiSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);

  // Apply the selection when the popover closes, so picking several items
  // triggers one reload instead of one per click.
  const close = useCallback(() => {
    setOpen(false);
    const changed = draft.length !== selected.length || draft.some((v) => !selected.includes(v));
    if (changed) onChange(draft);
  }, [draft, selected, onChange]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length <= 2
        ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative flex flex-col text-xs font-medium text-ink-2">
      {label}
      <button
        className={`${control} mt-1 flex min-w-44 items-center justify-between gap-2 text-left text-ink`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : (setDraft(selected), setOpen(true)))}
      >
        <span className="max-w-56 truncate">{summary}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1 text-sm text-ink shadow-lg">
          <div className="flex justify-between px-2 py-1.5 text-xs">
            <button className="text-accent hover:underline" onClick={() => setDraft(options.map((o) => o.value))}>
              Select all
            </button>
            <button className="text-accent hover:underline" onClick={() => setDraft([])}>
              Clear
            </button>
          </div>
          <ul role="listbox" aria-multiselectable className="max-h-72 overflow-y-auto">
            {options.map((o) => {
              const checked = draft.includes(o.value);
              return (
                <li key={o.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={checked}
                      onChange={() =>
                        setDraft(checked ? draft.filter((v) => v !== o.value) : [...draft, o.value])
                      }
                    />
                    <span className="flex-1">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted">{o.hint}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line p-1">
            <button className="w-full rounded-md bg-accent py-1.5 text-sm text-accent-ink" onClick={close}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
