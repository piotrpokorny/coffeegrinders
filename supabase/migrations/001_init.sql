-- Przelicznik młynków: baza młynków + zgłoszenia społeczności + moderacja.

create extension if not exists pgcrypto with schema extensions;

-- ── Młynki (tylko zatwierdzone dane) ────────────────────────────────────────
create table public.grinders (
  id                  text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  brand               text not null check (length(brand) between 1 and 80),
  model               text not null check (length(model) between 1 and 80),
  kind                text not null check (kind in ('manual', 'electric')),
  adjustment          text,
  range_min           numeric check (range_min >= 0),
  range_max           numeric check (range_max > 0),
  range_source        text,
  positions           integer check (positions between 2 and 5000),
  clicks_per_rotation integer check (clicks_per_rotation > 0),
  um_per_click        numeric check (um_per_click > 0),
  scale               jsonb not null default '{"type":"unknown"}',
  scale_note          text,
  confidence          text not null default 'C' check (confidence in ('A', 'B', 'C')),
  notes               text,
  updated_at          timestamptz not null default now()
);

-- ── Moderatorzy (dodawani ręcznie przez właściciela projektu) ───────────────
create table public.moderators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.moderators where user_id = auth.uid());
$$;

-- ── Zgłoszenia społeczności ─────────────────────────────────────────────────
create table public.submissions (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('edit', 'new')),
  grinder_id  text references public.grinders (id) on delete set null,
  payload     jsonb not null check (pg_column_size(payload) < 8000),
  source      text not null check (length(source) between 5 and 1000),
  contact     text check (length(contact) <= 200),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  mod_note    text,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);
create index submissions_status_idx on public.submissions (status, created_at);
create index submissions_ip_idx on public.submissions (ip_hash, created_at);

-- Anonimowe zgłoszenia: wymuszenie statusu pending + limit 5/godz. z jednego IP i 300/dobę łącznie.
create function public.submissions_before_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  ip text := coalesce(
    split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
    'unknown');
begin
  new.status := 'pending';
  new.mod_note := null;
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.created_at := now();
  new.ip_hash := encode(digest(ip || current_date::text, 'sha256'), 'hex');

  if (select count(*) from public.submissions
      where ip_hash = new.ip_hash and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Za dużo zgłoszeń – spróbuj ponownie za godzinę.';
  end if;
  if (select count(*) from public.submissions where created_at > now() - interval '1 day') >= 300 then
    raise exception 'Dzienny limit zgłoszeń został wyczerpany – spróbuj jutro.';
  end if;
  return new;
end $$;

create trigger submissions_before_insert before insert on public.submissions
for each row execute function public.submissions_before_insert();

-- ── Historia zmian (jak w wiki) ─────────────────────────────────────────────
create table public.grinder_revisions (
  id            bigint generated always as identity primary key,
  grinder_id    text not null references public.grinders (id) on delete cascade,
  submission_id bigint references public.submissions (id) on delete set null,
  before        jsonb,
  after         jsonb not null,
  source        text,
  created_at    timestamptz not null default now()
);
create index grinder_revisions_grinder_idx on public.grinder_revisions (grinder_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.grinders enable row level security;
alter table public.grinder_revisions enable row level security;
alter table public.submissions enable row level security;
alter table public.moderators enable row level security;

create policy "grinders: odczyt dla wszystkich" on public.grinders
  for select using (true);
create policy "revisions: odczyt dla wszystkich" on public.grinder_revisions
  for select using (true);
create policy "submissions: każdy może zgłosić" on public.submissions
  for insert to anon, authenticated
  with check (status = 'pending' and (type = 'new') = (grinder_id is null));
create policy "submissions: moderator czyta" on public.submissions
  for select to authenticated using (public.is_moderator());
create policy "moderators: moderator widzi siebie" on public.moderators
  for select to authenticated using (user_id = auth.uid());

-- Ograniczenie uprawnień kolumnowych dla zgłoszeń anonimowych.
revoke all on public.submissions from anon, authenticated;
grant insert (type, grinder_id, payload, source, contact) on public.submissions to anon, authenticated;
grant select on public.submissions to authenticated;
revoke all on public.grinders, public.grinder_revisions, public.moderators from anon, authenticated;
grant select on public.grinders, public.grinder_revisions to anon, authenticated;
grant select on public.moderators to authenticated;

-- ── Akcje moderatora ────────────────────────────────────────────────────────
-- Zatwierdza zgłoszenie (opcjonalnie z poprawionym payloadem) i zapisuje rewizję.
create function public.approve_submission(sub_id bigint, final_payload jsonb default null, note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  sub public.submissions;
  p jsonb;
  old_row public.grinders;
  new_row public.grinders;
  gid text;
begin
  if not public.is_moderator() then raise exception 'Brak uprawnień moderatora.'; end if;

  select * into sub from public.submissions where id = sub_id for update;
  if not found or sub.status <> 'pending' then raise exception 'Zgłoszenie nie istnieje lub już je rozpatrzono.'; end if;

  p := coalesce(final_payload, sub.payload) - 'updated_at';

  if sub.type = 'edit' then
    gid := sub.grinder_id;
    select * into old_row from public.grinders where id = gid for update;
    new_row := jsonb_populate_record(old_row, p - 'id');
    new_row.id := gid;
    new_row.updated_at := now();
    update public.grinders set
      brand = new_row.brand, model = new_row.model, kind = new_row.kind, adjustment = new_row.adjustment,
      range_min = new_row.range_min, range_max = new_row.range_max, range_source = new_row.range_source,
      positions = new_row.positions, clicks_per_rotation = new_row.clicks_per_rotation,
      um_per_click = new_row.um_per_click, scale = new_row.scale, scale_note = new_row.scale_note,
      confidence = new_row.confidence, notes = new_row.notes, updated_at = new_row.updated_at
    where id = gid;
  else
    new_row := jsonb_populate_record(null::public.grinders, p);
    gid := new_row.id;
    if gid is null then raise exception 'Nowy młynek wymaga pola id.'; end if;
    new_row.updated_at := now();
    insert into public.grinders select new_row.*;
  end if;

  insert into public.grinder_revisions (grinder_id, submission_id, before, after, source)
  values (gid, sub_id, case when old_row.id is null then null else to_jsonb(old_row) end, to_jsonb(new_row), sub.source);

  update public.submissions
  set status = 'approved', mod_note = note, reviewed_at = now(), reviewed_by = auth.uid(), grinder_id = gid
  where id = sub_id;

  return gid;
end $$;

create function public.reject_submission(sub_id bigint, note text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Brak uprawnień moderatora.'; end if;
  update public.submissions
  set status = 'rejected', mod_note = note, reviewed_at = now(), reviewed_by = auth.uid()
  where id = sub_id and status = 'pending';
  if not found then raise exception 'Zgłoszenie nie istnieje lub już je rozpatrzono.'; end if;
end $$;

revoke all on function public.approve_submission(bigint, jsonb, text) from public, anon;
revoke all on function public.reject_submission(bigint, text) from public, anon;
grant execute on function public.approve_submission(bigint, jsonb, text) to authenticated;
grant execute on function public.reject_submission(bigint, text) to authenticated;
revoke all on function public.submissions_before_insert() from public, anon, authenticated;
