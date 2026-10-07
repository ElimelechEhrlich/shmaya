// Supabase Edge Function: contreal-sync — שלב 0 (חיבור + בדיקת תשובות אמיתיות)
//
// מטרה בשלב הזה: להתחבר פעם אחת לשרת ה-MCP של קונטריל (OAuth 2.0 + PKCE, לקוח ציבורי)
// ולהחזיר את התשובות הגולמיות שלו, כדי לבנות את הסנכרון עצמו (שלבים 1–4) על נתונים
// אמיתיים ולא על הנחות. אין כאן עדיין סנכרון ואין כתיבה לטבלאות המשימות.
//
// נתיבים (GET, נפתחים ישירות בדפדפן):
//   /contreal-sync/start?key=...  — מתחיל התחברות. מסרב אם כבר מחובר (status = connected).
//   /contreal-sync/callback   — לכאן קונטריל מחזיר אחרי ההתחברות. מפנה חזרה לדשבורד.
//   /contreal-sync/status     — מצב החיבור, בלי טוקנים.
//   /contreal-sync/discover?key=...            — initialize + סיכום הכלים + קריאות קריאה-בלבד לדוגמה.
//   /contreal-sync/discover?key=...&refresh=1  — גם בודק רענון טוקן (האם ה-refresh token מתחלף).
//   /contreal-sync/discover?key=...&raw=1      — עוקף את ה-SDK ומשתמש ב-JSON-RPC ישיר.
//   /contreal-sync/disconnect?key=...&confirm=1 — מנתק את החשבון הנוכחי (מבטל טוקנים בקונטריל
//                                                 ומאפס את החיבור), כדי לחבר חשבון אחר דרך /start.
//
// start, discover ו-disconnect חסומים ב-secret ‏CONTREAL_ADMIN_KEY: start כדי שאף אחד אחר
// לא יחבר חשבון קונטריל משלו, discover כי הוא מחזיר תוכן אמיתי של משימות, ו-disconnect
// כי הוא מנתק. אם ה-secret לא מוגדר, שלושתם כבויים.
//
// פריסה: supabase functions deploy contreal-sync --no-verify-jwt
//   (--no-verify-jwt הכרחי: ההפניה של קונטריל ל-/callback היא GET בלי כותרת Authorization.)
//
// Secrets: SITE_URL (קיים), CONTREAL_ADMIN_KEY (חדש, לשלב 0).
// SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY מסופקים אוטומטית ע"י Supabase.
//
// טבלה: contreal_auth (מיגרציה 0026) — RLS בלי policies, נגישה רק עם service role.

import { createClient } from "npm:@supabase/supabase-js@2";

