-- LinkVault schema. Run in Supabase > SQL Editor (or `supabase db push`).
-- Every row is owned by a user; Row Level Security restricts all access to the owner.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete restrict, -- never silently drops subfolders
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete restrict, -- folders must be emptied first
  title text not null,
  url text not null,
  description text not null default '',
  category text not null default '',
  notes text not null default '',
  favorite boolean not null default false,
  archived boolean not null default false,
  last_accessed timestamptz,
  created_at timestamptz not null default now()
);

create index on public.folders (workspace_id, parent_id);
create index on public.bookmarks (workspace_id, folder_id);
create index on public.bookmarks (user_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.folders enable row level security;
alter table public.bookmarks enable row level security;

create policy "own workspaces" on public.workspaces for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own folders" on public.folders for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid()));
create policy "own bookmarks" on public.bookmarks for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid()));
