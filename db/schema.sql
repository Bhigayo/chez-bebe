-- Chez Bébé: the database. Run once in Supabase → SQL Editor. Safe to run again.
-- Only the two of you can read or write anything. Everyone else, including signed-in strangers, gets nothing.

begin;

/* ---------- The two of you ---------- */
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  who text not null unique check (who in ('her', 'him')),
  name text not null,
  title text not null,
  accepted_at timestamptz
);
alter table public.members enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid())
$$;

drop policy if exists "members see each other" on public.members;
create policy "members see each other" on public.members for select to authenticated using (public.is_member());

-- Her keys: marks the moment she first walked in
create or replace function public.accept_keys() returns void
language sql security definer set search_path = public as $$
  update members set accepted_at = coalesce(accepted_at, now()) where user_id = auth.uid()
$$;

/* ---------- Everything you make together ---------- */
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mood text not null check (mood in ('sun', 'cloud', 'rain')),
  line text,
  note text,
  audio text
);

create table if not exists public.greetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  reply text,
  replied_at timestamptz
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  charge text not null,
  defence text,
  defended_at timestamptz,
  verdict text check (verdict in ('guilty', 'pardoned', 'dismissed')),
  sentence text,
  ruled_at timestamptz
);

create table if not exists public.decrees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  done_at timestamptz
);

create table if not exists public.pins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  place text,
  kind text not null default 'castle' check (kind in ('castle', 'house', 'place', 'dream')),
  image text,
  link text,
  note text
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  for_who text not null check (for_who in ('her', 'him')),
  target int not null check (target > 0),
  pin_id uuid references public.pins (id) on delete set null
);

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  seconds int not null check (seconds > 0),
  mistakes int not null default 0 check (mistakes >= 0),
  unique (day, by) -- one go each, per day
);

create table if not exists public.lore (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quote', 'moment', 'photo', 'voice')),
  text text,
  said_by text check (said_by in ('her', 'him')),
  image text,
  audio text,
  trim_start real,
  trim_end real,
  peaks jsonb,
  happened_on date
);

create table if not exists public.dates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  title text not null,
  note text,
  kind text not null default 'yearly' check (kind in ('yearly', 'anniversary', 'once'))
);

create table if not exists public.here (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade
);

create table if not exists public.saved_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null
);

create table if not exists public.settings (
  key text primary key,
  value text
);

-- Phones that get notifications. Only the server reads other people's.
create table if not exists public.push_subs (
  endpoint text primary key,
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keys jsonb not null
);

