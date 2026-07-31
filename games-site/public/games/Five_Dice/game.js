/* ============================================================
   FIVE DICE  –  game.js
   A dice scoring game with physics simulation.
   ============================================================ */


// =============================================================
// CANVAS SETUP
// =============================================================

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

function resize() {
  // Narrower max-width leaves room for the tournament log panel beside it
  const vw = Math.min(window.innerWidth * 0.96, 560);
  canvas.width  = Math.floor(Math.min(vw, window.innerHeight * 0.9 * 0.72));
  canvas.height = Math.floor(canvas.width * 1.52);
}
resize();
window.addEventListener('resize', () => {
  resize();
  speckleCanvas = null; // force speckle regeneration on resize
  layoutScorecard();
});

const W = () => canvas.width;
const H = () => canvas.height;


// =============================================================
// LAYOUT ZONES
// Three vertical regions: dice tray | roll strip | scorecard
// =============================================================

function diceAreaBottom()  { return Math.floor(H() * 0.42); }
function rollStripBottom() { return diceAreaBottom() + Math.floor(H() * 0.08); }


// =============================================================
// PHYSICS CONSTANTS
// =============================================================

const RESTITUTION   = 0.38;  // bounce energy retention wall/floor
const BASE_FRICTION = 0.994; // air drag when airborne
const WALL_FRICTION = 0.7;   // lateral velocity loss on wall hit
const GRAVITY       = 0.09;  // downward acceleration per frame
const V_RESTITUT    = 0.6;   // vertical bounce retention
const FLOOR_FRIC    = 0.9;   // lateral drag on floor landing
const DRAG_THRESH   = 0.12;  // apex height below which drag increases
const DRAG_MAX      = 0.72;  // max drag coefficient near ground
const SLERP_FRAMES  = 28;    // frames to slerp die to final pose
const TRAY_PAD      = 12;    // pixel padding inside tray walls


// =============================================================
// 3D MATH  (column-major 3×3 rotation matrices, flat arrays)
// =============================================================

/** Multiply matrix × vector */
function mulMV(m, v) {
  return [
    m[0]*v[0] + m[1]*v[1] + m[2]*v[2],
    m[3]*v[0] + m[4]*v[1] + m[5]*v[2],
    m[6]*v[0] + m[7]*v[1] + m[8]*v[2],
  ];
}

/** Multiply matrix × matrix */
function mulMM(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ];
}

/** Project 3D point to 2D canvas (flip Y) */
function proj(p) { return [p[0], -p[1]]; }

/** Normalise a 3-vector */
function normV(v) {
  const l = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2);
  return l < 1e-12 ? [0, 1, 0] : v.map(x => x / l);
}

/** Rotation matrix that rotates unit vector `from` onto unit vector `to` */
function rotateFromTo(from, to) {
  const cx = from[1]*to[2] - from[2]*to[1];
  const cy = from[2]*to[0] - from[0]*to[2];
  const cz = from[0]*to[1] - from[1]*to[0];
  const sinA = Math.sqrt(cx**2 + cy**2 + cz**2);
  const cosA = from[0]*to[0] + from[1]*to[1] + from[2]*to[2];
  if (sinA < 1e-9) {
    if (cosA > 0) return [1,0,0, 0,1,0, 0,0,1];
    // 180° rotation — pick an orthogonal axis
    const px = Math.abs(from[0]) < 0.9 ? 1 : 0;
    const py = Math.abs(from[0]) < 0.9 ? 0 : 1;
    const qx = from[1]*0 - from[2]*py;
    const qy = from[2]*px - from[0]*0;
    const qz = from[0]*py - from[1]*px;
    const ql = Math.sqrt(qx**2 + qy**2 + qz**2);
    const k  = [qx/ql, qy/ql, qz/ql];
    return [
      2*k[0]**2-1,   2*k[0]*k[1], 2*k[0]*k[2],
      2*k[1]*k[0],   2*k[1]**2-1, 2*k[1]*k[2],
      2*k[2]*k[0],   2*k[2]*k[1], 2*k[2]**2-1,
    ];
  }
  const k = [cx/sinA, cy/sinA, cz/sinA];
  const t = 1 - cosA, s = sinA;
  return [
    t*k[0]**2+cosA,   t*k[0]*k[1]-s*k[2], t*k[0]*k[2]+s*k[1],
    t*k[1]*k[0]+s*k[2], t*k[1]**2+cosA,   t*k[1]*k[2]-s*k[0],
    t*k[2]*k[0]-s*k[1], t*k[2]*k[1]+s*k[0], t*k[2]**2+cosA,
  ];
}

/** Rotation matrix around Z axis by angle `a` */
function Rz(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c,-s,0, s,c,0, 0,0,1];
}

/** Rotation matrix around arbitrary axis by angle */
function rotAxis(ax, ay, az, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    t*ax**2+c,      t*ax*ay-s*az, t*ax*az+s*ay,
    t*ay*ax+s*az,   t*ay**2+c,    t*ay*az-s*ax,
    t*az*ax-s*ay,   t*az*ay+s*ax, t*az**2+c,
  ];
}

/** Spherical-linear interpolation between two rotation matrices */
function slerpM(A, B, t) {
  const AT = [A[0],A[3],A[6], A[1],A[4],A[7], A[2],A[5],A[8]];
  const R   = mulMM(B, AT);
  const cosA = Math.max(-1, Math.min(1, (R[0]+R[4]+R[8]-1) / 2));
  const angle = Math.acos(cosA);
  if (angle < 1e-6) return A;
  const s  = 1 / (2 * Math.sin(angle));
  const ax = (R[7]-R[5])*s, ay = (R[2]-R[6])*s, az = (R[3]-R[1])*s;
  return mulMM(rotAxis(ax, ay, az, angle * t), A);
}


// =============================================================
// D6 GEOMETRY
// =============================================================

const CUBE_VERTS = [
  [-0.5,-0.5,-0.5], [0.5,-0.5,-0.5], [0.5,0.5,-0.5], [-0.5,0.5,-0.5],
  [-0.5,-0.5, 0.5], [0.5,-0.5, 0.5], [0.5,0.5, 0.5], [-0.5,0.5, 0.5],
];

const CUBE_FACES = [
  { verts:[3,2,1,0], normal:[ 0, 0,-1], val:1 },
  { verts:[4,5,6,7], normal:[ 0, 0, 1], val:6 },
  { verts:[0,1,5,4], normal:[ 0,-1, 0], val:2 },
  { verts:[7,6,2,3], normal:[ 0, 1, 0], val:5 },
  { verts:[0,4,7,3], normal:[-1, 0, 0], val:3 },
  { verts:[1,2,6,5], normal:[ 1, 0, 0], val:4 },
];

