const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

// --- Game state ---
let score, lives, running, paused
let player, bullets, alienBullets, aliens, barricades
let selectedDiff = "easy"
let selectedFormation = "classic"
let wave = 1
let scoreMod = 1

// --- Screen dimensions ---
const W = Math.floor(window.innerWidth  * 0.92)
const H = Math.floor(window.innerHeight * 0.82)

// --- Sizing helpers ---
const ALIEN_W   = Math.max(18, Math.floor(W * 0.038))
const ALIEN_H   = Math.floor(ALIEN_W * 0.75)
const ALIEN_PAD = Math.floor(ALIEN_W * 0.55)

// --- Difficulty configs ---
// stepInterval: ms between each swarm step
// alienFireRate: probability per alien per second of firing
// playerSpeed: px per frame at 60fps
const DIFF_CONFIGS = {
  easy:   { stepInterval: 900,  alienFireRate: 0.0032, playerSpeed: Math.floor(W * 0.008), scoreMod: 1 },
  normal: { stepInterval: 650,  alienFireRate: 0.0090, playerSpeed: Math.floor(W * 0.009), scoreMod: 2 },
  hard:   { stepInterval: 420,  alienFireRate: 0.0200, playerSpeed: Math.floor(W * 0.010), scoreMod: 3 },
}

// --- Formation configs, rows always 5 (1 commander + 2 starship + 2 fighter) ---
const FORMATION_CONFIGS = {
  classic: { rows: 5, cols: 11 },
  dense:   { rows: 5, cols: 13 },
  sparse:  { rows: 5, cols: 11 },
}

// --- Row roles (fixed 5-row layout) ---
// row 0:   Commanders  - 30pts  (1 row)
// row 1-2: Starships   - 20pts  (2 rows)
// row 3-4: Fighters    - 10pts  (2 rows)
const ROW_POINTS = [30, 20, 20, 10, 10]

// alien type: 0=Commander, 1=Starship, 2=Fighter
function alienType(row) {
  if (row === 0) return 0
  if (row <= 2)  return 1
  return 2
}

// CRT phosphor palette
const TYPE_COLORS = ["#ffffff", "#aaffaa", "#00ff88"]

// ─── Mothership ───────────────────────────────────────────────────────────────
const MOTHER_W      = Math.floor(ALIEN_W * 2.2)
const MOTHER_H      = Math.floor(ALIEN_H * 1.1)
const MOTHER_Y      = Math.floor(H * 0.045)
const MOTHER_SPEED  = Math.floor(W * 0.004)
const MOTHER_PRIZES = [50, 100, 150, 300]

let mothership            = null
let motherSpawnTimer      = 0
let motherSpawnDelay      = 0
let motherSpawnedThisWave = false

function spawnMothership() {
  const goRight = Math.random() < 0.5
  mothership = {
    x:         goRight ? -MOTHER_W / 2 : W + MOTHER_W / 2,
    y:         MOTHER_Y,
    vx:        goRight ? MOTHER_SPEED : -MOTHER_SPEED,
    prize:     MOTHER_PRIZES[Math.floor(Math.random() * MOTHER_PRIZES.length)],
    alive:     true,
    flashTtl:  0,
    flashText: "",
  }
  motherSpawnedThisWave = true
}

function resetMotherTimer() {
  motherSpawnTimer      = 0
  motherSpawnDelay      = 20000 + Math.random() * 20000   // 20–40 s
  motherSpawnedThisWave = false
  mothership            = null
}

function drawMothership() {
  if (!mothership) return

  // Score flash after destruction
  if (!mothership.alive) {
    if (mothership.flashTtl > 0) {
      mothership.flashTtl--
      const alpha = mothership.flashTtl / 40
      ctx.fillStyle = `rgba(255,80,80,${alpha})`
      ctx.font = `bold ${Math.floor(MOTHER_H * 1.1)}px monospace`
      ctx.textAlign = "center"
      ctx.fillText(mothership.flashText, mothership.x, mothership.y + MOTHER_H / 2)
    } else {
      mothership = null
    }
    return
  }

  const cx = mothership.x
  const cy = mothership.y
  const w  = MOTHER_W
  const h  = MOTHER_H
  const px = Math.max(1, Math.floor(w / 18))
  ctx.fillStyle = "#ff4466"

  function dot(nx, ny) {
    ctx.fillRect(Math.round(cx - w/2 + nx*w), Math.round(cy - h/2 + ny*h), px, px)
  }

  // Classic saucer silhouette
  const pts = [
    [0.35,0.05],[0.4,0.05],[0.45,0.05],[0.5,0.05],[0.55,0.05],[0.6,0.05],
    [0.25,0.2],[0.3,0.2],[0.35,0.2],[0.4,0.2],[0.45,0.2],[0.5,0.2],[0.55,0.2],[0.6,0.2],[0.65,0.2],[0.7,0.2],[0.75,0.2],
    [0.15,0.4],[0.2,0.4],[0.25,0.4],[0.3,0.4],[0.35,0.4],[0.4,0.4],[0.45,0.4],[0.5,0.4],[0.55,0.4],[0.6,0.4],[0.65,0.4],[0.7,0.4],[0.75,0.4],[0.8,0.4],[0.85,0.4],
    [0.25,0.6],[0.3,0.6],[0.35,0.6],[0.4,0.6],[0.45,0.6],[0.5,0.6],[0.55,0.6],[0.6,0.6],[0.65,0.6],[0.7,0.6],[0.75,0.6],
    [0.2,0.75],[0.3,0.75],[0.45,0.75],[0.55,0.75],[0.7,0.75],[0.8,0.75],
  ]
  pts.forEach(([nx,ny]) => dot(nx,ny))
  // windows
  ctx.fillStyle = "#ffaacc"
  dot(0.3,0.4); dot(0.45,0.4); dot(0.6,0.4); dot(0.75,0.4)
}

