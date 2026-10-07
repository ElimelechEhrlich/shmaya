// Supabase Edge Function: contreal-sync — סנכרון משימות קונטריל ↔ שמעיה
//
// מתחבר פעם אחת לשרת ה-MCP של קונטריל (OAuth 2.0 + PKCE, לקוח ציבורי), מייבא את המשימות
// הפתוחות כתתי-משימות תחת אב משרדי אחד (registry_key = 'CONTREAL'), ומחזיר לקונטריל סימון
// בוצע/לא בוצע שנעשה בשמעיה. דו-כיווני לסטטוס בלבד; כותרת, תאריך יעד, שיוך וכו' — רק מקונטריל.
//
// פעולות מהאתר (POST /contreal-sync, גוף JSON { action, ... } — דרך supabase.functions.invoke):
//   status                       — מצב החיבור, בלי טוקנים.
//   sync                         — סנכרון מלא (ר' runSync).
//   push_status  { subtaskId }   — דוחף לקונטריל את is_completed הנוכחי של תת-המשימה (נקרא מה-DB).
//   task_details { subtaskId }   — כל פרטי המשימה מקונטריל (get_task), לחלונית הפרטים.
//   subtaskId בלבד: מזהה המשימה בקונטריל נלקח מ-contreal_task_link, שהדפדפן לא יכול לכתוב אליה.
//
// נתיבי ניהול (GET, נפתחים ישירות בדפדפן):
//   /contreal-sync/start?key=...  — מתחיל התחברות. מסרב אם כבר מחובר (status = connected).
//   /contreal-sync/callback   — לכאן קונטריל מחזיר אחרי ההתחברות. מפנה חזרה לדשבורד.
//   /contreal-sync/status     — מצב החיבור, בלי טוקנים.
//   /contreal-sync/discover?key=...            — קריאות קריאה-בלבד לדוגמה (מקוצרות).
//   /contreal-sync/discover?key=...&part=tools — במקום זה: סיכום הכלים וה-schema של כלי המשימות.
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
// טבלאות: contreal_auth (0026), contreal_task_link + contreal_user_map (0027).

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
      case "contreal-sync":
        if (req.method === "POST") return await handleAction(req);
        return json({ error: "POST only" }, 405);
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
  // ברירת מחדל: רק תוצאות הקריאות (מקוצרות). part=tools מחזיר במקום זה את רשימת הכלים.
  const part = url.searchParams.get("part") === "tools" ? "tools" : "calls";
  if (!forceRaw) {
    report.sdk = await discoverWithSdk(token, part);
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
 * מנקה גם את משימות הקונטריל שסונכרנו מהחשבון הקודם ואת מיפוי העובדים — אחרת הסנכרון
 * מהחשבון החדש היה רואה אותן כ"נמחקו" (ותנאי הבטיחות היה עוצר אותו).
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
  const cleared = await clearSyncedData();
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
  return json({ disconnected: true, previousStatus: auth.status, revoked, cleared });
}

// ──────────────────────────────────────────────────────────────────
// Actions from the site (POST)
// ──────────────────────────────────────────────────────────────────

const OFFICE_CUSTOMER_ID = "00000000-0000-0000-0000-000000000000";
const CONTREAL_PARENT_KEY = "CONTREAL";
const CONTREAL_PARENT_TITLE = "משימות מקונטריל";
// sub_tasks.updated_by הוא enum של משתמשי שמעיה (users) — שינוי שמקורו בקונטריל נשאר בלי שם משתמש.
const UPDATED_BY = null;
// תנאי בטיחות: סנכרון שמוצא יותר משימות "שנמחקו" מזה — לא מוחק כלום ומחזיר אזהרה.
const MAX_DELETIONS_PER_SYNC = 5;
// פרויקטים שלא מייבאים לשמעיה. "פרויקט לדוגמה" הוא פרויקט ההדגמה שקונטריל יוצר לכל חשבון חדש.
// משימה מפרויקט כזה לא נוצרת, ומשימה שכבר יובאה (או הועברה אליו) מוסרת משמעיה — בקונטריל
// עצמו לא נוגעים. זו החרגה מכוונת, לא מחיקה בקונטריל, ולכן לא נספרת בתנאי הבטיחות.
const EXCLUDED_PROJECT_NAMES = new Set(["פרויקט לדוגמה"]);

