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

commit;
