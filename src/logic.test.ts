import { describe, expect, it } from "vitest";
import { deckFor, passportMatches, passportProgress, keysTurned, letterReady, caseWinner, courtRecord, crowns, dayKey, duelResults, goalProgress, greetingStreak, isQuiet, recentHere, together, upcoming } from "./logic";
import { countSolutions, puzzleFor } from "./sudoku";
import { emptyTables, type Case, type Checkin, type Duel, type Goal, type Greeting, type KeyDate, type Member } from "./types";

const HIM = "u-him";
const HER = "u-her";
const members: Member[] = [
  { user_id: HIM, who: "him", name: "Abdulmalik", title: "Guest", accepted_at: null },
  { user_id: HER, who: "her", name: "Her Majesty", title: "Owner", accepted_at: null },
];
const now = new Date("2026-12-10T15:00:00Z");
let n = 0;
const row = (by: string, created_at: string) => ({ id: `r${n++}`, by, created_at });

describe("days", () => {
  it("uses the UK date for both of you", () => {
    expect(dayKey("2026-12-10T23:30:00Z")).toBe("2026-12-10");
    expect(dayKey("2026-07-10T23:30:00Z")).toBe("2026-07-11"); // summer time
  });

  it("counts a good-morning streak, even before today's is sent", () => {
    const g = (d: string): Greeting => ({ ...row(HIM, `${d}T08:00:00Z`), text: "gm", reply: null, replied_at: null });
    const rows = [g("2026-12-07"), g("2026-12-08"), g("2026-12-09")];
    expect(greetingStreak(rows, HIM, now)).toBe(3);
    expect(greetingStreak([...rows, g("2026-12-10")], HIM, now)).toBe(4);
    expect(greetingStreak([g("2026-12-05"), g("2026-12-09")], HIM, now)).toBe(1);
    expect(greetingStreak(rows, HER, now)).toBe(0);
  });
});

describe("quiet days", () => {
  const c = (mood: Checkin["mood"], at: string): Checkin => ({ ...row(HER, at), mood, line: null, note: null, audio: null });
  it("goes quiet on a rough day, and back when it gets better", () => {
    expect(isQuiet([c("rain", "2026-12-10T09:00:00Z")], HER, now)).toBe(true);
    expect(isQuiet([c("rain", "2026-12-10T09:00:00Z"), c("sun", "2026-12-10T13:00:00Z")], HER, now)).toBe(false);
    expect(isQuiet([c("rain", "2026-12-09T09:00:00Z")], HER, now)).toBe(false);
  });
  it("shows 'I'm here' for six hours", () => {
    expect(recentHere([row(HIM, "2026-12-10T10:00:00Z")], HIM, now)).not.toBeNull();
    expect(recentHere([row(HIM, "2026-12-10T08:00:00Z")], HIM, now)).toBeNull();
  });
});

describe("court", () => {
  const k = (by: string, verdict: Case["verdict"]): Case => ({ ...row(by, "2026-12-01T10:00:00Z"), title: "", charge: "", defence: null, defended_at: null, verdict, sentence: null, ruled_at: null });
  it("guilty goes to the accuser, pardoned to the accused", () => {
    expect(caseWinner(k(HER, "guilty"), members)).toBe(HER);
    expect(caseWinner(k(HER, "pardoned"), members)).toBe(HIM);
    expect(caseWinner(k(HER, "dismissed"), members)).toBeNull();
    expect(courtRecord([k(HER, "guilty"), k(HER, "guilty"), k(HIM, "pardoned"), k(HIM, null)], members)).toEqual({ [HER]: 3, [HIM]: 0 });
  });
});

describe("duels", () => {
  const d = (by: string, day: string, seconds: number, mistakes = 0): Duel => ({ ...row(by, `${day}T12:00:00Z`), day, seconds, mistakes });
  it("fastest wins, mistakes cost 10 seconds, and today waits for both", () => {
    const { wins, days } = duelResults([d(HIM, "2026-12-08", 300), d(HER, "2026-12-08", 280, 3), d(HER, "2026-12-09", 400), d(HIM, "2026-12-10", 200)], members, now);
    expect(days.get("2026-12-08")!.winner).toBe(HIM); // 300 vs 310
    expect(days.get("2026-12-09")!.winner).toBe(HER); // only one finished, and the day is over
    expect(days.get("2026-12-10")!.winner).toBeNull(); // she hasn't played yet
    expect(wins).toEqual({ [HIM]: 1, [HER]: 1 });
  });
});

describe("crowns and goals", () => {
  it("adds up crowns and fills each other's goals in order", () => {
    const t = emptyTables();
    t.greetings = ["2026-12-08", "2026-12-09", "2026-12-09"].map((day) => ({ ...row(HIM, `${day}T08:00:00Z`), text: "gm", reply: null, replied_at: null }));
    t.checkins = [{ ...row(HIM, "2026-12-09T10:00:00Z"), mood: "sun", line: null, note: null, audio: null }];
    t.decrees = [{ ...row(HER, "2026-12-09T10:00:00Z"), text: "Send a voice note", done_at: "2026-12-09T11:00:00Z" }];
    const earned = crowns(t, members, now);
    expect(earned[HIM].total).toBe(10 * 2 + 5 + 10); // two days of greetings, one check-in, one decree obeyed
    expect(earned[HER].total).toBe(0);
    const goals: Goal[] = [
      { ...row(HER, "2026-12-01T00:00:00Z"), title: "Castle", for_who: "her", target: 30, pin_id: null },
      { ...row(HER, "2026-12-02T00:00:00Z"), title: "Second castle", for_who: "her", target: 100, pin_id: null },
      { ...row(HIM, "2026-12-01T00:00:00Z"), title: "GTA 6", for_who: "him", target: 50, pin_id: null },
    ];
    const p = goalProgress(goals, members, earned);
    expect(p.get(goals[0].id)).toMatchObject({ saved: 30, achieved: true });
    expect(p.get(goals[1].id)).toMatchObject({ saved: 5, achieved: false });
    expect(p.get(goals[2].id)).toMatchObject({ saved: 0, achieved: false });
  });
});

