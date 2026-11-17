// Where Chez Bébé keeps things. Your Supabase project when connected, otherwise a demo in this
// browser where you can switch between being him and her, to try both sides.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emptyTables, TABLES, type Member, type TableName, type Tables } from "./types";

export interface Store {
  demo: boolean;
  /** Who's signed in on this phone, or null */
  me(): Promise<Member | null>;
  members(): Promise<Member[]>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Her first visit: the key from your text, then a password of her own */
  acceptKeys(email: string, key: string, newPassword: string): Promise<void>;
  load(): Promise<Tables>;
  add<K extends TableName>(table: K, row: Partial<Tables[K][number]>): Promise<Tables[K][number]>;
  edit<K extends TableName>(table: K, id: string, patch: Partial<Tables[K][number]>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  setting(key: string, value: string | null): Promise<void>;
  upload(file: Blob, ext: string): Promise<string>;
  url(path: string): Promise<string>;
  /** Calls back when anything changes on the other phone */
  onChange(cb: () => void): () => void;
  /** A notification on the other one's phone */
  notify(title: string, body: string): Promise<void>;
  enablePush(): Promise<"on" | "unsupported" | "denied" | "not-configured">;
}

export class ChezError extends Error {}

/** The two accounts' sign-in names. They only need to look like emails: nothing is ever sent to them. */
export const LOGIN = { her: "her@chez-bebe.local", him: "him@chez-bebe.local" } as const;

export function friendly(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  if (/NOT_YOURS/.test(m)) return "That's for the other one to do.";
  if (/ALREADY_RULED/.test(m)) return "The court has already ruled on this case.";
  if (/duplicate key.*duels|duels_day_by/.test(m)) return "You've already played today's puzzle.";
  if (/Invalid login|invalid_credentials/i.test(m)) return "That key doesn't fit this door.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No connection. Try again in a moment.";
  if (/row-level security|JWT/.test(m)) return "You've been signed out. Sign in again.";
  return m;
}

/* ---------------- Supabase ---------------- */
function supabaseStore(url: string, key: string): Store {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, storageKey: "chez-bebe" } });
  const signed = new Map<string, { url: string; until: number }>();
  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null;
  const check = <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new ChezError(friendly(r.error));
    return r.data;
  };
  return {
    demo: false,
    async me() {
      const id = await uid();
      if (!id) return null;
      const r = await sb.from("members").select("*").eq("user_id", id).maybeSingle();
      return (r.data as Member) ?? null;
    },
    async members() {
      return check(await sb.from("members").select("*")) as Member[];
    },
    async signIn(email, password) {
      const r = await sb.auth.signInWithPassword({ email, password });
      if (r.error) throw new ChezError(friendly(r.error));
      if (!(await this.me())) {
        await sb.auth.signOut();
        throw new ChezError("This house only has two keys, and this isn't one of them.");
      }
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async acceptKeys(email, key, newPassword) {
      await this.signIn(email, key);
      if (newPassword) {
        const r = await sb.auth.updateUser({ password: newPassword });
        if (r.error) throw new ChezError(friendly(r.error));
      }
      await sb.rpc("accept_keys");
    },
    async load() {
      const t = emptyTables();
      await Promise.all(
        TABLES.map(async (name) => {
          const q = sb.from(name).select("*");
          const r = name === "settings" ? await q : await q.order("created_at", { ascending: true });
          (t as Record<string, unknown>)[name] = check(r) ?? [];
        }),
      );
      return t;
    },
    async add(table, row) {
      return check(await sb.from(table).insert(row as never).select().single()) as never;
    },
    async edit(table, id, patch) {
      check(await sb.from(table).update(patch as never).eq("id", id));
    },
    async remove(table, id) {
      check(await sb.from(table).delete().eq("id", id));
    },
    async setting(key, value) {
      check(await sb.from("settings").upsert({ key, value }));
    },
    async upload(file, ext) {
      const path = `${await uid()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = await sb.storage.from("chez").upload(path, file, { contentType: file.type || undefined });
      if (r.error) throw new ChezError(friendly(r.error));
      return path;
    },
    async url(path) {
      const hit = signed.get(path);
      if (hit && hit.until > Date.now()) return hit.url;
      const r = await sb.storage.from("chez").createSignedUrl(path, 3600);
      if (r.error || !r.data) throw new ChezError(friendly(r.error));
      signed.set(path, { url: r.data.signedUrl, until: Date.now() + 50 * 60_000 });
      return r.data.signedUrl;
    },
    onChange(cb) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const later = () => {
        clearTimeout(timer);
        timer = setTimeout(cb, 250);
      };
      const ch = sb.channel("chez").on("postgres_changes", { event: "*", schema: "public" }, later).subscribe();
      // Catch up when the app comes back from the background
      const vis = () => document.visibilityState === "visible" && later();
      document.addEventListener("visibilitychange", vis);
      return () => {
        document.removeEventListener("visibilitychange", vis);
        void sb.removeChannel(ch);
      };
    },
    async notify(title, body) {
      try {
        await sb.functions.invoke("notify", { body: { title, body } });
      } catch {
        // notifications are a bonus; the app still updates live
      }
    },
    async enablePush() {
      const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapid) return "not-configured";
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return "denied";
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) }));
      const json = sub.toJSON();
      check(await sb.from("push_subs").upsert({ endpoint: json.endpoint, keys: json.keys }));
      return "on";
    },
  };
}

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/* ---------------- Demo, in this browser ---------------- */
const DEMO_KEY = "chez:demo";
const AS_KEY = "chez:demo-as";
export const DEMO_HIM = "demo-him";
export const DEMO_HER = "demo-her";
const demoMembers: Member[] = [
  { user_id: DEMO_HIM, who: "him", name: "Abdulmalik", title: "Guest (on probation)", accepted_at: null },
  { user_id: DEMO_HER, who: "her", name: "Her Majesty", title: "Owner of Chez Bébé", accepted_at: null },
];

// Photos and voice notes live in the browser's own database
const idb = () =>
  new Promise<IDBDatabase>((ok, fail) => {
    const r = indexedDB.open("chez-bebe-demo", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
const idbDo = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const db = await idb();
  return new Promise<T>((ok, fail) => {
    const r = fn(db.transaction("files", mode).objectStore("files"));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
};

function demoSeed(): Tables {
  const t = emptyTables();
  const at = (daysAgo: number, hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  let n = 0;
  const base = (by: string, created_at: string) => ({ id: `seed-${n++}`, by, created_at });
  t.dates = [
    { ...base(DEMO_HIM, at(90)), date: "2026-08-18", title: "We matched", note: "Chapter one.", kind: "yearly" },
    { ...base(DEMO_HIM, at(16)), date: "2026-11-01", title: "Together", note: "I asked. She said yes.", kind: "anniversary" },
  ];
  t.pins = [
    { ...base(DEMO_HER, at(3, 22)), title: "Eilean Donan Castle", place: "Scotland", kind: "castle", image: null, link: null, note: "This one. Obviously." },
    { ...base(DEMO_HER, at(2, 23)), title: "Château de Chambord", place: "France", kind: "castle", image: null, link: null, note: null },
    { ...base(DEMO_HIM, at(1, 21)), title: "A house by the sea", place: "Lagos", kind: "house", image: null, link: null, note: null },
  ];
  t.goals = [
    { ...base(DEMO_HER, at(10)), title: "The castle", for_who: "her", target: 5000, pin_id: t.pins[0].id },
    { ...base(DEMO_HIM, at(10)), title: "GTA 6", for_who: "him", target: 1500, pin_id: null },
  ];
  t.lore = [
    { ...base(DEMO_HIM, at(1)), kind: "quote", text: "your efforts have been noted, citizen", said_by: "her", image: null, audio: null, trim_start: null, trim_end: null, peaks: null, happened_on: null },
    { ...base(DEMO_HIM, at(2)), kind: "quote", text: "yet? … there it is", said_by: "her", image: null, audio: null, trim_start: null, trim_end: null, peaks: null, happened_on: null },
    { ...base(DEMO_HER, at(4)), kind: "moment", text: "He learned Sudoku. For me. Allegedly.", said_by: null, image: null, audio: null, trim_start: null, trim_end: null, peaks: null, happened_on: null },
  ];
  t.greetings = [1, 2, 3].map((d) => ({ ...base(DEMO_HIM, at(d, 8)), text: "Good morning to Her Imperial Majesty.", reply: "Acknowledged.", replied_at: at(d, 9) }));
  t.saved_notes = [{ ...base(DEMO_HIM, at(5)), text: "I love you so much. My day isn't the best, but I hope yours is going better. How's it going?" }];
  t.cases = [
    {
      ...base(DEMO_HER, at(1, 20)),
      title: "My gut",
      charge: "My gut is telling me to be mad at you. Confess.",
      defence: "I promise I have not done anything wrong yet.",
      defended_at: at(1, 20),
      verdict: "guilty",
      sentence: "“Yet?” There it is.",
      ruled_at: at(1, 21),
    },
  ];
  return t;
}

function demoStore(): Store {
  const load = (): Tables => {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return { ...emptyTables(), ...(JSON.parse(raw) as Tables) };
    } catch {
      // start fresh
    }
    const seed = demoSeed();
    save(seed);
    return seed;
  };
  const save = (t: Tables) => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(t));
    } catch {
      // full or blocked: changes last until reload
    }
    channel?.postMessage("changed");
  };
  const as = () => {
    try {
      return localStorage.getItem(AS_KEY) ?? DEMO_HIM;
    } catch {
      return DEMO_HIM;
    }
  };
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("chez-demo") : null;
  const urls = new Map<string, string>();
  return {
    demo: true,
    async me() {
      return demoMembers.find((m) => m.user_id === as()) ?? null;
    },
    async members() {
      return demoMembers;
    },
    async signIn() {},
    async signOut() {},
    async acceptKeys() {},
    async load() {
      return load();
    },
    async add(table, row) {
      const t = load();
      const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), by: as(), ...row };
      if (table === "duels" && t.duels.some((d) => d.by === full.by && d.day === (row as unknown as { day: string }).day)) throw new ChezError(friendly("duels_day_by"));
      (t[table] as unknown[]).push(full);
      save(t);
      return full as Tables[typeof table][number];
    },
    async edit(table, id, patch) {
      const t = load();
      (t as unknown as Record<string, { id: string }[]>)[table] = (t[table] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r));
      save(t);
    },
    async remove(table, id) {
      const t = load();
      (t as unknown as Record<string, { id: string }[]>)[table] = (t[table] as { id: string }[]).filter((r) => r.id !== id);
      save(t);
    },
    async setting(key, value) {
      const t = load();
      t.settings = [...t.settings.filter((s) => s.key !== key), { key, value }];
      save(t);
    },
    async upload(file, ext) {
      const path = `demo/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      try {
        await idbDo("readwrite", (s) => s.put(file, path));
      } catch {
        // private browsing: keep it for this visit only
      }
      urls.set(path, URL.createObjectURL(file));
      return path;
    },
    async url(path) {
      const hit = urls.get(path);
      if (hit) return hit;
      const blob = await idbDo<Blob | undefined>("readonly", (s) => s.get(path)).catch(() => undefined);
      if (!blob) throw new ChezError("This file was only saved for one visit.");
      const u = URL.createObjectURL(blob);
      urls.set(path, u);
      return u;
    },
    onChange(cb) {
      const on = () => cb();
      channel?.addEventListener("message", on);
      return () => channel?.removeEventListener("message", on);
    },
    async notify() {},
    async enablePush() {
      return "not-configured";
    },
  };
}

/** Demo only: switch between his side and hers. */
export function demoSwitch() {
  try {
    localStorage.setItem(AS_KEY, localStorage.getItem(AS_KEY) === DEMO_HER ? DEMO_HIM : DEMO_HER);
  } catch {
    // fine
  }
  location.reload();
}
export function demoReset() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    // fine
  }
  location.reload();
}

export function makeStore(): Store {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? supabaseStore(url.replace(/\/+$/, ""), key) : demoStore();
}

export const store = makeStore();
