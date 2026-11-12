-- Mural do Futuro — habilita exclusão de comentários (botão X no mural)
--
-- Migration ADITIVA: não apaga a tabela nem os comentários existentes.
-- Rode este SQL no Supabase Studio → SQL Editor.
--
-- Sem a policy de delete, o RLS faz o DELETE responder HTTP 200 com corpo
-- vazio e o comentário continua publicado no mural.

drop policy if exists "Authenticated delete" on public.entries;

create policy "Authenticated delete" on public.entries
  for delete using (true);

-- Limpa o comentário temporário criado ao validar a exclusão.
delete from public.entries where name = '__teste_temp__';
