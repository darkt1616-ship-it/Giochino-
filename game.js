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
             knockback: 90,  hitstun: 180, range: 96,  hitboxH: 46, hitY: -128,
             chip: 1, lunge: 70 },
    kick:  { startup: 240, active: 80,  recovery: 380, damage: 16, stamina: 20,
             knockback: 320, hitstun: 340, range: 128, hitboxH: 70, hitY: -110,
             chip: 3, lunge: 45 }
  },

  hurtbox: { halfW: 26, top: -195 },  // rettangolo dal suolo alla testa

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
    restMs: 3200,
    healBetween: 25,      // vita recuperata tra i round
    introMs: 1600         // "ROUND N" prima del via
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
    iterations: 3,         // constraint solve per frame (alza se sfarfalla)
    poseSpring: 260,       // molle verso le pose (arti): morbide, sforano
    poseDamp: 0.90,        // smorzamento basso = ondeggia, comico
    coreSpring: 1600,      // torso/bacino inchiodati allo stato arcade
    coreDamp: 0.72,
    limbGravity: 0.35,     // frazione di gravità sugli arti (cascano un po')
    groundFriction: 0.68,  // attrito al suolo in ragdoll
    bounce: 0.35,          // rimbalzo sul tappeto
    fenceBounce: 0.55,     // rimbalzo sulla rete
    impulseScale: 0.9      // quanto il knockback frusta il corpo molle
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

/* ============================ AUDIO (tutto sintetizzato) ============================ */
var AudioSys = { ctx: null, master: null, muted: false, crowdGain: null };
var CrowdE = 0; // eccitazione del pubblico 0..1.5

function initAudio() {
  if (AudioSys.ctx) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ac = new AC();
  AudioSys.ctx = ac;
  var master = ac.createGain();
  master.gain.value = AudioSys.muted ? 0 : CONFIG.audio.master;
  master.connect(ac.destination);
  AudioSys.master = master;

  // boato del pubblico: rumore in loop filtrato, il gain sale coi colpi
  var len = ac.sampleRate * 2;
  var buf = ac.createBuffer(1, len, ac.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  var src = ac.createBufferSource();
  src.buffer = buf; src.loop = true;
  var filt = ac.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 380; filt.Q.value = 0.5;
  var g = ac.createGain();
  g.gain.value = 0.03;
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
  AudioSys.crowdGain = g;
}
_tapHooks.push(function () {
  initAudio();
  if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
});

function toggleMute() {
  AudioSys.muted = !AudioSys.muted;
  if (AudioSys.master) {
    AudioSys.master.gain.value = AudioSys.muted ? 0 : CONFIG.audio.master;
  }
  document.getElementById('btn-mute').textContent = AudioSys.muted ? '🔇' : '🔊';
}

function noiseBurst(dur, filterType, freq, vol) {
  var ac = AudioSys.ctx;
  if (!ac) return;
  var len = Math.max(1, Math.floor(ac.sampleRate * dur));
  var buf = ac.createBuffer(1, len, ac.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = ac.createBufferSource();
  src.buffer = buf;
  var filt = ac.createBiquadFilter();
  filt.type = filterType; filt.frequency.value = freq;
  var g = ac.createGain();
  var t = ac.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(AudioSys.master);
  src.start(); src.stop(t + dur);
}

// tonfo: sine bassa che scende + botto di rumore
function sfxThud(vol, freq) {
  var ac = AudioSys.ctx;
  if (!ac) return;
  var t = ac.currentTime;
  var osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.4), t + 0.12);
  var g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(g); g.connect(AudioSys.master);
  osc.start(t); osc.stop(t + 0.2);
  noiseBurst(0.08, 'lowpass', 420, vol * 0.8);
}

// whoosh: rumore in bandpass che sale
function sfxWhoosh() {
  var ac = AudioSys.ctx;
  if (!ac) return;
  var t = ac.currentTime;
  var len = Math.floor(ac.sampleRate * 0.18);
  var buf = ac.createBuffer(1, len, ac.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = ac.createBufferSource();
  src.buffer = buf;
  var filt = ac.createBiquadFilter();
  filt.type = 'bandpass'; filt.Q.value = 1.2;
  filt.frequency.setValueAtTime(400, t);
  filt.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
  var g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filt); filt.connect(g); g.connect(AudioSys.master);
  src.start(); src.stop(t + 0.2);
}

