'use strict';
/* ============================================================
   BOTTE NELLA GABBIA — picchiaduro 1v1 da telefono
   Vanilla JS + Canvas 2D, niente moduli, niente dipendenze.
   Tutti i numeri con cui vale la pena smanettare stanno in CONFIG.
   ============================================================ */

/* ============================ CONFIG ============================ */
var CONFIG = {
  names: ['ROCCO', 'PIERO'],

  colors: {
    p1:      { body: '#d84438', trim: '#ffb199', glove: '#a52a1d' },
    p2:      { body: '#2f6fd8', trim: '#9fc4ff', glove: '#1d4fa5' },
    mat:     '#c8b89a',
    matEdge: '#8a7c62',
    matLogo: 'rgba(160, 40, 40, 0.55)',
    cagePost:'#3a3f4a',
    padTop:  '#b03030',
    fence:   'rgba(190, 200, 220, 0.16)',
    fenceFront: 'rgba(200, 210, 235, 0.10)',
    bgTop:   '#101018',
    bgBottom:'#1c1c2a',
    crowd:   '#151522',
    crowd2:  '#1d1d2e'
  },

  world: {
    cageHalf: 430,        // mezza larghezza interna della gabbia
    fenceH: 270,          // altezza rete
    wallPad: 46,          // quanto i lottatori si fermano prima della rete
    minGap: 58            // distanza minima tra i due corpi (spinta)
  },

  fighter: {
    hp: 100,
    stamina: 100,
    staminaRegen: 25,     // al secondo, quando non attacchi/pari
    walkSpeed: 250,       // unità/s
    backSpeed: 190,       // camminando all'indietro
    accel: 2200,
    // geometria (unità mondo)
    pelvisH: 88,
    chestH: 138,
    headH: 172,
    headR: 23,
    armLen: 72,
    legLen: 92,
    limbThick: 15,
    torsoThick: 26
  },

  moves: {
    punch: { startup: 100, active: 50,  recovery: 130, damage: 6,  stamina: 8,
             knockback: 90,  hitstun: 180, range: 96,  hitboxH: 40, chip: 1 },
    kick:  { startup: 240, active: 80,  recovery: 380, damage: 16, stamina: 20,
             knockback: 320, hitstun: 340, range: 128, hitboxH: 55, chip: 3 }
  },

  block: {
    damageCut: 0.8,        // taglia l'80% del danno
    staminaDrainHit: 14,   // stamina persa quando pari un colpo
    staminaDrainHold: 6,   // stamina/s persa tenendo la parata
    guardBreakMs: 600      // scoperto dopo guard break
  },

  dodge: {
    dist: 130,
    durMs: 240,
    invulnMs: 200,
    staminaCost: 12,
    doubleTapMs: 260
  },

  knockdown: {
    hpThreshold: 35,       // sotto questa vita, un calcio pulito atterra
    getupMs: 3000,         // tempo per rialzarsi tappando
    maxDowns: 3            // 3 atterramenti = TKO
  },

  rounds: {
    count: 3,
    durationS: 60,
    restMs: 3200
  },

  cpu: {
    // 3 livelli: [MOLLACCIONE, TOSTO, MACELLAIO]
    levels: [
      { reactionMs: 280, aggression: 0.35, blockChance: 0.30, dodgeChance: 0.10, mistakes: 0.35 },
      { reactionMs: 180, aggression: 0.55, blockChance: 0.50, dodgeChance: 0.22, mistakes: 0.18 },
      { reactionMs: 110, aggression: 0.75, blockChance: 0.68, dodgeChance: 0.35, mistakes: 0.07 }
    ],
    thinkMs: 120,          // ogni quanto la CPU riconsidera il piano
    idealRange: 105,       // distanza a cui vuole stare
    retreatHp: 18          // sotto questa vita tende a scappare un po'
  },

  physics: {
    gravity: 2400,
    iterations: 3,
    poseSpring: 26,        // rigidità molle verso le pose (arti)
    poseDamp: 0.82,        // smorzamento (basso = sfarfalla, comico)
    coreSpring: 60,        // il core (torso/bacino) segue lo stato arcade
    groundFriction: 0.72,
    bounce: 0.35,
    fenceBounce: 0.55
  },

  camera: {
    pad: 460,              // aria attorno ai lottatori
    minViewH: 430,         // più piccolo = zoom massimo più vicino
    maxViewH: 660,
    followK: 4.5,          // mollezza del pan
    zoomK: 3.0
  },

  juice: {
    hitstopPunchMs: 60,
    hitstopKickMs: 80,
    shakePerDamage: 0.9,
    koSlowmo: 0.25,
    koSlowmoMs: 1500
  },

  audio: {
    master: 0.5
  }
};

