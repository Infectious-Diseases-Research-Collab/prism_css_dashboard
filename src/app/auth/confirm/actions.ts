"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CONFIRM_TYPES } from "./types";

// Uses up the sign-in token. Runs only when the person presses the button on
// /auth/confirm, so mail scanners that merely open the link can't burn it.
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  if (!tokenHash || !CONFIRM_TYPES.includes(type)) redirect("/login?error=link");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) redirect("/login?error=link");
  redirect("/");
}
