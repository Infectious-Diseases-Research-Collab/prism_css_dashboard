import { fmtDateTime } from "@/lib/format";

export function Header({ email, lastSync }: { email: string; lastSync: string | null }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">PRISM CSS Surveillance Dashboard</h1>
          <p className="text-xs text-ink-2">Latest data: {fmtDateTime(lastSync)} (Kampala time)</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-2">{email}</span>
          <form action="/auth/signout" method="post">
            <button className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
