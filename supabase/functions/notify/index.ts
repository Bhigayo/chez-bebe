// Sends a notification to the other one's phone(s).
// Called by the app after a decree, a case, a good morning, a rough day or "I'm here".
// Secrets needed: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ error: "Notifications aren't set up yet" }, 501);

  // Who is asking? Only the two of you can send.
  const asUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json({ error: "Sign in first" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: members } = await admin.from("members").select("user_id");
  if (!members?.some((m) => m.user_id === auth.user!.id)) return json({ error: "Not a member" }, 403);
  const partner = members.find((m) => m.user_id !== auth.user!.id);
  if (!partner) return json({ sent: 0 });

  let body: { title?: string; body?: string; url?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty is fine
  }
  // Which app the notification opens: only these two
  const url = body.url === "vault.html" ? "vault.html" : "./";
  const payload = JSON.stringify({ title: String(body.title ?? "Chez Bébé").slice(0, 80), body: String(body.body ?? "").slice(0, 240), url });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@example.com", pub, priv);
  const { data: subs } = await admin.from("push_subs").select("endpoint, keys").eq("by", partner.user_id);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      // The phone unsubscribed or the app was removed: forget it
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
  return json({ sent });
});
