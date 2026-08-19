create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  employee_id varchar(5) not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_employee_id_five_digits check (employee_id ~ '^[0-9]{5}$'),
  constraint members_employee_id_unique unique (employee_id)
);

create index if not exists idx_members_employee_id on public.members(employee_id);

alter table public.members enable row level security;

drop policy if exists "members_no_public_access" on public.members;
create policy "members_no_public_access" on public.members for all using (false) with check (false);

alter table public.orders
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists idx_orders_member_id on public.orders(member_id);
