import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) return new Response(null, { status: 401 });

    const [access, sites] = await Promise.all([
      supabase.from("allowed_users").select("email").maybeSingle(),
      supabase.from("mrc").select("mrccode").limit(1),
    ]);
    if (access.error || sites.error) {
      console.error("Dashboard access tracking: authorization lookup failed");
      return new Response(null, { status: 503 });
    }
    if (!access.data || !sites.data?.length) return new Response(null, { status: 403 });

    const { error } = await createAdminClient().rpc("record_dashboard_access", {
      p_user_id: user.id,
      p_email: user.email.toLowerCase(),
    });
    if (error) {
      console.error("Dashboard access tracking: database write failed", { code: error.code });
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 204 });
  } catch {
    console.error("Dashboard access tracking: unexpected failure");
    return new Response(null, { status: 503 });
  }
}