// ─── Alien pixel art ─────────────────────────────────────────────────────────
// Each alien type has two animation frames drawn with canvas primitives.
// All coordinates are normalised 0-1 relative to ALIEN_W × ALIEN_H.

function drawAlienPixels(cx, cy, type, frame, color) {
  ctx.fillStyle = color
  const w = ALIEN_W
  const h = ALIEN_H
  // pixel size
  const px = Math.max(1, Math.floor(w / 10))

  function dot(nx, ny) {
    ctx.fillRect(
      Math.round(cx - w/2 + nx * w),
      Math.round(cy - h/2 + ny * h),
      px, px
    )
  }

  if (type === 0) {
    // Squid: top row, narrow with tentacles
    // body
    const bodyPts = [
      [0.35,0.05],[0.4,0.05],[0.45,0.05],[0.5,0.05],[0.55,0.05],[0.6,0.05],
      [0.3,0.15],[0.35,0.15],[0.4,0.15],[0.45,0.15],[0.5,0.15],[0.55,0.15],[0.6,0.15],[0.65,0.15],
      [0.25,0.25],[0.3,0.25],[0.35,0.25],[0.4,0.25],[0.45,0.25],[0.5,0.25],[0.55,0.25],[0.6,0.25],[0.65,0.25],[0.7,0.25],
      [0.25,0.35],[0.35,0.35],[0.45,0.35],[0.5,0.35],[0.55,0.35],[0.65,0.35],[0.7,0.35],
      [0.25,0.45],[0.3,0.45],[0.35,0.45],[0.4,0.45],[0.45,0.45],[0.5,0.45],[0.55,0.45],[0.6,0.45],[0.65,0.45],[0.7,0.45],
      [0.3,0.55],[0.4,0.55],[0.55,0.55],[0.65,0.55],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    // eyes
    dot(0.35, 0.2); dot(0.6, 0.2)
    // frame-dependent feet
    if (frame === 0) {
      dot(0.25,0.65); dot(0.35,0.65); dot(0.6,0.65); dot(0.7,0.65)
    } else {
      dot(0.3,0.65); dot(0.4,0.65); dot(0.55,0.65); dot(0.65,0.65)
      dot(0.25,0.75); dot(0.7,0.75)
    }

  } else if (type === 1) {
    // Crab: mid rows, wide claws
    const bodyPts = [
      [0.35,0.05],[0.6,0.05],
      [0.3,0.15],[0.35,0.15],[0.4,0.15],[0.5,0.15],[0.55,0.15],[0.6,0.15],[0.65,0.15],
      [0.25,0.25],[0.3,0.25],[0.35,0.25],[0.4,0.25],[0.45,0.25],[0.5,0.25],[0.55,0.25],[0.6,0.25],[0.65,0.25],[0.7,0.25],
      [0.25,0.35],[0.3,0.35],[0.45,0.35],[0.5,0.35],[0.55,0.35],[0.65,0.35],[0.7,0.35],
      [0.25,0.45],[0.3,0.45],[0.35,0.45],[0.4,0.45],[0.5,0.45],[0.55,0.45],[0.6,0.45],[0.65,0.45],[0.7,0.45],
      [0.3,0.55],[0.35,0.55],[0.6,0.55],[0.65,0.55],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    dot(0.35, 0.15); dot(0.6, 0.15) // eyes
    if (frame === 0) {
      dot(0.2,0.65); dot(0.25,0.65); dot(0.7,0.65); dot(0.75,0.65)
      dot(0.35,0.65); dot(0.6,0.65)
    } else {
      dot(0.15,0.55); dot(0.2,0.55); dot(0.75,0.55); dot(0.8,0.55)
      dot(0.3,0.65); dot(0.65,0.65)
    }

  } else {
    // Octopus: bottom rows, tentacled and wide
    const bodyPts = [
      [0.3,0.1],[0.35,0.1],[0.4,0.1],[0.45,0.1],[0.5,0.1],[0.55,0.1],[0.6,0.1],[0.65,0.1],
      [0.25,0.2],[0.3,0.2],[0.35,0.2],[0.4,0.2],[0.45,0.2],[0.5,0.2],[0.55,0.2],[0.6,0.2],[0.65,0.2],[0.7,0.2],
      [0.2,0.3],[0.25,0.3],[0.3,0.3],[0.4,0.3],[0.45,0.3],[0.5,0.3],[0.55,0.3],[0.65,0.3],[0.7,0.3],[0.75,0.3],
      [0.2,0.4],[0.25,0.4],[0.3,0.4],[0.35,0.4],[0.4,0.4],[0.45,0.4],[0.5,0.4],[0.55,0.4],[0.6,0.4],[0.65,0.4],[0.7,0.4],[0.75,0.4],
      [0.25,0.5],[0.35,0.5],[0.4,0.5],[0.5,0.5],[0.55,0.5],[0.65,0.5],[0.7,0.5],
      [0.3,0.6],[0.4,0.6],[0.55,0.6],[0.65,0.6],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    dot(0.3, 0.2); dot(0.65, 0.2) // eyes
    if (frame === 0) {
      dot(0.25,0.7); dot(0.3,0.7); dot(0.65,0.7); dot(0.7,0.7)
      dot(0.4,0.75); dot(0.55,0.75)
    } else {
      dot(0.2,0.7); dot(0.25,0.7); dot(0.7,0.7); dot(0.75,0.7)
      dot(0.35,0.8); dot(0.6,0.8)
    }
  }
}

// ─── Player pixel art (laser cannon) as solid blocks ──────────────────────────
function drawPlayerPixels(cx, cy) {
  const w = Math.floor(ALIEN_W * 1.6)
  const h = Math.floor(ALIEN_H * 1.2)
  ctx.fillStyle = "#00ff88"

  // Barrel — narrow centered column
  const barrelW = Math.max(2, Math.floor(w * 0.13))
  const barrelH = Math.floor(h * 0.28)
  ctx.fillRect(Math.round(cx - barrelW / 2), Math.round(cy - h / 2), barrelW, barrelH)

  // Turret — medium block
  const turretW = Math.floor(w * 0.52)
  const turretH = Math.floor(h * 0.30)
  const turretY = Math.round(cy - h / 2 + barrelH)
  ctx.fillRect(Math.round(cx - turretW / 2), turretY, turretW, turretH)

  // Base — full-width block
  const baseH = Math.floor(h * 0.32)
  const baseY = Math.round(cy + h / 2 - baseH)
  ctx.fillRect(Math.round(cx - w / 2), baseY, w, baseH)
}

// ─── Barricades ───────────────────────────────────────────────────────────────
// Pixel-level destructible barricades.
// Each barricade stores a per-pixel boolean grid.
// Bullets punch a procedural crater: entry point offset 10-30% in vertically,
// 5-10% in horizontally, then shred a 5-10% radius around it (50/50 per pixel).

const BARRICADE_COUNT = 4
// Cell = 1 screen pixel cluster; we use B_CELL px per logical pixel for visibility
const B_CELL  = Math.max(3, Math.floor(W * 0.004))
const B_COLS  = Math.floor(W * 0.076 / B_CELL)
const B_ROWS  = Math.floor(H * 0.081 / B_CELL)
const B_W     = B_COLS * B_CELL
const B_H     = B_ROWS * B_CELL

// Classic bunker silhouette mask (1=solid)
const BUNKER_MASK = (() => {
  const m = new Uint8Array(B_COLS * B_ROWS)
  for (let r = 0; r < B_ROWS; r++) {
    for (let c = 0; c < B_COLS; c++) {
      const inBody  = c >= 1 && c < B_COLS - 1 && r >= Math.floor(B_ROWS * 0.17)
      const inTop   = c >= Math.floor(B_COLS * 0.22) && c < Math.floor(B_COLS * 0.78) && r < Math.floor(B_ROWS * 0.17)
      const inNotch = c >= Math.floor(B_COLS * 0.33) && c < Math.floor(B_COLS * 0.67) && r >= Math.floor(B_ROWS * 0.67)
      m[r * B_COLS + c] = (inBody || inTop) && !inNotch ? 1 : 0
    }
  }
  return m
})()

function buildBarricades() {
  const bArr   = []
  const spacing = W * 0.8 / (BARRICADE_COUNT + 1)
  const startX  = W * 0.1
  const by      = player.y - player.h / 2 - B_H - Math.floor(H * 0.04)
  for (let i = 0; i < BARRICADE_COUNT; i++) {
    const bx    = startX + spacing * (i + 1) - B_W / 2
    const cells = new Uint8Array(BUNKER_MASK)   // copy mask: 1=alive, 0=dead
    bArr.push({ x: bx, y: by, cells })
  }
  return bArr
}

function drawBarricades() {
  for (const b of barricades) {
    for (let r = 0; r < B_ROWS; r++) {
      for (let c = 0; c < B_COLS; c++) {
        if (!b.cells[r * B_COLS + c]) continue
        ctx.fillStyle = "#00ff88"
        ctx.fillRect(b.x + c * B_CELL, b.y + r * B_CELL, B_CELL - 1, B_CELL - 1)
      }
    }
  }
}

// ─── Barricade destruction ────────────────────────────────────────────────────
//
// Path-trace to guaranteed edge contact, then carve:
//   1. A vertical tunnel 1–3 cells wide, 1–3 cells deep
//   2. Immediate clear: all cells touching the tunnel walls → deleted
//   3. Grid shred: cells beyond that, alternating skip-2 / skip-1 columns
//      in a checkerboard, up to (tunnel depth + 2) rows deep
//
// fromAbove=true  → alien bullet, scan top-to-bottom, delete downward
// fromAbove=false → player bullet, scan bottom-to-top, delete upward

function punchBarricade(b, hitCol, fromAbove) {
  hitCol = Math.max(0, Math.min(B_COLS - 1, hitCol))

  // 1. Find the first solid row from the entry side
  let entryRow = -1
  if (fromAbove) {
    for (let r = 0; r < B_ROWS; r++) {
      if (b.cells[r * B_COLS + hitCol]) { entryRow = r; break }
    }
  } else {
    for (let r = B_ROWS - 1; r >= 0; r--) {
      if (b.cells[r * B_COLS + hitCol]) { entryRow = r; break }
    }
  }
  if (entryRow === -1) return   // column is already empty

  // 2. Tunnel parameters
  const tunnelW     = 1 + Math.floor(Math.random() * 3)   // 1–3 cells wide
  const tunnelDepth = 1 + Math.floor(Math.random() * 3)   // 1–3 cells deep
  const halfW       = Math.floor(tunnelW / 2)
  const colMin      = Math.max(0, hitCol - halfW)
  const colMax      = Math.min(B_COLS - 1, hitCol + halfW)

  // Row range of the tunnel (going inward from entry)
  const dir      = fromAbove ? 1 : -1
  const rowStart = entryRow
  const rowEnd   = Math.min(B_ROWS - 1, Math.max(0, entryRow + dir * (tunnelDepth - 1)))
  const rMin     = Math.min(rowStart, rowEnd)
  const rMax     = Math.max(rowStart, rowEnd)

  // 3. Carve tunnel
  for (let r = rMin; r <= rMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      b.cells[r * B_COLS + c] = 0
    }
  }

  // 4. Immediate clear ring: all cells one step outside the tunnel
  const clearRMin = Math.max(0, rMin - 1)
  const clearRMax = Math.min(B_ROWS - 1, rMax + 1)
  const clearCMin = Math.max(0, colMin - 1)
  const clearCMax = Math.min(B_COLS - 1, colMax + 1)
  for (let r = clearRMin; r <= clearRMax; r++) {
    for (let c = clearCMin; c <= clearCMax; c++) {
      // skip the tunnel interior itself (already cleared)
      if (r >= rMin && r <= rMax && c >= colMin && c <= colMax) continue
      b.cells[r * B_COLS + c] = 0
    }
  }

  // 5. Grid shred: alternating skip-2 / skip-1 beyond the clear ring,
  //    up to (tunnelDepth + 2) extra rows deep in the entry direction
  const shredRows  = tunnelDepth + 2
  const shredCMin  = Math.max(0, clearCMin - 1)
  const shredCMax  = Math.min(B_COLS - 1, clearCMax + 1)

  for (let step = 1; step <= shredRows; step++) {
    const r = fromAbove
      ? clearRMax + step
      : clearRMin - step
    if (r < 0 || r >= B_ROWS) break
    // alternating columns: even step → delete every-other-2, odd step → every-other-1
    const skip = (step % 2 === 0) ? 2 : 1
    for (let c = shredCMin; c <= shredCMax; c++) {
      if (c % (skip + 1) !== 0) continue
      b.cells[r * B_COLS + c] = 0
    }
  }
}

// Path-traced barricade hit: finds which barricade a bullet X crosses, traces
// to the correct edge row, punches it, returns true if anything was hit.
function barricadeHit(bx, by, fromAbove) {
  for (const b of barricades) {
    // Coarse X check
    if (bx < b.x || bx >= b.x + B_W) continue
    // Coarse Y check 
    if (by < b.y - B_CELL || by > b.y + B_H + B_CELL) continue

    const col = Math.floor((bx - b.x) / B_CELL)
    if (col < 0 || col >= B_COLS) continue

    // Check whether this column has any live cell at all
    let hasLive = false
    for (let r = 0; r < B_ROWS; r++) {
      if (b.cells[r * B_COLS + col]) { hasLive = true; break }
    }
    if (!hasLive) continue

    // Also verify the bullet's Y is in the right zone relative to direction
    // (alien bullets arrive from above, player bullets from below)
    if (fromAbove && by > b.y + B_H) continue
    if (!fromAbove && by < b.y) continue

    punchBarricade(b, col, fromAbove)
    return true
  }
  return false
}

// Game over when any alive alien descends to the barricade Y level.
// Uses the top of the first barricade as the threshold (all share the same Y).
function aliensReachedBarricadeLevel() {
  if (!barricades.length) return false
  const barricadeTopY = barricades[0].y
  for (const a of aliens) {
    if (!a.alive) continue
    if (a.y + ALIEN_H / 2 >= barricadeTopY) return true
  }
  return false
}

// ─── Swarm construction ───────────────────────────────────────────────────────
function buildSwarm(formation) {
  const cfg = FORMATION_CONFIGS[formation]
  const { rows, cols } = cfg

  const totalW = cols * (ALIEN_W + ALIEN_PAD) - ALIEN_PAD
  const startX = Math.floor((W - totalW) / 2) + ALIEN_W / 2
  const startY = Math.floor(H * 0.10) + ALIEN_H / 2

  const grid = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // sparse: skip checkerboard pattern in outer positions
      if (formation === "sparse" && (r + c) % 2 !== 0) continue
      grid.push({
        x: startX + c * (ALIEN_W + ALIEN_PAD),
        y: startY + r * (ALIEN_H + ALIEN_PAD),
        // offset for swarm marching
        homeX: startX + c * (ALIEN_W + ALIEN_PAD),
        row: r,
        col: c,
        type: alienType(r),
        color: TYPE_COLORS[alienType(r)],
        points: ROW_POINTS[r],
        alive: true,
        frame: 0,
      })
    }
  }
  return grid
}

