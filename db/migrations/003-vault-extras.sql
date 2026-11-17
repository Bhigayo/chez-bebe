-- Hand-made envelopes, paper, tear-off tabs and little cards for the Vault.
-- Run once in Supabase → SQL Editor, after 002-vault.sql. Safe to run again.

begin;

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

commit;