function isExcludedTask(t: any): boolean {
  const name = t?.project?.name;
  return typeof name === "string" && EXCLUDED_PROJECT_NAMES.has(name.trim());
}
const SYNC_LOCK_MS = 120_000;

// משתמשי שמעיה — חייב להיות זהה ל-ALLOWED_USERS ב-src/services/authService.ts.
// (ערכי sub_tasks.updated_by מוגבלים לאותם שמות ב-DB.)
const SHMAYA_USERS = ["מוישי", "יוחנן", "שמוליק"];

/**
 * שיוך אוטומטי של עובד קונטריל למשתמש שמעיה: השם בקונטריל זהה לשם בשמעיה, או שהמילה
 * הראשונה שלו זהה ("מוישי שמעיה חשבונאות…" → מוישי). רק כשיש מועמד אחד בדיוק. כתיב שונה
 * ("מושי") לא מותאם — נשאר לשיוך ידני ב-contreal_user_map.
 */
function matchShmayaUser(contrealName: string): string | null {
  const name = contrealName.replace(/\s+/g, " ").trim();
  const first = name.split(" ")[0];
  const candidates = SHMAYA_USERS.filter((u) => u === name || u === first);
  return candidates.length === 1 ? candidates[0] : null;
}

async function handleAction(req: Request): Promise<Response> {
  let body: { action?: string; subtaskId?: string; source?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  switch (body.action) {
    case "status": {
      const auth = await readAuth();
      return json({ ok: true, status: auth.status, lastSyncedAt: auth.last_synced_at });
    }
    case "sync": {
      const result = await runSync();
      // הסנכרון האוטומטי (pg_cron, מיגרציה 0028) רושם ביומן הפעולות רק כשמשהו השתנה.
      // סנכרון ידני נרשם מהדשבורד.
      if (body.source === "cron" && result.ok) await logCronSync(result as any);
      return json(result);
    }
    case "push_status":
      if (!isUuid(body.subtaskId)) return json({ ok: false, error: "bad_subtask_id" }, 400);
      return json(await pushSubtaskStatus(body.subtaskId!));
    case "task_details":
      if (!isUuid(body.subtaskId)) return json({ ok: false, error: "bad_subtask_id" }, 400);
      return json(await taskDetails(body.subtaskId!));
    default:
      return json({ ok: false, error: `unknown_action: ${body.action}` }, 400);
  }
}

// ── MCP session (one connection per request) ──

class ToolError extends Error {}

interface McpSession {
  call: (tool: string, args: Record<string, unknown>) => Promise<any>;
  close: () => Promise<void>;
}

async function openMcp(token: string): Promise<McpSession> {
  const { Client } = await import("npm:@modelcontextprotocol/sdk@1/client/index.js");
  const { StreamableHTTPClientTransport } = await import("npm:@modelcontextprotocol/sdk@1/client/streamableHttp.js");
  const client = new Client({ name: "shmaya", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return {
    call: async (tool, args) => {
      const parsed = parseToolResult(await client.callTool({ name: tool, arguments: args }));
      if (parsed.isError) throw new ToolError(String(parsed.data));
      return parsed.data;
    },
    close: () => client.close(),
  };
}

/** קונטריל עונה "המשימה לא נמצאה." למשימה שנמחקה (אומת ב-discover). */
function isNotFound(err: unknown): boolean {
  return err instanceof ToolError && /לא נמצא|not found/i.test(err.message);
}

// ── Contreal task helpers ──

interface ContrealStatusIds { doneId: number | null; todoId: number | null }

/** הסטטוסים של החברה: "הושלם" = is_completed, "לביצוע" = ברירת המחדל הפתוחה. נשמרים ב-contreal_auth. */
async function loadStatuses(mcp: McpSession): Promise<ContrealStatusIds> {
  const data = await mcp.call("list_statuses_and_priorities", {});
  const statuses: any[] = data?.task_statuses ?? [];
  const done = statuses.find((st) => truthy(st.is_completed));
  const todo = statuses.find((st) => truthy(st.is_default) && !truthy(st.is_completed))
    ?? statuses.find((st) => !truthy(st.is_completed));
  const ids = { doneId: done?.id ?? null, todoId: todo?.id ?? null };
  await updateAuth({ status_id_done: ids.doneId, status_id_todo: ids.todoId });
  return ids;
}

async function fetchAllOpenTasks(mcp: McpSession): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let page = 0; page < 50; page++) {
    const data = await mcp.call("search_tasks", { state: "open", limit: 100, offset });
    const items: any[] = data?.items ?? [];
    all.push(...items);
    if (!data?.has_more || items.length === 0) return all;
    offset = data.next_offset ?? offset + items.length;
  }
  throw new Error("search_tasks: too many pages");
}

function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function isTaskCompleted(t: any): boolean {
  return !!t?.completed_at || truthy(t?.status?.is_completed);
}

function linkFieldsFromTask(t: any, userMap: Map<number, string | null>) {
  // shmaya_user לכל משויך: הדפדפן לא יכול לקרוא את contreal_user_map (RLS), ובזכותו הדשבורד
  // יודע איזו קבוצת עובד היא של המשתמש המחובר לשמעיה (ומציג אותה ראשונה).
  const assignees: { id: number; name: string; shmaya_user: string | null }[] = (t.assignees ?? [])
    .map((a: any) => ({ id: a.id, name: a.name, shmaya_user: userMap.get(a.id) ?? null }));
  const assignedTo = [...new Set(assignees.map((a) => a.shmaya_user).filter((n): n is string => !!n))];
  return {
    assigned_to: assignedTo,
    contreal_assignees: assignees,
    deadline_date: t.deadline_date ?? null,
    status_name: t.status?.name ?? null,
    priority_name: t.priority?.priority_name ?? t.priority?.name ?? null,
    project_name: t.project?.name ?? null,
    client_name: t.client?.name ?? t.client?.business_name ?? null,
    url: t.url ?? null,
  };
}

async function pushToContreal(mcp: McpSession, contrealTaskId: number, completed: boolean, ids: ContrealStatusIds):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const statusId = completed ? ids.doneId : ids.todoId;
  if (!statusId) return { ok: false, error: "סטטוסי קונטריל לא ידועים" };
  try {
    await mcp.call("update_task", { task_id: contrealTaskId, status_id: statusId });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 300) };
  }
}

