create table if not exists public.projects (
  id uuid primary key,
  user_id text not null,
  name text not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
create policy "Users manage their own Clipforge projects"
  on public.projects for all
  using (user_id = auth.jwt() ->> 'email')
  with check (user_id = auth.jwt() ->> 'email');

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-media', 'project-media', false, 536870912)
on conflict (id) do nothing;

create policy "Users manage their own Clipforge media"
  on storage.objects for all
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = (auth.jwt() ->> 'email'))
  with check (bucket_id = 'project-media' and (storage.foldername(name))[1] = (auth.jwt() ->> 'email'));
