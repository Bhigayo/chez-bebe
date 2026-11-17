import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const standIn = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const HIM = "aaaaaaaa-0000-0000-0000-000000000001";
const HER = "aaaaaaaa-0000-0000-0000-000000000002";
const STRANGER = "bbbbbbbb-0000-0000-0000-000000000003";
let db: PGlite;

const as = async <T>(user: string | null, sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    if (user) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    await tx.query(`set local role ${user ? "authenticated" : "anon"}`);
    return (await tx.query<T>(sql, params)).rows;
  });

beforeEach(async () => {
  db = new PGlite();
  await db.exec(standIn);
  await db.exec(schema);
  await db.exec(schema); // safe to run twice
  await db.query("insert into auth.users values ($1,'him@x.test'),($2,'her@x.test'),($3,'other@x.test')", [HIM, HER, STRANGER]);
  await db.query("insert into members values ($1,'him','Abdulmalik','Guest',null),($2,'her','Her Majesty','Owner',null)", [HIM, HER]);
});

describe("chez bébé database", () => {
  it("lets only the two of you in", async () => {
    await as(HIM, "insert into lore (kind, text) values ('quote', 'your efforts have been noted, citizen')");
    expect(await as(HER, "select text from lore")).toHaveLength(1);
    expect(await as(STRANGER, "select text from lore")).toHaveLength(0);
    expect(await as(STRANGER, "select * from members")).toHaveLength(0);
    await expect(as(STRANGER, "insert into lore (kind, text) values ('quote', 'hi')")).rejects.toThrow(/row-level security/);
    await expect(as(null, "select * from lore")).rejects.toThrow(/permission denied/);
  });

  it("stamps who made each thing, and nobody can fake it", async () => {
    const [{ by }] = await as<{ by: string }>(HIM, "insert into pins (title) values ('Château de Chambord') returning by");
    expect(by).toBe(HIM);
    await expect(as(HIM, "insert into pins (title, by) values ('x', $1)", [HER])).rejects.toThrow(/row-level security/);
  });

  it("keeps the court fair", async () => {
    const [{ id }] = await as<{ id: string }>(HER, "insert into cases (title, charge) values ('My gut', 'Suspected of future wrongdoing') returning id");
    // The accuser can't write the defence, and the accused can't rule
    await expect(as(HER, "update cases set defence = 'he did it' where id = $1", [id])).rejects.toThrow(/NOT_YOURS/);
    await as(HIM, "update cases set defence = 'I have not done anything wrong yet', defended_at = now() where id = $1", [id]);
    await expect(as(HIM, "update cases set verdict = 'pardoned' where id = $1", [id])).rejects.toThrow(/NOT_YOURS/);
    await as(HER, "update cases set verdict = 'guilty', sentence = 'yet? there it is', ruled_at = now() where id = $1", [id]);
    await expect(as(HER, "update cases set verdict = 'pardoned' where id = $1", [id])).rejects.toThrow(/ALREADY_RULED/);
    expect((await as<{ verdict: string; by: string }>(HIM, "select verdict, by from cases"))[0]).toEqual({ verdict: "guilty", by: HER });
  });

  it("only lets the other one reply to a good morning or carry out a decree", async () => {
    const [{ id: g }] = await as<{ id: string }>(HIM, "insert into greetings (text) values ('Good morning, Your Majesty') returning id");
    await expect(as(HIM, "update greetings set reply = 'Acknowledged' where id = $1", [g])).rejects.toThrow(/NOT_YOURS/);
    await as(HER, "update greetings set reply = 'Noted, citizen', replied_at = now() where id = $1", [g]);
    const [{ id: d }] = await as<{ id: string }>(HER, "insert into decrees (text) values ('Voice note before 9pm') returning id");
    await expect(as(HER, "update decrees set done_at = now() where id = $1", [d])).rejects.toThrow(/NOT_YOURS/);
    await as(HIM, "update decrees set done_at = now() where id = $1", [d]);
    // Nobody can rewrite who made it or when
    await as(HIM, "update decrees set by = $1, created_at = '2020-01-01' where id = $2", [HIM, d]);
    expect((await as<{ by: string; y: number }>(HER, "select by, extract(year from created_at)::int as y from decrees"))[0]).toEqual({ by: HER, y: new Date().getFullYear() });
  });

  it("only lets you edit or delete your own pins and memories", async () => {
    const [{ id }] = await as<{ id: string }>(HER, "insert into pins (title) values ('Eilean Donan') returning id");
    await expect(as(HIM, "update pins set title = 'mine now' where id = $1", [id])).rejects.toThrow(/NOT_YOURS/);
    await as(HIM, "delete from pins where id = $1", [id]);
    expect(await as(HER, "select * from pins")).toHaveLength(1);
    await as(HER, "delete from pins where id = $1", [id]);
    expect(await as(HER, "select * from pins")).toHaveLength(0);
  });

  it("allows one go each at the daily puzzle", async () => {
    await as(HER, "insert into duels (day, seconds) values ('2026-12-01', 300)");
    await expect(as(HER, "insert into duels (day, seconds) values ('2026-12-01', 200)")).rejects.toThrow(/duplicate key/);
    await as(HIM, "insert into duels (day, seconds, mistakes) values ('2026-12-01', 250, 1)");
  });

  it("marks when she accepts her keys, once", async () => {
    await as(HER, "select accept_keys()");
    const [{ accepted_at }] = await as<{ accepted_at: string }>(HIM, "select accepted_at from members where who = 'her'");
    expect(accepted_at).not.toBeNull();
    await as(HER, "select accept_keys()");
    expect((await as<{ accepted_at: string }>(HIM, "select accepted_at from members where who = 'her'"))[0].accepted_at).toEqual(accepted_at);
  });

  it("keeps notification subscriptions private to each phone's owner", async () => {
    await as(HER, `insert into push_subs (endpoint, keys) values ('https://push/1', '{}')`);
    expect(await as(HIM, "select * from push_subs")).toHaveLength(0);
    expect(await as(HER, "select * from push_subs")).toHaveLength(1);
  });

  it("shares settings like the first-meeting date", async () => {
    await as(HIM, "insert into settings values ('first_meeting', '2027-06-01') on conflict (key) do update set value = excluded.value");
    expect(await as(HER, "select value from settings where key = 'first_meeting'")).toEqual([{ value: "2027-06-01" }]);
    expect(await as(STRANGER, "select value from settings")).toHaveLength(0);
  });

  describe("the vault", () => {
    const write = (by: string, seal: string, openOn: string | null = null, title = "A letter") =>
      as<{ id: string }>(by, "insert into vault_letters (title, seal, open_on, body, audio) values ($1, $2, $3, 'the words', 'voice.wav') returning id", [title, seal, openOn]);
    const open = (user: string, id: string) => as<{ r: { body: string; opened_at: string | null } }>(user, "select open_letter($1) as r", [id]);

    it("shows the envelope but never the words before it opens", async () => {
      const [{ id }] = await write(HIM, "date", "2099-12-20", "For your birthday");
      expect(await as(HER, "select id, title, seal, open_on::text as open_on, opened_at from vault_letters")).toEqual([{ id, title: "For your birthday", seal: "date", open_on: "2099-12-20", opened_at: null }]);
      await expect(as(HER, "select body from vault_letters")).rejects.toThrow(/permission denied/);
      await expect(as(HER, "select * from vault_letters")).rejects.toThrow(/permission denied/);
      await expect(open(HER, id)).rejects.toThrow(/STILL_SEALED/);
      // The writer can always read and change their own, until it's opened
      expect((await open(HIM, id))[0].r).toMatchObject({ body: "the words", opened_at: null });
      await as(HIM, "update vault_letters set body = 'better words' where id = $1", [id]);
      await expect(as(HER, "update vault_letters set body = 'mine' where id = $1", [id])).resolves.toEqual([]);
      expect((await open(HIM, id))[0].r.body).toBe("better words");
      expect(await as(STRANGER, "select id from vault_letters")).toHaveLength(0);
    });

    it("opens on its date, and marks it opened for the writer to see", async () => {
      const [{ id }] = await write(HIM, "date", "2020-01-01");
      const [{ r }] = await open(HER, id);
      expect(r.body).toBe("the words");
      expect(r.opened_at).not.toBeNull();
      // Once opened it's hers: no more changes or deleting
      await as(HIM, "update vault_letters set body = 'changed' where id = $1", [id]);
      await as(HIM, "delete from vault_letters where id = $1", [id]);
      expect((await open(HER, id))[0].r.body).toBe("the words");
      await expect(as(HER, "update vault_letters set opened_at = null where id = $1", [id])).rejects.toThrow(/permission denied/);
    });

    it("lets 'open when' letters open whenever she decides", async () => {
      const [{ id }] = await write(HER, "when", null, "Open when you miss me");
      expect((await open(HIM, id))[0].r.body).toBe("the words");
    });

    it("only opens the first-meeting and wedding letters when you both turn your keys", async () => {
      const [{ id }] = await write(HIM, "wedding");
      await expect(open(HER, id)).rejects.toThrow(/STILL_SEALED/);
      expect((await as<{ r: boolean }>(HER, "select turn_key('wedding') as r"))[0].r).toBe(false);
      await expect(open(HER, id)).rejects.toThrow(/STILL_SEALED/);
      // Turning yours again doesn't count twice
      expect((await as<{ r: boolean }>(HER, "select turn_key('wedding') as r"))[0].r).toBe(false);
      // A key turned more than a day ago doesn't count
      await db.query("update vault_keys set turned_at = now() - interval '2 days'");
      expect((await as<{ r: boolean }>(HIM, "select turn_key('wedding') as r"))[0].r).toBe(false);
      expect((await as<{ r: boolean }>(HER, "select turn_key('wedding') as r"))[0].r).toBe(true);
      expect((await open(HER, id))[0].r.body).toBe("the words");
      // The meeting letters are still sealed
      const [{ id: m }] = await write(HIM, "meeting");
      await expect(open(HER, m)).rejects.toThrow(/STILL_SEALED/);
      await expect(as(STRANGER, "select turn_key('meeting')")).rejects.toThrow(/NOT_MEMBER/);
      await expect(as(HER, "insert into vault_unlocks values ('meeting')")).rejects.toThrow(/permission denied/);
    });
  });

  describe("vault extras", () => {
    it("shows the envelope front, keeps the paper, tabs and cards sealed, and lets each tab be torn once", async () => {
      const [{ id }] = await as<{ id: string }>(
        HIM,
        `insert into vault_letters (title, seal, envelope, envelope_photo, body, paper, tabs, cards)
         values ('Open when you have a bad day', 'when', '{"style":"clouds"}', 'him/front.jpg', 'baby,', 'lined',
                 '[{"label":"Strength","note":"You are stronger than this day."},{"label":"Laughter","note":"Remember the citizen?"}]',
                 '["A bad day only lasts 24 hours"]') returning id`,
      );
      expect(await as(HER, "select envelope, envelope_photo from vault_letters")).toEqual([{ envelope: { style: "clouds" }, envelope_photo: "him/front.jpg" }]);
      await expect(as(HER, "select tabs from vault_letters")).rejects.toThrow(/permission denied/);
      await expect(as(HER, "select cards from vault_letters")).rejects.toThrow(/permission denied/);
      await expect(as(HER, "select tear_tab($1, 0)", [id])).rejects.toThrow(/STILL_SEALED/);
      const [{ r }] = await as<{ r: { paper: string; tabs: unknown[]; cards: string[]; torn: number[] } }>(HER, "select open_letter($1) as r", [id]);
      expect(r).toMatchObject({ paper: "lined", cards: ["A bad day only lasts 24 hours"], torn: [] });
      expect(r.tabs).toHaveLength(2);
      expect((await as<{ t: number[] }>(HER, "select tear_tab($1, 1) as t", [id]))[0].t).toEqual([1]);
      expect((await as<{ t: number[] }>(HER, "select tear_tab($1, 1) as t", [id]))[0].t).toEqual([1]);
      await expect(as(HER, "select tear_tab($1, 5)", [id])).rejects.toThrow(/NOT_FOUND/);
      await expect(as(HIM, "select tear_tab($1, 0)", [id])).rejects.toThrow(/NOT_YOURS/);
      await expect(as(HER, "update vault_letters set torn = '[]' where id = $1", [id])).rejects.toThrow(/permission denied/);
    });

    it("opens an 'Open now!' letter straight away", async () => {
      const [{ id }] = await as<{ id: string }>(HIM, "insert into vault_letters (title, seal, body) values ('Open now!', 'now', 'Welcome to the Vault.') returning id");
      expect((await as<{ r: { body: string } }>(HER, "select open_letter($1) as r", [id]))[0].r.body).toBe("Welcome to the Vault.");
      await expect(as(HIM, "insert into vault_letters (title, seal, paper) values ('x', 'now', 'glitter')")).rejects.toThrow(/check constraint/);
    });
  });
});