// Pre-render each face to an offscreen canvas for fast texture mapping
const FACE_TEX_SIZE = 128;
const D6_FACE_CANVAS = {};
for (const f of CUBE_FACES) {
  const fc = document.createElement('canvas');
  fc.width = fc.height = FACE_TEX_SIZE;
  const c = fc.getContext('2d');
  c.fillStyle = '#c0282a';
  c.beginPath();
  c.roundRect(3, 3, FACE_TEX_SIZE-6, FACE_TEX_SIZE-6, 12);
  c.fill();
  c.fillStyle  = '#ffffff';
  c.font       = `bold ${FACE_TEX_SIZE * 0.52}px monospace`;
  c.textAlign  = 'center';
  c.textBaseline = 'middle';
  c.fillText(String(f.val), FACE_TEX_SIZE/2, FACE_TEX_SIZE/2);
  D6_FACE_CANVAS[f.val] = fc;
}

/** Return a rotation matrix that places face `outcome` pointing upward, random spin */
function settlePoseD6(outcome) {
  const face  = CUBE_FACES.find(f => f.val === outcome);
  const Rbase = rotateFromTo(face.normal, [0, 0, 1]);
  return mulMM(Rz(Math.floor(Math.random() * 4) * Math.PI / 2), Rbase);
}

/**
 * Build a pre-computed animation path for a die.
 * The path plays forwards = die bouncing then settling.
 * Stored reversed so frame 0 is the final pose (skip-anim can just use frame 0).
 */
function buildAnimPath(snapM, initVz) {
  const ROT_DECAY   = 0.78;
  const bounceVels  = [];
  let vUp = initVz;
  while (vUp > 0.06) { bounceVels.push(vUp); vUp *= V_RESTITUT; }
  bounceVels.reverse();

  let omega = 0.025 + Math.random() * 0.015;
  let axis  = normV([Math.random()-0.5, Math.random()-0.5, Math.random()-0.5]);

  const fwdPath     = [snapM];
  const fwdSegments = [];
  let M = snapM;

  for (let bi = 0; bi < bounceVels.length; bi++) {
    const v          = bounceVels[bi];
    const segStart   = fwdPath.length;
    const airFrames  = Math.ceil(2 * v / GRAVITY);
    for (let f = 0; f < airFrames; f++) {
      M = mulMM(rotAxis(axis[0], axis[1], axis[2], omega), M);
      fwdPath.push(M);
    }
    fwdSegments.push({ start: segStart, end: fwdPath.length - 1 });
    omega /= ROT_DECAY;
    axis   = normV([Math.random()-0.5, Math.random()-0.5, Math.random()-0.5]);
  }

  const totalLen = fwdPath.length - 1;
  fwdPath.reverse();
  const segments = [...fwdSegments].reverse().map(({ start, end }) => ({
    start: totalLen - end,
    end:   totalLen - start,
  }));
  return { path: fwdPath, segments };
}

/** Apply an affine transform to a canvas pattern so a quad maps onto the face texture */
function setPatternTransform(pat, p0, p1, p3) {
  const FS = FACE_TEX_SIZE;
  const a  = (p1[0]-p0[0])/FS, b  = (p1[1]-p0[1])/FS;
  const cc = (p3[0]-p0[0])/FS, d  = (p3[1]-p0[1])/FS;
  pat.setTransform(new DOMMatrix([a, b, cc, d, p0[0], p0[1]]));
}

/** Draw one textured quad face of the die */
function drawQuad(faceCanvas, pts, scale, cx, cy) {
  const T  = p => [p[0]*scale + cx, p[1]*scale + cy];
  const [p0, p1, p2, p3] = pts.map(T);
  const pat = ctx.createPattern(faceCanvas, 'no-repeat');
  setPatternTransform(pat, p0, p1, p3);
  ctx.fillStyle = pat;
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth   = 1;
  ctx.stroke();
}


// =============================================================
// DIE SIZE  (responsive, ~25% smaller than previous iteration)
// =============================================================

let DIE_R  = 18; // half-width in pixels (radius for collision)
let DIE_SC = 33; // scale factor passed to drawQuad

function updateDieSize() {
  DIE_R  = Math.floor(Math.min(W() / 20, diceAreaBottom() / 5.5));
  DIE_SC = Math.floor(DIE_R * 1.86);
}


// =============================================================
// SKIP-ANIM GRID POSITIONS  (5 dice in 3+2 layout, no overlap)
// =============================================================

function skipPositions() {
  const db = diceAreaBottom();
  const y1 = db * 0.28, y2 = db * 0.68;
  return [
    { x: W()*0.18, y: y1 }, { x: W()*0.50, y: y1 }, { x: W()*0.82, y: y1 },
    { x: W()*0.33, y: y2 }, { x: W()*0.67, y: y2 },
  ];
}


// =============================================================
// DIE OBJECT
// =============================================================

function createDie(outcome, doSkip, cx, cy) {
  const snapM = settlePoseD6(outcome);
  const initVz = 1.6 + Math.random() * 0.7;
  const { path: animPath, segments } = buildAnimPath(snapM, initVz);
  const dir = Math.random() * Math.PI * 2;

  const die = {
    outcome, snapM, animPath, segments,
    // 2D position and velocity in the tray
    x:    cx + (Math.random()-0.5) * 30,
    y2d:  cy + (Math.random()-0.5) * 30,
    vx:   Math.cos(dir) * (10 + Math.random()*10),
    vy2d: Math.sin(dir) * (10 + Math.random()*10),
    // Vertical bounce simulation
    h: 1.2 + Math.random() * 0.8,
    vz: initVz,
    apex: 0,
    // Animation path tracking
    segIdx: 0, arcVzStart: initVz,
    animFrame: 0, curM: animPath[0],
    settling: false, settleT: 0, settleFrom: null,
    phase:  doSkip ? 'done' : 'roll',
    locked: false,
  };
  if (doSkip) die.curM = die.snapM;
  return die;
}


// =============================================================
// PHYSICS STEP
// =============================================================

