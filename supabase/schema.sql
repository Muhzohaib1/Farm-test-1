-- Mir Farm app: run this once in Supabase → SQL Editor → New query → Run.
-- Then add yourself as owner at the bottom (change the email).

-- Who may use the farm data. Emails must match Supabase Auth users.
-- role 'owner' is shown in the app as Admin, 'manager' as Data entry.
create table if not exists farm_members (
  email text primary key,
  name text,
  role text not null check (role in ('owner', 'manager')),
  created_at timestamptz not null default now()
);

-- Every app record is stored as JSON. `seq` increases on every change so phones
-- can download only what changed since their last sync.
create sequence if not exists records_seq;
create table if not exists records (
  tbl text not null,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default nextval('records_seq'),
  primary key (tbl, id)
);
create index if not exists records_seq_idx on records (seq);

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from farm_members where lower(email) = lower(auth.jwt() ->> 'email') and role = 'owner')
$$;

alter table farm_members enable row level security;
alter table records enable row level security;

drop policy if exists members_read on farm_members;
create policy members_read on farm_members for select using (is_member());
drop policy if exists members_write on farm_members;
create policy members_write on farm_members for all using (is_owner()) with check (is_owner());

drop policy if exists records_read on records;
create policy records_read on records for select using (is_member());
drop policy if exists records_insert on records;
create policy records_insert on records for insert with check (is_member());
drop policy if exists records_update on records;
create policy records_update on records for update using (is_member()) with check (is_member());
-- No delete policy: records are only ever marked deleted, never removed.

-- Upload a batch of records. The newer edit (by updated_at) wins.
create or replace function push_records(rows jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into records (tbl, id, data, updated_at, deleted)
  select r ->> 'tbl', r ->> 'id', r -> 'data', (r ->> 'updated_at')::bigint, coalesce((r ->> 'deleted')::boolean, false)
  from jsonb_array_elements(rows) r
  on conflict (tbl, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        seq = nextval('records_seq')
    where records.updated_at <= excluded.updated_at;
$$;

-- ---------- Daily phone notifications ----------

-- One row per phone that switched on daily reminders.
create table if not exists push_subscriptions (
  endpoint text primary key,
  email text not null,
  subscription jsonb not null,
  tz text not null default 'Asia/Karachi',
  hour int not null default 8 check (hour between 0 and 23),
  lang text not null default 'en' check (lang in ('en', 'ur')),
  last_sent date,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists push_own on push_subscriptions;
create policy push_own on push_subscriptions for all
  using (is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

-- Settings for the server. Phones may read only the public notification key.
create table if not exists app_config (
  key text primary key,
  value text not null
);
alter table app_config enable row level security;
drop policy if exists config_public_read on app_config;
create policy config_public_read on app_config for select using (is_member() and key = 'vapid_public');

-- >>> CHANGE THIS to the owner's email, then run. <<<
insert into farm_members (email, name, role)
values (lower('owner@example.com'), 'Owner', 'owner')
on conflict (email) do nothing;