// ─── Init ─────────────────────────────────────────────────────────────────────
let stepTimer     = 0
let stepInterval  = 900
let swarmDir      = 1
let stepSize      = 0
let descentStep   = 0
let cfg           = null
let alienFrame    = 0
let shootCooldown = 0
let explosions    = []
let waveFireRate  = 0   // scales up each wave at ×1.1

// --- Control mode ---
let mouseControl  = false   // false = keyboard, true = mouse
let mouseTargetX  = null    // canvas-space X the player should track

function initGame(diff, formation) {
  selectedDiff      = diff
  selectedFormation = formation
  cfg               = DIFF_CONFIGS[diff]
  scoreMod          = cfg.scoreMod
  wave              = 1

  canvas.width  = W
  canvas.height = H

  score   = 0
  lives   = 3
  running = true
  paused  = false
  document.getElementById("pause-btn").textContent = "PAUSE"

  stepInterval  = cfg.stepInterval
  stepTimer     = 0
  swarmDir      = 1
  stepSize      = Math.floor(W * 0.022)
  descentStep   = Math.floor(H * 0.028)
  alienFrame    = 0
  shootCooldown = 0
  explosions    = []
  waveFireRate  = cfg.alienFireRate
  mouseControl  = false
  mouseTargetX  = null
  mouseHeld     = false

  const pw = Math.floor(ALIEN_W * 1.4)
  player = {
    x: W / 2,
    y: H - Math.floor(H * 0.07),
    w: pw,
    h: Math.floor(ALIEN_H * 1.1),
    speed: cfg.playerSpeed,
  }

  bullets      = []
  alienBullets = []
  aliens       = buildSwarm(formation)
  barricades   = buildBarricades()
  resetMotherTimer()

  updateHUD()
  document.getElementById("hud").style.width = W + "px"
}

