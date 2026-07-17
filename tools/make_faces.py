#!/usr/bin/env python3
"""Ritaglia le foto grezze nelle teste tonde del gioco.

Uso:  python3 tools/make_faces.py
Prende  assets/faces/raw/*_raw.jpg  e scrive  assets/faces/fighterN.png
(512x512 RGBA, mascherati a cerchio con bordo sfumato).

Rilanciabile: se un ritaglio non va, cambia i numeri in CROPS e rilancia.
Serve solo Pillow:  python3 -m pip install Pillow
"""
import os
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

# ------------------------------------------------------------------ parametri
# Coordinate normalizzate (0..1) SULL'IMMAGINE SORGENTE.
#   cx, cy = centro del ritaglio, messo sulla RADICE DEL NASO (tra gli occhi)
#            cx = frazione della larghezza, cy = frazione dell'altezza
#   size   = lato del quadrato, come frazione della LARGHEZZA dell'immagine
#   rot    = gradi (antiorario) per raddrizzare la linea degli occhi
CROPS = {
    "fighter1": {  # foto barbiere: barba, giacca nera, collo alto bianco (591x1280)
        "src": "fighter1_raw.jpg",
        "cx": 0.523, "cy": 0.479, "size": 0.330, "rot": -5.0,
    },
    "fighter2": {  # foto bagno col flash: capelli scuri bagnati, canotta nera (576x576)
        "src": "fighter2_raw.jpg",
        "cx": 0.384, "cy": 0.301, "size": 0.365, "rot": 7.0,
    },
}

OUT_SIZE = 512      # lato del PNG finale
FEATHER = 12        # px di sfumatura del bordo circolare
CONTRAST = 1.15     # la testa a schermo è piccola: deve staccare
SATURATION = 1.15

# ------------------------------------------------------------------ percorsi
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "assets", "faces", "raw")
OUT_DIR = os.path.join(ROOT, "assets", "faces")


def circular_alpha(size, feather):
    """Maschera L: cerchio pieno con bordo sfumato di ~feather px."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    inset = feather  # lascia spazio perché la sfumatura non venga tagliata
    d.ellipse([inset, inset, size - 1 - inset, size - 1 - inset], fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather * 0.6))


def make(name, spec):
    src = os.path.join(RAW_DIR, spec["src"])
    img = Image.open(src)
    img = ImageOps.exif_transpose(img).convert("RGB")  # rispetta l'orientamento EXIF
    w, h = img.size

    cx, cy = spec["cx"] * w, spec["cy"] * h
    half = spec["size"] * w / 2.0

    # ruota attorno al centro del ritaglio (quel punto resta fermo), poi ritaglia
    if spec["rot"]:
        img = img.rotate(spec["rot"], resample=Image.BICUBIC, center=(cx, cy))

    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    crop = img.crop(box)  # se sfora, Pillow riempie di nero: i ritagli stanno dentro
    crop = crop.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)

    crop = ImageEnhance.Contrast(crop).enhance(CONTRAST)
    crop = ImageEnhance.Color(crop).enhance(SATURATION)

    crop = crop.convert("RGBA")
    crop.putalpha(circular_alpha(OUT_SIZE, FEATHER))

    out = os.path.join(OUT_DIR, name + ".png")
    crop.save(out)
    print("scritto %s  (sorgente %dx%d, ritaglio %s)" % (
        os.path.relpath(out, ROOT), w, h, box))


def main():
    for name, spec in CROPS.items():
        make(name, spec)


if __name__ == "__main__":
    main()