// campana di inizio/fine round
function sfxBell() {
  var ac = AudioSys.ctx;
  if (!ac) return;
  var t = ac.currentTime;
  var freqs = [1100, 1650, 2210];
  for (var i = 0; i < freqs.length; i++) {
    var osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqs[i];
    var g = ac.createGain();
    g.gain.setValueAtTime(0.22 / (i + 1), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    osc.connect(g); g.connect(AudioSys.master);
    osc.start(t); osc.stop(t + 1.5);
  }
}

function updateCrowd(dt) {
  CrowdE = Math.max(0, CrowdE - dt * 0.35);
  if (AudioSys.crowdGain) {
    var target = 0.03 + CrowdE * 0.22;
    var g = AudioSys.crowdGain.gain;
    g.value = lerp(g.value, target, Math.min(1, dt * 5));
  }
}

/* ============================ PARTICELLE ============================ */
var particles = [];
var MAX_PARTICLES = 160;

function spawnP(p) { if (particles.length < MAX_PARTICLES) particles.push(p); }

function sparks(x, y, dir, n, color) {
  for (var i = 0; i < n; i++) {
    spawnP({ x: x, y: y, vx: dir * rand(80, 420) + rand(-80, 80), vy: rand(-280, -40),
             g: 1100, life: rand(0.22, 0.45), t: 0, r: rand(2, 4), color: color, kind: 'spark' });
  }
}

function sweat(x, y, dir, n) {
  for (var i = 0; i < n; i++) {
    spawnP({ x: x + rand(-8, 8), y: y + rand(-8, 8), vx: dir * rand(60, 260) + rand(-100, 100),
             vy: rand(-320, -120), g: 1500, life: rand(0.3, 0.55), t: 0, r: rand(2, 3.4),
             color: 'rgba(170,210,255,0.9)', kind: 'sweat' });
  }
}

function dust(x, n) {
  for (var i = 0; i < n; i++) {
    spawnP({ x: x + rand(-24, 24), y: rand(-6, 0), vx: rand(-70, 70), vy: rand(-90, -20),
             g: -40, life: rand(0.5, 0.9), t: 0, r: rand(6, 13),
             color: 'rgba(200,188,158,', kind: 'dust' });
  }
}

function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind !== 'dust' && p.y > -1) { p.y = -1; p.vy *= -0.4; p.vx *= 0.6; }
  }
}

