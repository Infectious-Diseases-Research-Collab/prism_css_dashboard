import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFilters, rpcArgs } from "@/lib/filters";
import type { Mrc } from "@/lib/types";
import { Header } from "@/components/header";
import { FilterBar } from "@/components/filter-bar";
import { TabsNav } from "@/components/tabs-nav";
import { SurveysTab } from "@/components/surveys-tab";
import { MalariaTab } from "@/components/malaria-tab";
import { NetsTab } from "@/components/nets-tab";
import { VaccinesTab } from "@/components/vaccines-tab";
import { DashboardAccessTracker } from "@/components/dashboard-access-tracker";

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const filters = parseFilters(await searchParams);
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const email = auth?.claims?.email as string | undefined;
  if (!email) redirect("/login");

  const [{ data: access }, { data: mrcs, error: mrcError }, { data: lastSync }] = await Promise.all([
    supabase.from("allowed_users").select("mrcs").maybeSingle(),
    supabase.from("mrc").select("mrccode, mrcname, district, target_hh").order("district").order("mrcname"),
    supabase.rpc("last_sync"),
  ]);
  if (mrcError) throw new Error(mrcError.message);

  if (!access || !mrcs?.length) {
    return (
      <>
        <Header email={email} lastSync={null} />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h2 className="text-lg font-semibold">No sites assigned</h2>
          <p className="mt-2 text-ink-2">
            Your account ({email}) doesn&apos;t have access to any MRCs yet. Ask a dashboard administrator to add you
            to the allowed users list.
          </p>
        </main>
      </>
    );
  }

  const args = rpcArgs(filters);
  const ts = { ...args, p_grain: filters.grain };
  const sites = mrcs as Mrc[];
  const selectedSites = sites.filter(
    (m) =>
      (!filters.mrcs.length || filters.mrcs.includes(m.mrccode)) &&
      (!filters.districts.length || filters.districts.includes(m.district)),
  );

  async function rpc<T>(fn: string, params: object): Promise<T[]> {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return (data ?? []) as T[];
  }

  let content: React.ReactNode;
  switch (filters.tab) {
    case "malaria": {
      const [rows, series] = await Promise.all([rpc("malaria_summary", args), rpc("malaria_timeseries", ts)]);
      content = <MalariaTab rows={rows as never} series={series as never} grain={filters.grain} />;
      break;
    }
    case "nets": {
      const [rows, series, brands] = await Promise.all([
        rpc("net_summary", args),
        rpc("net_timeseries", ts),
        rpc("net_brands", args),
      ]);
      content = <NetsTab rows={rows as never} series={series as never} brands={brands as never} grain={filters.grain} />;
      break;
    }
    case "vaccines": {
      const [rows, series] = await Promise.all([rpc("vaccine_summary", args), rpc("vaccine_timeseries", ts)]);
      content = <VaccinesTab rows={rows as never} series={series as never} grain={filters.grain} />;
      break;
    }
    default: {
      const [rows, series] = await Promise.all([rpc("survey_summary", args), rpc("survey_timeseries", ts)]);
      content = <SurveysTab rows={rows as never} series={series as never} grain={filters.grain} />;
    }
  }

  return (
    <>
      <Header email={email} lastSync={lastSync as string | null} />
      <DashboardAccessTracker />
      <div className="z-20 border-b border-line bg-page/95 backdrop-blur md:sticky md:top-0">
        <div className="mx-auto max-w-screen-2xl px-4">
          <FilterBar sites={sites} filters={filters} />
          <TabsNav filters={filters} />
        </div>
      </div>
      <main className="mx-auto max-w-screen-2xl space-y-6 px-4 py-6">
        <p className="text-sm text-ink-2">
          Showing {selectedSites.length === sites.length ? `all ${sites.length}` : selectedSites.length} of your{" "}
          {sites.length} MRC{sites.length === 1 ? "" : "s"}
          {filters.from || filters.to ? `, surveys ${filters.from ?? "…"} to ${filters.to ?? "…"}` : ""}.
        </p>
        {content}
      </main>
    </>
  );
}