/* ============================ UTILS ============================ */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function expDamp(cur, target, k, dt) { return lerp(cur, target, 1 - Math.exp(-k * dt)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function now() { return performance.now(); }

/* ============================ CANVAS ============================ */
var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');
var DPR = 1, W = 0, H = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  checkOrientation();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

var isPortrait = false;
function checkOrientation() {
  isPortrait = window.innerHeight > window.innerWidth;
  document.getElementById('rotate-overlay').classList.toggle('hidden', !isPortrait);
}

/* ============================ INPUT ============================ */
var Input = {
  left: false, right: false, block: false,
  punchPressed: false, kickPressed: false,   // edge (consumati dal gioco)
  dodgePressed: false,
  tapped: false,                             // un tap qualsiasi (rialzarsi / audio)
  _lastDirTap: { dir: 0, t: -9999 }
};

function dirPressed(dir) {
  var t = now();
  if (Input._lastDirTap.dir === dir && t - Input._lastDirTap.t < CONFIG.dodge.doubleTapMs) {
    Input.dodgePressed = true;
    Input._lastDirTap.t = -9999;
  } else {
    Input._lastDirTap.dir = dir;
    Input._lastDirTap.t = t;
  }
}

function bindHold(id, setter, onPress) {
  var el = document.getElementById(id);
  var down = function (e) {
    e.preventDefault();
    el.classList.add('pressed');
    setter(true);
    if (onPress) onPress();
    userTap();
  };
  var up = function (e) {
    if (e) e.preventDefault();
    el.classList.remove('pressed');
    setter(false);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', function () { up(null); });
  el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}

bindHold('btn-left',  function (v) { Input.left = v; },  function () { dirPressed(-1); });
bindHold('btn-right', function (v) { Input.right = v; }, function () { dirPressed(1); });
bindHold('btn-punch', function (v) { if (v) Input.punchPressed = true; });
bindHold('btn-kick',  function (v) { if (v) Input.kickPressed = true; });
bindHold('btn-block', function (v) { Input.block = v; });

window.addEventListener('keydown', function (e) {
  if (e.repeat) {
    if (e.code === 'ArrowLeft') Input.left = true;
    if (e.code === 'ArrowRight') Input.right = true;
    return;
  }
  switch (e.code) {
    case 'ArrowLeft':  Input.left = true;  dirPressed(-1); break;
    case 'ArrowRight': Input.right = true; dirPressed(1);  break;
    case 'KeyA': Input.punchPressed = true; break;
    case 'KeyS': Input.kickPressed = true;  break;
    case 'KeyD': Input.block = true;        break;
  }
  userTap();
});
window.addEventListener('keyup', function (e) {
  switch (e.code) {
    case 'ArrowLeft':  Input.left = false;  break;
    case 'ArrowRight': Input.right = false; break;
    case 'KeyD': Input.block = false;       break;
  }
});

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  Input.tapped = true;
  userTap();
});

// hook per sbloccare l'audio al primo tocco (usato più avanti)
var _tapHooks = [];
function userTap() {
  Input.tapped = true;
  for (var i = 0; i < _tapHooks.length; i++) _tapHooks[i]();
}

/* ============================ FACCE ============================ */
// Testa = cerchio con dentro la foto (o un placeholder disegnato).
function makePlaceholderFace(skin, hair, mustache) {
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var g = c.getContext('2d');
  g.fillStyle = skin;
  g.fillRect(0, 0, 128, 128);
  // capelli
  g.fillStyle = hair;
  g.beginPath();
  g.arc(64, 34, 52, Math.PI, 0);
  g.fill();
  g.fillRect(12, 20, 104, 18);
  // occhi
  g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(44, 60, 11, 13, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(84, 60, 11, 13, 0, 0, 7); g.fill();
  g.fillStyle = '#222';
  g.beginPath(); g.arc(46, 62, 5, 0, 7); g.fill();
  g.beginPath(); g.arc(82, 62, 5, 0, 7); g.fill();
  // naso
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(64, 66); g.lineTo(60, 82); g.lineTo(68, 84); g.stroke();
  // bocca / baffi
  if (mustache) {
    g.fillStyle = hair;
    g.beginPath(); g.ellipse(64, 94, 24, 9, 0, 0, 7); g.fill();
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(64, 101, 16, 6, 0, 0, 7); g.fill();
  } else {
    g.strokeStyle = '#7a3b2e';
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 92, 14, 0.3, Math.PI - 0.3); g.stroke();
  }
  return c;
}

function loadFace(src, placeholder) {
  var face = { img: placeholder, ready: true };
  var img = new Image();
  img.onload = function () { face.img = img; };
  img.onerror = function () { /* resta il placeholder, nessun crash */ };
  img.src = src;
  return face;
}

var FACES = [
  loadFace('assets/faces/fighter1.png', makePlaceholderFace('#e8b88a', '#3a2a1a', true)),
  loadFace('assets/faces/fighter2.png', makePlaceholderFace('#d9a06b', '#111111', false))
];

// disegna l'immagine "cover" dentro un cerchio già clippato di raggio r centrato in 0,0
function drawFaceCover(g, faceImg, r) {
  var iw = faceImg.width, ih = faceImg.height;
  var s = (r * 2) / Math.min(iw, ih);
  g.drawImage(faceImg, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
}

/* ============================ FIGHTER ============================ */
// Stato arcade: deterministico, guida tutto. Il corpo molle arriva dopo (M3).
function makeFighter(index, x, facing) {
  var F = CONFIG.fighter;
  return {
    index: index,
    name: CONFIG.names[index],
    color: index === 0 ? CONFIG.colors.p1 : CONFIG.colors.p2,
    face: FACES[index],

    x: x, vx: 0, facing: facing,
    hp: F.hp,
    stamina: F.stamina,

    state: 'idle',        // idle | walk | attack | block | dodge | hitstun | guardbreak | downed | ko
    stateT: 0,            // ms nello stato corrente
    move: null,           // dati mossa corrente (attack)
    moveHit: false,       // l'attacco ha già colpito? (un solo hit)
    hitstunMs: 0,
    invulnMs: 0,
    dodgeDir: 0,

    downs: 0,             // atterramenti subiti nel match
    damageDealt: 0,       // per i punti
    walkPhase: 0,
    ko: false
  };
}

var f1 = null, f2 = null;

function fighterOpponent(f) { return f === f1 ? f2 : f1; }

/* ---- pose target: dove "vorrebbero" stare le articolazioni ---- */
// Ritorna posizioni assolute nel mondo (y negativo = in alto).
function computePose(f, t) {
  var F = CONFIG.fighter;
  var s = f.facing;
  var p = {};
  var bob = Math.sin(t * 0.004 + f.index * 2.1) * 2.5;
  var wp = f.walkPhase;

  var pelvisY = -F.pelvisH + bob;
  var chestY = -F.chestH + bob * 1.2;
  var headY = -F.headH + bob * 1.4;
  var lean = s * 6;

  p.pelvis = { x: f.x, y: pelvisY };
  p.chest = { x: f.x + lean * 0.5, y: chestY };
  p.head = { x: f.x + lean, y: headY };

  // piedi: lead avanti, rear dietro; camminando fanno lo stepping
  var stepA = Math.sin(wp), stepB = Math.sin(wp + Math.PI);
  var moving = f.state === 'walk';
  var liftA = moving ? Math.max(0, stepA) * 14 : 0;
  var liftB = moving ? Math.max(0, stepB) * 14 : 0;
  var strideA = moving ? stepA * 26 : 0;
  var strideB = moving ? stepB * 26 : 0;
  p.footLead = { x: f.x + s * 30 + strideA * s, y: -liftA };
  p.footRear = { x: f.x - s * 24 + strideB * s, y: -liftB };

  // mani: guardia da boxe
  p.handLead = { x: f.x + s * 40, y: chestY + 6 + Math.sin(t * 0.006 + 1) * 3 };
  p.handRear = { x: f.x + s * 20, y: chestY + 10 + Math.sin(t * 0.006) * 3 };

  // varianti per stato
  if (f.state === 'block') {
    p.handLead = { x: f.x + s * 26, y: headY + 8 };
    p.handRear = { x: f.x + s * 16, y: headY + 16 };
    p.chest.x -= s * 4;
    p.head.x -= s * 6;
  } else if (f.state === 'attack' && f.move) {
    var m = f.move;
    var ph = attackPhase(f); // {name, k}
    if (m.kind === 'punch') {
      var ext = ph.name === 'startup' ? ph.k : (ph.name === 'active' ? 1 : 1 - ph.k);
      p.handLead = { x: f.x + s * (34 + ext * (m.range - 20)), y: chestY + 4 };
      p.chest.x += s * ext * 10;
      p.head.x += s * ext * 6;
    } else if (m.kind === 'kick') {
      var e2 = ph.name === 'startup' ? ph.k : (ph.name === 'active' ? 1 : 1 - ph.k);
      // gamba lead che si estende in alto-avanti, corpo che si inclina indietro
      p.footLead = {
        x: f.x + s * (26 + e2 * (m.range - 10)),
        y: -(F.pelvisH * 0.55 + e2 * 34)
      };
      p.chest.x -= s * e2 * 16;
      p.head.x -= s * e2 * 22;
      p.pelvis.x += s * e2 * 6;
      p.handLead.y += e2 * 10;
    }
  } else if (f.state === 'hitstun') {
    var k = clamp(f.stateT / Math.max(1, f.hitstunMs), 0, 1);
    var recoil = Math.sin(k * Math.PI) * 18;
    p.head.x -= s * recoil;
    p.chest.x -= s * recoil * 0.6;
    p.handLead.x -= s * recoil * 0.5;
    p.handRear.x -= s * recoil * 0.5;
  } else if (f.state === 'guardbreak') {
    p.handLead = { x: f.x + s * 10, y: pelvisY - 4 };
    p.handRear = { x: f.x - s * 6, y: pelvisY - 2 };
    p.head.x -= s * 8;
    p.head.y += 8;
    p.chest.x -= s * 6;
  } else if (f.state === 'dodge') {
    p.chest.x -= s * 10;
    p.head.x -= s * 14;
    p.head.y += 6;
  } else if (f.state === 'downed' || f.state === 'ko') {
    // a terra: tutto schiacciato (il ragdoll vero arriva con la fisica M3)
    var dir = f.dodgeDir || -s;
    p.pelvis = { x: f.x, y: -18 };
    p.chest = { x: f.x + dir * 34, y: -20 };
    p.head = { x: f.x + dir * 62, y: -20 };
    p.handLead = { x: f.x + dir * 70, y: -6 };
    p.handRear = { x: f.x + dir * 30, y: -6 };
    p.footLead = { x: f.x - dir * 34, y: -4 };
    p.footRear = { x: f.x - dir * 16, y: -4 };
  }
  return p;
}

function attackPhase(f) {
  var m = f.move;
  var t = f.stateT;
  if (t < m.startup) return { name: 'startup', k: t / m.startup };
  if (t < m.startup + m.active) return { name: 'active', k: (t - m.startup) / m.active };
  return { name: 'recovery', k: clamp((t - m.startup - m.active) / m.recovery, 0, 1) };
}

/* ---- update arcade ---- */
function updateFighter(f, dt, t) {
  var F = CONFIG.fighter;
  var Wd = CONFIG.world;
  var opp = fighterOpponent(f);
  var ms = dt * 1000;

  f.stateT += ms;
  if (f.invulnMs > 0) f.invulnMs -= ms;

  // faccia sempre l'avversario (tranne quando è per terra)
  if (f.state !== 'downed' && f.state !== 'ko' && f.state !== 'dodge') {
    f.facing = opp.x >= f.x ? 1 : -1;
  }

  var wantDir = 0;
  if (f.isPlayer) {
    wantDir = (Input.right ? 1 : 0) - (Input.left ? 1 : 0);
  } else if (f.cpuDir) {
    wantDir = f.cpuDir;
  }

  switch (f.state) {
    case 'idle':
    case 'walk':
      if (wantDir !== 0) {
        var backwards = (wantDir !== f.facing);
        var spd = backwards ? F.backSpeed : F.walkSpeed;
        f.vx = expDamp(f.vx, wantDir * spd, 10, dt);
        f.walkPhase += dt * 9 * (backwards ? -1 : 1);
        setState(f, 'walk', true);
      } else {
        f.vx = expDamp(f.vx, 0, 14, dt);
        setState(f, 'idle', true);
      }
      // rigenera stamina
      f.stamina = clamp(f.stamina + F.staminaRegen * dt, 0, F.stamina0 || 100);
      break;

    case 'dodge':
      f.vx = f.dodgeDir * (CONFIG.dodge.dist / (CONFIG.dodge.durMs / 1000));
      if (f.stateT >= CONFIG.dodge.durMs) { f.vx = 0; setState(f, 'idle'); }
      break;

    case 'attack':
      f.vx = expDamp(f.vx, 0, 8, dt);
      var m = f.move;
      if (f.stateT >= m.startup + m.active + m.recovery) {
        f.move = null;
        setState(f, 'idle');
      }
      break;

    case 'block':
      f.vx = expDamp(f.vx, 0, 14, dt);
      f.stamina -= CONFIG.block.staminaDrainHold * dt;
      if (f.stamina <= 0) {
        f.stamina = 0;
        guardBreak(f);
      } else if (!f.holdingBlock) {
        setState(f, 'idle');
      }
      break;

    case 'hitstun':
      f.vx = expDamp(f.vx, 0, 6, dt);
      if (f.stateT >= f.hitstunMs) setState(f, 'idle');
      break;

    case 'guardbreak':
      f.vx = expDamp(f.vx, 0, 6, dt);
      if (f.stateT >= CONFIG.block.guardBreakMs) setState(f, 'idle');
      break;

    case 'downed':
    case 'ko':
      f.vx = expDamp(f.vx, 0, 4, dt);
      break;
  }

  f.x += f.vx * dt;
  f.x = clamp(f.x, -Wd.cageHalf + Wd.wallPad, Wd.cageHalf - Wd.wallPad);
}

function setState(f, s, keepTimer) {
  if (f.state === s) return;
  f.state = s;
  if (!keepTimer) f.stateT = 0;
  else if (s === 'idle' || s === 'walk') { /* idle<->walk senza reset */ }
}

function guardBreak(f) {
  f.state = 'guardbreak';
  f.stateT = 0;
  f.holdingBlock = false;
}

// separazione dei corpi: niente compenetrazione
function separateBodies() {
  var gap = CONFIG.world.minGap;
  var d = f2.x - f1.x;
  var ad = Math.abs(d);
  if (ad < gap && f1.state !== 'ko' && f2.state !== 'ko') {
    var push = (gap - ad) / 2 * (d >= 0 ? 1 : -1);
    f1.x -= push;
    f2.x += push;
  }
}

/* ============================ CAMERA ============================ */
var cam = { x: 0, scale: 1, shake: 0, shakeX: 0, shakeY: 0 };

function updateCamera(dt) {
  var C = CONFIG.camera;
  var midX = (f1.x + f2.x) / 2;
  var need = Math.abs(f1.x - f2.x) + C.pad;
  var targetScale = Math.min(W / need, H / C.minViewH);
  targetScale = clamp(targetScale, H / C.maxViewH, H / C.minViewH);

  cam.scale = expDamp(cam.scale, targetScale, C.zoomK, dt);

  var halfView = (W / cam.scale) / 2;
  var maxX = Math.max(0, CONFIG.world.cageHalf + 140 - halfView);
  var tx = clamp(midX, -maxX, maxX);
  cam.x = expDamp(cam.x, tx, C.followK, dt);

  // shake (alimentato dai colpi, M5)
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 30);
    cam.shakeX = rand(-1, 1) * cam.shake;
    cam.shakeY = rand(-1, 1) * cam.shake;
  } else { cam.shakeX = 0; cam.shakeY = 0; }
}

