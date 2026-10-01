-- Mir Farm: daily phone notifications. Run once in Supabase → SQL Editor → New query → Run.
-- (Already included in schema.sql for new setups.)

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