function stepPhysics(dice) {
  updateDieSize();
  const walls = {
    left:   TRAY_PAD,
    right:  W() - TRAY_PAD,
    top:    TRAY_PAD,
    bottom: diceAreaBottom() - TRAY_PAD,
  };

  // --- Per-die gravity / bounce / drag / wall collisions ---
  dice.forEach(die => {
    if (die.phase === 'done' || die.locked) return;

    const prevH = die.h;
    die.vz -= GRAVITY;
    die.h  += die.vz;

    const justLanded = prevH > 0.001 && die.h <= 0;
    if (die.h <= 0) {
      die.h  = 0;
      die.vz = Math.abs(die.vz) * V_RESTITUT;
      die.apex = (die.vz**2) / (2 * GRAVITY);
      die.vx   *= FLOOR_FRIC;
      die.vy2d *= FLOOR_FRIC;
      if (justLanded) {
        const nextSeg = die.segIdx + 1;
        if (nextSeg < die.segments.length) {
          die.segIdx    = nextSeg;
          die.arcVzStart = die.vz;
        }
        if (die.vz < 0.08) die.apex = 0;
        // Scatter direction on bounce
        const spd = Math.sqrt(die.vx**2 + die.vy2d**2);
        if (spd > 0.5) {
          const a = Math.atan2(die.vy2d, die.vx) + (Math.random()-0.5) * (Math.PI/3);
          die.vx   = Math.cos(a) * spd;
          die.vy2d = Math.sin(a) * spd;
        }
      }
    }

    if (die.vz > 0) die.apex = die.h + (die.vz**2) / (2 * GRAVITY);

    // Air drag increases as die approaches ground
    const groundFraction = Math.max(0, 1 - die.apex / DRAG_THRESH);
    const friction = BASE_FRICTION - groundFraction * (BASE_FRICTION - DRAG_MAX);
    die.vx   *= friction;
    die.vy2d *= friction;
    die.x    += die.vx;
    die.y2d  += die.vy2d;

    // Wall bounces
    const r  = DIE_R;
    const wd = 0.7 + Math.random() * 0.1; // slight randomness to wall bounce
    if (die.x - r < walls.left)   { die.x = walls.left+r;   die.vx   =  Math.abs(die.vx)   * RESTITUTION * wd; die.vy2d *= WALL_FRICTION; }
    else if (die.x + r > walls.right)  { die.x = walls.right-r;  die.vx   = -Math.abs(die.vx)   * RESTITUTION * wd; die.vy2d *= WALL_FRICTION; }
    if (die.y2d - r < walls.top)  { die.y2d = walls.top+r;  die.vy2d =  Math.abs(die.vy2d) * RESTITUTION * wd; die.vx   *= WALL_FRICTION; }
    else if (die.y2d + r > walls.bottom) { die.y2d = walls.bottom-r; die.vy2d = -Math.abs(die.vy2d) * RESTITUTION * wd; die.vx   *= WALL_FRICTION; }

    // AABB collision against each locked die (locked dice are solid obstacles)
    dice.forEach(locked => {
      if (!locked.locked) return;
      const half = DIE_R + 3;
      const ox   = half*2 - Math.abs(die.x   - locked.x);
      const oy   = half*2 - Math.abs(die.y2d - locked.y2d);
      if (ox > 0 && oy > 0) {
        if (ox < oy) {
          const sg = die.x < locked.x ? -1 : 1;
          die.x   += sg * ox / 2;
          die.vx   = Math.abs(die.vx) * RESTITUTION * sg;
          die.vy2d *= WALL_FRICTION;
        } else {
          const sg = die.y2d < locked.y2d ? -1 : 1;
          die.y2d  += sg * oy / 2;
          die.vy2d  = Math.abs(die.vy2d) * RESTITUTION * sg;
          die.vx   *= WALL_FRICTION;
        }
      }
    });
  });

  // --- Circle-circle collisions between rolling dice ---
  for (let i = 0; i < dice.length; i++) {
    for (let j = i + 1; j < dice.length; j++) {
      const a = dice[i], b = dice[j];
      if (a.locked || b.locked) continue;
      if (a.phase === 'done' && b.phase === 'done') continue;

      const dx   = b.x - a.x, dy = b.y2d - a.y2d;
      const dist = Math.sqrt(dx**2 + dy**2);
      const minD = DIE_R * 2 - 2;
      if (dist < minD && dist > 0.001) {
        const nx = dx/dist, ny = dy/dist, ov = (minD - dist) / 2;
        if (a.phase !== 'done') { a.x -= nx*ov; a.y2d -= ny*ov; }
        if (b.phase !== 'done') { b.x += nx*ov; b.y2d += ny*ov; }
        const relV = (b.vx - a.vx)*nx + (b.vy2d - a.vy2d)*ny;
        if (relV < 0) {
          const imp = -(1 + RESTITUTION) * relV / 2;
          if (a.phase === 'roll') { a.vx -= imp*nx; a.vy2d -= imp*ny; }
          if (b.phase === 'roll') { b.vx += imp*nx; b.vy2d += imp*ny; }
        }
      }
    }
  }
}


// =============================================================
// ANIMATION STEP  (advance each die along its pre-baked path)
// =============================================================

function stepAnimations(dice) {
  dice.forEach(die => {
    if (die.phase === 'done' || die.locked) return;

    const spd = Math.sqrt(die.vx**2 + die.vy2d**2);

    // Slerp to final settled pose
    if (die.settling) {
      die.settleT += 1 / SLERP_FRAMES;
      if (die.settleT >= 1) {
        die.curM  = die.snapM;
        die.phase = 'done';
      } else {
        die.curM = slerpM(die.settleFrom, die.snapM, Math.sqrt(die.settleT));
      }
      return;
    }

    // Advance along pre-baked path, gated by current bounce segment
    const maxFrame   = die.animPath.length - 1;
    const currentSeg = die.segments[die.segIdx] ?? { start: 0, end: maxFrame };
    const gateFrame  = die.segIdx < die.segments.length - 1 ? currentSeg.end : maxFrame;
    die.animFrame = Math.min(die.animFrame + 1, gateFrame);
    die.curM      = die.animPath[Math.floor(die.animFrame)];

    // Trigger settling when the die has come to rest on the table
    if (spd < 0.12 && die.h < 0.01 && die.apex < 0.02 && Math.abs(die.vz) < 0.04) {
      die.settling   = true;
      die.settleT    = 0;
      die.settleFrom = die.curM;
      die.vx = die.vy2d = die.vz = 0;
    }
  });
}


// =============================================================
// RENDERING
// =============================================================

/** Draw a single D6 using painter's algorithm (back faces first) */
function drawD6(die) {
  const m  = die.curM;
  const tv = CUBE_VERTS.map(v => mulMV(m, v)); // transformed verts
  const pv = tv.map(proj);                      // projected 2D verts
  CUBE_FACES
    .map(f => ({
      ...f,
      avgZ:    f.verts.reduce((s, i) => s + tv[i][2], 0) / 4,
      visible: mulMV(m, f.normal)[2] > 0,
    }))
    .sort((a, b) => a.avgZ - b.avgZ)
    .forEach(f => {
      if (!f.visible) return;
      drawQuad(D6_FACE_CANVAS[f.val], f.verts.map(i => pv[i]), DIE_SC, die.x, die.y2d);
    });
}

