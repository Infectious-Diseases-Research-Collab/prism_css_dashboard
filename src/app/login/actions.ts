"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { step: "email" | "code"; email?: string; message?: string; error?: string };

const SENT_MESSAGE =
  "If this email is registered for the dashboard, a sign-in email is on its way. Click the link, or enter the code from the email below.";

export async function sendSignInEmail(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { step: "email", error: "Enter a valid email address." };
  }

  // Only people on the allow-list get an email; others see the same message so
  // the form doesn't reveal who is registered.
  const { data: allowed, error: lookupError } = await createAdminClient()
    .from("allowed_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) return { step: "email", error: "Sign-in is unavailable right now. Try again later." };
  if (!allowed) return { step: "code", email, message: SENT_MESSAGE };

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    const rateLimited = error.status === 429;
    return {
      step: "email",
      email,
      error: rateLimited
        ? "Too many sign-in emails were sent recently. Wait a minute and try again."
        : "Could not send the sign-in email. Try again later.",
    };
  }
  return { step: "code", email, message: SENT_MESSAGE };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) {
    return { step: "code", email, error: "Enter the numeric code from the email." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code is invalid or has expired." };
  redirect("/");
}
