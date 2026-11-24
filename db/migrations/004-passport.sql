-- Passport: swipe on countries; only the ones you both want get stamped, and one is drawn as the first trip.
-- Run once in Supabase → SQL Editor, after 003-vault-extras.sql. Safe to run again.

begin;

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
