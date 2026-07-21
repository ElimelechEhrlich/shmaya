// Supabase Edge Function: notify-new-customer
//
// מטרה: כשנוסף לקוח חדש לטבלת customers, שולח מייל התראה למזכיר/ה
// עם שם הלקוח וקישור ישיר לכרטיס הלקוח במערכת.
//
// מופעל אוטומטית ע"י Database Webhook על INSERT בטבלת customers.
//
// דורש 3 secrets מוגדרים ב-Supabase (Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY     - המפתח מ-resend.com
//   NOTIFICATION_EMAIL  - הכתובת שאליה יישלחו ההתראות (כרגע placeholder, יש לעדכן)
//   SITE_URL            - כתובת הבסיס של האפליקציה, למשל https://shmaya.vercel.app
//                         (בלי / בסוף)
//
// אומת מול הריפו בפועל (shmaya-master.zip):
//   - עמודות בטבלת customers: full_name, business_name, business_type
//     (מיגרציה 0004_flatten_customer_details.sql)
//   - לוגיקת שם התצוגה תואמת ל-getCustomerDisplayName ב-CustomerRegistry.ts:
//     אם business_type === 'חברה בע"מ' → business_name (או full_name אם ריק),
//     אחרת → full_name.
//   - נתיב כרטיס הלקוח: /admin/customers/:id (App.tsx) — הראוט מקונן תחת
//     /admin עם ProtectedRoute, לא /customers/:id כפי שהונח קודם.

Deno.serve(async (req: Request) => {
  try {
      const payload = await req.json();

          // Database Webhook payloads מגיעים בפורמט:
              // { type: "INSERT", table: "customers", record: {...}, schema: "public", old_record: null }
                  const record = payload.record;

                      if (!record || !record.id) {
                            return new Response(
                                    JSON.stringify({ error: "Missing record.id in webhook payload" }),
                                            { status: 400, headers: { "Content-Type": "application/json" } }
                                                  );
                                                      }

                                                          // תואם ל-getCustomerDisplayName ב-CustomerRegistry.ts
                                                              const customerName =
                                                                    record.business_type === 'חברה בע"מ'
                                                                            ? record.business_name || record.full_name || "לקוח חדש"
                                                                                    : record.full_name || "לקוח חדש";

                                                                                        const siteUrl = Deno.env.get("SITE_URL");
                                                                                            const notificationEmail = Deno.env.get("NOTIFICATION_EMAIL");
                                                                                                const resendApiKey = Deno.env.get("RESEND_API_KEY");

                                                                                                    if (!siteUrl || !notificationEmail || !resendApiKey) {
                                                                                                          console.error("Missing required environment variables");
                                                                                                                return new Response(
                                                                                                                        JSON.stringify({ error: "Server misconfiguration: missing env vars" }),
                                                                                                                                { status: 500, headers: { "Content-Type": "application/json" } }
                                                                                                                                      );
                                                                                                                                          }

                                                                                                                                              // נתיב מאומת מול App.tsx: הראוט מקונן תחת /admin
                                                                                                                                                  const customerUrl = `${siteUrl}/admin/customers/${record.id}`;

                                                                                                                                                      const emailHtml = `
                                                                                                                                                            <div dir="rtl" style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a1a;">
                                                                                                                                                                    <p>נוסף לקוח חדש: <strong>${escapeHtml(customerName)}</strong></p>
                                                                                                                                                                            <p>
                                                                                                                                                                                      <a href="${customerUrl}" style="color: #2563eb;">כניסה לכרטיס הלקוח במערכת</a>
                                                                                                                                                                                              </p>
                                                                                                                                                                                                    </div>
                                                                                                                                                                                                        `;

                                                                                                                                                                                                            const resendResponse = await fetch("https://api.resend.com/emails", {
                                                                                                                                                                                                                  method: "POST",
                                                                                                                                                                                                                        headers: {
                                                                                                                                                                                                                                Authorization: `Bearer ${resendApiKey}`,
                                                                                                                                                                                                                                        "Content-Type": "application/json",
                                                                                                                                                                                                                                              },
                                                                                                                                                                                                                                                    body: JSON.stringify({
                                                                                                                                                                                                                                                            from: "שמעיה - מערכת ניהול משימות <onboarding@resend.dev>",
                                                                                                                                                                                                                                                                    to: notificationEmail.split(",").map((e) => e.trim()),
                                                                                                                                                                                                                                                                            subject: `נוסף לקוח חדש: ${customerName}`,
                                                                                                                                                                                                                                                                                    html: emailHtml,
                                                                                                                                                                                                                                                                                          }),
                                                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                                                                  if (!resendResponse.ok) {
                                                                                                                                                                                                                                                                                                        const errorBody = await resendResponse.text();
                                                                                                                                                                                                                                                                                                              console.error("Resend API error:", resendResponse.status, errorBody);
                                                                                                                                                                                                                                                                                                                    return new Response(
                                                                                                                                                                                                                                                                                                                            JSON.stringify({ error: "Failed to send email", details: errorBody }),
                                                                                                                                                                                                                                                                                                                                    { status: 502, headers: { "Content-Type": "application/json" } }
                                                                                                                                                                                                                                                                                                                                          );
                                                                                                                                                                                                                                                                                                                                              }

                                                                                                                                                                                                                                                                                                                                                  return new Response(JSON.stringify({ success: true }), {
                                                                                                                                                                                                                                                                                                                                                        status: 200,
                                                                                                                                                                                                                                                                                                                                                              headers: { "Content-Type": "application/json" },
                                                                                                                                                                                                                                                                                                                                                                  });
                                                                                                                                                                                                                                                                                                                                                                    } catch (err) {
                                                                                                                                                                                                                                                                                                                                                                        console.error("Unexpected error in notify-new-customer:", err);
                                                                                                                                                                                                                                                                                                                                                                            return new Response(
                                                                                                                                                                                                                                                                                                                                                                                  JSON.stringify({ error: "Unexpected error", details: String(err) }),
                                                                                                                                                                                                                                                                                                                                                                                        { status: 500, headers: { "Content-Type": "application/json" } }
                                                                                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                                                                                                                                                              // מניעת HTML injection בסיסית בשם הלקוח (הגנה מינימלית, לא תחליף לניקוי אמיתי)
                                                                                                                                                                                                                                                                                                                                                                                              function escapeHtml(str: string): string {
                                                                                                                                                                                                                                                                                                                                                                                                return String(str)
                                                                                                                                                                                                                                                                                                                                                                                                    .replace(/&/g, "&amp;")
                                                                                                                                                                                                                                                                                                                                                                                                        .replace(/</g, "&lt;")
                                                                                                                                                                                                                                                                                                                                                                                                            .replace(/>/g, "&gt;")
                                                                                                                                                                                                                                                                                                                                                                                                                .replace(/"/g, "&quot;")
                                                                                                                                                                                                                                                                                                                                                                                                                    .replace(/'/g, "&#039;");
                                                                                                                                                                                                                                                                                                                                                                                                                    }