function nextWave() {
  wave++
  stepInterval = Math.max(120, Math.floor(cfg.stepInterval * Math.pow(0.82, wave - 1)))
  waveFireRate  = cfg.alienFireRate * Math.pow(1.1, wave - 1)
  stepTimer    = 0
  swarmDir     = 1
  alienFrame   = 0
  bullets      = []
  alienBullets = []
  aliens       = buildSwarm(selectedFormation)
  barricades   = buildBarricades()
  explosions   = []
  resetMotherTimer()
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById("score-display").textContent =
    `SCORE: ${score} | LIVES: ${lives} | WAVE: ${wave}`
}

// ─── Volume ───────────────────────────────────────────────────────────────────
const volTrack = document.getElementById("vol-track")
const volFill  = document.getElementById("vol-fill")
const volThumb = document.getElementById("vol-thumb")
setVolume(currentVolume)

function setVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v))
  const pct = (currentVolume * 100).toFixed(1) + "%"
  volFill.style.width = pct
  volThumb.style.left = pct
  setMusicVolume(currentVolume * 0.3)
}

let dragging = false
volTrack.addEventListener("mousedown", (e) => { dragging = true; updateFromEvent(e) })
document.addEventListener("mousemove",  (e) => { if (!dragging) return; updateFromEvent(e) })
document.addEventListener("mouseup",    ()  => { dragging = false })

