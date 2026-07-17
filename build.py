#!/usr/bin/env python3
"""Inlina tutto (JS + facce in base64) in un singolo dist/gioco.html.

Uso:  python3 build.py
Poi manda dist/gioco.html a chi vuoi: si apre con un doppio click.
Solo libreria standard, nessuna dipendenza.
"""
import base64
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
FACES = ['assets/faces/fighter1.png', 'assets/faces/fighter2.png']


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = 'image/jpeg' if ext in ('.jpg', '.jpeg') else 'image/png'
    with open(path, 'rb') as fh:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(fh.read()).decode('ascii'))


def main():
    with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as fh:
        html = fh.read()
    with open(os.path.join(ROOT, 'game.js'), encoding='utf-8') as fh:
        game = fh.read()

    faces = {}
    for rel in FACES:
        path = os.path.join(ROOT, rel)
        if os.path.exists(path):
            faces[rel] = data_uri(path)
        else:
            print('attenzione: manca %s (il gioco userà il placeholder)' % rel)

    embed = 'window.EMBEDDED_FACES = ' + repr(faces).replace("'", '"') + ';\n'
    inline = '<script>\n' + embed + game + '\n</script>'
    out, n = re.subn(r'<script src="game\.js"></script>', lambda _: inline, html)
    if n != 1:
        raise SystemExit('non trovo il tag <script src="game.js"> in index.html')

    dist = os.path.join(ROOT, 'dist')
    os.makedirs(dist, exist_ok=True)
    target = os.path.join(dist, 'gioco.html')
    with open(target, 'w', encoding='utf-8') as fh:
        fh.write(out)
    print('scritto %s (%.0f KB)' % (target, os.path.getsize(target) / 1024))


if __name__ == '__main__':
    main()
