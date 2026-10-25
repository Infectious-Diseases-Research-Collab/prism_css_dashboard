import type { Metadata } from "next";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { confirmSignIn } from "./actions";
import { ContinueButton } from "./continue-button";
import { CONFIRM_TYPES } from "./types";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Target of the sign-in email link. Deliberately does nothing on load: email
// security scanners (e.g. Proofpoint) open links automatically, and verifying
// here would use up the one-time token before the person sees the email.
export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (typeof tokenHash !== "string" || !tokenHash || !CONFIRM_TYPES.includes(type as EmailOtpType)) {
    redirect("/login?error=link");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-semibold">PRISM CSS Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">Click below to finish signing in.</p>
        <form action={confirmSignIn} className="mt-5">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <ContinueButton />
        </form>
      </div>
    </main>
  );
}