function updateFromEvent(e) {
  const rect  = volTrack.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  setVolume(ratio)
}

// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {}
let mouseHeld = false   // true while mouse button is held on canvas

document.addEventListener("keydown", (e) => {
  keys[e.key] = true

  // Movement keys switch to keyboard mode for movement, but don't kill mouse mode entirely
  // in keyboard mode, A/D move the player; in mouse mode, cursor does
  if (["ArrowLeft","ArrowRight","a","d"].includes(e.key) && running && !paused) {
    mouseControl = false   // keyboard takes over movement
    // mouseTargetX stays so we can re-engage mouse on next click
  }

  if (e.key === "Escape") {
    if (running) togglePause()
    else returnToMenu()
    return
  }
  if (e.key === " ") {
    e.preventDefault()
    if (running && paused) { togglePause(); return }
    // auto-fire while playing handled in update loop
    return
  }
  if (e.key === "w" || e.key === "W") return           // auto-fire handled in update
  if (e.key === "r" || e.key === "R") { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
  if (e.key === "q" || e.key === "Q") { stopMusic(); returnToMenu(); return }
  if (["ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault()
})
document.addEventListener("keyup", (e) => { keys[e.key] = false })

// Mouse always tracks position (so clicking instantly moves to cursor)
canvas.addEventListener("mousemove", (e) => {
  if (!running || paused) return
  const rect = canvas.getBoundingClientRect()
  mouseTargetX = (e.clientX - rect.left) * (canvas.width / rect.width)
})

// Mousedown on canvas → engage mouse mode + start holding to auto-fire
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return
  if (!running || paused) return
  mouseControl = true
  mouseHeld    = true
  const rect = canvas.getBoundingClientRect()
  mouseTargetX = (e.clientX - rect.left) * (canvas.width / rect.width)
  playerShoot()   // fire immediately on press
})

// Mouseup anywhere → release hold-fire
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseHeld = false
})

