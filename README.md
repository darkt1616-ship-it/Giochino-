# Botte nella Gabbia 🥊

Picchiaduro 1v1 in una gabbia tipo UFC, visto di lato, da giocare sul telefono
contro la CPU. Vanilla JS + Canvas 2D, zero dipendenze, zero build: si apre
`index.html` con un doppio click e funziona (anche da `file://`).

## Come si gioca

Telefono **in orizzontale** (in verticale compare l'overlay "gira il telefono").

- **Pollice sinistro**: `◀` `▶` per muoverti. **Doppio tap sul bottone che ti
  allontana** = schivata all'indietro con ~200ms di invulnerabilità.
- **Pollice destro**: **PUGNO** (veloce, danno basso), **CALCIO** (lento, danno
  grosso), **PARA** (tieni premuto: taglia l'80% del danno ma consuma stamina —
  se la stamina finisce mentre pari, guard break e sei scoperto).
- Un **calcio pulito** quando l'avversario è sotto il 35% di vita lo manda al
  tappeto: chi è a terra ha 3 secondi per rialzarsi **tappando lo schermo**.
  3 atterramenti = TKO.
- 3 round da 60 secondi. KO/TKO, altrimenti si va ai punti (danno inflitto).

Su desktop: **frecce** per muoverti (doppio tap sulla freccia "indietro" =
schivata), **A** = pugno, **S** = calcio, **D** = para.

## Cambiare le facce

Metti due immagini quadrate (~512×512, faccia centrata) in:

```
assets/faces/fighter1.png   → lottatore rosso (tu)
assets/faces/fighter2.png   → lottatore blu (CPU)
```

Anche `.jpg` va bene, basta rinominare in `.png`... no, scherzo: se usi jpg
cambia i percorsi in `game.js` (cerca `assets/faces/` nella sezione FACCE).
Se un'immagine manca o non carica, il gioco usa una faccia placeholder
disegnata a canvas, senza crashare. Le immagini vengono ritagliate in un
cerchio con effetto *cover*, quindi conviene che la faccia riempia il quadrato.

## Cambiare i nomi (e tutto il resto)

Tutto il bilanciamento sta nell'oggetto `CONFIG` in cima a `game.js`:

- `names` — i nomi mostrati sopra le barre della vita
- `colors` — colori di lottatori, gabbia, tappeto, pubblico
- `moves` — frame data in ms (startup/attivo/recovery), danni, stamina,
  knockback dei colpi
- `block`, `dodge`, `knockdown`, `rounds` — regole del combattimento
- `cpu.levels` — i 3 livelli di difficoltà (ritardo di reazione 280→110ms,
  aggressività, probabilità di parata/schivata, errori)
- `physics` — le molle del corpo buffo: `poseSpring`/`poseDamp` più bassi =
  più flaccido e comico; `iterations` se il ragdoll sfarfalla
- `juice` — hit-stop, screen shake, slow-mo al KO

## Versione single-file da mandare agli amici

```
python3 build.py
```

Crea `dist/gioco.html` con JS e foto (in base64) inlinati: un unico file da
mandare su WhatsApp/Telegram, si apre con un doppio click.

## Struttura

```
index.html      → shell, CSS, bottoni touch, overlay
game.js         → tutto il gioco (CONFIG in testa)
assets/faces/   → le due facce
build.py        → build opzionale single-file
```

Dettagli tecnici: game loop delta-time con `dt` clampato a 50ms,
`devicePixelRatio` cappato a 2, corpi molli a 7 punti in integrazione di
Verlet con molle verso le pose arcade (ragdoll pieno al KO), audio interamente
sintetizzato con WebAudio (si sblocca al primo tocco, bottone mute in alto a
destra).
