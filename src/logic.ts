// The rules of Chez Bébé: crowns, streaks, the court record, quiet days and the timeline.
// Worked out from what's stored, so nothing can drift out of step.

import type { Case, Checkin, Duel, Envelope, Goal, Greeting, Here, KeyDate, Member, Occasion, Tables, VaultKey, VaultUnlock, Who } from "./types";

/** "Today" is the same for both of you: the UK date. */
export const dayKey = (d: Date | string = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof d === "string" ? new Date(d) : d);

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export const partnerOf = (members: Member[], userId: string) => members.find((m) => m.user_id !== userId) ?? null;
export const memberWho = (members: Member[], who: Who) => members.find((m) => m.who === who) ?? null;

const latestBy = <T extends { by: string; created_at: string }>(rows: T[], by: string, now: Date) => {
  const today = dayKey(now);
  return rows.filter((r) => r.by === by && dayKey(r.created_at) === today).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
};
export const checkinToday = (rows: Checkin[], by: string, now = new Date()) => latestBy(rows, by, now);
export const greetingToday = (rows: Greeting[], by: string, now = new Date()) => latestBy(rows, by, now);

/** Days in a row, counting back from today (or yesterday, if today isn't done yet). */
export function streak(days: Iterable<string>, now = new Date()) {
  const set = new Set(days);
  let day = dayKey(now);
  if (!set.has(day)) day = addDays(day, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
export const greetingStreak = (rows: Greeting[], by: string, now = new Date()) => streak(rows.filter((g) => g.by === by).map((g) => dayKey(g.created_at)), now);

/** A rough day: banter pauses for them until tomorrow, or until they say it's better. */
export const isQuiet = (rows: Checkin[], userId: string, now = new Date()) => checkinToday(rows, userId, now)?.mood === "rain";

/** The latest "I'm here" from someone, if it was in the last 6 hours. */
export const recentHere = (rows: Here[], from: string, now = new Date()) =>
  rows.filter((h) => h.by === from && now.getTime() - Date.parse(h.created_at) < 6 * 3600_000).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

/** Who won each day's puzzle. Today's is only decided once you've both finished. */
export function duelResults(duels: Duel[], members: Member[], now = new Date()) {
  const today = dayKey(now);
  const days = new Map<string, { times: Record<string, Duel>; winner: string | null }>();
  for (const d of duels) {
    const day = days.get(d.day) ?? { times: {}, winner: null };
    // Only the first finish counts
    if (!day.times[d.by] || d.created_at < day.times[d.by].created_at) day.times[d.by] = d;
    days.set(d.day, day);
  }
  const wins: Record<string, number> = Object.fromEntries(members.map((m) => [m.user_id, 0]));
  for (const [key, day] of days) {
    const finished = Object.values(day.times);
    if (key === today && finished.length < members.length) continue;
    if (key > today) continue;
    // Fastest wins; mistakes cost 10 seconds each
    const score = (d: Duel) => d.seconds + d.mistakes * 10;
    const best = finished.reduce((a, b) => (score(b) < score(a) ? b : a));
    const tie = finished.filter((d) => score(d) === score(best)).length > 1;
    if (!tie) {
      day.winner = best.by;
      wins[best.by] = (wins[best.by] ?? 0) + 1;
    }
  }
  return { days, wins };
}

/** Who has won the most cases. Guilty means the accuser wins; pardoned means the accused does. */
export function courtRecord(cases: Case[], members: Member[]) {
  const wins: Record<string, number> = Object.fromEntries(members.map((m) => [m.user_id, 0]));
  for (const c of cases) {
    const winner = caseWinner(c, members);
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
  }
  return wins;
}
export function caseWinner(c: Case, members: Member[]) {
  if (c.verdict === "guilty") return c.by;
  if (c.verdict === "pardoned") return partnerOf(members, c.by)?.user_id ?? null;
  return null;
}

export const CROWNS = { checkin: 5, greeting: 10, decree: 10, duel: 20, case: 15, lore: 3 } as const;

/** Crowns each of you has earned, and what for. */
export function crowns(t: Tables, members: Member[], now = new Date()) {
  const result: Record<string, { total: number; parts: Record<keyof typeof CROWNS, number> }> = {};
  const once = (rows: { by: string; created_at: string }[], by: string) => new Set(rows.filter((r) => r.by === by).map((r) => dayKey(r.created_at))).size;
  const duel = duelResults(t.duels, members, now).wins;
  const court = courtRecord(t.cases, members);
  for (const m of members) {
    const other = partnerOf(members, m.user_id)?.user_id;
    const parts = {
      checkin: once(t.checkins, m.user_id) * CROWNS.checkin,
      greeting: once(t.greetings, m.user_id) * CROWNS.greeting,
      // A decree counts for the one who carried it out
      decree: t.decrees.filter((d) => d.done_at && d.by === other).length * CROWNS.decree,
      duel: (duel[m.user_id] ?? 0) * CROWNS.duel,
      case: (court[m.user_id] ?? 0) * CROWNS.case,
      lore: t.lore.filter((l) => l.by === m.user_id).length * CROWNS.lore,
    };
    result[m.user_id] = { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
  }
  return result;
}

/** Goals for her are earned by him, and the other way round. Crowns fill them in order, oldest first. */
export function goalProgress(goals: Goal[], members: Member[], earned: Record<string, { total: number }>) {
  const out = new Map<string, { saved: number; target: number; achieved: boolean; earner: Member | null }>();
  for (const who of ["her", "him"] as Who[]) {
    const earner = members.find((m) => m.who !== who) ?? null;
    let left = earner ? earned[earner.user_id]?.total ?? 0 : 0;
    for (const g of goals.filter((x) => x.for_who === who).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const saved = Math.min(left, g.target);
      left -= saved;
      out.set(g.id, { saved, target: g.target, achieved: saved >= g.target, earner });
    }
  }
  return out;
}

export type Upcoming = { title: string; date: string; inDays: number; note: string | null; kind: "yearly" | "monthly" | "once" | "first-meeting"; years?: number; months?: number };

const nextYearly = (date: string, today: string) => {
  const [, m, d] = date.split("-");
  let y = Number(today.slice(0, 4));
  let next = `${y}-${m}-${d}`;
  if (next < today) next = `${++y}-${m}-${d}`;
  return next;
};
const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
const nextMonthly = (date: string, today: string) => {
  const day = Math.min(Number(date.slice(8, 10)), 28);
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  let next = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (next < today) {
    m = m === 12 ? 1 : m + 1;
    if (m === 1) y++;
    next = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return next;
};

/** What's coming up, soonest first. Today's moments have inDays 0. */
export function upcoming(dates: KeyDate[], firstMeeting: string | null, now = new Date()): Upcoming[] {
  const today = dayKey(now);
  const list: Upcoming[] = [];
  for (const d of dates) {
    if (d.kind === "once") {
      if (d.date >= today) list.push({ title: d.title, date: d.date, inDays: daysBetween(today, d.date), note: d.note, kind: "once" });
      continue;
    }
    if (d.date > today) {
      list.push({ title: d.title, date: d.date, inDays: daysBetween(today, d.date), note: d.note, kind: "once" });
      continue;
    }
    const y = nextYearly(d.date, today);
    list.push({ title: d.title, date: y, inDays: daysBetween(today, y), note: d.note, kind: "yearly", years: Number(y.slice(0, 4)) - Number(d.date.slice(0, 4)) });
    if (d.kind === "anniversary") {
      const m = nextMonthly(d.date, today);
      const months = monthsBetween(d.date, m);
      // The yearly one already covers whole years
      if (months % 12 !== 0) list.push({ title: d.title, date: m, inDays: daysBetween(today, m), note: d.note, kind: "monthly", months });
    }
  }
  if (firstMeeting && firstMeeting >= today) list.push({ title: "The first time in the same room", date: firstMeeting, inDays: daysBetween(today, firstMeeting), note: null, kind: "first-meeting" });
  return list.filter((u) => u.inDays > 0 || u.kind === "first-meeting" || (u.years ?? 1) > 0 || (u.months ?? 1) > 0).sort((a, b) => a.inDays - b.inDays);
}

/** "2 months, 5 days" since a date. */
export function together(since: string, now = new Date()) {
  const today = dayKey(now);
  if (since > today) return null;
  let months = monthsBetween(since, today);
  if (Number(today.slice(8, 10)) < Number(since.slice(8, 10))) months--;
  const anchor = new Date(`${since}T12:00:00Z`);
  anchor.setUTCMonth(anchor.getUTCMonth() + months);
  const days = daysBetween(anchor.toISOString().slice(0, 10), today);
  return { months, days, total: daysBetween(since, today) };
}

export const plural = (n: number, word: string, many = word.endsWith("y") && !/[aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`) => `${n} ${n === 1 ? word : many}`;

/* ---------- The Vault (the database decides for real; this is for showing it) ---------- */
export const letterReady = (e: Pick<Envelope, "seal" | "open_on">, unlocks: VaultUnlock[], now = new Date()) =>
  e.seal === "when" ? true : e.seal === "date" ? !!e.open_on && e.open_on <= dayKey(now) : unlocks.some((u) => u.occasion === e.seal);

/** Who has turned their key for an occasion, in the last 24 hours. */
export const keysTurned = (keys: VaultKey[], occasion: Occasion, now = new Date()) =>
  keys.filter((k) => k.occasion === occasion && now.getTime() - Date.parse(k.turned_at) < 24 * 3600_000).map((k) => k.user_id);
