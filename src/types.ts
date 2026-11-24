// Everything stored in Chez Bébé. Each row knows who made it ("by") and when.

export type Who = "her" | "him";
export type Mood = "sun" | "cloud" | "rain";

export type Member = { user_id: string; who: Who; name: string; title: string; accepted_at: string | null };

type Row = { id: string; created_at: string; by: string };

/** "How's your day?" */
export type Checkin = Row & { mood: Mood; line: string | null; note: string | null; audio: string | null };
/** Good morning, and the royal reply */
export type Greeting = Row & { text: string; reply: string | null; replied_at: string | null };
/** A court case: "by" is the one bringing the charge */
export type Case = Row & {
  title: string;
  charge: string;
  defence: string | null;
  defended_at: string | null;
  verdict: "guilty" | "pardoned" | "dismissed" | null;
  sentence: string | null;
  ruled_at: string | null;
};
export type Decree = Row & { text: string; done_at: string | null };
export type Pin = Row & { title: string; place: string | null; kind: "castle" | "house" | "place" | "dream"; image: string | null; link: string | null; note: string | null };
/** Something to save up crowns for. for_who: who it's for (the other one earns it) */
export type Goal = Row & { title: string; for_who: Who; target: number; pin_id: string | null };
/** One finished daily puzzle */
export type Duel = Row & { day: string; seconds: number; mistakes: number };
export type Lore = Row & {
  kind: "quote" | "moment" | "photo" | "voice";
  text: string | null;
  said_by: Who | null;
  image: string | null;
  audio: string | null;
  trim_start: number | null;
  trim_end: number | null;
  peaks: number[] | null;
  happened_on: string | null;
};
/** anniversary: also celebrated on the same day every month */
export type KeyDate = Row & { date: string; title: string; note: string | null; kind: "yearly" | "anniversary" | "once" };
/** "I'm here" */
export type Here = Row;
/** One-tap messages, written once in your own words */
export type SavedNote = Row & { text: string };
export type Setting = { key: string; value: string | null };

/* The Vault. Only the envelope is ever loaded; the words come when it opens. */
export type Seal = "date" | "when" | "meeting" | "wedding" | "now";
export type EnvelopeStyle = "hearts" | "clouds" | "sunburst" | "rings" | "balloon" | "corners" | "stripes" | "kraft";
export type Paper = "lined" | "cream" | "kraft";
export type Tab = { label: string; note: string };
/** What's visible before it opens: the envelope, front and all */
export type Envelope = Row & { title: string; seal: Seal; open_on: string | null; opened_at: string | null; envelope: { style: EnvelopeStyle } | null; envelope_photo: string | null };
export type LetterContent = {
  id: string;
  body: string | null;
  image: string | null;
  audio: string | null;
  peaks: number[] | null;
  opened_at: string | null;
  paper: Paper | null;
  tabs: Tab[] | null;
  cards: string[] | null;
  torn: number[];
};
export type Letter = {
  title: string;
  seal: Seal;
  open_on: string | null;
  body: string | null;
  image: string | null;
  audio: string | null;
  peaks: number[] | null;
  envelope: { style: EnvelopeStyle } | null;
  envelope_photo: string | null;
  paper: Paper;
  tabs: Tab[] | null;
  cards: string[] | null;
};
export type Occasion = "meeting" | "wedding";
export type VaultKey = { user_id: string; occasion: Occasion; turned_at: string };
export type VaultUnlock = { occasion: Occasion; unlocked_at: string };

/* Passport. You only ever load your own swipes; the matches and counts come from the server. */
export type Choice = "yes" | "no" | "super";
export type Swipe = { by: string; country: string; choice: Choice; created_at: string };
export type PassportMatch = { country: string; matched_at: string; super_by: Who | "both" | null };
export type PassportProgress = { who: Who; swiped: number; sealed: boolean; super_used: boolean };
export type PassportReady = { user_id: string; at: string };
export type PassportTrip = { country: string; drawn_at: string };

export type Tables = {
  checkins: Checkin[];
  greetings: Greeting[];
  cases: Case[];
  decrees: Decree[];
  pins: Pin[];
  goals: Goal[];
  duels: Duel[];
  lore: Lore[];
  dates: KeyDate[];
  here: Here[];
  saved_notes: SavedNote[];
  settings: Setting[];
  vault_letters: Envelope[];
  vault_keys: VaultKey[];
  vault_unlocks: VaultUnlock[];
  passport_swipes: Swipe[];
  passport_ready: PassportReady[];
  passport_trip: PassportTrip[];
  passport_matches: PassportMatch[];
  passport_progress: PassportProgress[];
};
export type TableName = keyof Tables;
export const TABLES: TableName[] = ["checkins", "greetings", "cases", "decrees", "pins", "goals", "duels", "lore", "dates", "here", "saved_notes", "settings", "vault_letters", "vault_keys", "vault_unlocks", "passport_swipes", "passport_ready", "passport_trip"];

export const emptyTables = (): Tables => ({
  checkins: [],
  greetings: [],
  cases: [],
  decrees: [],
  pins: [],
  goals: [],
  duels: [],
  lore: [],
  dates: [],
  here: [],
  saved_notes: [],
  settings: [],
  vault_letters: [],
  vault_keys: [],
  vault_unlocks: [],
  passport_swipes: [],
  passport_ready: [],
  passport_trip: [],
  passport_matches: [],
  passport_progress: [],
});
