// Where Chez Bébé keeps things. Your Supabase project when connected, otherwise a demo in this
// browser where you can switch between being him and her, to try both sides.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { letterReady, passportMatches, passportProgress } from "./logic";
import { COUNTRIES } from "./countries";
import { emptyTables, TABLES, type Choice, type Envelope, type Letter, type LetterContent, type Member, type Occasion, type TableName, type Tables } from "./types";

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
  notify(title: string, body: string, open?: "vault"): Promise<void>;
  enablePush(): Promise<"on" | "unsupported" | "denied" | "not-configured">;
  /* The Vault */
  writeLetter(l: Letter): Promise<Envelope>;
  editLetter(id: string, l: Partial<Letter>): Promise<void>;
  /** The words, photo and voice note: only once its moment has come (or if you wrote it) */
  openLetter(id: string): Promise<LetterContent>;
  /** Returns true once you've both turned your keys */
  turnKey(o: Occasion): Promise<boolean>;
  /** Tears off one "take what you need" tab; returns all the torn ones */
  tearTab(id: string, index: number): Promise<number[]>;
  /* Passport */
  swipe(country: string, choice: Choice): Promise<void>;
  /** Take a swipe back (not once it's made a match, or once your passport is sealed) */
  unswipe(country: string): Promise<void>;
  /** Seal your passport. Returns the first trip once you've both sealed yours. */
  sealPassport(): Promise<string | null>;
}

const ENVELOPE = "id,created_at,by,title,seal,open_on,opened_at,envelope,envelope_photo";
const NO_DATES: TableName[] = ["settings", "vault_keys", "vault_unlocks", "passport_ready", "passport_trip"];

export class ChezError extends Error {}

/** The two accounts' sign-in names. They only need to look like emails: nothing is ever sent to them. */
export const LOGIN = { her: "her@chez-bebe.local", him: "him@chez-bebe.local" } as const;