// Speckled gray tray texture — generated once, cached until resize
let speckleCanvas = null, speckleW = 0, speckleH = 0;
function getSpeckle(w, h) {
  if (speckleCanvas && speckleW === w && speckleH === h) return speckleCanvas;
  speckleCanvas       = document.createElement('canvas');
  speckleCanvas.width = w;
  speckleCanvas.height = h;
  speckleW = w; speckleH = h;
  const sc = speckleCanvas.getContext('2d');
  sc.fillStyle = '#3a3a3a';
  sc.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.018; i++) {
    const x     = Math.random() * w;
    const y     = Math.random() * h;
    const r     = Math.random() * 1.2 + 0.3;
    const light = Math.random() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
    const alpha = (0.04 + Math.random() * 0.1).toFixed(2);
    sc.fillStyle = light + alpha + ')';
    sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.fill();
  }
  return speckleCanvas;
}

function drawTray() {
  const db = diceAreaBottom();
  ctx.drawImage(getSpeckle(W(), db), 0, 0);
  // Subtle dark vignette around edges
  const g = ctx.createRadialGradient(W()/2, db/2, db*0.15, W()/2, db/2, Math.max(W(), db)*0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W(), db);
  // Tray border
  ctx.strokeStyle = '#555';
  ctx.lineWidth   = 1;
  ctx.strokeRect(TRAY_PAD, TRAY_PAD, W() - TRAY_PAD*2, db - TRAY_PAD*2);
}

/** Draw a rounded gray square around locked dice */
function drawLockOutline(die) {
  if (!die.locked) return;
  const s = DIE_R + 2, r = 5;
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); ctx.roundRect(die.x-s, die.y2d-s, s*2, s*2, r); ctx.stroke();
  ctx.fillStyle = 'rgba(180,180,180,0.07)';
  ctx.beginPath(); ctx.roundRect(die.x-s, die.y2d-s, s*2, s*2, r); ctx.fill();
}

function renderDice(dice) {
  drawTray();
  drawTrayCorners();
  dice.forEach(d => { drawD6(d); drawLockOutline(d); });
}

/** Tournament mode corner labels */
function drawTrayCorners() {
  if (!gameRules.tournament) return;
  const pad = TRAY_PAD + 6;
  ctx.font      = 'bold 9px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle    = 'rgba(220,200,100,0.85)';
  ctx.textAlign    = 'left';
  ctx.fillText('TOURNAMENT MODE', pad, pad);
  ctx.textAlign    = 'right';
  ctx.fillText(`Game ${tournGameNum}/${gameRules.numGames}`, W() - pad, pad);
  ctx.textBaseline = 'alphabetic';
}


// =============================================================
// SKIP-ANIM TOGGLE BUTTON  (drawn in tray, top-right)
// =============================================================

let skipAnim    = false;
let skipBtnRect = { x:0, y:0, w:0, h:0 };

function drawSkipBtn() {
  const bw = 62, bh = 20;
  const bx = W() - TRAY_PAD - bw - 4;
  const by = TRAY_PAD + 18; // sits below the tournament label
  skipBtnRect = { x: bx, y: by, w: bw, h: bh };

  ctx.fillStyle   = skipAnim ? 'rgba(200,200,200,0.18)' : 'rgba(80,80,80,0.25)';
  ctx.strokeStyle = skipAnim ? '#cccccc' : '#666';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4); ctx.fill(); ctx.stroke();

  ctx.fillStyle    = skipAnim ? '#ddd' : '#777';
  ctx.font         = 'bold 9px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SKIP ANIM', bx + bw/2, by + bh/2);
  ctx.textBaseline = 'alphabetic';
}


// =============================================================
// ROLL STRIP  (between dice tray and scorecard)
// =============================================================

let rollBtnRect = { x:0, y:0, w:0, h:0 };

function drawRollStrip(dice) {
  const sy = diceAreaBottom();
  const sh = rollStripBottom() - sy;

  ctx.fillStyle = '#222222';
  ctx.fillRect(0, sy, W(), sh);
  ctx.strokeStyle = '#444';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, sy);              ctx.lineTo(W(), sy);              ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, rollStripBottom()); ctx.lineTo(W(), rollStripBottom()); ctx.stroke();

  const allDone = dice.length === 5 && dice.every(d => d.phase === 'done');
  const canRoll = !gameOver && (rollsLeft > 0 || dice.length === 0);

  // Roll button
  const bw = 110, bh = Math.floor(sh * 0.62);
  const bx = W()/2 - bw/2, by = sy + Math.floor((sh - bh) / 2);
  rollBtnRect = { x: bx, y: by, w: bw, h: bh };

  ctx.fillStyle   = canRoll ? 'rgba(240,240,240,0.10)' : 'rgba(60,60,60,0.20)';
  ctx.strokeStyle = canRoll ? '#cccccc' : '#444';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();

  ctx.fillStyle    = canRoll ? '#dddddd' : '#444';
  ctx.font         = 'bold 12px monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dice.length === 0 ? 'ROLL' : `ROLL  (${rollsLeft} left)`, bx + bw/2, by + bh/2);
  ctx.textBaseline = 'alphabetic';

  // Hint text
  if (allDone) {
    ctx.fillStyle = '#666';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    const hint = rollsLeft > 0
      ? 'tap dice to lock · tap score to record'
      : 'tap a score to record it';
    ctx.fillText(hint, W()/2, sy + sh - 5);
  }

  // Round counter (left side)
  ctx.fillStyle = '#666';
  ctx.font      = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`Round ${currentRound}/13`, TRAY_PAD + 4, sy + sh/2 + 4);
}


// =============================================================
// SCORECARD — CATEGORIES
// =============================================================

const UPPER_CATS = [
  { id:'ones',   label:'Ones'   },
  { id:'twos',   label:'Twos'   },
  { id:'threes', label:'Threes' },
  { id:'fours',  label:'Fours'  },
  { id:'fives',  label:'Fives'  },
  { id:'sixes',  label:'Sixes'  },
];

const LOWER_CATS = [
  { id:'3ok',    label:'3 of a Kind'  },
  { id:'4ok',    label:'4 of a Kind'  },
  { id:'fh',     label:'Full House'   },
  { id:'ss',     label:'Sm. Straight' },
  { id:'ls',     label:'Lg. Straight' },
  { id:'5kind',  label:'5 of a Kind'  },
  { id:'chance', label:'Chance'       },
];