/**
 * מי סימן. קונטריל רושם כל שינוי בשם המשתמש של החיבור (חיבור אחד, של המנהל), ואין דרך לבצע
 * פעולה בשם חבר צוות אחר. לכן, כשמי שסימן בשמעיה (sub_tasks.updated_by) אינו המשתמש של
 * החיבור, מוסיפים על המשימה בקונטריל תגובה עם שמו — כך רואים שם מי באמת סימן.
 * best-effort: כישלון בתגובה לא מבטל את עדכון הסטטוס.
 */
interface Annotator { (contrealTaskId: number, completed: boolean, actor: string | null): Promise<void> }

function makeAnnotator(mcp: McpSession, warnings?: string[]): Annotator {
  let connectedUser: Promise<string | null> | null = null;
  // משתמש שמעיה של החיבור: get_me → contreal_user_map.shmaya_user (נשאל פעם אחת לכל בקשה)
  const resolveConnectedUser = async (): Promise<string | null> => {
    try {
      const me = await mcp.call("get_me", {});
      const id = me?.user?.id;
      if (!id) return null;
      const { data } = await db.from("contreal_user_map").select("shmaya_user").eq("contreal_user_id", id).maybeSingle();
      return data?.shmaya_user ?? null;
    } catch {
      return null;
    }
  };
  return async (contrealTaskId, completed, actor) => {
    if (!actor) return;
    connectedUser ??= resolveConnectedUser();
    if ((await connectedUser) === actor) return; // השינוי כבר רשום בקונטריל בשמו
    const content = completed ? `✓ סומן כבוצע בשמעיה ע״י ${actor}` : `↺ סימון הביצוע בוטל בשמעיה ע״י ${actor}`;
    try {
      await mcp.call("add_task_comment", { task_id: contrealTaskId, content });
    } catch (err) {
      const msg = `תגובת "סומן ע״י ${actor}" למשימה ${contrealTaskId} לא נוספה: ${String(err instanceof Error ? err.message : err).slice(0, 120)}`;
      console.error("[contreal-sync]", msg);
      warnings?.push(msg);
    }
  };
}

