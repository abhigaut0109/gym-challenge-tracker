-- 45x5 Gym Challenge Tracker — Supabase schema (v3: squad-scoped visibility)
-- Run this once in your Supabase project's SQL editor (Project -> SQL Editor -> New query).
-- Free tier (500MB DB) is more than enough for this.
--
-- Uses Supabase Auth (email + password) for accounts. Before your friends
-- sign up, go to Authentication -> Providers -> Email in the dashboard and
-- turn OFF "Confirm email" so signup logs people in immediately with no
-- verification step. (If you leave it on, the app still works — it just
-- asks people to click the confirmation email once before their first
-- sign-in.)
--
-- If you already ran the v2 schema (no is_active column, "everyone sees
-- everyone" policies), you don't need to drop and recreate everything —
-- just run the incremental block at the bottom of this file instead of
-- the whole script. Running this whole script again is also safe: every
-- statement is idempotent (create-if-not-exists / create-or-replace /
-- drop-if-exists-then-create).

create extension if not exists pgcrypto;

create table if not exists members (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  squad      text not null default 'Squad Iron',
  is_admin   boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
alter table members add column if not exists is_active boolean not null default true;

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
-- Regular members can see their own squad (and themselves) only. Admins can
-- see and manage everyone. Nobody except an admin can write someone else's
-- data — the only "delete" available anywhere is an admin removing a
-- member, which deactivates their account rather than hard-deleting it
-- (see the note above setMemberAdmin-style functions in db.js for why).

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select coalesce((select is_admin from members where id = auth.uid()), false);
$$;

create or replace function my_squad() returns text
language sql security definer stable as $$
  select squad from members where id = auth.uid();
$$;

alter table members    enable row level security;
alter table sessions   enable row level security;
alter table exclusions enable row level security;
alter table holidays   enable row level security;

drop policy if exists "members readable by signed-in users" on members;
drop policy if exists "members readable by squad or admin"  on members;
create policy "members readable by squad or admin" on members for select using (
  is_admin() or auth.uid() = id or (is_active and squad = my_squad())
);
drop policy if exists "members insert own row" on members;
create policy "members insert own row" on members for insert with check (auth.uid() = id);
drop policy if exists "members update own row or admin" on members;
create policy "members update own row or admin" on members for update using (auth.uid() = id or is_admin());

drop policy if exists "sessions readable by signed-in users" on sessions;
drop policy if exists "sessions readable by squad or admin"  on sessions;
create policy "sessions readable by squad or admin" on sessions for select using (
  member_id = auth.uid() or is_admin()
  or exists (select 1 from members m where m.id = sessions.member_id and m.is_active and m.squad = my_squad())
);
drop policy if exists "sessions insert own" on sessions;
create policy "sessions insert own" on sessions for insert with check (member_id = auth.uid());
drop policy if exists "sessions update own" on sessions;
create policy "sessions update own" on sessions for update using (member_id = auth.uid());
drop policy if exists "sessions delete own" on sessions;
create policy "sessions delete own" on sessions for delete using (member_id = auth.uid());

drop policy if exists "exclusions readable by signed-in users" on exclusions;
drop policy if exists "exclusions readable by squad or admin"  on exclusions;
create policy "exclusions readable by squad or admin" on exclusions for select using (
  member_id = auth.uid() or is_admin()
  or exists (select 1 from members m where m.id = exclusions.member_id and m.is_active and m.squad = my_squad())
);
drop policy if exists "exclusions insert own" on exclusions;
create policy "exclusions insert own" on exclusions for insert with check (member_id = auth.uid());
drop policy if exists "exclusions update by admin" on exclusions;
create policy "exclusions update by admin" on exclusions for update using (is_admin());
drop policy if exists "exclusions delete own" on exclusions;
create policy "exclusions delete own" on exclusions for delete using (member_id = auth.uid());

drop policy if exists "holidays readable by signed-in users" on holidays;
create policy "holidays readable by signed-in users" on holidays for select using (auth.role() = 'authenticated');

-- After your first friend signs up through the app, make them (or yourself)
-- the admin so someone can approve exclusion requests:
--   update members set is_admin = true where email = 'you@example.com';


-- ===========================================================================
-- INCREMENTAL MIGRATION — run just this block if you already have the v2
-- schema set up (skip everything above; this repeats the new/changed bits
-- only, and is safe to run even if some of it already exists).
-- ===========================================================================
--
-- alter table members add column if not exists is_active boolean not null default true;
--
-- create or replace function my_squad() returns text
-- language sql security definer stable as $$
--   select squad from members where id = auth.uid();
-- $$;
--
-- drop policy if exists "members readable by signed-in users" on members;
-- create policy "members readable by squad or admin" on members for select using (
--   is_admin() or auth.uid() = id or (is_active and squad = my_squad())
-- );
--
-- drop policy if exists "sessions readable by signed-in users" on sessions;
-- create policy "sessions readable by squad or admin" on sessions for select using (
--   member_id = auth.uid() or is_admin()
--   or exists (select 1 from members m where m.id = sessions.member_id and m.is_active and m.squad = my_squad())
-- );
--
-- drop policy if exists "exclusions readable by signed-in users" on exclusions;
-- create policy "exclusions readable by squad or admin" on exclusions for select using (
--   member_id = auth.uid() or is_admin()
--   or exists (select 1 from members m where m.id = exclusions.member_id and m.is_active and m.squad = my_squad())
-- );