const CONTREAL_BASE = "https://api.contreal.io";
const MCP_URL = `${CONTREAL_BASE}/mcp`;
const SCOPE = "contreal";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL");
const ADMIN_KEY = Deno.env.get("CONTREAL_ADMIN_KEY");

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/contreal-sync/callback`;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop();

  try {
    switch (route) {
      case "start":
        return requireAdminKey(url) ?? await handleStart();
      case "callback":
        return await handleCallback(url);
      case "status":
        return await handleStatus();
      case "discover":
        return requireAdminKey(url) ?? await handleDiscover(url);
      case "disconnect":
        return requireAdminKey(url) ?? await handleDisconnect(url);
      default:
        return json({ error: `Unknown route: ${route}` }, 404);
    }
  } catch (err) {
    console.error("[contreal-sync] unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────────────

async function handleStart(): Promise<Response> {
  const auth = await readAuth();
  // נעילה: אחרי שהחיבור הצליח, אי אפשר להתחיל חיבור חדש (למשל לחשבון קונטריל אחר)
  // דרך הנתיב הזה. החלפת חשבון: קודם /disconnect, ואז /start מחדש.
  if (auth.status === "connected") {
    return html("כבר מחובר לקונטריל", "החיבור לקונטריל כבר פעיל. כדי לחבר חשבון אחר, נתק קודם דרך /disconnect.", 409);
  }

  const meta = await fetchAuthServerMetadata();

  let clientId: string | null = auth.client_id;
  if (!clientId) {
    const regRes = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Shmaya",
        redirect_uris: [REDIRECT_URI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SCOPE,
      }),
    });
    const regBody = await regRes.text();
    if (!regRes.ok) {
      console.error("[contreal-sync] client registration failed:", regRes.status, regBody);
      return html("רישום מול קונטריל נכשל", `קונטריל החזיר ${regRes.status}: ${regBody}`, 502);
    }
    clientId = JSON.parse(regBody).client_id;
    if (!clientId) return html("רישום מול קונטריל נכשל", `לא הוחזר client_id: ${regBody}`, 502);
  }

  const verifier = randomUrlSafe(64);
  const challenge = await sha256UrlSafe(verifier);
  const state = randomUrlSafe(32);

  await updateAuth({ client_id: clientId, pkce_verifier: verifier, oauth_state: state, status: "pending" });

  const authorize = new URL(meta.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_URL,
  }).toString();

  return Response.redirect(authorize.toString(), 302);
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return backToSite(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return html("חסרים פרטים", "קונטריל לא החזיר code או state.", 400);

  const auth = await readAuth();
  if (auth.status === "connected") return backToSite("already_connected=1");
  if (!auth.oauth_state || state !== auth.oauth_state || !auth.pkce_verifier || !auth.client_id) {
    return html("אימות נכשל", "ה-state לא תואם. התחל את ההתחברות מחדש.", 400);
  }

  const meta = await fetchAuthServerMetadata();
  const tokenRes = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: auth.client_id,
      code_verifier: auth.pkce_verifier,
      resource: MCP_URL,
    }),
  });
  const tokenBody = await tokenRes.text();
  if (!tokenRes.ok) {
    console.error("[contreal-sync] token exchange failed:", tokenRes.status, tokenBody);
    return html("החלפת הקוד בטוקן נכשלה", `קונטריל החזיר ${tokenRes.status}: ${tokenBody}`, 502);
  }

  const tokens = JSON.parse(tokenBody);
  await updateAuth({
    status: "connected",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    pkce_verifier: null,
    oauth_state: null,
  });

  return backToSite(`contreal=connected&refresh_token=${tokens.refresh_token ? "yes" : "no"}`);
}

async function handleStatus(): Promise<Response> {
  const auth = await readAuth();
  return json({
    status: auth.status,
    lastSyncedAt: auth.last_synced_at,
    hasRefreshToken: !!auth.refresh_token,
    expiresAt: auth.expires_at,
  });
}

async function handleDiscover(url: URL): Promise<Response> {
  const report: Record<string, unknown> = { redirectUri: REDIRECT_URI };

  if (url.searchParams.get("refresh") === "1") {
    report.refreshTest = await testRefresh();
  }

  const token = await getAccessToken();
  if (!token) return json({ ...report, error: "לא מחובר לקונטריל" }, 409);

  const auth = await readAuth();
  report.auth = { status: auth.status, hasRefreshToken: !!auth.refresh_token, expiresAt: auth.expires_at };

  const forceRaw = url.searchParams.get("raw") === "1";
  if (!forceRaw) {
    report.sdk = await discoverWithSdk(token);
  }
  if (forceRaw || !(report.sdk as { ok?: boolean })?.ok) {
    report.raw = await discoverWithRawRpc(token);
  }

  return json(report);
}

/**
 * ניתוק החשבון הנוכחי, כדי לחבר חשבון קונטריל אחר (למשל מעבר מחשבון בדיקה לחשבון המנהל).
 * מבטל את הטוקנים בקונטריל (best-effort) ומאפס את החיבור. client_id נשמר — הוא רישום של
 * שמעיה כאפליקציה, לא של משתמש. דורש confirm=1 כדי שפתיחה בטעות של הקישור לא תנתק.
 * הערה לשלבים 1–4: ניתוק יצטרך גם לנקות את משימות הקונטריל שסונכרנו מהחשבון הקודם.
 */
async function handleDisconnect(url: URL): Promise<Response> {
  if (url.searchParams.get("confirm") !== "1") {
    return html("לאשר ניתוק?", "הניתוק יבטל את החיבור הנוכחי לקונטריל. כדי לאשר, הוסף לכתובת ‎&confirm=1", 400);
  }
  const auth = await readAuth();
  const revoked: Record<string, string> = {};
  try {
    const meta = await fetchAuthServerMetadata();
    if (meta.revocation_endpoint && auth.client_id) {
      for (const [hint, token] of [["refresh_token", auth.refresh_token], ["access_token", auth.access_token]] as const) {
        if (!token) continue;
        const res = await fetch(meta.revocation_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token, token_type_hint: hint, client_id: auth.client_id }),
        });
        revoked[hint] = res.ok ? "revoked" : `HTTP ${res.status}`;
      }
    }
  } catch (err) {
    // ביטול בקונטריל הוא best-effort: גם אם נכשל, מנתקים אצלנו
    console.error("[contreal-sync] revoke failed:", err);
    revoked.error = String(err);
  }
  await updateAuth({
    status: "none",
    access_token: null,
    refresh_token: null,
    expires_at: null,
    pkce_verifier: null,
    oauth_state: null,
    status_id_done: null,
    status_id_todo: null,
    last_synced_at: null,
    sync_lock_until: null,
  });
  return json({ disconnected: true, previousStatus: auth.status, revoked });
}

// ──────────────────────────────────────────────────────────────────
// MCP — two clients, so stage 0 tells us which one works in Edge Runtime
// ──────────────────────────────────────────────────────────────────

// קריאות הבדיקה, לפי ה-schema האמיתי שהחזיר tools/list (סבב ראשון של discover):
// search_tasks מקבל state/limit/offset (לא completionState/fields/taskIds), והשרת דוחה
// פרמטרים לא מוכרים (additionalProperties: false).
const DISCOVERY_CALLS: { label: string; tool: string; args: Record<string, unknown> }[] = [
  { label: "get_me", tool: "get_me", args: {} },
  { label: "statuses_and_priorities", tool: "list_statuses_and_priorities", args: {} },
  { label: "team_members", tool: "list_team_members", args: { limit: 20 } },
  { label: "open_tasks", tool: "search_tasks", args: { state: "open", limit: 5 } },
  { label: "completed_tasks", tool: "search_tasks", args: { state: "completed", limit: 2 } },
];

// כלים שה-schema המלא שלהם נחוץ לשלבים 1–4 (כתיבה וקריאה של משימה בודדת).
const FULL_SCHEMA_TOOLS = /^(get_task|update_task|update_tasks|create_task|complete_task)$/;

/** content[0].text של תשובת MCP — מפוענח כ-JSON אם אפשר. */
function parseToolResult(result: any) {
  const text = result?.content?.find((c: any) => c.type === "text")?.text;
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* נשאר טקסט */ }
  return { isError: !!result?.isError, data, otherContentTypes: (result?.content ?? []).filter((c: any) => c.type !== "text").map((c: any) => c.type) };
}

/** מחפש את מזהה המשימה הראשונה בתשובת search_tasks, בלי להניח את המבנה המדויק. */
function firstTaskId(data: any): number | null {
  const list = Array.isArray(data) ? data : (data?.tasks ?? data?.items ?? data?.results ?? data?.data);
  const id = Array.isArray(list) ? list[0]?.id : null;
  return typeof id === "number" ? id : null;
}

async function discoverWithSdk(token: string) {
  const out: Record<string, unknown> = { ok: false };
  try {
    const { Client } = await import("npm:@modelcontextprotocol/sdk@1/client/index.js");
    const { StreamableHTTPClientTransport } = await import("npm:@modelcontextprotocol/sdk@1/client/streamableHttp.js");

    const client = new Client({ name: "shmaya", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    out.serverVersion = client.getServerVersion?.();

    // סיכום קצר של כל הכלים (כדי שהתשובה לא תהיה ארוכה מדי), ו-schema מלא רק לכלים הרלוונטיים
    const { tools } = await client.listTools();
    out.toolsSummary = tools.map((t: any) => ({
      name: t.name,
      readOnly: t.annotations?.readOnlyHint ?? null,
      destructive: t.annotations?.destructiveHint ?? null,
      params: Object.keys(t.inputSchema?.properties ?? {}),
      required: t.inputSchema?.required ?? [],
    }));
    out.fullSchemas = tools
      .filter((t: any) => FULL_SCHEMA_TOOLS.test(t.name))
      .map((t: any) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

    const call = async (tool: string, args: Record<string, unknown>) => {
      try {
        return parseToolResult(await client.callTool({ name: tool, arguments: args }));
      } catch (err) {
        return { error: String(err) };
      }
    };

    const calls: Record<string, unknown> = {};
    for (const c of DISCOVERY_CALLS) calls[c.label] = await call(c.tool, c.args);

    // משימה אחת במלואה (תיאור, תאריכים, assignees...), ואיך נראית תשובה למשימה שלא קיימת
    const openId = firstTaskId((calls.open_tasks as any)?.data);
    if (openId) calls.get_task_first_open = await call("get_task", { task_id: openId });
    calls.get_task_missing = await call("get_task", { task_id: 999999999 });

    out.calls = calls;
    await client.close();
    out.ok = true;
  } catch (err) {
    out.error = String(err);
  }
  return out;
}

async function discoverWithRawRpc(token: string) {
  const out: Record<string, unknown> = { ok: false };
  let sessionId: string | null = null;
  let protocolVersion: string | null = null;
  let nextId = 1;

  const rpc = async (method: string, params?: unknown, isNotification = false) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    if (protocolVersion) headers["MCP-Protocol-Version"] = protocolVersion;
    const id = isNotification ? undefined : nextId++;
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}), ...(id ? { id } : {}) }),
    });
    sessionId = res.headers.get("Mcp-Session-Id") ?? sessionId;
    const contentType = res.headers.get("Content-Type") ?? "";
    const text = await res.text();
    if (isNotification) return { httpStatus: res.status };
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${text}`);
    if (contentType.includes("text/event-stream")) {
      // SSE: מחפשים את הודעת ה-data שה-id שלה תואם לבקשה
      for (const line of text.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const msg = JSON.parse(line.slice(5).trim());
        if (msg.id === id) return { contentType, message: msg };
      }
      throw new Error(`${method}: no matching SSE message. Body: ${text.slice(0, 500)}`);
    }
    return { contentType, message: JSON.parse(text) };
  };

  try {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "shmaya", version: "0.1.0" },
    });
    protocolVersion = init.message?.result?.protocolVersion ?? null;
    out.initialize = init;
    out.initializedNotification = await rpc("notifications/initialized", undefined, true);
    out.tools = await rpc("tools/list", {});
    const samples: Record<string, unknown> = {};
    for (const call of DISCOVERY_CALLS) {
      try {
        samples[call.label] = await rpc("tools/call", { name: call.tool, arguments: call.args });
      } catch (err) {
        samples[call.label] = { error: String(err) };
      }
    }
    out.samples = samples;
    out.sessionId = sessionId ? "(received)" : null;
    out.ok = true;
  } catch (err) {
    out.error = String(err);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// Tokens
// ──────────────────────────────────────────────────────────────────

/** מחזיר access token תקף, ומרענן אם הוא עומד לפוג (פחות מדקה). null אם אין חיבור. */
async function getAccessToken(): Promise<string | null> {
  const auth = await readAuth();
  if (auth.status !== "connected" || !auth.access_token) return null;
  const expiresAt = auth.expires_at ? new Date(auth.expires_at).getTime() : Infinity;
  if (expiresAt - Date.now() > 60_000) return auth.access_token;
  const refreshed = await refreshTokens(auth);
  return refreshed.ok ? refreshed.accessToken : null;
}

/**
 * רענון עם עדכון מותנה: כותבים רק אם ה-refresh token ב-DB עדיין זהה לזה שהשתמשנו בו.
 * אם תהליך אחר רענן במקביל (0 שורות עודכנו), קוראים את הטוקן שהוא שמר.
 */
async function refreshTokens(auth: AuthRow): Promise<{ ok: boolean; accessToken: string | null; rotated?: boolean; details?: string }> {
  if (!auth.refresh_token || !auth.client_id) {
    await updateAuth({ status: "expired" });
    return { ok: false, accessToken: null, details: "אין refresh token" };
  }
  const meta = await fetchAuthServerMetadata();
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: auth.refresh_token,
      client_id: auth.client_id,
      resource: MCP_URL,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("[contreal-sync] refresh failed:", res.status, body);
    // ייתכן שתהליך אחר כבר רענן והחליף את הטוקן — בודקים לפני שמסמנים כפג
    const latest = await readAuth();
    if (latest.refresh_token !== auth.refresh_token && latest.status === "connected") {
      return { ok: true, accessToken: latest.access_token };
    }
    await updateAuth({ status: "expired" });
    return { ok: false, accessToken: null, details: `HTTP ${res.status}: ${body}` };
  }
  const tokens = JSON.parse(body);
  const newRefresh = tokens.refresh_token ?? auth.refresh_token;
  const { data: updated, error } = await db
    .from("contreal_auth")
    .update({
      access_token: tokens.access_token,
      refresh_token: newRefresh,
      expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)
    .eq("refresh_token", auth.refresh_token)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length === 0) {
    const latest = await readAuth();
    return { ok: true, accessToken: latest.access_token, rotated: newRefresh !== auth.refresh_token };
  }
  return { ok: true, accessToken: tokens.access_token, rotated: newRefresh !== auth.refresh_token };
}