async function ensureContrealParent(): Promise<string> {
  const find = () => db.from("parent_tasks").select("id")
    .eq("registry_key", CONTREAL_PARENT_KEY).eq("customer_id", OFFICE_CUSTOMER_ID).maybeSingle();
  const { data: existing, error } = await find();
  if (error) throw error;
  if (existing) return existing.id;
  const { data: created, error: insErr } = await db.from("parent_tasks").insert({
    customer_id: OFFICE_CUSTOMER_ID,
    registry_key: CONTREAL_PARENT_KEY,
    title: CONTREAL_PARENT_TITLE,
    status: "pending",
  }).select("id").single();
  if (!insErr) return created.id;
  // סנכרון מקביל יצר אותו בינתיים (אינדקס ייחודי, מיגרציה 0027)
  const { data: again } = await find();
  if (again) return again.id;
  throw insErr;
}

async function recomputeParentStatus(parentId: string): Promise<void> {
  const { data } = await db.from("sub_tasks").select("is_completed").eq("parent_task_id", parentId);
  const allDone = (data ?? []).length > 0 && (data ?? []).every((r: any) => r.is_completed);
  await db.from("parent_tasks").update({ status: allDone ? "completed" : "pending" }).eq("id", parentId);
}

// ── sync ──

/**
 * סנכרון מלא. לכל משימה מקושרת:
 *  - נמחקה בקונטריל ("המשימה לא נמצאה")  → נמחקת אצלנו (אלא אם יותר מ-MAX_DELETIONS_PER_SYNC).
 *  - is_completed אצלנו ≠ synced_completed → שונתה בשמעיה ולא הגיעה לקונטריל: דוחפים (שמעיה גוברת).
 *  - אחרת, אם המצב בקונטריל ≠ synced_completed → מחילים אצלנו, בעדכון מותנה בערך הקודם
 *    (סימון שקרה באמצע הסנכרון לא נדרס; הוא יידחף בסנכרון הבא).
 * משימות פתוחות חדשות נוצרות כתתי-משימות. משימות שלא חזרו ברשימת הפתוחות נבדקות אחת-אחת
 * ב-get_task (search_tasks לא תומך בחיפוש לפי מזהים); תקלה בבדיקה = לא נוגעים, לא מוחקים.
 */
