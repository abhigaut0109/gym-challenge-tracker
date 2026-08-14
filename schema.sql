-- 45x5 Gym Challenge Tracker — Supabase schema (v2: real accounts)
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor -> New query).
-- Free tier (500MB DB) is more than enough for this.
--
-- Uses Supabase Auth (email + password) for accounts. Before your friends
-- sign up, go to Authentication -> Providers -> Email in the dashboard and
-- turn OFF "Confirm email" so signup logs people in immediately with no
-- verification step. (If you leave it on, the app still works — it just
-- asks people to click the confirmation email once before their first
-- sign-in.)

create extension if not exists pgcrypto;

create table if not exists members (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  squad      text not null default 'Squad Iron',
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  session_date date not null,
  minutes      int not null check (minutes > 0),
  type         text not null default 'Weights',
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists exclusions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  reason     text not null,           -- 'Not well' | 'Travelling' | 'Public holiday'
  from_date  date not null,
  to_date    date not null,
  note       text,
  status     text not null default 'PENDING', -- PENDING | APPROVED | DECLINED
  created_at timestamptz not null default now()
);

create table if not exists holidays (
  holiday_date date primary key,
  name         text not null,
  tag          text not null default 'national'
);

create index if not exists sessions_member_date_idx on sessions (member_id, session_date);
create index if not exists exclusions_status_idx on exclusions (status);

-- Seed a few holidays for the current cycle (edit freely).
insert into holidays (holiday_date, name, tag) values
  ('2026-08-15', 'Independence Day', 'national'),
  ('2026-08-26', 'Janmashtami', 'regional'),
  ('2026-10-02', 'Gandhi Jayanti', 'national'),
  ('2026-10-20', 'Diwali', 'national')
on conflict (holiday_date) do nothing;

-- Row Level Security -------------------------------------------------------
-- Anyone signed in can read everything (that's the point — "everything you
-- log is visible to the whole group"), but people can only write their own
-- sessions/exclusions. Admin actions (approving/declining, promoting) are
-- gated by the is_admin() helper below.

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select is_admin from members where id = auth.uid()), false);
$$;

alter table members    enable row level security;
alter table sessions   enable row level security;
alter table exclusions enable row level security;
alter table holidays   enable row level security;

create policy "members readable by signed-in users" on members for select using (auth.role() = 'authenticated');
create policy "members insert own row"              on members for insert with check (auth.uid() = id);
create policy "members update own row or admin"     on members for update using (auth.uid() = id or is_admin());

create policy "sessions readable by signed-in users" on sessions for select using (auth.role() = 'authenticated');
create policy "sessions insert own"                  on sessions for insert with check (member_id = auth.uid());
create policy "sessions delete own"                  on sessions for delete using (member_id = auth.uid());

create policy "exclusions readable by signed-in users" on exclusions for select using (auth.role() = 'authenticated');
create policy "exclusions insert own"                  on exclusions for insert with check (member_id = auth.uid());
create policy "exclusions update by admin"             on exclusions for update using (is_admin());
create policy "exclusions delete own"                  on exclusions for delete using (member_id = auth.uid());

create policy "holidays readable by signed-in users" on holidays for select using (auth.role() = 'authenticated');

-- After your first friend signs up through the app, make them (or yourself)
-- the admin so someone can approve exclusion requests:
--   update members set is_admin = true where email = 'you@example.com';