describe("timeline", () => {
  const k = (date: string, title: string, kind: KeyDate["kind"]): KeyDate => ({ ...row(HIM, "2026-11-01T00:00:00Z"), date, title, note: null, kind });
  it("lists what's next: monthly and yearly anniversaries, and the first meeting", () => {
    const list = upcoming([k("2026-08-18", "Matched", "yearly"), k("2026-11-01", "Together", "anniversary")], "2027-03-01", now);
    expect(list.map((u) => [u.title, u.date, u.kind])).toEqual([
      ["Together", "2027-01-01", "monthly"],
      ["The first time in the same room", "2027-03-01", "first-meeting"],
      ["Matched", "2027-08-18", "yearly"],
      ["Together", "2027-11-01", "yearly"],
    ]);
    expect(list[0]).toMatchObject({ months: 2, inDays: 22 });
  });
  it("marks a month-iversary on the day itself", () => {
    const list = upcoming([k("2026-11-01", "Together", "anniversary")], null, new Date("2026-12-01T09:00:00Z"));
    expect(list[0]).toMatchObject({ date: "2026-12-01", inDays: 0, months: 1 });
  });
  it("says how long you've been together", () => {
    expect(together("2026-11-01", now)).toEqual({ months: 1, days: 9, total: 39 });
    expect(together("2026-11-01", new Date("2026-11-17T12:00:00Z"))).toEqual({ months: 0, days: 16, total: 16 });
  });
});

describe("daily sudoku", () => {
  it("is the same for both phones, has one answer, and changes daily", () => {
    const a = puzzleFor("2026-12-10");
    expect(puzzleFor("2026-12-10")).toEqual(a);
    expect(puzzleFor("2026-12-11").puzzle).not.toEqual(a.puzzle);
    expect(countSolutions(a.puzzle)).toBe(1);
    expect(a.puzzle.filter(Boolean).length).toBeLessThanOrEqual(34);
    a.puzzle.forEach((v, i) => v && expect(v).toBe(a.solution[i]));
  });
});

describe("vault", () => {
  it("knows when a letter's moment has come", () => {
    expect(letterReady({ seal: "date", open_on: "2026-12-20" }, [], now)).toBe(false);
    expect(letterReady({ seal: "date", open_on: "2026-12-20" }, [], new Date("2026-12-20T00:30:00Z"))).toBe(true);
    expect(letterReady({ seal: "when", open_on: null }, [], now)).toBe(true);
    expect(letterReady({ seal: "wedding", open_on: null }, [], now)).toBe(false);
    expect(letterReady({ seal: "wedding", open_on: null }, [{ occasion: "wedding", unlocked_at: "x" }], now)).toBe(true);
    expect(letterReady({ seal: "meeting", open_on: null }, [{ occasion: "wedding", unlocked_at: "x" }], now)).toBe(false);
  });
  it("only counts keys turned in the last day", () => {
    const keys = [
      { user_id: HIM, occasion: "wedding" as const, turned_at: "2026-12-10T10:00:00Z" },
      { user_id: HER, occasion: "wedding" as const, turned_at: "2026-12-08T10:00:00Z" },
    ];
    expect(keysTurned(keys, "wedding", now)).toEqual([HIM]);
    expect(keysTurned(keys, "meeting", now)).toEqual([]);
  });
});

describe("passport", () => {
  const sw = (by: string, country: string, choice: "yes" | "no" | "super", t = "2026-12-01T10:00:00Z") => ({ by, country, choice, created_at: t });
  it("stamps only what you both want, or what a Super Like carries", () => {
    const swipes = [sw(HIM, "JP", "yes"), sw(HER, "JP", "yes", "2026-12-02T10:00:00Z"), sw(HIM, "IS", "yes"), sw(HER, "IS", "no"), sw(HIM, "PF", "no"), sw(HER, "PF", "super"), sw(HIM, "FR", "yes")];
    expect(passportMatches(swipes, members)).toEqual([
      { country: "PF", matched_at: "2026-12-01T10:00:00Z", super_by: "her" },
      { country: "JP", matched_at: "2026-12-02T10:00:00Z", super_by: null },
    ]);
    expect(passportProgress(swipes, [{ user_id: HER, at: "x" }], members)).toEqual([
      { who: "him", swiped: 4, sealed: false, super_used: false },
      { who: "her", swiped: 3, sealed: true, super_used: true },
    ]);
  });
  it("shuffles the deck the same way each time, differently for each of you", () => {
    const codes = Array.from({ length: 50 }, (_, i) => `C${i}`);
    expect(deckFor(HIM, codes)).toEqual(deckFor(HIM, codes));
    expect(deckFor(HIM, codes)).not.toEqual(deckFor(HER, codes));
    expect([...deckFor(HER, codes)].sort()).toEqual([...codes].sort());
  });
});