async function runSync() {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "not_connected" };

  const nowIso = new Date().toISOString();
  const { data: locked, error: lockErr } = await db.from("contreal_auth")
    .update({ sync_lock_until: new Date(Date.now() + SYNC_LOCK_MS).toISOString() })
    .eq("id", 1)
    .or(`sync_lock_until.is.null,sync_lock_until.lt.${nowIso}`)
    .select("id");
  if (lockErr) throw lockErr;
  if (!locked || locked.length === 0) return { ok: false, error: "sync_running" };

  const result = {
    ok: true,
    created: 0, completedFromContreal: 0, reopenedFromContreal: 0, excluded: 0,
    pushed: 0, pushFailed: 0, deleted: 0,
    unmappedAssignees: [] as string[],
    autoMapped: [] as string[],
    warnings: [] as string[],
  };

  let mcp: McpSession | null = null;
  try {
    mcp = await openMcp(token);
    const statusIds = await loadStatuses(mcp);
    const annotate = makeAnnotator(mcp, result.warnings);
    const open = (await fetchAllOpenTasks(mcp)).filter((t) => !isExcludedTask(t));
    const parentId = await ensureContrealParent();

    // עובדים: כל מי שמופיע כ-assignee נרשם ב-contreal_user_map (בלי לדרוס shmaya_user)
    const seen = new Map<number, string>();
    for (const t of open) for (const a of t.assignees ?? []) seen.set(a.id, a.name);
    if (seen.size > 0) {
      const { error } = await db.from("contreal_user_map").upsert(
        [...seen].map(([id, name]) => ({ contreal_user_id: id, contreal_name: name, updated_at: nowIso })),
        { onConflict: "contreal_user_id" },
      );
      if (error) throw error;
    }
    const { data: mapRows, error: mapErr } = await db.from("contreal_user_map").select("contreal_user_id, contreal_name, shmaya_user");
    if (mapErr) throw mapErr;

    // שיוך אוטומטי לעובדים שעוד לא שויכו. לא דורס שיוך קיים (ידני או אוטומטי), ולא משייך
    // משתמש שמעיה שכבר משויך לעובד קונטריל אחר, או ששני עובדי קונטריל חדשים מתאימים לו.
    const taken = new Set((mapRows ?? []).map((r: any) => r.shmaya_user).filter(Boolean));
    const proposals = new Map<string, any[]>();
    for (const r of mapRows ?? []) {
      if (r.shmaya_user) continue;
      const match = matchShmayaUser(String(r.contreal_name ?? ""));
      if (match) proposals.set(match, [...(proposals.get(match) ?? []), r]);
    }
    for (const [user, rows] of proposals) {
      if (taken.has(user) || rows.length > 1) {
        result.warnings.push(`לא שויך אוטומטית ל"${user}": ${rows.map((r) => r.contreal_name).join(", ")} — ${taken.has(user) ? `"${user}" כבר משויך לעובד אחר` : "יותר מעובד אחד מתאים"}. יש לשייך ידנית ב-contreal_user_map.`);
        continue;
      }
      const row = rows[0];
      const { error } = await db.from("contreal_user_map")
        .update({ shmaya_user: user, updated_at: nowIso })
        .eq("contreal_user_id", row.contreal_user_id).is("shmaya_user", null);
      if (error) { result.warnings.push(`שיוך אוטומטי של ${row.contreal_name} נכשל: ${error.message}`); continue; }
      row.shmaya_user = user;
      result.autoMapped.push(`${row.contreal_name} ← ${user}`);
    }

    const userMap = new Map<number, string | null>((mapRows ?? []).map((r: any) => [Number(r.contreal_user_id), r.shmaya_user]));
    result.unmappedAssignees = (mapRows ?? []).filter((r: any) => !r.shmaya_user).map((r: any) => r.contreal_name);

    const { data: links, error: linksErr } = await db.from("contreal_task_link")
      .select("subtask_id, contreal_task_id, synced_completed, push_error, project_name, sub_tasks(id, title, is_completed, updated_by)");
    if (linksErr) throw linksErr;
    const openById = new Map<number, any>(open.map((t) => [Number(t.id), t]));
    const linkedIds = new Set<number>((links ?? []).map((l: any) => Number(l.contreal_task_id)));

    // מצב בקונטריל לכל משימה מקושרת
    const remote = new Map<number, { task: any; deleted: boolean }>();
    for (const l of links ?? []) {
      const id = Number(l.contreal_task_id);
      if (l.project_name && EXCLUDED_PROJECT_NAMES.has(String(l.project_name).trim())) continue; // מוסרת למטה
      if (openById.has(id)) { remote.set(id, { task: openById.get(id), deleted: false }); continue; }
      // הושלמה בשני הצדדים ולא חזרה ברשימת הפתוחות → עדיין הושלמה בקונטריל (אילו נפתחה מחדש,
      // הייתה חוזרת ברשימת הפתוחות). לא בודקים אותה שוב — אחרת כל סנכרון (כל 5 דקות) היה
      // שולח get_task לכל משימה שהושלמה אי-פעם. מחיר: משימה שהושלמה ואז נמחקה בקונטריל נשארת
      // אצלנו כמשימה שהושלמה (מוסתרת ב"רק פתוחות").
      if (l.synced_completed && (l.sub_tasks as any)?.is_completed) continue;
      try {
        remote.set(id, { task: await mcp.call("get_task", { task_id: id }), deleted: false });
      } catch (err) {
        if (isNotFound(err)) remote.set(id, { task: null, deleted: true });
        else result.warnings.push(`משימה ${id}: לא הצלחתי לבדוק את מצבה (${String(err).slice(0, 120)}) — לא שיניתי אותה`);
      }
    }

    const deletions = [...remote.values()].filter((r) => r.deleted).length;
    const skipDeletes = deletions > MAX_DELETIONS_PER_SYNC;
    if (skipDeletes) {
      result.warnings.push(`${deletions} משימות נראות כמחוקות בקונטריל — יותר מ-${MAX_DELETIONS_PER_SYNC}, ולכן לא נמחק כלום. יש לבדוק ידנית.`);
    }

    for (const l of links ?? []) {
      const id = Number(l.contreal_task_id);
      const r = remote.get(id);
      const sub = l.sub_tasks as any;
      const excludedByLink = !!l.project_name && EXCLUDED_PROJECT_NAMES.has(String(l.project_name).trim());
      if (sub && (excludedByLink || (r?.task && isExcludedTask(r.task)))) {
        const { error } = await db.from("sub_tasks").delete().eq("id", sub.id);
        if (error) result.warnings.push(`הסרת משימה ${id} (פרויקט מוחרג) נכשלה: ${error.message}`);
        else result.excluded++;
        continue;
      }
      if (!r || !sub) continue;

      if (r.deleted) {
        if (!skipDeletes) {
          const { error } = await db.from("sub_tasks").delete().eq("id", sub.id);
          if (error) result.warnings.push(`מחיקת משימה ${id} נכשלה: ${error.message}`);
          else result.deleted++;
        }
        continue;
      }

      const t = r.task;
      const remoteDone = isTaskCompleted(t);
      const local = !!sub.is_completed;
      const synced = !!l.synced_completed;
      let newSynced = synced;
      let pushError: string | null = l.push_error ?? null;

      if (local !== synced) {
        if (remoteDone === local) {
          newSynced = local; // כבר מסונכרן בפועל (סומן בשני הצדדים)
          pushError = null;
        } else {
          const pushed = await pushToContreal(mcp, id, local, statusIds);
          if (pushed.ok) { newSynced = local; pushError = null; result.pushed++; await annotate(id, local, sub.updated_by ?? null); }
          else { pushError = pushed.error; result.pushFailed++; }
        }
      } else if (remoteDone !== synced) {
        const { data: upd, error } = await db.from("sub_tasks")
          .update({ is_completed: remoteDone, updated_at: nowIso, updated_by: UPDATED_BY })
          .eq("id", sub.id).eq("is_completed", synced)
          .select("id");
        if (error) result.warnings.push(`עדכון משימה ${id} נכשל: ${error.message}`);
        else if (upd && upd.length > 0) {
          newSynced = remoteDone;
          if (remoteDone) result.completedFromContreal++; else result.reopenedFromContreal++;
        }
      }

      if (t?.title && t.title !== sub.title) {
        await db.from("sub_tasks").update({ title: t.title }).eq("id", sub.id);
      }

      const { error: linkErr } = await db.from("contreal_task_link").update({
        ...linkFieldsFromTask(t, userMap),
        synced_completed: newSynced,
        push_error: pushError,
        last_seen_at: nowIso,
        updated_at: nowIso,
      }).eq("subtask_id", sub.id);
      if (linkErr) result.warnings.push(`עדכון קישור ${id} נכשל: ${linkErr.message}`);
    }

    // משימות פתוחות חדשות
    for (const t of open) {
      const id = Number(t.id);
      if (linkedIds.has(id)) continue;
      const { data: sub, error: subErr } = await db.from("sub_tasks").insert({
        parent_task_id: parentId,
        title: t.title,
        is_completed: false,
        priority: "medium",
        comment: "",
        updated_at: nowIso,
        updated_by: UPDATED_BY,
      }).select("id").single();
      if (subErr) { result.warnings.push(`יצירת משימה ${id} נכשלה: ${subErr.message}`); continue; }
      const { error: linkErr } = await db.from("contreal_task_link").insert({
        subtask_id: sub.id,
        contreal_task_id: id,
        ...linkFieldsFromTask(t, userMap),
        synced_completed: false,
        last_seen_at: nowIso,
      });
      if (linkErr) {
        // למשל סנכרון מקביל כבר קישר אותה — לא משאירים תת-משימה יתומה
        await db.from("sub_tasks").delete().eq("id", sub.id);
        result.warnings.push(`קישור משימה ${id} נכשל: ${linkErr.message}`);
        continue;
      }
      result.created++;
    }

    await recomputeParentStatus(parentId);
    await updateAuth({ last_synced_at: new Date().toISOString() });
    return result;
  } finally {
    if (mcp) await mcp.close().catch(() => {});
    await db.from("contreal_auth").update({ sync_lock_until: null }).eq("id", 1);
  }
}

