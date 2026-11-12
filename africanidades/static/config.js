/* Configuração do mural.
 *
 * Para rodar LOCALMENTE com Flask/SQLite:
 *   deixe SUPABASE_URL vazio — o script.js usa /api/wall automaticamente.
 *
 * Para rodar na VERCEL:
 *   preencha com suas credenciais do Supabase (chave anon/publishable).
 *   Obtenha em: Settings → API → project URL e anon/public key.
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://aabpywhtailidzwngxpz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_5ESQ7jhJha1uCoLFRyITUg_8p4VvA14",
};