const UPPER_IDS = new Set(UPPER_CATS.map(c => c.id));

let scorecard        = {};
let fiveKindBonusCount = 0;
function resetScorecard() { scorecard = {}; fiveKindBonusCount = 0; }


// =============================================================
// SCORING LOGIC
// =============================================================

function scoreValue(id, dice) {
  const vals   = dice.map(d => d.outcome).sort((a, b) => a - b);
  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const sum    = vals.reduce((s, v) => s + v, 0);
  const groups = Object.values(counts).sort((a, b) => b - a);

  switch (id) {
    case 'ones':   return vals.filter(v => v === 1).reduce((s, v) => s+v, 0);
    case 'twos':   return vals.filter(v => v === 2).reduce((s, v) => s+v, 0);
    case 'threes': return vals.filter(v => v === 3).reduce((s, v) => s+v, 0);
    case 'fours':  return vals.filter(v => v === 4).reduce((s, v) => s+v, 0);
    case 'fives':  return vals.filter(v => v === 5).reduce((s, v) => s+v, 0);
    case 'sixes':  return vals.filter(v => v === 6).reduce((s, v) => s+v, 0);
    case '3ok':    return groups[0] >= 3 ? sum : 0;
    case '4ok':    return groups[0] >= 4 ? sum : 0;
    case 'fh':     return (groups[0]===3 && groups[1]===2) || groups[0]===5 ? 25 : 0;
    case 'ss': {
      const u = [...new Set(vals)];
      const has = (a,b,c,d) => u.includes(a)&&u.includes(b)&&u.includes(c)&&u.includes(d);
      return has(1,2,3,4) || has(2,3,4,5) || has(3,4,5,6) ? 30 : 0;
    }
    case 'ls': {
      const u = [...new Set(vals)];
      const has = (a,b,c,d,e) => u.includes(a)&&u.includes(b)&&u.includes(c)&&u.includes(d)&&u.includes(e);
      return has(1,2,3,4,5) || has(2,3,4,5,6) ? 40 : 0;
    }
    case '5kind':  return groups[0] === 5 ? 50 : 0;
    case 'chance': return sum;
    default:       return 0;
  }
}

/** True when all five dice show the same face */
function is5Kind(dice) {
  return dice.length === 5 && dice.every(d => d.outcome === dice[0].outcome);
}

/**
 * Strict joker assignment rules (when strict5Kind is on and we have 5-of-a-kind):
 *
 *   1. If '5kind' slot is open -> must assign there first.
 *   2. If '5kind' was scored 0 -> no joker applies; all open slots available.
 *   3. If '5kind' was scored 50 -> official joker priority:
 *        a. Corresponding upper box (e.g. five 4s -> Fours). Scores dice sum.
 *        b. Any open LOWER section box (wild card; fixed scores for FH/straights,
 *           dice sum for 3ok/4ok/chance).
 *        c. Last resort: any open UPPER box. Scores ZERO (forced scratch).
 *
 * The returned Set has a `lastResortUpper` flag when case (c) applies,
 * so potentialScore and recordValue can return 0 instead of the dice sum.
 */
function allowedCats(dice, rules) {
  const allOpen = new Set(
    [...UPPER_CATS, ...LOWER_CATS]
      .filter(c => scorecard[c.id] === undefined)
      .map(c => c.id)
  );

  if (!rules.strict5Kind || !is5Kind(dice)) return allOpen;

  // Step 1: 5kind slot not yet used
  if (scorecard['5kind'] === undefined) {
    return allOpen.has('5kind') ? new Set(['5kind']) : allOpen;
  }

  // Step 2: 5kind was scratched (0) - no joker
  if (scorecard['5kind'] !== 50) return allOpen;

  // Step 3: official joker priority
  const face         = dice[0].outcome;
  const upperForFace = ['ones','twos','threes','fours','fives','sixes'][face - 1];

  // a. Corresponding upper box open -> must go there, scores normal dice sum
  if (allOpen.has(upperForFace)) return new Set([upperForFace]);

  // b. Any open lower section box -> player's choice, wild card scores apply
  const openLower = [...allOpen].filter(id => !UPPER_IDS.has(id) && id !== '5kind');
  if (openLower.length > 0) return new Set(openLower);

  // c. Last resort: only upper boxes remain -> forced scratch, scores zero
  const openUpper = [...allOpen].filter(id => UPPER_IDS.has(id));
  const result    = new Set(openUpper);
  result.lastResortUpper = true;
  return result;
}

/**
 * Score preview shown on the scorecard before the player commits.
 * Returns null if the category is already scored or not allowed.
 */
function potentialScore(id, dice, rules, allowed) {
  if (dice.length !== 5 || scorecard[id] !== undefined) return null;
  if (!allowed.has(id)) return null;

  const joker      = is5Kind(dice);
  const first5kind = scorecard['5kind'] === 50;

  // Last-resort upper box under strict joker rules -> forced zero scratch
  if (rules.strict5Kind && joker && first5kind && allowed.lastResortUpper && UPPER_IDS.has(id)) {
    return 0;
  }

  // Strict joker: lower section wild card fixed scores
  if (rules.strict5Kind && joker && first5kind && id !== '5kind') {
    if (id === 'fh') return 25;
    if (id === 'ss') return 30;
    if (id === 'ls') return 40;
    // 3ok / 4ok / chance score the dice sum
    if (id === '3ok' || id === '4ok' || id === 'chance') {
      return dice.reduce((s, d) => s + d.outcome, 0);
    }
  }

  // Non-strict wild card bonuses (alwaysWild or wildAfterFirst)
  if (joker && (rules.alwaysWild || (rules.wildAfterFirst && first5kind)) && id !== '5kind') {
    if (id === 'fh') return 25;
    if (id === 'ss') return 30;
    if (id === 'ls') return 40;
  }

  return scoreValue(id, dice);
}

/**
 * Actual value written to the scorecard on commit.
 * Applies joker / strict-assignment fixed scores where appropriate.
 */
function recordValue(id, dice, rules) {
  const joker      = is5Kind(dice);
  const first5kind = scorecard['5kind'] === 50;

  if (rules.strict5Kind && joker && first5kind && id !== '5kind') {
    // Re-derive allowed to check whether we're in last-resort upper mode
    const allowed = allowedCats(dice, rules);

    // c. Last-resort upper box -> zero scratch
    if (allowed.lastResortUpper && UPPER_IDS.has(id)) return 0;

    // a. Corresponding upper box -> normal dice sum (scoreValue handles it)
    if (UPPER_IDS.has(id)) return scoreValue(id, dice);

    // b. Lower section wild card fixed scores
    if (id === 'fh')  return 25;
    if (id === 'ss')  return 30;
    if (id === 'ls')  return 40;
    // 3ok / 4ok / chance -> sum of all dice
    if (id === '3ok' || id === '4ok' || id === 'chance') {
      return dice.reduce((s, d) => s + d.outcome, 0);
    }
  }

  // Non-strict wild card bonuses
  if (joker && (rules.alwaysWild || (rules.wildAfterFirst && first5kind)) && id !== '5kind') {
    if (id === 'fh') return 25;
    if (id === 'ss') return 30;
    if (id === 'ls') return 40;
  }

  return scoreValue(id, dice);
}