// Click on canvas: handle pause overlay and end-screen buttons
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect()
  const tapY = (e.clientY - rect.top) * (canvas.height / rect.height)

  if (!running) {
    // End screen
    const menuY  = H / 2 + 56
    const resetY = H / 2 + 76
    if (tapY >= menuY  - 16 && tapY <= menuY  + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
    return
  }

  if (paused) {
    // Pause overlay
    const resumeY  = H / 2 + 5
    const restartY = H / 2 + 30
    if (tapY >= resumeY  - 16 && tapY <= resumeY  + 8) { togglePause(); return }
    if (tapY >= restartY - 16 && tapY <= restartY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
    return
  }
  // In-game clicks handled by mousedown already
})

// Touch: tap to shoot + drag to move
let lastTouchX = null
canvas.addEventListener("touchstart", (e) => {
  if (!running || paused) return
  e.preventDefault()
  lastTouchX = e.touches[0].clientX
  playerShoot()
}, { passive: false })
canvas.addEventListener("touchmove", (e) => {
  if (!running || paused) return
  e.preventDefault()
  const tx = e.touches[0].clientX
  if (lastTouchX !== null) {
    const dx = tx - lastTouchX
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x + dx))
  }
  lastTouchX = tx
}, { passive: false })
canvas.addEventListener("touchend", () => { lastTouchX = null })

// ─── Shooting ─────────────────────────────────────────────────────────────────
const BULLET_SPEED   = H * 0.016
const A_BULLET_SPEED = H * 0.010
const PLAYER_COOLDOWN_FRAMES = 18  // ~0.3s at 60fps; only 1 bullet on screen at a time

function playerShoot() {
  if (shootCooldown > 0) return
  // only 1 player bullet at a time (classic 1978 rule)
  if (bullets.length >= 1) return
  bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -BULLET_SPEED })
  shootCooldown = PLAYER_COOLDOWN_FRAMES
}

function alienShoot() {
  // Classic rule: only the bottom-most alien in each column can shoot
  const colBottoms = {}
  for (const a of aliens) {
    if (!a.alive) continue
    const key = a.col
    if (colBottoms[key] === undefined || a.row > colBottoms[key].row) {
      colBottoms[key] = a
    }
  }
  const shooters = Object.values(colBottoms)
  for (const a of shooters) {
    if (Math.random() < waveFireRate) {
      alienBullets.push({ x: a.x, y: a.y + ALIEN_H / 2, vy: A_BULLET_SPEED })
    }
  }
}

// ─── Pause ────────────────────────────────────────────────────────────────────
function togglePause() {
  if (!running) return
  paused = !paused
  document.getElementById("pause-btn").textContent = paused ? "RESUME" : "PAUSE"
  if (paused) drawPauseOverlay()
  else draw()
}

// ─── Return to menu ───────────────────────────────────────────────────────────
function returnToMenu() {
  document.getElementById("menu").style.display = ""
  canvas.style.display = "none"
  document.getElementById("hud").style.display = "none"
}

