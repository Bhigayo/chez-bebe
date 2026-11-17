-- Adds the Vault to a Chez Bébé database set up before it existed.
-- Run once in Supabase → SQL Editor. Safe to run again.

begin;

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

commit;
