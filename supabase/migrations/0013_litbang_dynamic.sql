-- Litbang cards become fully dynamic: admins can add/remove/reorder them
-- from /admin/litbang and toggle whether a card is copied into new warta,
-- instead of a fixed set of 5 seeded rows.
--
-- `key` was only ever used to identify those original fixed seed rows and
-- has no meaning for dynamically-created ones, so it's dropped along with
-- its uniqueness constraint. `active` controls whether the card is
-- included when a new warta snapshots the template (see
-- src/app/api/admin/warta/route.ts) - inactive cards stay in the template
-- list (and any warta that already copied them) but are skipped for new
-- warta going forward.
alter table public.litbang_categories
  drop column if exists key,
  add column if not exists active boolean not null default true;
