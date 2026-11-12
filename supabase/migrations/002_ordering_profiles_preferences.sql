-- 002: per-user ordering, profiles, preferences. Run after 001_init.sql.
alter table public.workspaces add column position double precision not null default (extract(epoch from clock_timestamp()) * 1000);
alter table public.folders    add column position double precision not null default (extract(epoch from clock_timestamp()) * 1000);
alter table public.bookmarks  add column position double precision not null default (extract(epoch from clock_timestamp()) * 1000);
-- keep existing rows in their original creation order
update public.workspaces set position = extract(epoch from created_at) * 1000;
update public.folders    set position = extract(epoch from created_at) * 1000;
update public.bookmarks  set position = extract(epoch from created_at) * 1000;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'dark', 'light')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own preferences" on public.user_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- create a profile automatically at signup
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- backfill users who signed up before this migration
insert into public.profiles (id, full_name) select id, coalesce(raw_user_meta_data->>'full_name', '') from auth.users on conflict do nothing;
