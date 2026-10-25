import type { EmailOtpType } from "@supabase/supabase-js";

// Token types the sign-in email templates may put in the link.
export const CONFIRM_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];