async function logCronSync(r: Record<string, number>): Promise<void> {
  const parts = [
    r.created && `נוספו ${r.created}`,
    r.completedFromContreal && `נסגרו ${r.completedFromContreal}`,
    r.reopenedFromContreal && `נפתחו ${r.reopenedFromContreal}`,
    r.pushed && `נדחפו ${r.pushed}`,
    r.deleted && `נמחקו ${r.deleted}`,
    r.excluded && `הוסרו (פרויקט מוחרג) ${r.excluded}`,
    (r as any).autoMapped?.length && `שויכו אוטומטית: ${(r as any).autoMapped.join(", ")}`,
  ].filter(Boolean);
  if (parts.length === 0) return;
  const { error } = await db.from("logs").insert({
    actor: "סנכרון אוטומטי",
    action: "סנכרון קונטריל",
    entity_type: "system",
    entity_id: null,
    payload: { details: parts.join(", ") },
  });
  if (error) console.error("[contreal-sync] cron log insert failed:", error.message);
}

// ── push_status ──

async function pushSubtaskStatus(subtaskId: string) {
  const { data: link, error } = await db.from("contreal_task_link")
    .select("contreal_task_id, synced_completed, sub_tasks(is_completed, updated_by)")
    .eq("subtask_id", subtaskId).maybeSingle();
  if (error) throw error;
  if (!link) return { ok: true, skipped: "not_a_contreal_task" };
  const local = !!(link.sub_tasks as any)?.is_completed;
  if (local === !!link.synced_completed) return { ok: true, skipped: "already_synced" };

  const token = await getAccessToken();
  if (!token) {
    await db.from("contreal_task_link").update({ push_error: "אין חיבור לקונטריל" }).eq("subtask_id", subtaskId);
    return { ok: false, error: "not_connected" };
  }
  const auth = await db.from("contreal_auth").select("status_id_done, status_id_todo").eq("id", 1).single();
  let ids: ContrealStatusIds = { doneId: auth.data?.status_id_done ?? null, todoId: auth.data?.status_id_todo ?? null };

  const mcp = await openMcp(token);
  try {
    if (!ids.doneId || !ids.todoId) ids = await loadStatuses(mcp);
    const pushed = await pushToContreal(mcp, Number(link.contreal_task_id), local, ids);
    if (pushed.ok) await makeAnnotator(mcp)(Number(link.contreal_task_id), local, (link.sub_tasks as any)?.updated_by ?? null);
    await db.from("contreal_task_link").update(pushed.ok
      ? { synced_completed: local, push_error: null, updated_at: new Date().toISOString() }
      : { push_error: pushed.error, updated_at: new Date().toISOString() },
    ).eq("subtask_id", subtaskId);
    return pushed.ok ? { ok: true } : { ok: false, error: pushed.error };
  } finally {
    await mcp.close().catch(() => {});
  }
}