function calcUpperTotal() {
  return UPPER_CATS.reduce((s, c) => s + (scorecard[c.id] || 0), 0);
}

function calcTotal(rules) {
  const upperTotal  = calcUpperTotal();
  const bonus       = rules.bonusEnabled && upperTotal >= rules.bonusThreshold ? rules.bonusAmount : 0;
  const lowerTotal  = LOWER_CATS.reduce((s, c) => s + (scorecard[c.id] || 0), 0);
  const fiveKindBonus = rules.fiveKindBonus ? fiveKindBonusCount * 100 : 0;
  return upperTotal + bonus + lowerTotal + fiveKindBonus;
}


// =============================================================
// SCORECARD LAYOUT  (pixel rects for each row, rebuilt each frame)
// =============================================================

let scorecardLayout = {};

function layoutScorecard() {
  scorecardLayout = {};
  const top   = rollStripBottom() + 4;
  const avail = H() - top - 6;
  const left  = 4, midX = W()/2 + 2, colW = W()/2 - 6;

  // 10% compact rows
  const maxRows = Math.max(UPPER_CATS.length + 2, LOWER_CATS.length + 4);
  const rowH    = Math.floor(avail / maxRows * 0.90);

  let uy = top + rowH; // +rowH skips the column header
  UPPER_CATS.forEach((c, i) => {
    scorecardLayout[c.id] = { x: left, y: uy + i*rowH, w: colW, h: rowH };
  });
  scorecardLayout['__bonus'] = { x: left, y: uy + UPPER_CATS.length*rowH, w: colW, h: rowH };

  let ly = top + rowH;
  LOWER_CATS.forEach((c, i) => {
    scorecardLayout[c.id] = { x: midX, y: ly + i*rowH, w: colW, h: rowH };
  });
  scorecardLayout['__5kindbonus'] = { x: midX, y: ly + LOWER_CATS.length*rowH,     w: colW, h: rowH };
  scorecardLayout['__total']      = { x: midX, y: ly + (LOWER_CATS.length+1)*rowH, w: colW, h: rowH };
}


// =============================================================
// SCORECARD DRAWING
// =============================================================

let hoveredCat = null;
let pendingCat = null; // mobile two-tap: first tap selects, second confirms

function isSmallScreen() {
  return window.screen.height < 700 || window.innerHeight < 700;
}

