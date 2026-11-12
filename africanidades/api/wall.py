"""
API do Mural — versão Vercel (serverless) usando Supabase.

Esta função substitui a rota /api/wall do app.py Flask.
Em Vercel, arquivos em api/ se tornam serverless functions automaticamente.

Variáveis de ambiente necessárias (.env.local na Vercel):
  SUPABASE_URL    — URL do projeto Supabase
  SUPABASE_ANON_KEY — Chave anônima (service_role opcional para escrita)

Como funciona:
  - GET  /api/wall  → devolve as últimas entradas do mural (Supabase)
  - POST /api/wall  → insere uma nova entrada no mural (Supabase)
"""

import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request

from supabase import create_client

app = Flask(__name__)

MAX_TEXT_LEN = 220
MAX_NAME_LEN = 40
MAX_ENTRIES_RETURNED = 60


def _get_supabase():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL e SUPABASE_ANON_KEY não configurados")
    return create_client(url, key)


@app.route("/api/wall", methods=["GET"])
def get_wall():
    try:
        supabase = _get_supabase()
    except RuntimeError as exc:
        return jsonify({"error": "config_error", "message": str(exc)}), 500

    rows = (
        supabase.table("entries")
        .select("id, name, text, ts")
        .order("ts", desc=True)
        .limit(MAX_ENTRIES_RETURNED)
        .execute()
    )

    entries = []
    for row in rows.data or []:
        entries.append(
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "text": row.get("text"),
                "ts": row.get("ts"),
            }
        )

    return jsonify({"entries": entries})


@app.route("/api/wall", methods=["POST"])
def post_wall():
    try:
        supabase = _get_supabase()
    except RuntimeError as exc:
        return jsonify({"error": "config_error", "message": str(exc)}), 500

    payload = request.get_json(silent=True) or {}
    text = (payload.get("text") or "").strip()
    name = (payload.get("name") or "").strip()

    if not text:
        return (
            jsonify(
                {
                    "error": "invalid_argument",
                    "message": "O texto não pode ficar vazio.",
                }
            ),
            400,
        )

    text = text[:MAX_TEXT_LEN]
    name = name[:MAX_NAME_LEN] if name else None
    ts = datetime.now(timezone.utc).isoformat()

    result = (
        supabase.table("entries")
        .insert({"name": name, "text": text, "ts": ts})
        .execute()
    )

    inserted = result.data[0] if result.data else {}
    entry = {
        "id": inserted.get("id"),
        "name": name,
        "text": text,
        "ts": ts,
    }
    return jsonify({"entry": entry}), 201


@app.route("/api/wall/<int:id>", methods=["DELETE"])
def delete_wall(id):
    try:
        supabase = _get_supabase()
    except RuntimeError as exc:
        return jsonify({"error": "config_error", "message": str(exc)}), 500

    result = (
        supabase.table("entries")
        .delete()
        .eq("id", id)
        .execute()
    )

    if not result.data:
        return (
            jsonify({"error": "not_found", "message": "Comentário não encontrado."}),
            404,
        )
    return jsonify({"deleted": id}), 200


if __name__ == "__main__":
    app.run(debug=True, port=5000)
