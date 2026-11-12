# Afrofuturismo — O Mural do Futuro

Um site de afrofuturismo onde visitantes deixam visões, frases e ideias no mural e
elas aparecem em tempo real para a comunidade.

## Estrutura de pastas

```
africanidades/
├── app.py                  # Backend Flask + SQLite (desenvolvimento local)
├── requirements.txt        # Dependências Python (apenas Flask para dev local)
├── vercel.json             # Configuração de deploy na Vercel (estático puro)
├── .gitignore
├── .env.example            # Template de variáveis de ambiente (Supabase)
├── index.html              # Frontend (raiz — servido pela Vercel)
├── templates/
│   └── index.html          # Template Flask (desenvolvimento local)
├── static/
│   ├── style.css           # Tema afro-futurista premium (ouro, turquesa, vermelho terra, preto)
│   ├── script.js           # Mural interativo + quiz (Supabase ou Flask)
│   ├── gallery.js          # Galeria de edições (miniaturas, lightbox, carregar mais)
│   ├── stars.js            # Campo de estrelas (início e galeria)
│   └── config.js           # Credenciais do Supabase (preencher para Vercel)
├── api/
│   └── wall.py             # Serverless function (alternativa ao config.js)
├── tools/
│   └── importar_fotos.py   # Carga em lote de fotos na galeria
├── supabase/
│   └── migrations/
│       └── 20240101000000_create_entries.sql
└── mural.db                # SQLite (criado localmente, ignorado no git)
```

## Como rodar localmente

```bash
pip install -r requirements.txt
python app.py
```

Acesse `http://localhost:5000`.

O banco (`mural.db`) é criado automaticamente com 4 entradas semeadas.

## Deploy na Vercel

### Por que Supabase?

A Vercel serve arquivos estáticos (HTML, CSS, JS) — não mantém estado entre
requisições. Como o mural precisa de um banco **persistente** compartilhado, usamos
o **Supabase** (PostgreSQL) como backend. O frontend fala direto com a API REST do
Supabase — sem necessidade de serverless functions.

### Passo 1 — Supabase

1. Crie uma conta gratuita em [supabase.com](https://supabase.com)
2. Crie um novo projeto
3. No **SQL Editor**, cole e execute:
   - `supabase/migrations/20240101000000_create_entries.sql` (só em banco vazio — tem `drop table`)
   - `supabase/migrations/20240102000000_create_gallery.sql` (tabela de fotos + bucket `gallery`)
   - `supabase/migrations/20240103000000_entries_delete_policy.sql` (**obrigatória** para o
     botão X de apagar comentários funcionar; é aditiva, pode rodar a qualquer momento)
4. Em **Settings → API**, copie:
   - **Project URL** (ex: `https://abc123.supabase.co`)
   - **anon/public key** (chave *publishable*)

### Passo 2 — Configurar o frontend

Abra `static/config.js` e cole suas credenciais:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://abc123.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
};
```

> Para teste local, deixe os campos vazios — o site usa o Flask/SQLite automaticamente.

### Passo 3 — Deploy na Vercel

```bash
git add .
git commit -m "Configurar Supabase para Vercel"
git push origin main
```

Na [Vercel](https://vercel.com/new), importe seu repositório GitHub → **Deploy**.
Pronto! Site no ar em segundos.

### Alternativa: Environment Variables da Vercel

Em vez de editar `config.js`, você pode usar variáveis de ambiente:

1. No dashboard da Vercel → **Settings → Environment Variables**
2. Adicione:
   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | sua URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sua chave anon |
3. Modifique `static/config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};
```

### Como funciona

| Modo | Banco | Como funciona |
|---|---|---|
| Local (`python app.py`) | SQLite (`mural.db`) | `script.js` detecta que `SUPABASE_URL` está vazio → usa `/api/wall` (Flask) |
| Vercel | Supabase (PostgreSQL) | `script.js` usa a API REST do Supabase diretamente |

Nenhum código backend Python é servido na Vercel — é **puro HTML/CSS/JS estático**.

## Tecnologias

- **Frontend**: HTML + CSS + JavaScript (vanilla, sem frameworks)
- **Local**: Flask + SQLite
- **Nuvem**: Vercel (hospedagem) + Supabase (banco gratuito)
- **Fontes**: Space Grotesk (UI) + Fraunces (textos)

## Importar muitas fotos de uma vez

O formulário de "adicionar foto" é para casos pontuais. Para colocar uma pasta
inteira na galeria, use o script de carga:

```bash
pip install pillow requests
python tools/importar_fotos.py --origem "C:\caminho\das\fotos" --ano 2024 --quantidade 200
```

O que ele faz:

1. Escolhe `--quantidade` fotos **aleatoriamente** entre as da pasta (com
   `--seed` a seleção é reproduzível; sem ele, sorteia de novo).
2. Ignora o que não for imagem (vídeos, PDFs).
3. Corrige a orientação (fotos de celular deitadas) e redimensiona para
   1600px, com miniatura de 640px — fotos cruas de celular passam de 8 MB e
   estourariam a cota do Storage.
4. Sobe as duas versões no bucket `gallery`, em `2024/` e `2024/thumbs/`.
5. Grava as linhas em `gallery_photos` com a legenda vazia.

Opções: `--somente-lista` (só mostra a seleção), `--full`, `--thumb`,
`--concorrencia`. Fotos que já estão no banco são puladas, então rodar de novo
não duplica nada. O resultado fica em `tools/import_manifest.txt`.

A galeria acha a miniatura por convenção de caminho (`<ano>/thumbs/<arquivo>`),
por isso não foi preciso criar coluna nova no banco.

## Logo

O espaço da logo já está reservado no menu e no rodapé de todas as páginas
(`.brand-logo-slot`, caixa preta com moldura dourada).

Basta salvar a imagem com **fundo preto** em:

```
static/img/logo.png
```

A imagem preenche a caixa automaticamente (`object-fit: contain`) e aparece
tanto no menu quanto no rodapé. Enquanto o arquivo não existir, o nome
**SANKOFUTURO** aparece no lugar — o espaço é o mesmo nos dois casos, então
o layout não muda.

## Páginas

| Página | URL | Descrição |
|---|---|---|
| Início / Mural | `/` | Hero, manifesto, temas, formulário e mural de visões |
| Edições Passadas | `/edicoes.html` | Galeria de fotos organizadas por ano, com formulário para adicionar novas fotos |

## Configurar o Supabase

Execute **ambas** as migrations no **SQL Editor** do Supabase:
1. `supabase/migrations/20240101000000_create_entries.sql` (mural de textos)
2. `supabase/migrations/20240102000000_create_gallery.sql` (galeria de fotos)
