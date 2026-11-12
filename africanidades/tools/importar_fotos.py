"""
Importa uma pasta de fotos para o mural: sobe para o Supabase Storage
(versão completa + miniatura) e registra as linhas na tabela gallery_photos.

Uso:
    python tools/importar_fotos.py --origem "C:\\caminho\\das\\fotos" --ano 2024 --quantidade 200

Opções úteis:
    --somente-lista   só mostra quais fotos seriam escolhidas (não faz nada)
    --seed 2024       mantém a seleção aleatória reproduzível
    --full 1600       lado maior da foto completa, em pixels
    --thumb 640       lado maior da miniatura, em pixels
    --concorrencia 6  quantas fotos sobem ao mesmo tempo

As credenciais são lidas de static/config.js.
"""

import argparse
import io
import json
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "static" / "config.js"
MANIFEST_PATH = BASE_DIR / "tools" / "import_manifest.txt"
BUCKET = "gallery"
EXTENSOES = {".jpg", ".jpeg", ".png", ".webp"}


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

def ler_config():
    texto = CONFIG_PATH.read_text(encoding="utf-8")
    url = re.search(r'SUPABASE_URL:\s*"([^"]*)"', texto)
    key = re.search(r'SUPABASE_ANON_KEY:\s*"([^"]*)"', texto)
    if not url or not key or not url.group(1) or not key.group(1):
        sys.exit("Supabase não configurado em static/config.js")
    return url.group(1).rstrip("/"), key.group(1)


def cabecalhos(key, extras=None):
    h = {"apikey": key, "Authorization": "Bearer " + key}
    if extras:
        h.update(extras)
    return h


def slug(nome):
    """Nome de arquivo seguro para URL, mantendo a identidade da foto."""
    base = Path(nome).stem
    limpo = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_")
    return limpo or "foto"


# ---------------------------------------------------------------------------
# Seleção
# ---------------------------------------------------------------------------

def listar_fotos(origem, filtro=None):
    pasta = Path(origem)
    if not pasta.is_dir():
        sys.exit("Pasta não encontrada: " + str(pasta))

    fotos, ignorados = [], []
    for arquivo in sorted(pasta.rglob("*")):
        if not arquivo.is_file():
            continue
        if filtro and filtro.lower() not in arquivo.name.lower():
            ignorados.append(arquivo)
        elif arquivo.suffix.lower() in EXTENSOES:
            fotos.append(arquivo)
        else:
            ignorados.append(arquivo)
    return fotos, ignorados


def escolher(fotos, quantidade, seed):
    if quantidade <= 0 or quantidade >= len(fotos):
        return list(fotos)
    sorteio = random.Random(seed)
    return sorteio.sample(fotos, quantidade)


# ---------------------------------------------------------------------------
# Imagem
# ---------------------------------------------------------------------------

def processar(caminho, lado_full, lado_thumb):
    """Abre, corrige a orientação e devolve (bytes_full, bytes_thumb)."""
    with Image.open(caminho) as original:
        imagem = ImageOps.exif_transpose(original)
        if imagem.mode in ("RGBA", "LA", "P"):
            fundo = Image.new("RGB", imagem.size, (0, 0, 0))
            imagem = imagem.convert("RGBA")
            fundo.paste(imagem, mask=imagem.split()[-1])
            imagem = fundo
        else:
            imagem = imagem.convert("RGB")

        def salvar(lado, qualidade):
            copia = imagem.copy()
            copia.thumbnail((lado, lado), Image.LANCZOS)
            buffer = io.BytesIO()
            copia.save(buffer, "JPEG", quality=qualidade, optimize=True, progressive=True)
            return buffer.getvalue()

        return salvar(lado_full, 82), salvar(lado_thumb, 78)


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

