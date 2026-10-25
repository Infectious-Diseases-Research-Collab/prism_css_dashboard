// Creates a sign-in link and 6-digit code for an allow-listed user without
// sending any email, so you can pass them on yourself (e.g. to someone whose
// mail filter blocks the sign-in emails).
//
//   npm run signin-link -- someone@example.org
//
// Uses the Supabase project in .env.local. The link and code are single-use,
// expire after the project's "Email OTP Expiration" setting, and are cancelled
// if the person requests a new sign-in email.
import { createClient } from "@supabase/supabase-js";

const SITE_URL = process.env.SITE_URL ?? "https://prism-css-dashboard.vercel.app";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run signin-link -- <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (see .env.local).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: allowed, error: lookupError } = await supabase
  .from("allowed_users")
  .select("email")
  .eq("email", email)
  .maybeSingle();
if (lookupError) {
  console.error(`Could not check the allow-list: ${lookupError.message}`);
  process.exit(1);
}
if (!allowed) {
  console.error(`${email} is not in allowed_users. Add them first.`);
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
if (error) {
  console.error(`Could not create the link: ${error.message}`);
  process.exit(1);
}

const { hashed_token: tokenHash, email_otp: code } = data.properties;
console.log(`Project: ${url}`);
console.log(`Email:   ${email}`);
console.log(`Link:    ${SITE_URL}/auth/confirm?token_hash=${tokenHash}&type=magiclink`);
console.log(`Code:    ${code}`);
console.log("\nSingle use. Requesting a new sign-in email (or running this again) cancels it.");
