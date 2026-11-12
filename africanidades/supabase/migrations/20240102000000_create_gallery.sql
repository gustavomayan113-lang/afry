-- Mural do Futuro — galeria de edições passadas
-- Tabela de fotos organizadas por ano + bucket de storage.

-- (Re)cria a tabela
drop table if exists public.gallery_photos cascade;

create table public.gallery_photos (
  id bigint generated always as identity primary key,
  year integer not null,
  image_url text not null,
  caption text,
  ts timestamptz not null default now()
);

-- Políticas de acesso
create policy "Public read access" on public.gallery_photos
  for select using (true);

create policy "Authenticated insert" on public.gallery_photos
  for insert with check (true);

create policy "Authenticated delete" on public.gallery_photos
  for delete using (true);

alter table public.gallery_photos enable row level security;
alter table public.gallery_photos force row level security;

-- Bucket de storage para upload de imagens
-- Necessário para fazer upload direto do navegador
-- Supabase não permite DELETE direto em storage.buckets, usa insert ... on conflict
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, ARRAY['image/*']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Políticas de acesso para storage.objects (necessário para upload via browser)
-- Remove políticas antigas do bucket gallery se existirem
drop policy if exists "gallery can upload" on storage.objects;
drop policy if exists "gallery can read" on storage.objects;
drop policy if exists "gallery can delete" on storage.objects;

-- Permite upload de imagens no bucket gallery
create policy "gallery can upload" on storage.objects
  for insert with check (bucket_id = 'gallery');

-- Permite leitura de imagens no bucket gallery
create policy "gallery can read" on storage.objects
  for select using (bucket_id = 'gallery');

-- Permite deleção no bucket gallery
create policy "gallery can delete" on storage.objects
  for delete using (bucket_id = 'gallery');

-- Dados de exemplo
insert into public.gallery_photos (year, image_url, caption) values
  (2024, 'https://placehold.co/400x300/2fa898/ffffff?text=Edição+2024', 'Afrofuturismo na Avenida'),
  (2024, 'https://placehold.co/400x300/d6572f/ffffff?text=Círculo+Cósmico', 'Roda de conversa cósmica'),
  (2023, 'https://placehold.co/400x300/e4a939/150e2b?text=Feira+2023', 'Feira de tecnologia ancestral'),
  (2023, 'https://placehold.co/400x300/150e2b/f3e9d2?text=Oficina+2023', 'Oficina de tambores digitais'),
  (2022, 'https://placehold.co/400x300/2fa898/ffffff?text=Lançamento+2022', 'Lançamento do coletivo órbita');
