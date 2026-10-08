// Dashboard filters live in the URL (?district=Kole,Apac&mrc=37&from=...&to=...&grain=week&tab=surveys)
// so every view is shareable and bookmarkable.

export const TABS = ["surveys", "tracker", "malaria", "nets", "vaccines"] as const;
export type Tab = (typeof TABS)[number];
export type Grain = "week" | "month";

export type Filters = {
  districts: string[];
  mrcs: number[];
  from: string | null;
  to: string | null;
  grain: Grain;
  tab: Tab;
};

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) =>
  one(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseFilters(sp: SearchParams): Filters {
  const tab = one(sp.tab) as Tab;
  return {
    districts: list(sp.district),
    mrcs: list(sp.mrc)
      .map(Number)
      .filter((n) => Number.isInteger(n)),
    from: isoDate(one(sp.from)),
    to: isoDate(one(sp.to)),
    grain: one(sp.grain) === "month" ? "month" : "week",
    tab: TABS.includes(tab) ? tab : "surveys",
  };
}

export function toSearchParams(f: Partial<Filters>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.tab && f.tab !== "surveys") p.set("tab", f.tab);
  if (f.districts?.length) p.set("district", f.districts.join(","));
  if (f.mrcs?.length) p.set("mrc", f.mrcs.join(","));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.grain && f.grain !== "week") p.set("grain", f.grain);
  return p;
}

// Arguments shared by all dashboard RPCs (empty filter = everything the user may see).
export function rpcArgs(f: Filters) {
  return {
    p_mrcs: f.mrcs.length ? f.mrcs : null,
    p_districts: f.districts.length ? f.districts : null,
    p_from: f.from,
    p_to: f.to,
  };
}
