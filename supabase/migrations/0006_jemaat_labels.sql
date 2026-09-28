-- Turns jemaat.label (free text, one value) into a proper many-to-many
-- relationship: label_jemaat is a manageable list (own admin page, same
-- pattern as `tempat`), and jemaat_labels lets one jemaat hold more than
-- one label (e.g. both "Majelis Jemaat" and "Anggota Komisi").

create table public.label_jemaat (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.jemaat_labels (
  jemaat_id uuid not null references public.jemaat (id) on delete cascade,
  label_id uuid not null references public.label_jemaat (id) on delete cascade,
  primary key (jemaat_id, label_id)
);

-- Backfill: turn any existing free-text jemaat.label values into rows in
-- the new tables instead of just dropping the data.
insert into public.label_jemaat (nama)
select distinct label
from public.jemaat
where label is not null and trim(label) <> ''
on conflict (nama) do nothing;

insert into public.jemaat_labels (jemaat_id, label_id)
select j.id, l.id
from public.jemaat j
join public.label_jemaat l on l.nama = j.label
where j.label is not null and trim(j.label) <> ''
on conflict do nothing;

alter table public.jemaat drop column if exists label;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.label_jemaat enable row level security;
alter table public.jemaat_labels enable row level security;

create policy "label_jemaat_select" on public.label_jemaat
  for select using (true);

create policy "label_jemaat_write" on public.label_jemaat
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));

create policy "jemaat_labels_select" on public.jemaat_labels
  for select using (true);

create policy "jemaat_labels_write" on public.jemaat_labels
  for all
  using (public.has_permission(auth.uid(), 'warta', 'update'))
  with check (public.has_permission(auth.uid(), 'warta', 'update'));