function worldToScreenX(wx) { return W / 2 + (wx - cam.x) * cam.scale + cam.shakeX; }
function worldToScreenY(wy) { return H * 0.80 + wy * cam.scale + cam.shakeY; }

function applyCameraTransform() {
  ctx.translate(W / 2 + cam.shakeX, H * 0.80 + cam.shakeY);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, 0);
}

/* ============================ SCENA ============================ */
function drawBackground(t) {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, CONFIG.colors.bgTop);
  g.addColorStop(1, CONFIG.colors.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCrowd(t) {
  // sagome scure che ondeggiano, dietro la gabbia (spazio mondo)
  var Wd = CONFIG.world;
  var rows = [
    { y: -Wd.fenceH - 30, r: 16, color: CONFIG.colors.crowd2, n: 26, seed: 0 },
    { y: -Wd.fenceH + 6,  r: 19, color: CONFIG.colors.crowd,  n: 22, seed: 7 }
  ];
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    ctx.fillStyle = row.color;
    var span = Wd.cageHalf * 2 + 500;
    for (var i = 0; i < row.n; i++) {
      var x = -span / 2 + (i + 0.5) * (span / row.n);
      var sway = Math.sin(t * 0.0012 + i * 1.7 + row.seed) * 5;
      var bounce = Math.sin(t * 0.002 + i * 2.3 + row.seed) * 2;
      // testa + spalle
      ctx.beginPath();
      ctx.arc(x + sway, row.y - 20 + bounce, row.r, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + sway, row.y + 8 + bounce, row.r * 1.7, row.r, 0, Math.PI, 0);
      ctx.fill();
    }
  }
}

