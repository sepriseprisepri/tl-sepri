import { withSupabase } from "npm:@supabase/server@1";

const ALLOWED_ORIGINS = new Set([
  "https://samsung-kalteng.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function headers(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://samsung-kalteng.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

function reply(request: Request, result: unknown, status = 200) {
  return new Response(JSON.stringify(result), { status, headers: headers(request) });
}

function secureTemporaryPassword() {
  // Cryptographically random, 28 characters. Never persist or log the plaintext.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(28);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

const authorized = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return reply(request, { error: "Method not allowed" }, 405);
  const userId = ctx.userClaims?.id;
  if (!userId) return reply(request, { error: "Authentication required" }, 401);
  const admin = ctx.supabaseAdmin;
  const { data: caller, error: callerError } = await admin.from("profiles")
    .select("id,role,employee_id,is_active,must_change_password")
    .eq("id", userId).maybeSingle();
  if (callerError || !caller ||
      (!caller.is_active &&
        !(caller.role === "tl" && caller.employee_id === "TL_BMU_KAL_02" && caller.must_change_password))) {
    return reply(request, { error: "Unauthorized user" }, 403);
  }

  let body: { action?: string; new_password?: string };
  try {
    body = await request.json();
  } catch {
    return reply(request, { error: "Invalid JSON body" }, 400);
  }

  if (body.action === "rotate_password") {
    if (caller.role !== "tl" || caller.employee_id !== "TL_BMU_KAL_02" || !caller.must_change_password) {
      return reply(request, { error: "Password rotation is not required for this account" }, 403);
    }
    // Recovery-managed TL BMU must rotate through the approved recovery Edge
    // Function, which enforces the 24-hour expiration and one-time delivery.
    const {data:recentRecovery,error:recoveryError}=await admin
      .from("password_recovery_requests").select("id,status")
      .eq("user_id",userId).order("created_at",{ascending:false}).limit(1);
    if(recoveryError)return reply(request,{error:"Layanan pemulihan sedang tidak tersedia"},503);
    if((recentRecovery||[]).some(item=>item.status!=="completed"))
      return reply(request,{error:"Gunakan penggantian password melalui pemulihan yang disetujui Admin"},403);
    const password = body.new_password;
    if (typeof password !== "string" || password.length < 14 || password.length > 128 ||
        !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return reply(request, { error: "Gunakan minimal 14 karakter, dengan huruf dan angka" }, 400);
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) return reply(request, { error: "Gagal mengganti password" }, 500);
    const { error: profileError } = await admin.from("profiles").update({
      must_change_password: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq("id", userId).eq("employee_id", "TL_BMU_KAL_02");
    if (profileError) return reply(request, { error: "Password diperbarui; status akun memerlukan bantuan admin" }, 500);
    return reply(request, { ok: true, message: "Password baru disimpan" });
  }

  if (body.action !== "activate") return reply(request, { error: "Unknown action" }, 400);
  if (caller.role !== "admin" || caller.must_change_password) return reply(request, { error: "Active admin access required" }, 403);

  const { data: manpower, error: manpowerError } = await admin.from("manpower")
    .select("id,employee_id,promoter_id,is_active")
    .eq("employee_id", "TL_BMU_KAL_02").maybeSingle();
  if (manpowerError || !manpower?.is_active || manpower.promoter_id !== "AC-2406310901") {
    return reply(request, { error: "TL_BMU_KAL_02 manpower mapping is not verified" }, 409);
  }

  const { data: oldProfile, error: oldError } = await admin.from("profiles")
    .select("id,employee_id,role,is_active")
    .eq("employee_id", "063109").maybeSingle();
  if (oldError || !oldProfile || oldProfile.role !== "tl" || oldProfile.is_active) {
    return reply(request, { error: "Legacy TL profile must be inactive" }, 409);
  }

  const { data: oldCoverage, error: oldCoverageError } = await admin.from("coverage_assignments")
    .select("id").eq("profile_id", oldProfile.id).eq("coverage_role", "tl").is("valid_to", null);
  if (oldCoverageError) return reply(request, { error: "Failed to verify previous coverage" }, 500);

  const email = "tl_bmu_kal_02@login.tlsepri.internal";
  const { data: existingProfile, error: profileLookupError } = await admin.from("profiles")
    .select("id,employee_id,role,manpower_id,is_active,must_change_password")
    .eq("employee_id", "TL_BMU_KAL_02").maybeSingle();
  if (profileLookupError) return reply(request, { error: "Cannot inspect target TL profile" }, 500);

  const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return reply(request, { error: "Could not check Auth users" }, 500);
  let authUser = (users.users ?? []).find((user) => user.email?.toLowerCase() === email);
  if (authUser && (!existingProfile || existingProfile.id !== authUser.id ||
      existingProfile.role !== "tl" || existingProfile.manpower_id !== manpower.id)) {
    return reply(request, { error: "Auth identity conflict; manual review required" }, 409);
  }

  if (authUser) {
    const { data: assigned, error: assignedError } = await admin.from("coverage_assignments")
      .select("id").eq("profile_id", authUser.id).eq("coverage_role", "tl").is("valid_to", null);
    if (assignedError || ((assigned?.length ?? 0) + (oldCoverage?.length ?? 0) !== 32)) {
      return reply(request, { error: "Coverage changed: manual review required" }, 409);
    }
  } else if (oldCoverage?.length !== 32 || existingProfile) {
    return reply(request, { error: "Coverage changed: manual review required" }, 409);
  }

  let password: string | undefined;
  let created = false;
  if (!authUser) {
    password = secureTemporaryPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "tl", employee_id: "TL_BMU_KAL_02" },
      user_metadata: { full_name: "TL_BMU_KAL_02" },
    });
    if (error || !data.user) return reply(request, { error: "Gagal membuat akun Auth" }, 500);
    authUser = data.user;
    created = true;
  }

  const fullyActivated = Boolean(existingProfile?.is_active && !existingProfile?.must_change_password);
  if (!fullyActivated) {
    // Fail-closed: an account has no RLS-authorized data access until password rotation completes.
    const { error: upsertError } = await admin.from("profiles").upsert({
      id: authUser.id,
      email,
      employee_id: "TL_BMU_KAL_02",
      full_name: "TL_BMU_KAL_02",
      role: "tl",
      manpower_id: manpower.id,
      is_active: false,
      must_change_password: true,
    }, { onConflict: "id" });
    if (upsertError) {
      if (created) await admin.auth.admin.updateUserById(authUser.id, { ban_duration: "876000h" });
      return reply(request, { error: "Auth dibuat tetapi profil tidak dapat ditautkan; hubungi administrator" }, 500);
    }
  }

  if ((oldCoverage?.length ?? 0) > 0) {
    const ids = oldCoverage!.map((assignment) => assignment.id);
    const { error: transferError } = await admin.from("coverage_assignments")
      .update({ profile_id: authUser.id }).in("id", ids)
      .eq("profile_id", oldProfile.id).eq("coverage_role", "tl");
    if (transferError) return reply(request, { error: "Account created, but coverage transfer failed; retry activation" }, 500);
  }

  const { count, error: finalError } = await admin.from("coverage_assignments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", authUser.id).eq("coverage_role", "tl").is("valid_to", null);
  if (finalError || count !== 32) {
    return reply(request, { error: "Coverage verification failed; contact admin", actual: count }, 500);
  }
  return reply(request, {
    ok: true,
    created,
    employee_id: "TL_BMU_KAL_02",
    promoter_id: "AC-2406310901",
    coverage_stores: count,
    username: "TL_BMU_KAL_02",
    temporary_password: created ? password : undefined,
    requires_password_change: !fullyActivated,
    message: created ? "Akun baru berhasil dibuat. Simpan password sementara sekarang." :
      "Akun sudah ada dan coverage telah diverifikasi. Password lama tidak ditampilkan.",
  });
});

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: headers(request) });
  }
  return authorized(request);
});
