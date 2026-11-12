-- Mural do Futuro — schema Supabase
-- Limpa e recria a tabela com políticas de acesso.
--
-- ATENÇÃO: este arquivo contém "drop table". Use-o apenas em ambiente vazio.
-- Para habilitar a exclusão de comentários num mural já com dados, rode
-- 20240103000000_entries_delete_policy.sql (aditivo, não apaga nada).
drop table if exists public.entries cascade;

create table public.entries (
  id bigint generated always as identity primary key,
  name text,
  text text not null,
  ts timestamptz not null default now()
);

-- Permite que todos os usuários autenticados leiam todas as entradas.
create policy "Public read access" on public.entries
  for select using (true);

-- Permite que usuários autenticados insiram novas entradas.
create policy "Authenticated insert" on public.entries
  for insert with check (true);

-- Habilita Row Level Security (necessário para as policies funcionarem)
alter table public.entries enable row level security;
alter table public.entries force row level security;
