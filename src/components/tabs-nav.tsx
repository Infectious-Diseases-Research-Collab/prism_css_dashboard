"use client";

import Link, { useLinkStatus } from "next/link";
import { TABS, toSearchParams, type Filters } from "@/lib/filters";

const LABELS: Record<(typeof TABS)[number], string> = {
  surveys: "Survey progress",
  malaria: "Malaria",
  nets: "Bed nets",
  vaccines: "Vaccines",
};

export function TabsNav({ filters }: { filters: Filters }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Dashboard sections">
      {TABS.map((tab) => {
        const active = filters.tab === tab;
        const qs = toSearchParams({ ...filters, tab }).toString();
        return (
          <Link
            key={tab}
            href={qs ? `/?${qs}` : "/"}
            prefetch={!active}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-accent text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {LABELS[tab]}
            <PendingIndicator />
          </Link>
        );
      })}
    </nav>
  );
}

function PendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden="true"
      className={`tab-pending-indicator${pending ? " is-pending" : ""}`}
    />
  );
}