async function testRefresh() {
  const auth = await readAuth();
  if (auth.status !== "connected") return { ok: false, details: "לא מחובר" };
  const result = await refreshTokens(auth);
  return { ok: result.ok, refreshTokenRotated: result.rotated ?? null, details: result.details ?? null };
}

// ──────────────────────────────────────────────────────────────────
// DB + helpers
// ──────────────────────────────────────────────────────────────────

interface AuthRow {
  status: string;
  client_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  pkce_verifier: string | null;
  oauth_state: string | null;
  last_synced_at: string | null;
}

async function readAuth(): Promise<AuthRow> {
  const { data, error } = await db.from("contreal_auth").select("*").eq("id", 1).single();
  if (error) throw new Error(`contreal_auth read failed (האם מיגרציה 0026 הורצה?): ${error.message}`);
  return data as AuthRow;
}

async function updateAuth(fields: Record<string, unknown>): Promise<void> {
  const { error } = await db
    .from("contreal_auth")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

let metadataCache: Record<string, string> | null = null;
async function fetchAuthServerMetadata(): Promise<Record<string, string>> {
  if (metadataCache) return metadataCache;
  const res = await fetch(`${CONTREAL_BASE}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new Error(`Contreal OAuth metadata: HTTP ${res.status}`);
  metadataCache = await res.json();
  return metadataCache!;
}

/** מחזיר תגובת 403 אם המפתח חסר או שגוי, אחרת null. */
function requireAdminKey(url: URL): Response | null {
  if (!ADMIN_KEY) return json({ error: "כבוי: לא הוגדר CONTREAL_ADMIN_KEY" }, 403);
  const given = url.searchParams.get("key") ?? "";
  if (!timingSafeEqual(given, ADMIN_KEY)) return json({ error: "מפתח שגוי" }, 403);
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

function randomUrlSafe(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

async function sha256UrlSafe(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function backToSite(query: string): Response {
  const target = SITE_URL ? `${SITE_URL}/admin/dashboard?${query}` : null;
  if (!target) return html("החיבור הסתיים", `SITE_URL לא מוגדר. תוצאה: ${query}`, 200);
  return Response.redirect(target, 302);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function html(title: string, message: string, status: number): Response {
  const page = `<!doctype html><html dir="rtl" lang="he"><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:0 16px">
<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></body></html>`;
  return new Response(page, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