function drawScorecard(dice, rules) {
  layoutScorecard();

  const top = rollStripBottom();
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, top, W(), H() - top);

  const rolled      = dice.length === 5 && dice.every(d => d.phase === 'done');
  const jokerNow    = rolled && is5Kind(dice);
  const first5kind  = scorecard['5kind'] === 50;
  const fs          = Math.max(9, Math.min(12, W() / 58));
  const allowed     = rolled
    ? allowedCats(dice, rules)
    : new Set([...UPPER_CATS, ...LOWER_CATS].map(c => c.id));

  // Column headers
  const topU = scorecardLayout['ones'];
  const topL = scorecardLayout['3ok'];
  ctx.fillStyle = '#888';
  ctx.font      = `bold ${fs}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('UPPER', topU.x + 2, topU.y - 4);
  ctx.fillText('LOWER', topL.x + 2, topL.y - 4);

  // Centre divider
  ctx.strokeStyle = '#333';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(W()/2, top); ctx.lineTo(W()/2, H()); ctx.stroke();

  // --- Draw a single scorecard row ---
  function drawRow(id, label, score, potential, layout, highlight, dimmed) {
    const { x, y, w, h } = layout;
    const scored  = scorecard[id] !== undefined;
    const pending = pendingCat === id && !scored;

    // Background
    if (pending) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, w, h - 1);
      ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 2);
    } else if (highlight && !scored) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, y, w, h - 1);
    } else if (scored) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(x, y, w, h - 1);
    }

    // Label
    ctx.textAlign = 'left';
    ctx.font      = `${fs}px monospace`;
    ctx.fillStyle = scored  ? '#444'
                  : dimmed  ? '#3a3a3a'
                  : (pending || highlight) ? '#e0e0e0'
                  : '#777';
    ctx.fillText(label, x + 4, y + h * 0.68);

    // Value
    ctx.textAlign = 'right';
    if (scored) {
      ctx.fillStyle = '#99dd99';
      ctx.fillText(String(score), x + w - 4, y + h * 0.68);
    } else if (dimmed) {
      ctx.fillStyle = '#333';
      ctx.fillText('—', x + w - 4, y + h * 0.68);
    } else if (rolled && potential !== null && potential > 0) {
      ctx.fillStyle = pending ? '#ffffff' : 'rgba(220,220,220,0.75)';
      ctx.fillText(String(potential), x + w - 4, y + h * 0.68);
    } else if (rolled && potential === 0 && potential !== null) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillText('0', x + w - 4, y + h * 0.68);
    } else {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillText('—', x + w - 4, y + h * 0.68);
    }

    // Bottom border
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y+h); ctx.lineTo(x+w, y+h); ctx.stroke();
  }

  // Upper section
  UPPER_CATS.forEach(c => {
    const pot    = rolled ? potentialScore(c.id, dice, rules, allowed) : null;
    const dimmed = rolled && scorecard[c.id] === undefined && !allowed.has(c.id);
    drawRow(c.id, c.label, scorecard[c.id], pot, scorecardLayout[c.id], hoveredCat === c.id, dimmed);
  });

  // Bonus row
  const bl          = scorecardLayout['__bonus'];
  const upperTot    = calcUpperTotal();
  const bonusEarned = rules.bonusEnabled && upperTot >= rules.bonusThreshold;
  ctx.font      = `${fs}px monospace`;
  ctx.textAlign = 'left';
  if (rules.bonusEnabled) {
    ctx.fillStyle = bonusEarned ? '#f0c040' : '#555';
    ctx.fillText(`Bonus: +${rules.bonusAmount}`, bl.x + 4, bl.y + bl.h * 0.68);
    ctx.textAlign = 'right';
    if (bonusEarned) {
      ctx.fillStyle = '#f0c040'; ctx.fillText('✓', bl.x + bl.w - 4, bl.y + bl.h * 0.68);
    } else {
      ctx.fillStyle = '#444'; ctx.fillText(`${upperTot}/63`, bl.x + bl.w - 4, bl.y + bl.h * 0.68);
    }
  } else {
    ctx.fillStyle = '#383838';
    ctx.fillText('Bonus (off)', bl.x + 4, bl.y + bl.h * 0.68);
  }

  // Lower section
  LOWER_CATS.forEach(c => {
    let pot = rolled ? potentialScore(c.id, dice, rules, allowed) : null;
    // 5-of-a-kind bonus preview (shows +100 on the slot when joker applies)
    if (c.id === '5kind' && jokerNow && first5kind && rules.fiveKindBonus) pot = 100;
    const dimmed = rolled && scorecard[c.id] === undefined && !allowed.has(c.id);
    drawRow(c.id, c.label, scorecard[c.id], pot, scorecardLayout[c.id], hoveredCat === c.id, dimmed);
  });

  // 5-of-a-kind bonus accumulator row
  if (rules.fiveKindBonus && fiveKindBonusCount > 0) {
    const ybl = scorecardLayout['__5kindbonus'];
    ctx.font      = `${fs}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f0c040';
    ctx.fillText(`5-of-a-Kind Bonus ×${fiveKindBonusCount}`, ybl.x + 4, ybl.y + ybl.h * 0.68);
    ctx.textAlign = 'right';
    ctx.fillText(String(fiveKindBonusCount * 100), ybl.x + ybl.w - 4, ybl.y + ybl.h * 0.68);
  }

  // Total row
  const tl = scorecardLayout['__total'];
  ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tl.x, tl.y-1); ctx.lineTo(tl.x+tl.w, tl.y-1); ctx.stroke();
  ctx.font      = `bold ${fs+1}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('TOTAL', tl.x + 4, tl.y + tl.h * 0.72);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(calcTotal(rules)), tl.x + tl.w - 4, tl.y + tl.h * 0.72);
}


// =============================================================
// GAME STATE
// =============================================================

let dice                = [];
let rolling             = false;
let gameActive          = false;
let gameOver            = false;
let rollsLeft           = 0;
let currentRound        = 0;
let gameRules           = {};
let gameOverRestartRect = { x:0, y:0, w:0, h:0 };

// Tournament state
let tournGameNum  = 0;     // current game number (1-indexed)
let tournComplete = false; // true after final tournament game ends


// =============================================================
// RENDER LOOP
// =============================================================

function render() {
  if (!gameActive) return;
  updateDieSize();
  ctx.clearRect(0, 0, W(), H());
  stepPhysics(dice);
  stepAnimations(dice);
  renderDice(dice);
  drawSkipBtn();
  drawRollStrip(dice);
  drawScorecard(dice, gameRules);
  if (gameOver) drawGameOverOverlay();
  if (dice.length > 0 && dice.every(d => d.phase === 'done') && rolling) rolling = false;
  requestAnimationFrame(render);
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W(), H());
  const total = calcTotal(gameRules);

  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 18px monospace';
  ctx.textAlign    = 'center';

  if (tournComplete) {
    ctx.fillText('TOURNAMENT COMPLETE', W()/2, H()/2 - 50);
    ctx.font      = '13px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(`Game ${tournGameNum} · Final: ${total}`, W()/2, H()/2 - 18);
    ctx.font      = '11px monospace';
    ctx.fillStyle = '#888';
    ctx.fillText('See the log panel for all scores', W()/2, H()/2 + 14);

    const rbw = 140, rbh = 32;
    const rbx = W()/2 - rbw/2, rby = H()/2 + 34;
    gameOverRestartRect = { x:0, y:0, w:0, h:0 }; // disabled — use menu
    ctx.fillStyle   = 'rgba(220,220,220,0.10)';
    ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(rbx, rby, rbw, rbh, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#cccccc';
    ctx.font         = 'bold 11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('USE MENU TO EXIT', W()/2, rby + rbh/2);
    ctx.textBaseline = 'alphabetic';

  } else {
    const label    = gameRules.tournament ? `Game ${tournGameNum} Complete` : 'GAME OVER';
    const btnLabel = gameRules.tournament
      ? `NEXT GAME (${tournGameNum+1}/${gameRules.numGames})`
      : 'PLAY AGAIN';

    ctx.fillText(label, W()/2, H()/2 - 44);
    ctx.font      = '14px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(`Final Score: ${total}`, W()/2, H()/2 - 14);

    const rbw = 180, rbh = 32;
    const rbx = W()/2 - rbw/2, rby = H()/2 + 10;
    gameOverRestartRect = { x: rbx, y: rby, w: rbw, h: rbh };
    ctx.fillStyle   = 'rgba(220,220,220,0.12)';
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(rbx, rby, rbw, rbh, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle    = '#dddddd';
    ctx.font         = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabel, W()/2, rby + rbh/2);
    ctx.textBaseline = 'alphabetic';
  }
}


// =============================================================
// GAME FLOW
// =============================================================

function startGame(rules) {
  // Map incoming rule keys (index.html uses 'fiveKindBonus') to internal names
  gameRules = {
    ...rules,
    fiveKindBonus: rules.fiveKindBonus ?? true,
  };
  currentRound  = 0;
  gameOver      = false;
  tournComplete = false;
  tournGameNum  = rules.tournament ? 1 : 0;
  resetScorecard();
  dice         = [];
  rolling      = false;
  rollsLeft    = 0;
  speckleCanvas = null;
  gameActive   = true;
  layoutScorecard();
  beginRound();
  requestAnimationFrame(render);
}

function resetGame() {
  gameActive    = false;
  dice          = [];
  gameOver      = false;
  tournComplete = false;
}

function beginRound() {
  currentRound++;
  rollsLeft  = 3;
  dice       = [];
  pendingCat = null;
  document.getElementById('score-display').textContent = `ROUND ${currentRound} / 13`;
}

function doRoll() {
  if (gameOver) return;
  if (rollsLeft <= 0 && dice.length > 0) return;

  const doSkip    = skipAnim;
  const positions = skipPositions();

  if (dice.length === 0) {
    // First roll: create all five dice
    positions.forEach(pos => {
      const d = createDie(1 + Math.floor(Math.random() * 6), doSkip, pos.x, pos.y);
      if (doSkip) { d.x = pos.x; d.y2d = pos.y; }
      dice.push(d);
    });
  } else {
    // Re-roll: only replace unlocked dice, place them at free grid positions
    const unlockedIdxs  = dice.map((_,i) => i).filter(i => !dice[i].locked);
    const lockedPos     = dice.filter(d => d.locked).map(d => ({ x: d.x, y: d.y2d }));
    const freePositions = positions.filter(p =>
      !lockedPos.some(lp => Math.abs(lp.x-p.x) < DIE_R*2.5 && Math.abs(lp.y-p.y) < DIE_R*2.5)
    );
    // Pad with random positions if the grid doesn't have enough free slots
    while (freePositions.length < unlockedIdxs.length) {
      freePositions.push({
        x: TRAY_PAD + DIE_R + Math.random() * (W() - TRAY_PAD*2 - DIE_R*2),
        y: TRAY_PAD + DIE_R + Math.random() * (diceAreaBottom() - TRAY_PAD*2 - DIE_R*2),
      });
    }
    unlockedIdxs.forEach((di, k) => {
      const pos = freePositions[k] || { x: dice[di].x, y: dice[di].y2d };
      const nd  = createDie(1 + Math.floor(Math.random() * 6), doSkip, pos.x, pos.y);
      if (doSkip) {
        nd.x = pos.x; nd.y2d = pos.y;
      } else {
        nd.x   = pos.x + (Math.random()-0.5) * 20;
        nd.y2d = pos.y + (Math.random()-0.5) * 20;
      }
      dice[di] = nd;
    });
  }

  rollsLeft--;
  rolling = !doSkip;
}

function recordScore(catId) {
  if (gameOver || scorecard[catId] !== undefined) return;
  const allDone = dice.every(d => d.phase === 'done');
  if (!allDone || dice.length !== 5) return;

  const allowed = allowedCats(dice, gameRules);
  if (!allowed.has(catId)) return;

  // Accumulate 5-of-a-kind bonus when joker rule applies
  if (is5Kind(dice) && catId !== '5kind' && gameRules.fiveKindBonus && scorecard['5kind'] === 50) {
    fiveKindBonusCount++;
  }

  scorecard[catId] = recordValue(catId, dice, gameRules);
  rollsLeft        = 0;
  pendingCat       = null;

  const allScored = [...UPPER_CATS, ...LOWER_CATS].every(c => scorecard[c.id] !== undefined);
  if (allScored) { onGameComplete(); return; }
  setTimeout(() => beginRound(), 200);
}

function onGameComplete() {
  const total = calcTotal(gameRules);
  const snap  = Object.assign({}, scorecard);

  if (gameRules.tournament) {
    if (typeof addTournamentLogEntry === 'function') {
      addTournamentLogEntry(tournGameNum, total, snap);
    }
    if (tournGameNum >= gameRules.numGames) {
      tournComplete = true;
      gameOver      = true;
      if (typeof onTournamentComplete === 'function') onTournamentComplete();
    } else {
      gameOver = true;
    }
  } else {
    gameOver = true;
  }
}

function restartGame() {
  if (gameRules.tournament && !tournComplete) tournGameNum++;
  currentRound = 0;
  gameOver     = false;
  resetScorecard();
  dice      = [];
  rolling   = false;
  rollsLeft = 0;
  layoutScorecard();
  beginRound();
}


// =============================================================
// INPUT HANDLING
// =============================================================

function getCanvasXY(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const src    = e.touches ? e.touches[0] : e;
  return [(src.clientX - rect.left) * scaleX, (src.clientY - rect.top) * scaleY];
}

function handleTap(mx, my) {
  if (!gameActive) return;

  // Game-over overlay intercepts all taps
  if (gameOver) {
    if (tournComplete) return; // locked until player uses the Menu button
    const gr = gameOverRestartRect;
    if (mx >= gr.x && mx <= gr.x+gr.w && my >= gr.y && my <= gr.y+gr.h) {
      restartGame();
    }
    return;
  }

  // Skip-anim toggle
  const sb = skipBtnRect;
  if (mx >= sb.x && mx <= sb.x+sb.w && my >= sb.y && my <= sb.y+sb.h) {
    skipAnim = !skipAnim;
    return;
  }

  // Roll button
  const rb = rollBtnRect;
  if (mx >= rb.x && mx <= rb.x+rb.w && my >= rb.y && my <= rb.y+rb.h) {
    if (rollsLeft > 0 || dice.length === 0) doRoll();
    return;
  }

  // Tray area: toggle die lock when dice are settled and rolls remain
  if (my < diceAreaBottom()) {
    const allDone = dice.length === 5 && dice.every(d => d.phase === 'done');
    if (allDone && rollsLeft > 0 && !gameOver) {
      dice.forEach(d => {
        const dx = d.x - mx, dy = d.y2d - my;
        if (Math.sqrt(dx**2 + dy**2) < DIE_R + 8) d.locked = !d.locked;
      });
    }
    return;
  }

  // Scorecard area: record a score (single tap on desktop, two-tap on small screens)
  const allDone = dice.length === 5 && dice.every(d => d.phase === 'done');
  if (allDone) {
    for (const [id, layout] of Object.entries(scorecardLayout)) {
      if (id.startsWith('__')) continue;
      const { x, y, w, h } = layout;
      if (mx >= x && mx <= x+w && my >= y && my <= y+h) {
        if (isSmallScreen()) {
          // First tap → highlight (pending); second tap on same cell → commit
          if (pendingCat === id) { pendingCat = null; recordScore(id); }
          else                   { pendingCat = id; }
        } else {
          recordScore(id);
        }
        return;
      }
    }
    // Tapped outside any cell — clear pending selection
    pendingCat = null;
  }
}

canvas.addEventListener('click',      e => { const [mx,my] = getCanvasXY(e); handleTap(mx,my); });
canvas.addEventListener('touchstart', e => { e.preventDefault(); const [mx,my] = getCanvasXY(e); handleTap(mx,my); }, { passive: false });

canvas.addEventListener('mousemove', e => {
  if (!gameActive) return;
  const [mx, my]  = getCanvasXY(e);
  const allDone   = dice.length === 5 && dice.every(d => d.phase === 'done');
  if (!allDone) { hoveredCat = null; canvas.style.cursor = 'default'; return; }

  const allowed = allowedCats(dice, gameRules);
  hoveredCat    = null;
  for (const [id, layout] of Object.entries(scorecardLayout)) {
    if (id.startsWith('__')) continue;
    const { x, y, w, h } = layout;
    if (mx >= x && mx <= x+w && my >= y && my <= y+h && scorecard[id] === undefined && allowed.has(id)) {
      hoveredCat = id;
      break;
    }
  }
  canvas.style.cursor = hoveredCat ? 'pointer' : 'default';
});

canvas.addEventListener('mouseleave', () => { hoveredCat = null; });