-- Links a login account (profiles) to a congregation roster entry (jemaat).
-- Nullable: not every jemaat has a login, and an account isn't required to
-- represent a specific jemaat (though in practice most admin accounts will).
-- unique: one jemaat should map to at most one login account.
alter table public.profiles
  add column if not exists jemaat_id uuid references public.jemaat (id) on delete set null;

create unique index if not exists profiles_jemaat_id_key on public.profiles (jemaat_id)
  where jemaat_id is not null;