function drawSpotlights(t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (var i = 0; i < 2; i++) {
    var sx = i === 0 ? -220 : 220;
    var sway = Math.sin(t * 0.0006 + i * 3) * 40;
    var g = ctx.createLinearGradient(0, -520, 0, 40);
    g.addColorStop(0, 'rgba(255, 244, 214, 0.10)');
    g.addColorStop(1, 'rgba(255, 244, 214, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sx - 30, -520);
    ctx.lineTo(sx + 30, -520);
    ctx.lineTo(sx + 190 + sway, 30);
    ctx.lineTo(sx - 190 + sway, 30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawMat() {
  var Wd = CONFIG.world;
  var half = Wd.cageHalf + 90;
  // pedana
  ctx.fillStyle = CONFIG.colors.matEdge;
  ctx.fillRect(-half - 40, 0, half * 2 + 80, 34);
  ctx.fillStyle = CONFIG.colors.mat;
  ctx.fillRect(-half - 40, 0, half * 2 + 80, 10);
  // logo scemo al centro (ellisse schiacciata, vista di lato)
  ctx.save();
  ctx.translate(0, 5);
  ctx.scale(1, 0.16);
  ctx.strokeStyle = CONFIG.colors.matLogo;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 170, 0, 7);
  ctx.stroke();
  ctx.fillStyle = CONFIG.colors.matLogo;
  ctx.font = 'italic 900 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GFC', 0, 0);
  ctx.restore();
}

function drawFence(front) {
  var Wd = CONFIG.world;
  var half = Wd.cageHalf;
  var hgt = Wd.fenceH;
  var step = 30;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-half, -hgt, half * 2, hgt);
  ctx.clip();
  ctx.strokeStyle = front ? CONFIG.colors.fenceFront : CONFIG.colors.fence;
  ctx.lineWidth = front ? 2.5 : 2;
  ctx.beginPath();
  for (var x = -half - hgt; x < half + hgt; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x + hgt, -hgt);
    ctx.moveTo(x + hgt, 0); ctx.lineTo(x, -hgt);
  }
  ctx.stroke();
  ctx.restore();

  // corrimano in cima e paletti
  ctx.strokeStyle = front ? 'rgba(120,128,148,0.55)' : 'rgba(90,96,112,0.8)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-half, -hgt);
  ctx.lineTo(half, -hgt);
  ctx.stroke();

  for (var side = -1; side <= 1; side += 2) {
    var px = side * half;
    ctx.fillStyle = CONFIG.colors.cagePost;
    ctx.fillRect(px - 9, -hgt - 8, 18, hgt + 8);
    ctx.fillStyle = CONFIG.colors.padTop;
    ctx.fillRect(px - 11, -hgt - 14, 22, 26);
  }
}