export function friendly(e: unknown) {
  const m = (e as Error)?.message ?? String(e);
  if (/NOT_YOURS/.test(m)) return "That's for the other one to do.";
  if (/ALREADY_RULED/.test(m)) return "The court has already ruled on this case.";
  if (/STILL_SEALED/.test(m)) return "Not yet. This one is still sealed.";
  if (/duplicate key.*duels|duels_day_by/.test(m)) return "You've already played today's puzzle.";
  if (/passport_\w+.*(does not exist|schema cache)|(does not exist|schema cache).*passport_/.test(m)) return "Passport isn't set up yet: run db/migrations/004-passport.sql in Supabase.";
  if (/passport_one_super/.test(m)) return "You've already used your Super Like.";
  if (/duplicate key.*passport|passport_swipes_pkey/.test(m)) return "You've already swiped on that one.";
  if (/row-level security.*passport_swipes/.test(m)) return "Your passport is sealed. No more swiping.";
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
      await Promise.all([
        ...TABLES.map(async (name) => {
          // Only ever the envelopes from the Vault, never the letters
          const q = sb.from(name).select(name === "vault_letters" ? ENVELOPE : "*");
          const r = NO_DATES.includes(name) ? await q : await q.order("created_at", { ascending: true });
          // Passport arrived later: until its SQL has been run, the rest of the house still works
          if (r.error && name.startsWith("passport_")) return;
          (t as Record<string, unknown>)[name] = check(r) ?? [];
        }),
        (async () => {
          const r = await sb.rpc("passport_matches");
          if (!r.error) t.passport_matches = (r.data as Tables["passport_matches"]) ?? [];
        })(),
        (async () => {
          const r = await sb.rpc("passport_progress");
          if (!r.error) t.passport_progress = (r.data as Tables["passport_progress"]) ?? [];
        })(),
      ]);
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
    async notify(title, body, open) {
      try {
        await sb.functions.invoke("notify", { body: { title, body, url: open === "vault" ? "vault.html" : "./" } });
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
    async writeLetter(l) {
      return check(await sb.from("vault_letters").insert(l).select(ENVELOPE).single()) as unknown as Envelope;
    },
    async editLetter(id, l) {
      check(await sb.from("vault_letters").update(l).eq("id", id));
    },
    async openLetter(id) {
      return check(await sb.rpc("open_letter", { p_id: id })) as LetterContent;
    },
    async turnKey(o) {
      return check(await sb.rpc("turn_key", { p_occasion: o })) as boolean;
    },
    async tearTab(id, index) {
      return check(await sb.rpc("tear_tab", { p_id: id, p_index: index })) as number[];
    },
    async swipe(country, choice) {
      check(await sb.from("passport_swipes").insert({ country, choice }));
    },
    async unswipe(country) {
      const r = check(await sb.from("passport_swipes").delete().eq("country", country).select("country"));
      if (!(r as unknown[])?.length) throw new ChezError("That one's stamped now. A stamp is a stamp.");
    },
    async sealPassport() {
      return check(await sb.rpc("passport_seal")) as string | null;
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
  t.vault_letters = [
    { ...base(DEMO_HIM, at(3)), title: "Open now!", seal: "now", open_on: null, opened_at: null, envelope: { style: "stripes" }, envelope_photo: null },
    { ...base(DEMO_HIM, at(2)), title: "For your birthday", seal: "date", open_on: "2026-12-20", opened_at: null, envelope: { style: "balloon" }, envelope_photo: null },
    { ...base(DEMO_HIM, at(2)), title: "Open when you've had a bad day", seal: "when", open_on: null, opened_at: null, envelope: { style: "clouds" }, envelope_photo: null },
    { ...base(DEMO_HIM, at(2)), title: "Open when you miss me", seal: "when", open_on: null, opened_at: null, envelope: { style: "sunburst" }, envelope_photo: null },
    { ...base(DEMO_HIM, at(1)), title: "For our wedding day", seal: "wedding", open_on: null, opened_at: null, envelope: { style: "rings" }, envelope_photo: null },
  ];
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
  // Her side of the Passport is already swiped, so his matches land as he goes
  t.passport_swipes = COUNTRIES.map((c, i) => ({
    by: DEMO_HER,
    country: c.code,
    choice: c.code === "FR" ? "super" : (i * 37) % 100 < 45 ? "yes" : "no",
    created_at: at(1, 21),
  }));
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
    saveWords(
      Object.fromEntries(
        seed.vault_letters.map((e) => [
          e.id,
          {
            id: e.id,
            body: `(Demo) ${e.title}.\n\nThis is where the letter goes, in your own words.`,
            image: null,
            audio: null,
            peaks: null,
            opened_at: null,
            paper: e.title.includes("bad day") ? "lined" : "cream",
            tabs: e.title.includes("bad day")
              ? ["Inspiration", "Confidence", "Strength", "Happiness", "Laughter", "Peace"].map((label) => ({ label, note: `(Demo) A little note about ${label.toLowerCase()}.` }))
              : null,
            cards: e.title.includes("bad day") ? ["A bad day only lasts 24 hours."] : null,
            torn: [],
          } satisfies LetterContent,
        ]),
      ),
    );
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
      const t = load();
      // Like the real thing: you only see your own swipes, and the matches
      t.passport_matches = passportMatches(t.passport_swipes, demoMembers);
      t.passport_progress = passportProgress(t.passport_swipes, t.passport_ready, demoMembers);
      t.passport_swipes = t.passport_swipes.filter((x) => x.by === as());
      return t;
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
    async writeLetter(l) {
      const t = load();
      const { body, image, audio, peaks, paper, tabs, cards, ...env } = l;
      const e: Envelope = { id: crypto.randomUUID(), created_at: new Date().toISOString(), by: as(), opened_at: null, ...env };
      t.vault_letters.push(e);
      const words = vaultWords();
      words[e.id] = { id: e.id, body, image, audio, peaks, paper, tabs, cards, torn: [], opened_at: null };
      saveWords(words);
      save(t);
      return e;
    },
    async editLetter(id, l) {
      const t = load();
      const { body, image, audio, peaks, paper, tabs, cards, ...env } = l;
      t.vault_letters = t.vault_letters.map((e) => (e.id === id ? { ...e, ...env } : e));
      const words = vaultWords();
      words[id] = { ...words[id], ...Object.fromEntries(Object.entries({ body, image, audio, peaks, paper, tabs, cards }).filter(([, v]) => v !== undefined)) };
      saveWords(words);
      save(t);
    },
    async openLetter(id) {
      const t = load();
      const e = t.vault_letters.find((x) => x.id === id);
      if (!e) throw new ChezError("That letter isn't here any more.");
      if (e.by !== as()) {
        if (!letterReady(e, t.vault_unlocks)) throw new ChezError(friendly("STILL_SEALED"));
        if (!e.opened_at) {
          e.opened_at = new Date().toISOString();
          save(t);
        }
      }
      const blank: LetterContent = { id, body: null, image: null, audio: null, peaks: null, paper: null, tabs: null, cards: null, torn: [], opened_at: null };
      return { ...blank, ...vaultWords()[id], opened_at: e.opened_at };
    },
    async tearTab(id, index) {
      const t = load();
      const e = t.vault_letters.find((x) => x.id === id);
      const words = vaultWords();
      const w = words[id];
      if (!e || !w || e.by === as() || !e.opened_at || !w.tabs?.[index]) throw new ChezError("That tab isn't there.");
      if (!w.torn?.includes(index)) w.torn = [...(w.torn ?? []), index];
      saveWords(words);
      channel?.postMessage("changed");
      return w.torn;
    },
    async swipe(country, choice) {
      const t = load();
      if (t.passport_ready.some((r) => r.user_id === as())) throw new ChezError(friendly("row-level security passport_swipes"));
      if (t.passport_swipes.some((x) => x.by === as() && x.country === country)) throw new ChezError(friendly("passport_swipes_pkey"));
      if (choice === "super" && t.passport_swipes.some((x) => x.by === as() && x.choice === "super")) throw new ChezError(friendly("passport_one_super"));
      t.passport_swipes.push({ by: as(), country, choice, created_at: new Date().toISOString() });
      save(t);
    },
    async unswipe(country) {
      const t = load();
      if (t.passport_ready.some((r) => r.user_id === as())) throw new ChezError(friendly("row-level security passport_swipes"));
      if (passportMatches(t.passport_swipes, demoMembers).some((m) => m.country === country)) throw new ChezError("That one's stamped now. A stamp is a stamp.");
      t.passport_swipes = t.passport_swipes.filter((x) => !(x.by === as() && x.country === country));
      save(t);
    },
    async sealPassport() {
      const t = load();
      if (!t.passport_ready.some((r) => r.user_id === as())) t.passport_ready.push({ user_id: as(), at: new Date().toISOString() });
      const matches = passportMatches(t.passport_swipes, demoMembers);
      if (t.passport_ready.length >= 2 && !t.passport_trip.length && matches.length)
        t.passport_trip = [{ country: matches[Math.floor(Math.random() * matches.length)].country, drawn_at: new Date().toISOString() }];
      save(t);
      return t.passport_trip[0]?.country ?? null;
    },
    async turnKey(o) {
      const t = load();
      const now = new Date().toISOString();
      t.vault_keys = [...t.vault_keys.filter((k) => !(k.user_id === as() && k.occasion === o)), { user_id: as(), occasion: o, turned_at: now }];
      const turned = t.vault_keys.filter((k) => k.occasion === o && Date.now() - Date.parse(k.turned_at) < 24 * 3600_000);
      if (turned.length >= 2 && !t.vault_unlocks.some((u) => u.occasion === o)) t.vault_unlocks.push({ occasion: o, unlocked_at: now });
      save(t);
      return t.vault_unlocks.some((u) => u.occasion === o);
    },
  };
}

// Demo letters' words are kept apart from the envelopes, like the real thing
const WORDS_KEY = "chez:demo-vault";
const vaultWords = (): Record<string, LetterContent> => {
  try {
    return JSON.parse(localStorage.getItem(WORDS_KEY) ?? "{}") as Record<string, LetterContent>;
  } catch {
    return {};
  }
};
const saveWords = (w: Record<string, LetterContent>) => {
  try {
    localStorage.setItem(WORDS_KEY, JSON.stringify(w));
  } catch {
    // fine
  }
};

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
    localStorage.removeItem(WORDS_KEY);
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
