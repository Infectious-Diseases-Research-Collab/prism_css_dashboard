"use client";

import { useActionState } from "react";
import { sendSignInEmail, verifyCode, type LoginState } from "./actions";

const input =
  "mt-1 w-full rounded-md border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const button =
  "w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60";

export function LoginForm() {
  const [sent, sendAction, sending] = useActionState<LoginState, FormData>(sendSignInEmail, { step: "email" });
  const [verified, verifyAction, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  if (sent.step === "code") {
    return (
      <div className="mt-5 space-y-4">
        <p className="text-sm text-ink-2">{sent.message}</p>
        <form action={verifyAction} className="space-y-3">
          <input type="hidden" name="email" value={sent.email} />
          <label className="block text-sm font-medium">
            Code from the email
            <input name="code" inputMode="numeric" autoComplete="one-time-code" className={`${input} tabular tracking-widest`} required />
          </label>
          {verified.error && <p className="text-sm text-critical">{verified.error}</p>}
          <button className={button} disabled={verifying}>
            {verifying ? "Checking…" : "Sign in"}
          </button>
        </form>
        <form action={sendAction}>
          <input type="hidden" name="email" value={sent.email} />
          <button className="text-sm text-accent hover:underline" disabled={sending}>
            {sending ? "Sending…" : `Resend email to ${sent.email}`}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={sendAction} className="mt-5 space-y-3">
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={sent.email} className={input} required />
      </label>
      {sent.error && <p className="text-sm text-critical">{sent.error}</p>}
      <button className={button} disabled={sending}>
        {sending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