/* ---------- Who can do what ---------- */
do $$
declare t text;
begin
  foreach t in array array['checkins', 'greetings', 'cases', 'decrees', 'pins', 'goals', 'duels', 'lore', 'dates', 'here', 'saved_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('drop policy if exists "add" on public.%I', t);
    execute format('drop policy if exists "change" on public.%I', t);
    execute format('drop policy if exists "remove" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (public.is_member())', t);
    execute format('create policy "add" on public.%I for insert to authenticated with check (public.is_member() and by = auth.uid())', t);
    execute format('create policy "change" on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
    -- You can only delete what you made
    execute format('create policy "remove" on public.%I for delete to authenticated using (public.is_member() and by = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.settings enable row level security;
drop policy if exists "read" on public.settings;
drop policy if exists "write" on public.settings;
create policy "read" on public.settings for select to authenticated using (public.is_member());
create policy "write" on public.settings for all to authenticated using (public.is_member()) with check (public.is_member());
revoke all on public.settings, public.members from anon;

alter table public.push_subs enable row level security;
drop policy if exists "own" on public.push_subs;
create policy "own" on public.push_subs for all to authenticated using (by = auth.uid()) with check (by = auth.uid() and public.is_member());
revoke all on public.push_subs from anon;

-- Fair play, enforced here so neither phone can cheat:
-- nobody rewrites who made something or when; you reply to their good morning, not your own;
-- the accused writes the defence, the accuser gives the verdict; decrees are carried out by the other one.
create or replace function public.fair_play() returns trigger
language plpgsql set search_path = public as $$
begin
  new."by" := old."by";
  new.created_at := old.created_at;
  if auth.uid() is null then
    return new; -- the server itself
  end if;
  -- (each table's checks sit in their own block: the others don't have those columns)
  if tg_table_name = 'greetings' then
    if new.reply is distinct from old.reply and auth.uid() = old."by" then
      raise exception 'NOT_YOURS';
    end if;
  elsif tg_table_name = 'cases' then
    if new.defence is distinct from old.defence and auth.uid() = old."by" then
      raise exception 'NOT_YOURS';
    end if;
    if (new.verdict is distinct from old.verdict or new.sentence is distinct from old.sentence) and auth.uid() <> old."by" then
      raise exception 'NOT_YOURS';
    end if;
    if old.verdict is not null and new.verdict is distinct from old.verdict then
      raise exception 'ALREADY_RULED';
    end if;
  elsif tg_table_name = 'decrees' then
    if new.done_at is distinct from old.done_at and auth.uid() = old."by" then
      raise exception 'NOT_YOURS';
    end if;
  elsif auth.uid() <> old."by" then
    raise exception 'NOT_YOURS'; -- everything else, only the one who made it can edit
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['checkins', 'greetings', 'cases', 'decrees', 'pins', 'goals', 'duels', 'lore', 'dates', 'here', 'saved_notes'] loop
    execute format('drop trigger if exists fair_play on public.%I', t);
    execute format('create trigger fair_play before update on public.%I for each row execute function public.fair_play()', t);
  end loop;
end $$;

revoke all on function public.is_member(), public.accept_keys() from public, anon;
grant execute on function public.is_member(), public.accept_keys() to authenticated;

/* ---------- Supabase extras (skipped when testing) ---------- */
do $$
begin
  -- Private storage for photos and voice notes
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('chez', 'chez', false) on conflict (id) do nothing;
    drop policy if exists "chez read" on storage.objects;
    drop policy if exists "chez add" on storage.objects;
    drop policy if exists "chez remove" on storage.objects;
    create policy "chez read" on storage.objects for select to authenticated using (bucket_id = 'chez' and public.is_member());
    create policy "chez add" on storage.objects for insert to authenticated with check (bucket_id = 'chez' and public.is_member());
    create policy "chez remove" on storage.objects for delete to authenticated using (bucket_id = 'chez' and public.is_member() and owner = auth.uid());
  end if;
  -- Live updates, so things appear on the other phone straight away
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.checkins, public.greetings, public.cases, public.decrees, public.pins, public.goals, public.duels, public.lore, public.dates, public.here, public.saved_notes, public.settings, public.members;
    exception when duplicate_object then
      null; -- already added
    end;
  end if;
end $$;

/* ---------- The Vault: letters that stay sealed until their moment ---------- */
-- The words, photos and voice notes in a letter can't be read by the other one before it opens,
-- not even by asking the database directly. Only the envelope (who, what for, when) is visible.

create table if not exists public.vault_letters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,                 -- what's written on the envelope
  seal text not null check (seal in ('date', 'when', 'meeting', 'wedding')),
  open_on date,                        -- for 'date' seals
  body text,
  image text,
  audio text,
  peaks jsonb,
  opened_at timestamptz,               -- when the other one opened it
  check (seal <> 'date' or open_on is not null)
);

-- "Turn your key": the first meeting and the wedding letters open only when you both turn yours, the same day
create table if not exists public.vault_keys (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occasion text not null check (occasion in ('meeting', 'wedding')),
  turned_at timestamptz not null default now(),
  primary key (user_id, occasion)
);
create table if not exists public.vault_unlocks (
  occasion text primary key check (occasion in ('meeting', 'wedding')),
  unlocked_at timestamptz not null default now()
);
-- A tiny table that only says "something in the Vault changed", so the other phone updates
-- without the letters themselves ever being sent over the live connection
create table if not exists public.vault_pulse (
  id int primary key default 1 check (id = 1),
  at timestamptz not null default now()
);
insert into public.vault_pulse (id) values (1) on conflict do nothing;

alter table public.vault_letters enable row level security;
alter table public.vault_keys enable row level security;
alter table public.vault_unlocks enable row level security;
alter table public.vault_pulse enable row level security;

drop policy if exists "envelopes" on public.vault_letters;
drop policy if exists "write" on public.vault_letters;
drop policy if exists "edit before opened" on public.vault_letters;
drop policy if exists "remove before opened" on public.vault_letters;
create policy "envelopes" on public.vault_letters for select to authenticated using (public.is_member());
create policy "write" on public.vault_letters for insert to authenticated with check (public.is_member() and by = auth.uid());
create policy "edit before opened" on public.vault_letters for update to authenticated using (by = auth.uid() and opened_at is null) with check (by = auth.uid() and opened_at is null);
create policy "remove before opened" on public.vault_letters for delete to authenticated using (by = auth.uid() and opened_at is null);

-- Only the envelope can be read directly; the contents come through open_letter()
revoke all on public.vault_letters from anon, authenticated;
grant select (id, created_at, by, title, seal, open_on, opened_at) on public.vault_letters to authenticated;
grant insert (title, seal, open_on, body, image, audio, peaks) on public.vault_letters to authenticated;
grant update (title, seal, open_on, body, image, audio, peaks) on public.vault_letters to authenticated;
grant delete on public.vault_letters to authenticated;

drop policy if exists "read" on public.vault_keys;
drop policy if exists "read" on public.vault_unlocks;
drop policy if exists "read" on public.vault_pulse;
create policy "read" on public.vault_keys for select to authenticated using (public.is_member());
create policy "read" on public.vault_unlocks for select to authenticated using (public.is_member());
create policy "read" on public.vault_pulse for select to authenticated using (public.is_member());
revoke all on public.vault_keys, public.vault_unlocks, public.vault_pulse from anon, authenticated;
grant select on public.vault_keys, public.vault_unlocks, public.vault_pulse to authenticated;

create or replace function public.vault_pulse_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update vault_pulse set at = now() where id = 1;
  return null;
end $$;
drop trigger if exists pulse on public.vault_letters;
create trigger pulse after insert or update or delete on public.vault_letters for each statement execute function public.vault_pulse_bump();

/** Is this letter's moment here? */
create or replace function public.letter_ready(p_seal text, p_open_on date) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_seal
    when 'when' then true
    when 'date' then p_open_on <= (now() at time zone 'Europe/London')::date
    else exists (select 1 from vault_unlocks where occasion = p_seal)
  end
$$;

-- Opens a letter: the writer can always read their own; the other one only when its moment has come.
-- Opening marks it as opened, which lets the writer know.
create or replace function public.open_letter(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v vault_letters;
begin
  if not is_member() then
    raise exception 'NOT_MEMBER';
  end if;
  select * into v from vault_letters where id = p_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v."by" <> auth.uid() then
    if not letter_ready(v.seal, v.open_on) then
      raise exception 'STILL_SEALED';
    end if;
    if v.opened_at is null then
      update vault_letters set opened_at = now() where id = p_id returning * into v;
    end if;
  end if;
  return jsonb_build_object('id', v.id, 'body', v.body, 'image', v.image, 'audio', v.audio, 'peaks', v.peaks, 'opened_at', v.opened_at);
end $$;

-- Turn your key. When you've both turned yours within the same 24 hours, those letters open, for good.
create or replace function public.turn_key(p_occasion text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then
    raise exception 'NOT_MEMBER';
  end if;
  if p_occasion not in ('meeting', 'wedding') then
    raise exception 'BAD_OCCASION';
  end if;
  insert into vault_keys (user_id, occasion, turned_at) values (auth.uid(), p_occasion, now())
  on conflict (user_id, occasion) do update set turned_at = now();
  if (select count(*) from vault_keys k join members m on m.user_id = k.user_id
      where k.occasion = p_occasion and k.turned_at > now() - interval '24 hours') >= 2 then
    insert into vault_unlocks (occasion) values (p_occasion) on conflict do nothing;
  end if;
  update vault_pulse set at = now() where id = 1;
  return exists (select 1 from vault_unlocks where occasion = p_occasion);
end $$;

revoke all on function public.letter_ready(text, date), public.open_letter(uuid), public.turn_key(text) from public, anon;
grant execute on function public.letter_ready(text, date), public.open_letter(uuid), public.turn_key(text) to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Never the letters themselves: only the pulse, the keys and the unlocks
    foreach t in array array['vault_pulse', 'vault_keys', 'vault_unlocks'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end $$;

/* ---------- The Vault, made by hand: envelope fronts, paper, tear-off tabs, little cards ---------- */
alter table public.vault_letters add column if not exists envelope jsonb;       -- the style picked for the front (visible)
alter table public.vault_letters add column if not exists envelope_photo text;  -- or a photo of a hand-drawn front (visible)
alter table public.vault_letters add column if not exists paper text;           -- lined, cream or kraft (sealed)
alter table public.vault_letters add column if not exists tabs jsonb;           -- "take what you need": [{label, note}] (sealed)
alter table public.vault_letters add column if not exists cards jsonb;          -- little cards tucked in: ["…"] (sealed)
alter table public.vault_letters add column if not exists torn jsonb not null default '[]'; -- which tabs she's torn off

-- "Open now!": ready straight away, no "is this the moment?"
alter table public.vault_letters drop constraint if exists vault_letters_seal_check;
alter table public.vault_letters add constraint vault_letters_seal_check check (seal in ('date', 'when', 'meeting', 'wedding', 'now'));
alter table public.vault_letters drop constraint if exists vault_letters_paper_check;
alter table public.vault_letters add constraint vault_letters_paper_check check (paper is null or paper in ('lined', 'cream', 'kraft'));

grant select (envelope, envelope_photo) on public.vault_letters to authenticated;
grant insert (envelope, envelope_photo, paper, tabs, cards) on public.vault_letters to authenticated;
grant update (envelope, envelope_photo, paper, tabs, cards) on public.vault_letters to authenticated;

create or replace function public.letter_ready(p_seal text, p_open_on date) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_seal
    when 'when' then true
    when 'now' then true
    when 'date' then p_open_on <= (now() at time zone 'Europe/London')::date
    else exists (select 1 from vault_unlocks where occasion = p_seal)
  end
$$;

create or replace function public.open_letter(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v vault_letters;
begin
  if not is_member() then
    raise exception 'NOT_MEMBER';
  end if;
  select * into v from vault_letters where id = p_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v."by" <> auth.uid() then
    if not letter_ready(v.seal, v.open_on) then
      raise exception 'STILL_SEALED';
    end if;
    if v.opened_at is null then
      update vault_letters set opened_at = now() where id = p_id returning * into v;
    end if;
  end if;
  return jsonb_build_object('id', v.id, 'body', v.body, 'image', v.image, 'audio', v.audio, 'peaks', v.peaks, 'opened_at', v.opened_at,
    'paper', v.paper, 'tabs', v.tabs, 'cards', v.cards, 'torn', v.torn);
end $$;

-- Tear off one "take what you need" tab. Only the one it was written for, only once it's open, each tab once.
create or replace function public.tear_tab(p_id uuid, p_index int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v vault_letters;
begin
  select * into v from vault_letters where id = p_id for update;
  if not found or not is_member() then
    raise exception 'NOT_FOUND';
  end if;
  if v."by" = auth.uid() then
    raise exception 'NOT_YOURS';
  end if;
  if v.opened_at is null then
    raise exception 'STILL_SEALED';
  end if;
  if v.tabs is null or p_index < 0 or p_index >= jsonb_array_length(v.tabs) then
    raise exception 'NOT_FOUND';
  end if;
  if not v.torn @> to_jsonb(p_index) then
    update vault_letters set torn = torn || to_jsonb(p_index) where id = p_id returning * into v;
  end if;
  return v.torn;
end $$;

revoke all on function public.tear_tab(uuid, int) from public, anon;
grant execute on function public.tear_tab(uuid, int) to authenticated;

/* ---------- Passport: swipe on countries. Only the ones you both say yes to get stamped. ---------- */
-- Your swipes are yours alone: the other one can never read them, not even by asking the database.
-- All either of you ever sees is the matches, how far along the other is, and the first trip once it's drawn.

create table if not exists public.passport_swipes (
  by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  country text not null check (country ~ '^[A-Z]{2}$'),
  choice text not null check (choice in ('yes', 'no', 'super')),
  created_at timestamptz not null default now(),
  primary key (by, country)
);
-- One Super Like each, ever
create unique index if not exists passport_one_super on public.passport_swipes (by) where choice = 'super';

-- "Seal my passport": once you've both sealed yours, one match is drawn as the first trip
create table if not exists public.passport_ready (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create table if not exists public.passport_trip (
  id int primary key default 1 check (id = 1),
  country text not null,
  drawn_at timestamptz not null default now()
);
-- Only says "something changed", so the other phone updates without the swipes being sent
create table if not exists public.passport_pulse (
  id int primary key default 1 check (id = 1),
  at timestamptz not null default now()
);
insert into public.passport_pulse (id) values (1) on conflict do nothing;

alter table public.passport_swipes enable row level security;
alter table public.passport_ready enable row level security;
alter table public.passport_trip enable row level security;
alter table public.passport_pulse enable row level security;

create or replace function public.passport_sealed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from passport_ready where user_id = auth.uid())
$$;

/** Do you both want to go? Yes from both, or a Super Like from either. Only once both have swiped. */
create or replace function public.passport_is_match(p_country text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from passport_swipes a join passport_swipes b on b.country = a.country and b."by" <> a."by"
    join members ma on ma.user_id = a."by" join members mb on mb.user_id = b."by"
    where a.country = p_country and (a.choice = 'super' or b.choice = 'super' or (a.choice = 'yes' and b.choice = 'yes'))
  )
$$;

drop policy if exists "own" on public.passport_swipes;
drop policy if exists "swipe" on public.passport_swipes;
drop policy if exists "undo" on public.passport_swipes;
create policy "own" on public.passport_swipes for select to authenticated using (by = auth.uid() and public.is_member());
create policy "swipe" on public.passport_swipes for insert to authenticated with check (by = auth.uid() and public.is_member() and not public.passport_sealed());
-- Take a swipe back, until your passport is sealed. Not once it's made a match: a stamp is a stamp.
create policy "undo" on public.passport_swipes for delete to authenticated using (by = auth.uid() and not public.passport_sealed() and not public.passport_is_match(country));
revoke all on public.passport_swipes from anon, authenticated;
grant select, delete on public.passport_swipes to authenticated;
grant insert (country, choice) on public.passport_swipes to authenticated;

drop policy if exists "read" on public.passport_ready;
drop policy if exists "read" on public.passport_trip;
drop policy if exists "read" on public.passport_pulse;
create policy "read" on public.passport_ready for select to authenticated using (public.is_member());
create policy "read" on public.passport_trip for select to authenticated using (public.is_member());
create policy "read" on public.passport_pulse for select to authenticated using (public.is_member());
revoke all on public.passport_ready, public.passport_trip, public.passport_pulse from anon, authenticated;
grant select on public.passport_ready, public.passport_trip, public.passport_pulse to authenticated;

create or replace function public.passport_pulse_bump() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update passport_pulse set at = now() where id = 1;
  return null;
end $$;
drop trigger if exists pulse on public.passport_swipes;
create trigger pulse after insert or delete on public.passport_swipes for each statement execute function public.passport_pulse_bump();

-- The stamps: every country you both want. super_by says whose Super Like got it in.
create or replace function public.passport_matches() returns table (country text, matched_at timestamptz, super_by text)
language sql stable security definer set search_path = public as $$
  select a.country, greatest(a.created_at, b.created_at),
    case when a.choice = 'super' and b.choice = 'super' then 'both' when a.choice = 'super' then 'him' when b.choice = 'super' then 'her' end
  from passport_swipes a
  join members ma on ma.user_id = a."by" and ma.who = 'him'
  join passport_swipes b on b.country = a.country
  join members mb on mb.user_id = b."by" and mb.who = 'her'
  where public.is_member() and (a.choice = 'super' or b.choice = 'super' or (a.choice = 'yes' and b.choice = 'yes'))
  order by 2
$$;

-- How far along each of you is: a count, never which way you swiped
create or replace function public.passport_progress() returns table (who text, swiped int, sealed boolean, super_used boolean)
language sql stable security definer set search_path = public as $$
  select m.who,
    (select count(*)::int from passport_swipes s where s."by" = m.user_id),
    exists (select 1 from passport_ready r where r.user_id = m.user_id),
    exists (select 1 from passport_swipes s where s."by" = m.user_id and s.choice = 'super')
  from members m where public.is_member()
$$;

-- Seal your passport. When you've both sealed yours, one of your matches is drawn at random: the first trip.
create or replace function public.passport_seal() returns text
language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if not is_member() then
    raise exception 'NOT_MEMBER';
  end if;
  insert into passport_ready (user_id) values (auth.uid()) on conflict do nothing;
  if (select count(*) from passport_ready r join members m on m.user_id = r.user_id) >= 2 then
    select country into v from passport_matches() order by random() limit 1;
    if v is not null then
      insert into passport_trip (id, country) values (1, v) on conflict do nothing;
    end if;
  end if;
  update passport_pulse set at = now() where id = 1;
  return (select country from passport_trip where id = 1);
end $$;

revoke all on function public.passport_sealed(), public.passport_is_match(text), public.passport_matches(), public.passport_progress(), public.passport_seal() from public, anon;
grant execute on function public.passport_sealed(), public.passport_is_match(text), public.passport_matches(), public.passport_progress(), public.passport_seal() to authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    -- Never the swipes themselves
    foreach t in array array['passport_pulse', 'passport_ready', 'passport_trip'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end $$;

commit;