/* ============================ RENDER FIGHTER ============================ */
function drawLimb(ax, ay, bx, by, bend, thick, color) {
  // segmento con "gomito/ginocchio" finto: punto medio spostato in perpendicolare
  var mx = (ax + bx) / 2, my = (ay + by) / 2;
  var dx = bx - ax, dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var nx = -dy / len, ny = dx / len;
  mx += nx * bend; my += ny * bend;
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(mx, my, bx, by);
  ctx.stroke();
}

function drawFighter(f, t) {
  var F = CONFIG.fighter;
  var p = f.renderPose || computePose(f, t);
  var s = f.facing;
  var col = f.color;

  // ombra
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(f.x, 2, 46, 9, 0, 0, 7);
  ctx.fill();

  // gambe (dietro il torso)
  drawLimb(p.pelvis.x, p.pelvis.y, p.footRear.x, p.footRear.y, -s * 10, F.limbThick, col.body);
  drawLimb(p.pelvis.x, p.pelvis.y, p.footLead.x, p.footLead.y, -s * 12, F.limbThick, col.body);
  // piedi
  ctx.fillStyle = col.glove;
  ctx.beginPath(); ctx.ellipse(p.footRear.x + s * 5, p.footRear.y - 3, 12, 7, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(p.footLead.x + s * 5, p.footLead.y - 3, 12, 7, 0, 0, 7); ctx.fill();

  // braccio rear (dietro)
  drawLimb(p.chest.x, p.chest.y + 6, p.handRear.x, p.handRear.y, s * 12, F.limbThick - 2, shade(col.body, -22));
  glove(p.handRear.x, p.handRear.y, shade(col.glove, -18));

  // torso
  ctx.strokeStyle = col.body;
  ctx.lineWidth = F.torsoThick;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.pelvis.x, p.pelvis.y);
  ctx.lineTo(p.chest.x, p.chest.y + 4);
  ctx.stroke();
  // pantaloncini
  ctx.strokeStyle = col.trim;
  ctx.lineWidth = F.torsoThick - 4;
  ctx.beginPath();
  ctx.moveTo(p.pelvis.x, p.pelvis.y);
  ctx.lineTo(lerp(p.pelvis.x, p.chest.x, 0.28), lerp(p.pelvis.y, p.chest.y, 0.28));
  ctx.stroke();

  // testa con la faccia
  var hx = p.head.x, hy = p.head.y;
  var ang = Math.atan2(hy - p.chest.y, hx - p.chest.x) + Math.PI / 2 + (f.headSpin || 0);
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang * 0.5);
  ctx.beginPath();
  ctx.arc(0, 0, F.headR, 0, 7);
  ctx.save();
  ctx.clip();
  drawFaceCover(ctx, f.face.img, F.headR);
  ctx.restore();
  ctx.strokeStyle = col.body;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, F.headR, 0, 7); ctx.stroke();
  ctx.restore();

  // braccio lead (davanti)
  drawLimb(p.chest.x, p.chest.y + 6, p.handLead.x, p.handLead.y, s * 14, F.limbThick - 2, col.body);
  glove(p.handLead.x, p.handLead.y, col.glove);
}