function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var k = 1 - p.t / p.life;
    if (p.kind === 'dust') {
      ctx.fillStyle = p.color + (0.30 * k) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1.6 - k * 0.6), 0, 7);
      ctx.fill();
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * k + 0.5, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
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
    staminaFlashT: 0,
    holdingBlock: false,

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
  if (f.staminaFlashT > 0) f.staminaFlashT -= ms;

  // faccia sempre l'avversario (tranne quando è per terra)
  if (f.state !== 'downed' && f.state !== 'ko' && f.state !== 'dodge') {
    f.facing = opp.x >= f.x ? 1 : -1;
  }

  var wantDir = 0;
  if (Match.phase === 'fight') {
    if (f.isPlayer) {
      wantDir = (Input.right ? 1 : 0) - (Input.left ? 1 : 0);
    } else if (f.cpuDir) {
      wantDir = f.cpuDir;
    }
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
      f.stamina = clamp(f.stamina + F.staminaRegen * dt, 0, F.stamina);
      break;

    case 'dodge':
      f.vx = f.dodgeDir * (CONFIG.dodge.dist / (CONFIG.dodge.durMs / 1000));
      if (f.stateT >= CONFIG.dodge.durMs) { f.vx = 0; setState(f, 'idle'); }
      break;

    case 'attack':
      var m = f.move;
      var ph = attackPhase(f);
      if (ph.name === 'startup') {
        // piccolo affondo in avanti: la mossa deve sembrare "buttata"
        f.vx = expDamp(f.vx, f.facing * m.lunge, 12, dt);
      } else {
        f.vx = expDamp(f.vx, 0, 8, dt);
      }
      if (ph.name === 'active' && !f.moveHit) {
        checkHit(f, opp);
      }
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

/* ============================ CORPO MOLLE (Verlet) ============================ */
// 7 punti: testa, torace, bacino, 2 mani, 2 piedi.
// Torace/bacino inseguono lo stato arcade con molle rigide; il resto con
// molle morbide e poco smorzamento, così ondeggia e frusta.
// Al KO (o a terra) le molle si spengono: ragdoll pieno.
var BODY_POINTS = ['head', 'chest', 'pelvis', 'handLead', 'handRear', 'footLead', 'footRear'];
var BODY_RADII = { head: 23, chest: 14, pelvis: 14, handLead: 10, handRear: 10, footLead: 9, footRear: 9 };

function makeBody(f, t) {
  var pose = computePose(f, t);
  var body = {};
  for (var i = 0; i < BODY_POINTS.length; i++) {
    var n = BODY_POINTS[i];
    body[n] = { x: pose[n].x, y: pose[n].y, px: pose[n].x, py: pose[n].y };
  }
  // constraint di distanza: [a, b, lunghezza, "rope" = limita solo lo stiramento]
  var F = CONFIG.fighter;
  body.constraints = [
    ['pelvis', 'chest', F.chestH - F.pelvisH, false],
    ['chest', 'head', F.headH - F.chestH + 6, false],
    ['chest', 'handLead', F.armLen, true],
    ['chest', 'handRear', F.armLen, true],
    ['pelvis', 'footLead', F.legLen, true],
    ['pelvis', 'footRear', F.legLen, true],
    ['head', 'pelvis', F.headH - F.pelvisH, true]  // il collo non si piega all'indietro all'infinito
  ];
  return body;
}

function isRagdoll(f) { return f.state === 'ko' || f.state === 'downed'; }

function bodyImpulse(f, ix, iy) {
  // un impulso sul core: gli arti seguono in ritardo e frustano
  if (!f.body) return;
  var k = CONFIG.physics.impulseScale * 0.016;
  f.body.chest.px -= ix * k;
  f.body.chest.py -= iy * k;
  f.body.pelvis.px -= ix * k * 0.7;
  f.body.pelvis.py -= iy * k * 0.7;
  f.body.head.px -= ix * k * 1.3;
  f.body.head.py -= iy * k * 1.3;
}

function updateBody(f, dt, t) {
  if (!f.body || dt <= 0) return;
  var B = f.body;
  var P = CONFIG.physics;
  var ragdoll = isRagdoll(f);
  var pose = ragdoll ? null : computePose(f, t);
  var dampPow = dt * 60;

  for (var i = 0; i < BODY_POINTS.length; i++) {
    var n = BODY_POINTS[i];
    var pt = B[n];
    var isCore = (n === 'chest' || n === 'pelvis');
    var ax = 0, ay = 0;

    if (ragdoll) {
      ay = P.gravity;
    } else {
      var k = isCore ? P.coreSpring : P.poseSpring;
      ax = (pose[n].x - pt.x) * k;
      ay = (pose[n].y - pt.y) * k + (isCore ? 0 : P.gravity * P.limbGravity);
    }

    var damp = ragdoll ? 0.995 : Math.pow(isCore ? P.coreDamp : P.poseDamp, dampPow);
    var vx = (pt.x - pt.px) * damp;
    var vy = (pt.y - pt.py) * damp;
    pt.px = pt.x; pt.py = pt.y;
    pt.x += vx + ax * dt * dt;
    pt.y += vy + ay * dt * dt;
  }

  // solve constraints + collisioni
  for (var it = 0; it < P.iterations; it++) {
    for (var c = 0; c < B.constraints.length; c++) {
      var con = B.constraints[c];
      var a = B[con[0]], b = B[con[1]];
      var len = con[2], rope = con[3];
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      if (rope && d <= len) continue;
      var diff = (d - len) / d * 0.5;
      a.x += dx * diff; a.y += dy * diff;
      b.x -= dx * diff; b.y -= dy * diff;
    }
    for (var j = 0; j < BODY_POINTS.length; j++) {
      collidePoint(B[BODY_POINTS[j]], BODY_RADII[BODY_POINTS[j]], P);
    }
  }

  // testa che gira al KO (la foto che rotola è tutto il senso del gioco)
  if (ragdoll) {
    f.headSpin = (f.headSpin || 0) + (f.headSpinV || 0) * dt;
    f.headSpinV = (f.headSpinV || 0) * Math.max(0, 1 - 1.5 * dt);
    // lo stato arcade segue il corpo, così camera e rialzata tornano giuste
    f.x = clamp(B.pelvis.x, -CONFIG.world.cageHalf + 20, CONFIG.world.cageHalf - 20);
  } else {
    f.headSpin = (f.headSpin || 0) * Math.max(0, 1 - 8 * dt);
    f.headSpinV = 0;
  }

  f.renderPose = {
    head: B.head, chest: B.chest, pelvis: B.pelvis,
    handLead: B.handLead, handRear: B.handRear,
    footLead: B.footLead, footRear: B.footRear
  };
}

function collidePoint(pt, r, P) {
  // tappeto
  if (pt.y > -r) {
    var vy = pt.y - pt.py;
    var vx = pt.x - pt.px;
    pt.y = -r;
    if (vy > 0) pt.py = pt.y + vy * P.bounce;
    pt.px = pt.x - vx * P.groundFriction;
    if (vy > 9) dust(pt.x, Math.min(4, Math.floor(vy * 0.35)));  // polvere sull'impatto
  }
  // rete della gabbia
  var wall = CONFIG.world.cageHalf - 10;
  if (pt.x > wall) {
    var vx2 = pt.x - pt.px;
    pt.x = wall;
    if (vx2 > 0) pt.px = pt.x + vx2 * P.fenceBounce;
  } else if (pt.x < -wall) {
    var vx3 = pt.x - pt.px;
    pt.x = -wall;
    if (vx3 < 0) pt.px = pt.x + vx3 * P.fenceBounce;
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
  var ang = Math.atan2(hy - p.chest.y, hx - p.chest.x) + Math.PI / 2;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang * 0.5 + (f.headSpin || 0));
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

  drawAnnounce();
  drawGetupPrompt();
}

function drawAnnounce() {
  var t = now();
  if (t > Announce.until || !Announce.text) return;
  var age = t - Announce.born;
  var pop = Math.min(1, age / 160);
  var scale = 0.6 + 0.4 * (1 - Math.pow(1 - pop, 3));
  var fade = clamp((Announce.until - t) / 250, 0, 1);
  ctx.save();
  ctx.translate(W / 2, H * 0.34);
  ctx.scale(scale, scale);
  ctx.globalAlpha = fade;
  ctx.font = 'italic 900 ' + Math.min(64, W * 0.08) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(Announce.text, 0, 0);
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(Announce.text, 0, 0);
  ctx.restore();
}

function drawGetupPrompt() {
  if (!f1 || f1.state !== 'downed' || Match.phase !== 'fight') return;
  var K = CONFIG.knockdown;
  var frac = 1 - clamp(f1.stateT / K.getupMs, 0, 1);
  var y = H * 0.52;
  var blink = Math.floor(now() / 220) % 2 === 0;
  if (blink) {
    ctx.font = '900 ' + Math.min(30, W * 0.045) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText('TAPPA PER RIALZARTI!', W / 2, y);
    ctx.fillStyle = '#fff';
    ctx.fillText('TAPPA PER RIALZARTI!', W / 2, y);
  }
  // barra del tempo rimasto
  var bw = Math.min(W * 0.3, 260);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(W / 2 - bw / 2, y + 26, bw, 10, 5); ctx.fill();
  ctx.fillStyle = frac > 0.35 ? '#ffd24a' : '#d03030';
  if (frac > 0) { roundRect(W / 2 - bw / 2, y + 26, bw * frac, 10, 5); ctx.fill(); }
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
  ctx.fillStyle = (f.staminaFlashT > 0 && Math.floor(f.staminaFlashT / 60) % 2 === 0)
    ? '#ff5050' : '#e8c33a';
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

/* ============================ MATCH ============================ */
var Match = {
  round: 1,
  timeLeft: CONFIG.rounds.durationS,
  running: false,
  difficulty: 1,
  phase: 'intro',       // intro | fight | rest | ko | over
  phaseT: 0,
  winner: null,
  method: ''
};

var Announce = { text: '', until: 0, born: 0 };
function announce(text, ms) {
  Announce.text = text;
  Announce.born = now();
  Announce.until = now() + ms;
}

function startMatch(diff) {
  Match.difficulty = diff;
  Match.running = true;
  Match.winner = null;
  Match.method = '';
  f1 = makeFighter(0, -140, 1);
  f2 = makeFighter(1, 140, -1);
  f1.isPlayer = true;
  f2.cpu = { thinkT: 0, blockT: 0, reacted: false, pendingBlock: -1, pendingDodge: -1, getupT: -1 };
  f1.body = makeBody(f1, 0);
  f2.body = makeBody(f2, 0);
  Match.round = 0;
  startRound(1);
  document.getElementById('menu-overlay').classList.add('hidden');
}

function startRound(n) {
  var R = CONFIG.rounds;
  Match.round = n;
  Match.timeLeft = R.durationS;
  Match.phase = 'intro';
  Match.phaseT = 0;
  var fs = [f1, f2];
  for (var i = 0; i < 2; i++) {
    var f = fs[i];
    f.x = i === 0 ? -140 : 140;
    f.facing = i === 0 ? 1 : -1;
    f.vx = 0;
    f.state = 'idle';
    f.stateT = 0;
    f.move = null;
    f.stamina = CONFIG.fighter.stamina;
    if (n > 1) f.hp = Math.min(CONFIG.fighter.hp, f.hp + R.healBetween);
    f.headSpin = 0; f.headSpinV = 0;
    f.body = makeBody(f, 0);
  }
  if (f2.cpu) { f2.cpu.blockT = 0; f2.cpu.pendingBlock = -1; f2.cpu.pendingDodge = -1; f2.cpu.getupT = -1; }
  timescale = 1;
  slowmoT = 0;
  hitstopMs = 0;
  particles.length = 0;
  announce('ROUND ' + n, R.introMs - 200);
}

function updateMatch(dt) {
  var R = CONFIG.rounds;
  Match.phaseT += dt * 1000;
  switch (Match.phase) {
    case 'intro':
      if (Match.phaseT >= R.introMs) {
        Match.phase = 'fight';
        Match.phaseT = 0;
        announce('FIGHT!', 700);
        onBell();
      }
      break;
    case 'fight':
      Match.timeLeft -= dt;
      handleDowned(f1);
      handleDowned(f2);
      if (Match.phase !== 'fight') break; // un TKO può essere scattato qui sopra
      if (Match.timeLeft <= 0) {
        Match.timeLeft = 0;
        onBell();
        if (Match.round >= R.count) {
          decision();
        } else {
          Match.phase = 'rest';
          Match.phaseT = 0;
          announce('FINE ROUND', 1600);
        }
      }
      break;
    case 'rest':
      if (Match.phaseT >= R.restMs) startRound(Match.round + 1);
      break;
    case 'ko':
      if (Match.phaseT >= 2800) showWinner();
      break;
  }
}

function handleDowned(f) {
  if (f.state !== 'downed') return;
  var K = CONFIG.knockdown;
  if (f.stateT >= K.getupMs) {
    // non si è rialzato in tempo: TKO
    endByKO(fighterOpponent(f), f, 'TKO');
    return;
  }
  if (f.isPlayer) {
    if (Input.tapped && f.stateT > 450) getUp(f);
  } else {
    var c = f.cpu;
    if (c.getupT < 0) c.getupT = rand(800, 2200);
    if (f.stateT >= c.getupT) { c.getupT = -1; getUp(f); }
  }
}

function getUp(f) {
  f.state = 'idle';
  f.stateT = 0;
  f.invulnMs = 700;   // un attimo di respiro mentre si rialza
  f.vx = 0;
}

function decision() {
  var winner = null;
  if (f1.damageDealt > f2.damageDealt) winner = f1;
  else if (f2.damageDealt > f1.damageDealt) winner = f2;
  Match.winner = winner;
  Match.method = winner ? 'AI PUNTI' : 'PAREGGIO';
  Match.phase = 'ko';
  Match.phaseT = 800; // niente ragdoll da guardare, accorcia l'attesa
  announce(winner ? 'DECISIONE!' : 'PAREGGIO!', 1800);
}

function endByKO(winner, loser, method) {
  Match.winner = winner;
  Match.method = method;
  Match.phase = 'ko';
  Match.phaseT = 0;
  if (loser.state !== 'ko') {
    loser.state = 'ko';
    loser.stateT = 0;
    loser.ko = true;
    bodyImpulse(loser, -loser.facing * 500, -350);
  }
  announce(method + '!', 2000);
  onKOJuice(loser);
}

function showWinner() {
  Match.phase = 'over';
  Match.running = true; // continua a disegnare la scena sotto l'overlay
  var ov = document.getElementById('menu-overlay');
  var h1 = ov.querySelector('h1');
  var sub = document.getElementById('menu-sub');
  if (Match.winner) {
    h1.textContent = 'VINCE ' + Match.winner.name + '!';
    sub.textContent = Match.method + (Match.method === 'AI PUNTI' ? '' : ' al round ' + Match.round) +
      ' — rivincita?';
  } else {
    h1.textContent = 'PAREGGIO';
    sub.textContent = 'Nessuno le ha prese abbastanza. Rivincita?';
  }
  ov.classList.remove('hidden');
}

/* ============================ CPU ============================ */
function updateCPU(f, dt) {
  if (!f.cpu || f.state === 'downed' || f.state === 'ko') { f.cpuDir = 0; return; }
  var c = f.cpu;
  var opp = fighterOpponent(f);
  var L = CONFIG.cpu.levels[Match.difficulty];
  var ms = dt * 1000;
  var d = Math.abs(opp.x - f.x);
  var toward = opp.x >= f.x ? 1 : -1;

  // --- percezione con ritardo: reagisce agli attacchi, ma non è onnisciente ---
  if (opp.state === 'attack' && !c.reacted) {
    c.reacted = true;
    if (Math.random() > L.mistakes) {
      var r = Math.random();
      var delay = L.reactionMs * rand(0.85, 1.35);
      if (r < L.blockChance) c.pendingBlock = delay;
      else if (r < L.blockChance + L.dodgeChance) c.pendingDodge = delay;
      // altrimenti: l'ha visto ma non fa niente (capita anche ai migliori)
    }
  }
  if (opp.state !== 'attack') c.reacted = false;

  if (c.pendingBlock >= 0) {
    c.pendingBlock -= ms;
    if (c.pendingBlock < 0) c.blockT = rand(300, 650);
  }
  if (c.pendingDodge >= 0) {
    c.pendingDodge -= ms;
    if (c.pendingDodge < 0) tryDodge(f);
  }
  if (c.blockT > 0) c.blockT -= ms;

  // --- pianificazione: ogni thinkMs riconsidera cosa fare ---
  c.thinkT -= ms;
  if (c.thinkT <= 0) {
    c.thinkT = CONFIG.cpu.thinkMs * rand(0.7, 1.6);
    c.dir = 0;
    c.wantAttack = null;

    if (opp.state === 'downed' || opp.state === 'ko') {
      c.dir = d < 180 ? -toward : 0;          // si scosta, fa il magnanimo
    } else if (f.stamina < 22) {
      c.dir = -toward;                         // fiaccato: rifiata
    } else if (f.hp < CONFIG.cpu.retreatHp && Math.random() < 0.5) {
      c.dir = -toward;                         // messo male: scappa un po'
      if (Math.random() < 0.4) c.blockT = rand(250, 500);
    } else if (d > CONFIG.cpu.idealRange + 45) {
      c.dir = toward;
    } else if (d < CONFIG.cpu.idealRange - 35) {
      c.dir = -toward;
    } else if (Math.random() < L.aggression) {
      // in range: prova a menare
      var goKick = (opp.hp < CONFIG.knockdown.hpThreshold && Math.random() < 0.65) ||
                   Math.random() < 0.3;
      c.wantAttack = goKick ? 'kick' : 'punch';
    }
  }

  // --- esecuzione ---
  f.cpuDir = c.dir || 0;
  applyBlockInput(f, c.blockT > 0);
  if (c.wantAttack && (f.state === 'idle' || f.state === 'walk')) {
    var kind = c.wantAttack;
    c.wantAttack = null;
    if (d < CONFIG.moves[kind].range + 40) tryAttack(f, kind);
  }
}

/* ============================ INPUT → AZIONI ============================ */
function handlePlayerInput(f) {
  if (!f.isPlayer) return;
  if (Input.dodgePressed) {
    Input.dodgePressed = false;
    tryDodge(f);
  }
  if (Input.punchPressed) { Input.punchPressed = false; tryAttack(f, 'punch'); }
  if (Input.kickPressed)  { Input.kickPressed = false;  tryAttack(f, 'kick'); }
  applyBlockInput(f, Input.block);
}

function applyBlockInput(f, holding) {
  f.holdingBlock = holding;
  if (holding && (f.state === 'idle' || f.state === 'walk') && f.stamina > 0) {
    f.state = 'block';
    f.stateT = 0;
  }
}

function tryDodge(f) {
  if (f.state !== 'idle' && f.state !== 'walk') return;
  if (f.stamina < CONFIG.dodge.staminaCost) { staminaFail(f); return; }
  f.stamina -= CONFIG.dodge.staminaCost;
  f.dodgeDir = -f.facing;
  f.invulnMs = CONFIG.dodge.invulnMs;
  f.state = 'dodge';
  f.stateT = 0;
  onWhoosh(f);
}

/* ============================ COMBATTIMENTO ============================ */
function tryAttack(f, kind) {
  if (f.state !== 'idle' && f.state !== 'walk') return;
  var m = CONFIG.moves[kind];
  if (f.stamina < m.stamina) { staminaFail(f); return; }
  f.stamina -= m.stamina;
  f.move = { kind: kind, startup: m.startup, active: m.active, recovery: m.recovery,
             damage: m.damage, knockback: m.knockback, hitstun: m.hitstun,
             range: m.range, hitboxH: m.hitboxH, hitY: m.hitY, chip: m.chip,
             lunge: m.lunge };
  f.moveHit = false;
  f.state = 'attack';
  f.stateT = 0;
  if (kind === 'kick') onWhoosh(f);
}

function staminaFail(f) {
  f.staminaFlashT = 300; // la barra lampeggia: sei fiaccato
}

// hitbox dell'attacco vs hurtbox dell'avversario (rettangoli, un solo hit)
function checkHit(f, opp) {
  var m = f.move;
  var s = f.facing;
  // hitbox: davanti all'attaccante
  var hx1 = f.x + s * 24, hx2 = f.x + s * m.range;
  if (hx1 > hx2) { var tmp = hx1; hx1 = hx2; hx2 = tmp; }
  var hy1 = m.hitY - m.hitboxH / 2, hy2 = m.hitY + m.hitboxH / 2;
  // hurtbox avversario
  var HB = CONFIG.hurtbox;
  var ox1 = opp.x - HB.halfW, ox2 = opp.x + HB.halfW;
  var oy1 = HB.top, oy2 = 0;
  if (opp.state === 'downed' || opp.state === 'ko') return;      // niente calci a terra
  if (opp.invulnMs > 0) return;                                   // schivata riuscita
  if (hx2 < ox1 || hx1 > ox2 || hy2 < oy1 || hy1 > oy2) return;   // niente overlap

  f.moveHit = true;
  resolveHit(f, opp, m);
}

function resolveHit(f, opp, m) {
  var blocked = opp.state === 'block';
  var dir = opp.x >= f.x ? 1 : -1;

  if (blocked) {
    // parata: 80% del danno tagliato, ma chip damage e stamina persa
    var chip = Math.min(m.chip, Math.max(0, opp.hp - 1)); // il chip non uccide
    opp.hp -= chip;
    opp.stamina -= CONFIG.block.staminaDrainHit;
    opp.vx += dir * m.knockback * 0.45;
    bodyImpulse(opp, dir * m.knockback * 1.2, 0);
    f.damageDealt += chip;
    if (opp.stamina <= 0) {
      opp.stamina = 0;
      guardBreak(opp);
      onGuardBreak(opp);
    } else {
      onHit(f, opp, m, true);
    }
    return;
  }

  opp.hp -= m.damage;
  f.damageDealt += m.damage;
  opp.vx += dir * m.knockback;
  bodyImpulse(opp, dir * m.knockback * 3.2, -m.knockback * 0.9);
  onHit(f, opp, m, false);

  if (opp.hp <= 0) {
    opp.hp = 0;
    doKO(opp, dir, m);
    return;
  }

  // calcio pulito con vita bassa → al tappeto (gestione completa in M4)
  if (m.kind === 'kick' && opp.hp < CONFIG.knockdown.hpThreshold) {
    doKnockdown(opp, dir);
    return;
  }

  opp.state = 'hitstun';
  opp.stateT = 0;
  opp.hitstunMs = m.hitstun;
  opp.holdingBlock = false;
}

function doKnockdown(opp, dir) {
  opp.state = 'downed';
  opp.stateT = 0;
  opp.dodgeDir = dir;   // riusato come "verso della caduta"
  opp.downs++;
  opp.vx = 0;
  bodyImpulse(opp, dir * 850, -650);
  opp.headSpinV = dir * rand(3, 6);
  if (opp.downs >= CONFIG.knockdown.maxDowns) {
    endByKO(fighterOpponent(opp), opp, 'TKO');
    return;
  }
  onKnockdown(opp);
}

function doKO(opp, dir, m) {
  opp.state = 'ko';
  opp.stateT = 0;
  opp.ko = true;
  opp.dodgeDir = dir;
  opp.vx = 0;
  bodyImpulse(opp, dir * 1200, -900);
  opp.headSpinV = dir * rand(5, 10);
  onKO(opp);
}

/* ---- juice: qui il gioco "si sente" ---- */
function onHit(f, opp, m, blocked) {
  var dir = opp.x >= f.x ? 1 : -1;
  var hx = (f.x + opp.x) / 2 + dir * 12;
  var hy = m.hitY;
  if (blocked) {
    hitstopMs = Math.max(hitstopMs, 30);
    cam.shake += m.damage * CONFIG.juice.shakePerDamage * 0.35;
    sparks(hx, hy, dir, 4, '#9fc4ff');
    CrowdE = Math.min(1.5, CrowdE + 0.05);
    sfxThud(0.3, 240);
  } else {
    hitstopMs = Math.max(hitstopMs,
      m.kind === 'punch' ? CONFIG.juice.hitstopPunchMs : CONFIG.juice.hitstopKickMs);
    cam.shake += m.damage * CONFIG.juice.shakePerDamage;
    sparks(hx, hy, dir, m.kind === 'punch' ? 6 : 10, '#ffd24a');
    if (opp.body) sweat(opp.body.head.x, opp.body.head.y, dir, m.kind === 'punch' ? 3 : 6);
    CrowdE = Math.min(1.5, CrowdE + m.damage * 0.035);
    sfxThud(clamp(0.35 + m.damage * 0.035, 0, 0.95), m.kind === 'punch' ? 150 : 105);
  }
}

function onGuardBreak(opp) {
  announce('GUARDIA ROTTA!', 1100);
  hitstopMs = Math.max(hitstopMs, 50);
  cam.shake += 8;
  sparks(opp.x, -130, -opp.facing, 8, '#9fc4ff');
  sfxThud(0.6, 330);
  noiseBurst(0.15, 'highpass', 1500, 0.25);
}

function onKnockdown(opp) {
  announce('AL TAPPETO!', 1200);
  cam.shake += 12;
  CrowdE = Math.min(1.5, CrowdE + 0.7);
  dust(opp.x, 8);
  sfxThud(0.8, 95);
}

function onKO(opp) { endByKO(fighterOpponent(opp), opp, 'KO'); }

function onWhoosh(f) { sfxWhoosh(); }

function onBell() { sfxBell(); }

function onKOJuice(loser) {
  timescale = CONFIG.juice.koSlowmo;
  slowmoT = CONFIG.juice.koSlowmoMs;
  cam.shake += 20;
  CrowdE = 1.5;
  dust(loser.x, 10);
  sfxThud(1.0, 80);
  noiseBurst(1.2, 'bandpass', 500, 0.3); // il pubblico esplode
}

/* ============================ GAME LOOP ============================ */
var lastT = 0;
var timescale = 1;
var hitstopMs = 0;
var slowmoT = 0;

function frame(tNow) {
  requestAnimationFrame(frame);
  var rawDt = (tNow - lastT) / 1000;
  lastT = tNow;
  var dt = clamp(rawDt, 0, 0.05);   // clamp: tab che torna in focus non esplode

  if (isPortrait) return;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(tNow);

  if (Match.running) {
    if (slowmoT > 0) {
      slowmoT -= dt * 1000;
      if (slowmoT <= 0) timescale = 1;
    }
    var gdt = dt * timescale;
    if (hitstopMs > 0) {
      hitstopMs -= dt * 1000;
    } else {
      if (Match.phase === 'fight') {
        handlePlayerInput(f1);
        updateCPU(f2, gdt);
      } else {
        f2.cpuDir = 0;
      }
      updateMatch(gdt);
      updateFighter(f1, gdt, tNow);
      updateFighter(f2, gdt, tNow);
      separateBodies();
      updateBody(f1, gdt, tNow);
      updateBody(f2, gdt, tNow);
      updateParticles(gdt);
    }
    updateCamera(dt);
    updateCrowd(dt);

    ctx.save();
    applyCameraTransform();
    drawCrowd(tNow);
    drawSpotlights(tNow);
    drawFence(false);
    drawMat();
    drawFighter(f1, tNow);
    drawFighter(f2, tNow);
    drawParticles();
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
      userTap(); // sblocca l'audio (iOS vuole un gesto utente)
      startMatch(parseInt(e.currentTarget.getAttribute('data-diff'), 10));
    });
  }
  document.getElementById('btn-mute').addEventListener('click', function () {
    userTap();
    toggleMute();
  });
  requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
})();
