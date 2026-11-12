"""
Afrofuturismo — O Mural do Futuro
Backend em Flask + SQLite (desenvolvimento local).

Como rodar localmente:
    pip install -r requirements.txt
    python app.py
    Abra http://localhost:5000 no navegador.
    O banco de dados (mural.db) é criado automaticamente na primeira execução.

Deploy na Vercel:
    - O backend do mural usa api/wall.py (serverless) + Supabase
    - Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente da Vercel
    - Veja README.md para instruções detalhadas
"""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mural.db"

MAX_TEXT_LEN = 220
MAX_NAME_LEN = 40
MAX_ENTRIES_RETURNED = 60

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                text TEXT NOT NULL,
                ts TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS gallery_photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER NOT NULL,
                image_url TEXT NOT NULL,
                caption TEXT,
                ts TEXT NOT NULL
            )
            """
        )
        db.commit()

        # Semeia o mural com algumas entradas de exemplo, só na primeira vez.
        count = db.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
        if count == 0:
            seeds = [
                ("Coletivo Órbita", "Uma cidade flutuante onde os terreiros são estações de pouso para satélites ancestrais."),
                (None, "Trança de fibra óptica: cada nó guarda a memória de uma geração."),
                ("Zuri", "Naves que só decolam ao som do berimbau — combustível é ritmo."),
                (None, "Um museu do futuro onde os artefatos ainda não foram inventados, só sonhados."),
            ]
            now = datetime.now(timezone.utc)
            for i, (name, text) in enumerate(seeds):
                db.execute(
                    "INSERT INTO entries (name, text, ts) VALUES (?, ?, ?)",
                    (name, text, now.isoformat()),
                )

            # Semente da galeria de fotos
            gallery_seeds = [
                (2026, "https://placehold.co/400x300/8B2323/ffffff?text=Edição+2026", "Próxima edição"),
                (2025, "https://placehold.co/400x300/2fa898/ffffff?text=Edição+2025", "Encontro da edição 2025"),
                (2024, "https://placehold.co/400x300/D4A24C/000000?text=Edição+2024", "Africanidades Ubuntu"),
            ]
            for year, img, cap in gallery_seeds:
                db.execute(
                    "INSERT INTO gallery_photos (year, image_url, caption, ts) VALUES (?, ?, ?, ?)",
                    (year, img, cap, now.isoformat()),
                )
        db.commit()


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

@app.route("/")
@app.route("/index.html")
def index():
    return render_template("index.html")


@app.route("/edicoes")
@app.route("/edicoes.html")
def edicoes():
    return render_template("edicoes.html")


# ---------------------------------------------------------------------------
# API do mural
# ---------------------------------------------------------------------------

@app.route("/api/wall", methods=["GET"])
def get_wall():
    db = get_db()
    rows = db.execute(
        "SELECT id, name, text, ts FROM entries ORDER BY ts DESC LIMIT ?",
        (MAX_ENTRIES_RETURNED,),
    ).fetchall()
    entries = [dict(row) for row in rows]
    return jsonify({"entries": entries})


@app.route("/api/wall", methods=["POST"])
def post_wall():
    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    name = (payload.get("name") or "").strip()

    if not text:
        return jsonify({"error": "invalid_argument", "message": "O texto não pode ficar vazio."}), 400

    text = text[:MAX_TEXT_LEN]
    name = name[:MAX_NAME_LEN] if name else None
    ts = datetime.now(timezone.utc).isoformat()

    db = get_db()
    cur = db.execute(
        "INSERT INTO entries (name, text, ts) VALUES (?, ?, ?)",
        (name, text, ts),
    )
    db.commit()

    entry = {"id": cur.lastrowid, "name": name, "text": text, "ts": ts}
    return jsonify({"entry": entry}), 201


@app.route("/api/wall/<int:id>", methods=["DELETE"])
def delete_wall(id):
    db = get_db()
    cur = db.execute("DELETE FROM entries WHERE id = ?", (id,))
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "not_found", "message": "Comentário não encontrado."}), 404
    return jsonify({"deleted": id}), 200


# ---------------------------------------------------------------------------
# API da galeria (edições passadas)
# ---------------------------------------------------------------------------

MAX_CAPTION_LEN = 120
MAX_GALLERY_RETURNED = 1000


@app.route("/api/gallery", methods=["GET"])
def get_gallery():
    db = get_db()
    rows = db.execute(
        "SELECT id, year, image_url, caption, ts FROM gallery_photos ORDER BY id DESC LIMIT ?",
        (MAX_GALLERY_RETURNED,),
    ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.route("/api/gallery", methods=["POST"])
def post_gallery():
    payload = request.get_json(silent=True) or {}
    image_url = (payload.get("image_url") or "").strip()
    year = payload.get("year")
    caption = (payload.get("caption") or "").strip()

    if not image_url:
        return jsonify({"error": "invalid_argument", "message": "A URL da imagem é obrigatória."}), 400
    if not year:
        return jsonify({"error": "invalid_argument", "message": "O ano é obrigatório."}), 400

    ts = datetime.now(timezone.utc).isoformat()

    db = get_db()
    cur = db.execute(
        "INSERT INTO gallery_photos (year, image_url, caption, ts) VALUES (?, ?, ?, ?)",
        (int(year), image_url[:500], caption[:MAX_CAPTION_LEN] if caption else None, ts),
    )
    db.commit()

    photo = {"id": cur.lastrowid, "year": int(year), "image_url": image_url, "caption": caption, "ts": ts}
    return jsonify(photo), 201


@app.route("/api/gallery/<int:id>", methods=["DELETE"])
def delete_gallery(id):
    db = get_db()
    db.execute("DELETE FROM gallery_photos WHERE id = ?", (id,))
    db.commit()
    return jsonify({"deleted": id}), 200


def gerar_miniatura(origem: Path, destino: Path, lado: int = 640) -> None:
    """Cria a miniatura usada na grade da galeria.
    Sem Pillow instalado, a grade cai automaticamente na foto completa."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return
    try:
        with Image.open(origem) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((lado, lado), Image.LANCZOS)
            img.save(destino, "JPEG", quality=78, optimize=True)
    except Exception:
        return


@app.route("/api/upload", methods=["POST"])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "no_file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "empty_file"}), 400

    upload_dir = BASE_DIR / "static" / "uploads"
    thumbs_dir = upload_dir / "thumbs"
    upload_dir.mkdir(exist_ok=True)
    thumbs_dir.mkdir(exist_ok=True)

    filename = secure_filename(str(int(datetime.now(timezone.utc).timestamp())) + "_" + file.filename)
    file.save(upload_dir / filename)
    gerar_miniatura(upload_dir / filename, thumbs_dir / filename)
    return jsonify({"url": "/static/uploads/" + filename}), 201


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