document.getElementById("pause-btn").addEventListener("click", togglePause)
document.getElementById("reset-btn").addEventListener("click", () => {
  stopMusic()
  returnToMenu()
})

// ─── Step speed: scales with remaining aliens ─────────────────────────────────
function currentStepInterval() {
  const alive  = aliens.filter(a => a.alive).length
  const total  = aliens.length
  const ratio  = alive / total  // 1.0 = full swarm, 0 = empty
  // linearly interpolate: full swarm = stepInterval, last alien = stepInterval * 0.12
  return stepInterval * (0.12 + 0.88 * ratio)
}

// ─── Swarm bounds ─────────────────────────────────────────────────────────────
function swarmBounds() {
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const a of aliens) {
    if (!a.alive) continue
    minX = Math.min(minX, a.x - ALIEN_W / 2)
    maxX = Math.max(maxX, a.x + ALIEN_W / 2)
    maxY = Math.max(maxY, a.y + ALIEN_H / 2)
  }
  return { minX, maxX, maxY }
}

// ─── Game loop ────────────────────────────────────────────────────────────────
let lastTime = 0

function loop(ts) {
  requestAnimationFrame(loop)
  if (!running || paused) return
  const dt = Math.min(ts - lastTime, 50)
  lastTime = ts
  update(dt)
  draw()
}
requestAnimationFrame(loop)

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
  // --- Player movement ---
  // Keyboard mode: arrow keys / A/D move the player
  if (!mouseControl) {
    if (keys["ArrowLeft"]  || keys["a"]) player.x = Math.max(player.w / 2, player.x - player.speed)
    if (keys["ArrowRight"] || keys["d"]) player.x = Math.min(W - player.w / 2, player.x + player.speed)
  }

  // Mouse mode: lerp player toward cursor at keyboard speed
  if (mouseControl && mouseTargetX !== null) {
    const diff = mouseTargetX - player.x
    const step = player.speed * 1.5
    if (Math.abs(diff) <= step) player.x = mouseTargetX
    else player.x += Math.sign(diff) * step
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x))
  }

  // Auto-fire: hold Space or W (keyboard mode), or hold mouse button (handled via mousedown flag)
  if (running && !paused && (keys[" "] || keys["w"] || keys["W"] || mouseHeld)) {
    playerShoot()
  }

  if (shootCooldown > 0) shootCooldown--

  // --- Mothership timer + movement ---
  if (!motherSpawnedThisWave) {
    motherSpawnTimer += dt
    if (motherSpawnTimer >= motherSpawnDelay) spawnMothership()
  }
  if (mothership && mothership.alive) {
    mothership.x += mothership.vx
    if (mothership.x < -MOTHER_W || mothership.x > W + MOTHER_W) mothership = null
  }

  // --- Player bullets ---
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    b.y += b.vy
    if (b.y < 0) { bullets.splice(i, 1); continue }

    // Barricade
    if (barricadeHit(b.x, b.y, false)) { bullets.splice(i, 1); continue }

    // Mothership
    if (mothership && mothership.alive) {
      if (
        b.x > mothership.x - MOTHER_W / 2 && b.x < mothership.x + MOTHER_W / 2 &&
        b.y > mothership.y - MOTHER_H / 2 && b.y < mothership.y + MOTHER_H / 2
      ) {
        const pts = mothership.prize * scoreMod
        score += pts
        updateHUD()
        explosions.push({ x: mothership.x, y: mothership.y, ttl: 40 })
        mothership.alive    = false
        mothership.flashTtl = 40
        mothership.flashText = `${pts}`
        bullets.splice(i, 1)
        continue
      }
    }

    // Aliens
    let hit = false
    for (const a of aliens) {
      if (!a.alive) continue
      if (
        b.x > a.x - ALIEN_W / 2 && b.x < a.x + ALIEN_W / 2 &&
        b.y > a.y - ALIEN_H / 2 && b.y < a.y + ALIEN_H / 2
      ) {
        a.alive = false
        score += a.points * scoreMod
        updateHUD()
        explosions.push({ x: a.x, y: a.y, ttl: 18 })
        bullets.splice(i, 1)
        hit = true
        break
      }
    }
    if (hit) continue
  }

  // --- Alien bullets ---
  for (let i = alienBullets.length - 1; i >= 0; i--) {
    const b = alienBullets[i]
    b.y += b.vy
    if (b.y > H) { alienBullets.splice(i, 1); continue }

    // Barricade
    if (barricadeHit(b.x, b.y, true)) { alienBullets.splice(i, 1); continue }

    // Player
    if (
      b.x > player.x - player.w / 2 && b.x < player.x + player.w / 2 &&
      b.y > player.y - player.h / 2 && b.y < player.y + player.h / 2
    ) {
      alienBullets.splice(i, 1)
      lives--
      explosions.push({ x: player.x, y: player.y, ttl: 25 })
      updateHUD()
      if (lives <= 0) { endGame(); return }
      continue
    }
  }

  // --- Explosions ---
  for (let i = explosions.length - 1; i >= 0; i--) {
    if (--explosions[i].ttl <= 0) explosions.splice(i, 1)
  }

  // --- Swarm step ---
  stepTimer += dt
  const si = currentStepInterval()
  if (stepTimer >= si) {
    stepTimer -= si
    alienFrame = 1 - alienFrame
    for (const a of aliens) { if (a.alive) a.frame = alienFrame }

    const { minX, maxX } = swarmBounds()
    const bounce = (swarmDir === 1 && maxX + stepSize >= W) ||
                   (swarmDir === -1 && minX - stepSize <= 0)
    if (bounce) {
      for (const a of aliens) { if (a.alive) a.y += descentStep }
      swarmDir = -swarmDir
    } else {
      for (const a of aliens) { if (a.alive) a.x += swarmDir * stepSize }
    }

    alienShoot()

    const { maxY } = swarmBounds()
    if (maxY >= player.y - player.h / 2) { endGame(); return }
    if (aliensReachedBarricadeLevel())    { endGame(); return }
  }

  // --- Wave cleared → next wave (infinite) ---
  if (aliens.every(a => !a.alive)) {
    nextWave()
    updateHUD()
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
// Ground line Y
const GROUND_Y = H - Math.floor(H * 0.04)

function draw() {
  ctx.fillStyle = "#0a0a0f"
  ctx.fillRect(0, 0, W, H)

  // Ground line
  ctx.fillStyle = "#00ff88"
  ctx.fillRect(0, GROUND_Y, W, 1)

  // Barricades
  drawBarricades()

  // Mothership
  drawMothership()

  // Aliens
  for (const a of aliens) {
    if (!a.alive) continue
    drawAlienPixels(a.x, a.y, a.type, a.frame, a.color)
  }

  // Player
  drawPlayerPixels(player.x, player.y)

  // Player bullets: thin bright line
  ctx.fillStyle = "#ffffff"
  for (const b of bullets) {
    ctx.fillRect(b.x - 1, b.y - 6, 2, 12)
  }

  // Alien bullets: zigzag look
  ctx.fillStyle = "#ff4444"
  for (const b of alienBullets) {
    ctx.fillRect(b.x - 1, b.y - 4, 2, 8)
    ctx.fillRect(b.x - 2, b.y,     2, 3)
  }

  // Explosions
  for (const ex of explosions) {
    const alpha = ex.ttl / 25
    ctx.fillStyle = `rgba(255, 200, 0, ${alpha})`
    const r = (1 - alpha) * ALIEN_W
    ctx.beginPath()
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Hint
  if (running && !paused) {
    ctx.fillStyle = "#333333"
    ctx.font = "10px monospace"
    ctx.textAlign = "center"
    ctx.fillText(
      mouseControl
        ? "MOUSE MOVE  |  CLICK / HOLD SHOOT  |  ESC PAUSE"
        : "← → / A D MOVE  |  SPACE / W SHOOT (HOLD)  |  ESC PAUSE",
      W / 2, H - 6
    )
  }
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.75)"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px monospace"
  ctx.textAlign = "center"
  ctx.fillText("PAUSED", W / 2, H / 2 - 20)
  ctx.font = "13px monospace"
  ctx.fillStyle = "#aaaaaa"
  ctx.fillText("Press ESC/SPACE/PAUSE to resume", W / 2, H / 2 + 5)
  ctx.fillText("Press R to restart", W / 2, H / 2 + 30)
}

function endGame() {
  running   = false
  mouseHeld = false
  stopMusic()
  document.getElementById("pause-btn").textContent = "PAUSE"
  setTimeout(() => {
    ctx.fillStyle = "rgba(0,0,0,0.75)"
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = "#ffffff"
    ctx.font = "bold 20px monospace"
    ctx.textAlign = "center"
    ctx.fillText("GAME OVER", W / 2, H / 2)
    ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 30)
    ctx.font = "13px monospace"
    ctx.fillStyle = "#aaaaaa"
    ctx.fillText("ESC: Back to Main Menu", W / 2, H / 2 + 56)
    ctx.fillText("R: Restart", W / 2, H / 2 + 76)
  }, 50)
}

// ─── Menu wiring ──────────────────────────────────────────────────────────────
document.querySelectorAll(".opt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.group
    if (!group) return
    document.querySelectorAll(`.opt-btn[data-group="${group}"]`)
            .forEach(b => b.classList.remove("selected"))
    btn.classList.add("selected")
    if (group === "diff")      selectedDiff      = btn.dataset.value
    if (group === "formation") selectedFormation = btn.dataset.value
  })
})

document.getElementById("start-btn").addEventListener("click", () => {
  document.getElementById("menu").style.display = "none"
  document.getElementById("hud").style.display  = "flex"
  document.getElementById("game").style.display = "block"
  playMusic()
  initGame(selectedDiff, selectedFormation)
})

// Load music
loadMidi("lil_big_day.mid")