function glove(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, 7);
  ctx.fill();
}

function shade(hex, amt) {
  var n = parseInt(hex.slice(1), 16);
  var r = clamp(((n >> 16) & 255) + amt, 0, 255);
  var g = clamp(((n >> 8) & 255) + amt, 0, 255);
  var b = clamp((n & 255) + amt, 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/* ============================ HUD ============================ */
function drawHUD() {
  var pad = 14;
  var barW = Math.min(W * 0.36, 340);
  var topY = Math.max(10, 0) + 8;

  drawHealthBar(pad, topY, barW, f1, false);
  drawHealthBar(W - pad - barW, topY, barW, f2, true);

  // timer al centro
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(W / 2 - 38, topY, 76, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatTimer(), W / 2, topY + 20);
  ctx.font = '700 11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('ROUND ' + Match.round, W / 2, topY + 50);
}

function drawHealthBar(x, y, w, f, flip) {
  var h = 16;
  // nome
  ctx.fillStyle = '#fff';
  ctx.font = '800 13px sans-serif';
  ctx.textAlign = flip ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(f.name, flip ? x + w : x, y + 12);
  // vita
  var by = y + 18;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(x, by, w, h, 4); ctx.fill();
  var frac = clamp(f.hp / CONFIG.fighter.hp, 0, 1);
  ctx.fillStyle = frac > 0.5 ? '#3fbf4f' : (frac > 0.25 ? '#e0a030' : '#d03030');
  var fw = w * frac;
  if (fw > 0) { roundRect(flip ? x + w - fw : x, by, fw, h, 4); ctx.fill(); }
  // stamina
  var sy = by + h + 4;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(x, sy, w, 7, 3); ctx.fill();
  var sfrac = clamp(f.stamina / CONFIG.fighter.stamina, 0, 1);
  ctx.fillStyle = '#e8c33a';
  var sw = w * sfrac;
  if (sw > 0) { roundRect(flip ? x + w - sw : x, sy, sw, 7, 3); ctx.fill(); }
  // pallini atterramenti
  for (var i = 0; i < CONFIG.knockdown.maxDowns; i++) {
    var dotX = flip ? x + w - 8 - i * 16 : x + 8 + i * 16;
    ctx.beginPath();
    ctx.arc(dotX, sy + 16, 4, 0, 7);
    ctx.fillStyle = i < f.downs ? '#d03030' : 'rgba(255,255,255,0.25)';
    ctx.fill();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatTimer() {
  var t = Math.max(0, Math.ceil(Match.timeLeft));
  var m = Math.floor(t / 60), sec = t % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

/* ============================ MATCH (scheletro, M4 lo completa) ============================ */
var Match = {
  round: 1,
  timeLeft: CONFIG.rounds.durationS,
  running: false,
  difficulty: 1
};

function startMatch(diff) {
  Match.difficulty = diff;
  Match.round = 1;
  Match.timeLeft = CONFIG.rounds.durationS;
  Match.running = true;
  f1 = makeFighter(0, -140, 1);
  f2 = makeFighter(1, 140, -1);
  f1.isPlayer = true;
  document.getElementById('menu-overlay').classList.add('hidden');
}

/* ============================ INPUT → AZIONI (M2 completa) ============================ */
function handlePlayerInput(f) {
  if (!f.isPlayer) return;
  // per ora solo la schivata è "consumata" qui; pugno/calcio arrivano in M2
  if (Input.dodgePressed) {
    Input.dodgePressed = false;
    tryDodge(f);
  }
  Input.punchPressed = false;
  Input.kickPressed = false;
  f.holdingBlock = false;
}

function tryDodge(f) {
  if (f.state !== 'idle' && f.state !== 'walk') return;
  if (f.stamina < CONFIG.dodge.staminaCost) return;
  f.stamina -= CONFIG.dodge.staminaCost;
  f.dodgeDir = -f.facing;
  f.invulnMs = CONFIG.dodge.invulnMs;
  f.state = 'dodge';
  f.stateT = 0;
}

/* ============================ GAME LOOP ============================ */
var lastT = 0;
var timescale = 1;
var hitstopMs = 0;

function frame(tNow) {
  requestAnimationFrame(frame);
  var rawDt = (tNow - lastT) / 1000;
  lastT = tNow;
  var dt = clamp(rawDt, 0, 0.05);   // clamp: tab che torna in focus non esplode

  if (isPortrait) return;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(tNow);

  if (Match.running) {
    var gdt = dt * timescale;
    if (hitstopMs > 0) {
      hitstopMs -= dt * 1000;
    } else {
      handlePlayerInput(f1);
      updateFighter(f1, gdt, tNow);
      updateFighter(f2, gdt, tNow);
      separateBodies();
    }
    updateCamera(dt);

    ctx.save();
    applyCameraTransform();
    drawCrowd(tNow);
    drawSpotlights(tNow);
    drawFence(false);
    drawMat();
    drawFighter(f1, tNow);
    drawFighter(f2, tNow);
    drawFence(true);
    ctx.restore();

    drawHUD();
  }

  Input.tapped = false;
}

/* ============================ AVVIO ============================ */
(function init() {
  resize();
  var btns = document.querySelectorAll('#menu-overlay .menu-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (e) {
      startMatch(parseInt(e.currentTarget.getAttribute('data-diff'), 10));
    });
  }
  requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
})();
