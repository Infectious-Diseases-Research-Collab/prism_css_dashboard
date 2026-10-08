import { fmtDateTime } from "@/lib/format";

// lastSync: when the dashboard last synced from DataKollecta (it is up to date
// as of then). newestRecord: when DataKollecta received the newest record --
// whether the field team is still uploading. A sync that finds nothing new
// moves the first and not the second.
export function Header({
  email,
  lastSync,
  newestRecord,
}: {
  email: string;
  lastSync: string | null;
  newestRecord: string | null;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">PRISM CSS Surveillance Dashboard</h1>
          <p className="flex flex-wrap gap-x-3 text-xs text-ink-2">
            <span>Synced from DataKollecta: {fmtDateTime(lastSync)}</span>
            <span>Newest record received: {newestRecord ? fmtDateTime(newestRecord) : "none yet"}</span>
            <span>(Kampala time)</span>
          </p>
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