// ── task_details ──

// שדות של get_task שלא מוצגים בחלונית (רשימות עזר לעריכה, לא פרטי המשימה)
const DETAILS_OMIT = new Set(["available_statuses", "available_priorities", "assignable_members"]);

async function taskDetails(subtaskId: string) {
  const { data: link, error } = await db.from("contreal_task_link")
    .select("contreal_task_id").eq("subtask_id", subtaskId).maybeSingle();
  if (error) throw error;
  if (!link) return { ok: false, error: "not_a_contreal_task" };
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "not_connected" };
  const mcp = await openMcp(token);
  try {
    const task = await mcp.call("get_task", { task_id: Number(link.contreal_task_id) });
    const details = Object.fromEntries(Object.entries(task ?? {}).filter(([k]) => !DETAILS_OMIT.has(k)));
    return { ok: true, task: details };
  } catch (err) {
    if (isNotFound(err)) return { ok: false, error: "deleted_in_contreal" };
    return { ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 300) };
  } finally {
    await mcp.close().catch(() => {});
  }
}

// ── disconnect cleanup ──

async function clearSyncedData() {
  const { data: parent } = await db.from("parent_tasks").select("id")
    .eq("registry_key", CONTREAL_PARENT_KEY).eq("customer_id", OFFICE_CUSTOMER_ID).maybeSingle();
  let subtasks = 0;
  if (parent) {
    const { data: removed } = await db.from("sub_tasks").delete().eq("parent_task_id", parent.id).select("id");
    subtasks = removed?.length ?? 0;
    await db.from("parent_tasks").delete().eq("id", parent.id);
  }
  const { data: users } = await db.from("contreal_user_map").delete().gte("contreal_user_id", 0).select("contreal_user_id");
  return { subtasks, userMappings: users?.length ?? 0 };
}

function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
  { label: "open_tasks", tool: "search_tasks", args: { state: "open", limit: 3 } },
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

/** מקצר תשובה גדולה כדי שתיכנס בהודעה אחת: מחרוזות ארוכות ומערכים ארוכים נחתכים. */
function trimForReport(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}… (${value.length} chars)` : value;
  if (Array.isArray(value)) {
    const head = value.slice(0, 3).map((v) => trimForReport(v, depth + 1));
    return value.length > 3 ? [...head, `… +${value.length - 3} more`] : head;
  }
  if (value && typeof value === "object") {
    if (depth > 6) return "{…}";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimForReport(v, depth + 1)]));
  }
  return value;
}

async function discoverWithSdk(token: string, part: "tools" | "calls" = "calls") {
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

    if (part === "tools") {
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
    await client.close();
    out.ok = true;
    return out;
    }

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

    out.calls = trimForReport(calls);
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
