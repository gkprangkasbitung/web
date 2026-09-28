alter table public.sarana_dana_transactions
  add column if not exists jemaat_id uuid references public.jemaat (id) on delete set null;