def subir(url, key, caminho, dados, tentativas=3):
    for tentativa in range(tentativas):
        try:
            resposta = requests.post(
                url + "/storage/v1/object/" + BUCKET + "/" + caminho,
                headers=cabecalhos(key, {"Content-Type": "image/jpeg", "x-upsert": "true"}),
                data=dados,
                timeout=120,
            )
            if resposta.status_code in (200, 201):
                return True, caminho, None
            if resposta.status_code in (400, 401, 403, 404) and tentativa == tentativas - 1:
                return False, caminho, resposta.text[:200]
        except requests.RequestException as erro:
            if tentativa == tentativas - 1:
                return False, caminho, str(ero)[:200]
        time.sleep(1.5 * (tentativa + 1))
    return False, caminho, "sem resposta"


def urls_publicas(url, caminho):
    return url + "/storage/v1/object/public/" + BUCKET + "/" + caminho


def existe_no_storage(url, caminho):
    """True se o objeto já estiver no bucket.

    Importações interrompidas deixam arquivos no storage sem linha na tabela.
    Reenviá-los falha (x-upsert exige policy de UPDATE), então com
    --reaproveitar reaproveitamos o que já está lá em vez de subir de novo.
    """
    try:
        resposta = requests.head(urls_publicas(url, caminho), timeout=30)
        return resposta.status_code == 200
    except requests.RequestException:
        return False


def linhas_existentes(url, key, ano):
    resposta = requests.get(
        url + "/rest/v1/gallery_photos",
        params={"select": "id,image_url", "year": "eq." + str(ano)},
        headers=cabecalhos(key, {"Accept": "application/json"}),
        timeout=60,
    )
    resposta.raise_for_status()
    return {linha["image_url"] for linha in resposta.json()}


