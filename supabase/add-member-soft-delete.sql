alter table public.members
  add column if not exists deleted_at timestamptz null;

create index if not exists idx_members_deleted_at on public.members(deleted_at);
