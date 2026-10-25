"use client";

import { useFormStatus } from "react-dom";

// Disabled while the sign-in runs so a second click can't submit the already
// used token and land on the "invalid link" page.
export function ContinueButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "Signing in…" : "Continue to dashboard"}
    </button>
  );
}