def inserir(url, key, ano, linhas):
    """Insere as linhas em lotes de 50 (limite seguro do PostgREST)."""
    inseridas = 0
    for inicio in range(0, len(linhas), 50):
        lote = linhas[inicio:inicio + 50]
        resposta = requests.post(
            url + "/rest/v1/gallery_photos",
            headers=cabecalhos(key, {
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            }),
            data=json.dumps(lote),
            timeout=120,
        )
        if resposta.status_code not in (200, 201):
            raise SystemExit("Falha ao inserir: " + resposta.status_code + " " + resposta.text[:300])
        inseridas += len(lote)
        print("   inseridas " + str(inseridas) + "/" + str(len(linhas)))
    return inseridas


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    analise = argparse.ArgumentParser()
    analise.add_argument("--origem", required=True, help="pasta com as fotos")
    analise.add_argument("--ano", type=int, required=True, help="ano da edição")
    analise.add_argument(
        "--filtro",
        default=None,
        help="só importa arquivos cujo nome contenha esse texto (ex.: Reconcilavo)",
    )
    analise.add_argument("--legenda", default=None, help="legenda aplicada a todas as fotos")
    analise.add_argument("--quantidade", type=int, default=0, help="quantas fotos (0 = todas)")
    analise.add_argument("--seed", type=int, default=2024, help="semente da seleção aleatória")
    analise.add_argument("--full", type=int, default=1600, help="lado maior da foto completa")
    analise.add_argument("--thumb", type=int, default=640, help="lado maior da miniatura")
    analise.add_argument("--concorrencia", type=int, default=6)
    analise.add_argument("--somente-lista", action="store_true")
    analise.add_argument(
        "--reaproveitar",
        action="store_true",
        help="reaproveita arquivos que já estão no storage em vez de reenviar",
    )
    args = analise.parse_args()

    url, key = ler_config()
    fotos, ignorados = listar_fotos(args.origem, args.filtro)
    escolhidas = escolher(fotos, args.quantidade, args.seed)

    print("Fotos de imagem encontradas: " + str(len(fotos)))
    if ignorados:
        print("Ignorados (não são imagem): " + str(len(ignorados)))
        for arquivo in ignorados[:10]:
            print("   - " + arquivo.name)
    print("Selecionadas para " + str(args.ano) + ": " + str(len(escolhidas)))

    if args.somente_lista:
        for arquivo in escolhidas:
            print("   " + arquivo.name)
        return

    existentes = linhas_existentes(url, key, args.ano)
    print("Já cadastradas em " + str(args.ano) + ": " + str(len(existentes)))

    trabalhos = []
    for arquivo in escolhidas:
        destino = str(args.ano) + "/" + slug(arquivo.name) + ".jpg"
        if urls_publicas(url, destino) in existentes:
            print("   já existe, pulando: " + arquivo.name)
            continue
        trabalhos.append((arquivo, destino))

    if not trabalhos:
        print("Nada novo para enviar.")
        return

    manifesto = ["origem: " + str(args.origem), "ano: " + str(args.ano),
                 "seed: " + str(args.seed), "selecionadas: " + str(len(escolhidas)),
                 "enviadas: " + str(len(trabalhos)), ""]

    def trabalho(item):
        arquivo, destino = item
        nome_thumb = str(args.ano) + "/thumbs/" + Path(destino).name

        linha = {
            "year": args.ano,
            "image_url": urls_publicas(url, destino),
            "caption": args.legenda,
        }

        if args.reaproveitar and existe_no_storage(url, destino) and existe_no_storage(url, nome_thumb):
            return {"arquivo": arquivo.name, "ok": True, "reaproveitado": True, "linha": linha}

        try:
            full, thumb = processar(arquivo, args.full, args.thumb)
        except Exception as erro:  # noqa: BLE001
            return {"arquivo": arquivo.name, "ok": False, "erro": "processamento: " + str(erro)[:120]}

        ok_full, caminho, erro = subir(url, key, destino, full)
        if not ok_full:
            return {"arquivo": arquivo.name, "ok": False, "erro": "full: " + str(erro)}
        ok_thumb, caminho, erro = subir(url, key, nome_thumb, thumb)
        if not ok_thumb:
            return {"arquivo": arquivo.name, "ok": False, "erro": "thumb: " + str(erro)}

        return {
            "arquivo": arquivo.name,
            "ok": True,
            "reaproveitado": False,
            "linha": linha,
            "thumb_url": urls_publicas(url, nome_thumb),
        }

    print("\nEnviando " + str(len(trabalhos)) + " fotos para o Supabase…")
    inicio = time.time()
    resultados = []
    with ThreadPoolExecutor(max_workers=args.concorrencia) as pool:
        for indice, resultado in enumerate(pool.map(trabalho, trabalhos), 1):
            resultados.append(resultado)
            if indice % 10 == 0 or indice == len(trabalhos):
                print("   " + str(indice) + "/" + str(len(trabalhos)) + "  (" +
                      str(int(time.time() - inicio)) + "s)")

    ok = [r for r in resultados if r["ok"]]
    falhas = [r for r in resultados if not r["ok"]]
    reaproveitados = [r for r in ok if r.get("reaproveitado")]
    print("\nEnviadas com sucesso: " + str(len(ok)))
    if reaproveitados:
        print("Já estavam no storage: " + str(len(reaproveitados)))
    if falhas:
        print("Falharam: " + str(len(falhas)))
        for falha in falhas[:20]:
            print("   - " + falha["arquivo"] + ": " + falha.get("erro", ""))

    if ok:
        print("\nRegistrando linhas na tabela gallery_photos…")
        inserir(url, key, args.ano, [r["linha"] for r in ok])

    manifesto.append("linhas gravadas: " + str(len(ok)))
    if falhas:
        manifesto.append("FALHAS:")
        for falha in falhas:
            manifesto.append("  " + falha["arquivo"] + " :: " + falha.get("erro", ""))
    for resultado in ok:
        manifesto.append(resultado["arquivo"] + " -> " + resultado["linha"]["image_url"])
    MANIFEST_PATH.write_text("\n".join(manifesto), encoding="utf-8")
    print("\nManifesto gravado em " + str(MANIFEST_PATH))


if __name__ == "__main__":
    main()
