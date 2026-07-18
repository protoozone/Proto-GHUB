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
const DIFF_CONFIGS = {
  easy:   { stepInterval: 900,  alienFireRate: 0.0032, playerSpeed: Math.floor(W * 0.008), scoreMod: 1 },
  normal: { stepInterval: 650,  alienFireRate: 0.0090, playerSpeed: Math.floor(W * 0.009), scoreMod: 2 },
  hard:   { stepInterval: 420,  alienFireRate: 0.0200, playerSpeed: Math.floor(W * 0.010), scoreMod: 3 },
}

// --- Formation configs ---
const FORMATION_CONFIGS = {
  classic: { rows: 5, cols: 11 },
  dense:   { rows: 5, cols: 13 },
  sparse:  { rows: 5, cols: 11 },
}

// --- Row roles (fixed 5-row layout) ---
const ROW_POINTS = [30, 20, 20, 10, 10]

function alienType(row) {
  if (row === 0) return 0
  if (row <= 2)  return 1
  return 2
}

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
  if (motherSpawnedThisWave) return   // hard gate: only one per wave
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
  motherSpawnDelay      = 20000 + Math.random() * 20000
  motherSpawnedThisWave = false
  mothership            = null
}

function drawMothership() {
  if (!mothership) return

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

  const pts = [
    [0.35,0.05],[0.4,0.05],[0.45,0.05],[0.5,0.05],[0.55,0.05],[0.6,0.05],
    [0.25,0.2],[0.3,0.2],[0.35,0.2],[0.4,0.2],[0.45,0.2],[0.5,0.2],[0.55,0.2],[0.6,0.2],[0.65,0.2],[0.7,0.2],[0.75,0.2],
    [0.15,0.4],[0.2,0.4],[0.25,0.4],[0.3,0.4],[0.35,0.4],[0.4,0.4],[0.45,0.4],[0.5,0.4],[0.55,0.4],[0.6,0.4],[0.65,0.4],[0.7,0.4],[0.75,0.4],[0.8,0.4],[0.85,0.4],
    [0.25,0.6],[0.3,0.6],[0.35,0.6],[0.4,0.6],[0.45,0.6],[0.5,0.6],[0.55,0.6],[0.6,0.6],[0.65,0.6],[0.7,0.6],[0.75,0.6],
    [0.2,0.75],[0.3,0.75],[0.45,0.75],[0.55,0.75],[0.7,0.75],[0.8,0.75],
  ]
  pts.forEach(([nx,ny]) => dot(nx,ny))
  ctx.fillStyle = "#ffaacc"
  dot(0.3,0.4); dot(0.45,0.4); dot(0.6,0.4); dot(0.75,0.4)
}

// ─── Alien pixel art ──────────────────────────────────────────────────────────
function drawAlienPixels(cx, cy, type, frame, color) {
  ctx.fillStyle = color
  const w = ALIEN_W
  const h = ALIEN_H
  const px = Math.max(1, Math.floor(w / 10))

  function dot(nx, ny) {
    ctx.fillRect(
      Math.round(cx - w/2 + nx * w),
      Math.round(cy - h/2 + ny * h),
      px, px
    )
  }

  if (type === 0) {
    const bodyPts = [
      [0.35,0.05],[0.4,0.05],[0.45,0.05],[0.5,0.05],[0.55,0.05],[0.6,0.05],
      [0.3,0.15],[0.35,0.15],[0.4,0.15],[0.45,0.15],[0.5,0.15],[0.55,0.15],[0.6,0.15],[0.65,0.15],
      [0.25,0.25],[0.3,0.25],[0.35,0.25],[0.4,0.25],[0.45,0.25],[0.5,0.25],[0.55,0.25],[0.6,0.25],[0.65,0.25],[0.7,0.25],
      [0.25,0.35],[0.35,0.35],[0.45,0.35],[0.5,0.35],[0.55,0.35],[0.65,0.35],[0.7,0.35],
      [0.25,0.45],[0.3,0.45],[0.35,0.45],[0.4,0.45],[0.45,0.45],[0.5,0.45],[0.55,0.45],[0.6,0.45],[0.65,0.45],[0.7,0.45],
      [0.3,0.55],[0.4,0.55],[0.55,0.55],[0.65,0.55],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    dot(0.35, 0.2); dot(0.6, 0.2)
    if (frame === 0) {
      dot(0.25,0.65); dot(0.35,0.65); dot(0.6,0.65); dot(0.7,0.65)
    } else {
      dot(0.3,0.65); dot(0.4,0.65); dot(0.55,0.65); dot(0.65,0.65)
      dot(0.25,0.75); dot(0.7,0.75)
    }

  } else if (type === 1) {
    const bodyPts = [
      [0.35,0.05],[0.6,0.05],
      [0.3,0.15],[0.35,0.15],[0.4,0.15],[0.5,0.15],[0.55,0.15],[0.6,0.15],[0.65,0.15],
      [0.25,0.25],[0.3,0.25],[0.35,0.25],[0.4,0.25],[0.45,0.25],[0.5,0.25],[0.55,0.25],[0.6,0.25],[0.65,0.25],[0.7,0.25],
      [0.25,0.35],[0.3,0.35],[0.45,0.35],[0.5,0.35],[0.55,0.35],[0.65,0.35],[0.7,0.35],
      [0.25,0.45],[0.3,0.45],[0.35,0.45],[0.4,0.45],[0.5,0.45],[0.55,0.45],[0.6,0.45],[0.65,0.45],[0.7,0.45],
      [0.3,0.55],[0.35,0.55],[0.6,0.55],[0.65,0.55],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    dot(0.35, 0.15); dot(0.6, 0.15)
    if (frame === 0) {
      dot(0.2,0.65); dot(0.25,0.65); dot(0.7,0.65); dot(0.75,0.65)
      dot(0.35,0.65); dot(0.6,0.65)
    } else {
      dot(0.15,0.55); dot(0.2,0.55); dot(0.75,0.55); dot(0.8,0.55)
      dot(0.3,0.65); dot(0.65,0.65)
    }

  } else {
    const bodyPts = [
      [0.3,0.1],[0.35,0.1],[0.4,0.1],[0.45,0.1],[0.5,0.1],[0.55,0.1],[0.6,0.1],[0.65,0.1],
      [0.25,0.2],[0.3,0.2],[0.35,0.2],[0.4,0.2],[0.45,0.2],[0.5,0.2],[0.55,0.2],[0.6,0.2],[0.65,0.2],[0.7,0.2],
      [0.2,0.3],[0.25,0.3],[0.3,0.3],[0.4,0.3],[0.45,0.3],[0.5,0.3],[0.55,0.3],[0.65,0.3],[0.7,0.3],[0.75,0.3],
      [0.2,0.4],[0.25,0.4],[0.3,0.4],[0.35,0.4],[0.4,0.4],[0.45,0.4],[0.5,0.4],[0.55,0.4],[0.6,0.4],[0.65,0.4],[0.7,0.4],[0.75,0.4],
      [0.25,0.5],[0.35,0.5],[0.4,0.5],[0.5,0.5],[0.55,0.5],[0.65,0.5],[0.7,0.5],
      [0.3,0.6],[0.4,0.6],[0.55,0.6],[0.65,0.6],
    ]
    bodyPts.forEach(([nx,ny]) => dot(nx,ny))
    dot(0.3, 0.2); dot(0.65, 0.2)
    if (frame === 0) {
      dot(0.25,0.7); dot(0.3,0.7); dot(0.65,0.7); dot(0.7,0.7)
      dot(0.4,0.75); dot(0.55,0.75)
    } else {
      dot(0.2,0.7); dot(0.25,0.7); dot(0.7,0.7); dot(0.75,0.7)
      dot(0.35,0.8); dot(0.6,0.8)
    }
  }
}

// ─── Player pixel art ─────────────────────────────────────────────────────────
function drawPlayerPixels(cx, cy) {
  const w = Math.floor(ALIEN_W * 1.6)
  const h = Math.floor(ALIEN_H * 1.2)
  ctx.fillStyle = "#00ff88"

  const barrelW = Math.max(2, Math.floor(w * 0.13))
  const barrelH = Math.floor(h * 0.28)
  ctx.fillRect(Math.round(cx - barrelW / 2), Math.round(cy - h / 2), barrelW, barrelH)

  const turretW = Math.floor(w * 0.52)
  const turretH = Math.floor(h * 0.30)
  const turretY = Math.round(cy - h / 2 + barrelH)
  ctx.fillRect(Math.round(cx - turretW / 2), turretY, turretW, turretH)

  const baseH = Math.floor(h * 0.32)
  const baseY = Math.round(cy + h / 2 - baseH)
  ctx.fillRect(Math.round(cx - w / 2), baseY, w, baseH)
}

// ─── Barricades ───────────────────────────────────────────────────────────────
// FIX: hardcode logical grid dimensions so the bunker silhouette is consistent
// across all screen sizes and pixel densities. B_CELL is derived from cols,
// not the other way around.

const BARRICADE_COUNT = 4
const B_COLS  = 26                                           // doubled from 13
const B_ROWS  = 20                                           // doubled from 10
const B_CELL  = Math.max(2, Math.floor(W * 0.076 / B_COLS)) // half the cell size
const B_W     = B_COLS * B_CELL
const B_H     = B_ROWS * B_CELL

// Classic bunker silhouette mask on doubled 26×20 grid:
//   rows 0–5  : top arch  (cols 6–19)  → matches original proportions × 2
//   rows 6–19 : body      (cols 0–25)  → full width
//   rows 12–19: notch cut (cols 8–17)  → centre-bottom cut-out
const BUNKER_MASK = (() => {
  const m = new Uint8Array(B_COLS * B_ROWS)
  for (let r = 0; r < B_ROWS; r++) {
    for (let c = 0; c < B_COLS; c++) {
      const inTop   = r < 6  && c >= 6 && c <= 19
      const inBody  = r >= 6
      const inNotch = r >= 12 && c >= 8 && c <= 17
      m[r * B_COLS + c] = (inTop || inBody) && !inNotch ? 1 : 0
    }
  }
  return m
})()

function buildBarricades() {
  const bArr   = []
  const gap     = B_W * 0.9   // 0.9 barricade-widths between each one
  const totalW  = BARRICADE_COUNT * B_W + (BARRICADE_COUNT - 1) * gap
  const startX  = (W - totalW) / 2
  const by      = player.y - player.h / 2 - B_H - Math.floor(H * 0.04)
  for (let i = 0; i < BARRICADE_COUNT; i++) {
    const bx    = startX + i * (B_W + gap)
    const cells = new Uint8Array(BUNKER_MASK)
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
function punchBarricade(b, hitCol, fromAbove) {
  hitCol = Math.max(0, Math.min(B_COLS - 1, hitCol))

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
  if (entryRow === -1) return

  const tunnelW     = 1 + Math.floor(Math.random() * 3)
  const tunnelDepth = 1 + Math.floor(Math.random() * 3)
  const halfW       = Math.floor(tunnelW / 2)
  const colMin      = Math.max(0, hitCol - halfW)
  const colMax      = Math.min(B_COLS - 1, hitCol + halfW)

  const dir      = fromAbove ? 1 : -1
  const rowStart = entryRow
  const rowEnd   = Math.min(B_ROWS - 1, Math.max(0, entryRow + dir * (tunnelDepth - 1)))
  const rMin     = Math.min(rowStart, rowEnd)
  const rMax     = Math.max(rowStart, rowEnd)

  for (let r = rMin; r <= rMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      b.cells[r * B_COLS + c] = 0
    }
  }

  const clearRMin = Math.max(0, rMin - 1)
  const clearRMax = Math.min(B_ROWS - 1, rMax + 1)
  const clearCMin = Math.max(0, colMin - 1)
  const clearCMax = Math.min(B_COLS - 1, colMax + 1)
  for (let r = clearRMin; r <= clearRMax; r++) {
    for (let c = clearCMin; c <= clearCMax; c++) {
      if (r >= rMin && r <= rMax && c >= colMin && c <= colMax) continue
      b.cells[r * B_COLS + c] = 0
    }
  }

  const shredRows = tunnelDepth + 2
  const shredCMin = Math.max(0, clearCMin - 1)
  const shredCMax = Math.min(B_COLS - 1, clearCMax + 1)

  for (let step = 1; step <= shredRows; step++) {
    const r = fromAbove ? clearRMax + step : clearRMin - step
    if (r < 0 || r >= B_ROWS) break
    const skip = (step % 2 === 0) ? 2 : 1
    for (let c = shredCMin; c <= shredCMax; c++) {
      if (c % (skip + 1) !== 0) continue
      b.cells[r * B_COLS + c] = 0
    }
  }
}

function barricadeHit(bx, by, fromAbove) {
  for (const b of barricades) {
    if (bx < b.x || bx >= b.x + B_W) continue
    if (by < b.y - B_CELL || by > b.y + B_H + B_CELL) continue

    const col = Math.floor((bx - b.x) / B_CELL)
    if (col < 0 || col >= B_COLS) continue

    let hasLive = false
    for (let r = 0; r < B_ROWS; r++) {
      if (b.cells[r * B_COLS + col]) { hasLive = true; break }
    }
    if (!hasLive) continue

    if (fromAbove && by > b.y + B_H) continue
    if (!fromAbove && by < b.y) continue

    punchBarricade(b, col, fromAbove)
    return true
  }
  return false
}

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
      if (formation === "sparse" && (r + c) % 2 !== 0) continue
      grid.push({
        x: startX + c * (ALIEN_W + ALIEN_PAD),
        y: startY + r * (ALIEN_H + ALIEN_PAD),
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
let waveFireRate  = 0

let mouseControl  = false
let mouseTargetX  = null

// Bullet speed: H px in 0.9s → H / 0.9 px per second.
// Movement each frame = speed * (dt / 1000) since dt is in ms.
const BULLET_SPEED_PPS   = H / 0.9   // player bullet: full screen height in 0.9s
const A_BULLET_SPEED_PPS = H / 1.8   // alien bullet: half player speed

// FIX: target number of swarm descent steps before reaching the player.
// Derived once per initGame() so it's proportional regardless of screen H.
const MAX_DESCENTS = 14

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

  // FIX: descentStep calculated so the swarm always takes MAX_DESCENTS steps
  // to travel from its start Y to the player zone, regardless of screen height.
  const swarmStartY  = Math.floor(H * 0.10) + ALIEN_H / 2
  const swarmRange   = (player.y - player.h / 2) - swarmStartY
  descentStep        = Math.max(4, Math.floor(swarmRange / MAX_DESCENTS))

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
let mouseHeld = false

document.addEventListener("keydown", (e) => {
  keys[e.key] = true

  if (["ArrowLeft","ArrowRight","a","d"].includes(e.key) && running && !paused) {
    mouseControl = false
  }

  if (e.key === "Escape") {
    if (running) togglePause()
    else returnToMenu()
    return
  }
  if (e.key === " ") {
    e.preventDefault()
    if (running && paused) { togglePause(); return }
    return
  }
  if (e.key === "w" || e.key === "W") return
  if (e.key === "r" || e.key === "R") { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
  if (e.key === "q" || e.key === "Q") { stopMusic(); returnToMenu(); return }
  if (["ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault()
})
document.addEventListener("keyup", (e) => { keys[e.key] = false })

canvas.addEventListener("mousemove", (e) => {
  if (!running || paused) return
  const rect = canvas.getBoundingClientRect()
  mouseTargetX = (e.clientX - rect.left) * (canvas.width / rect.width)
})

canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return
  if (!running || paused) return
  mouseControl = true
  mouseHeld    = true
  const rect = canvas.getBoundingClientRect()
  mouseTargetX = (e.clientX - rect.left) * (canvas.width / rect.width)
  playerShoot()
})

document.addEventListener("mouseup", (e) => {
  if (e.button === 0) mouseHeld = false
})

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect()
  const tapY = (e.clientY - rect.top) * (canvas.height / rect.height)

  if (!running) {
    const menuY  = H / 2 + 56
    const resetY = H / 2 + 76
    if (tapY >= menuY  - 16 && tapY <= menuY  + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
    return
  }

  if (paused) {
    const resumeY  = H / 2 + 5
    const restartY = H / 2 + 30
    if (tapY >= resumeY  - 16 && tapY <= resumeY  + 8) { togglePause(); return }
    if (tapY >= restartY - 16 && tapY <= restartY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedFormation); return }
    return
  }
})

let lastTouchX = null
canvas.addEventListener("touchstart", (e) => {
  if (!running || paused) return
  e.preventDefault()
  lastTouchX = e.touches[0].clientX
  mouseHeld = true     // begin continuous fire
  playerShoot()        // fire immediately on tap
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
canvas.addEventListener("touchend", () => {
  lastTouchX = null
  mouseHeld  = false   // stop continuous fire on lift
})

// ─── Shooting ─────────────────────────────────────────────────────────────────
const PLAYER_COOLDOWN_MS = 300   // ms between shots

function playerShoot() {
  if (shootCooldown > 0) return
  if (bullets.length >= 1) return
  bullets.push({ x: player.x, y: player.y - player.h / 2, vy: -BULLET_SPEED_PPS })
  shootCooldown = PLAYER_COOLDOWN_MS
}

function alienShoot() {
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
      alienBullets.push({ x: a.x, y: a.y + ALIEN_H / 2, vy: A_BULLET_SPEED_PPS })
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
  const ratio  = alive / total
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
  const dt = Math.min(ts - lastTime, 50)   // cap at 50ms to avoid spiral on tab-switch
  lastTime = ts
  update(dt)
  draw()
}
requestAnimationFrame(loop)

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
  // FIX: normalise all per-frame movement to 60fps so 120Hz screens aren't faster.
  // dtScale = 1.0 at 60fps, 0.5 at 120fps, 2.0 at 30fps.
  const dtScale = dt / 16.667

  // --- Player movement ---
  if (!mouseControl) {
    if (keys["ArrowLeft"]  || keys["a"]) player.x = Math.max(player.w / 2, player.x - player.speed * dtScale)
    if (keys["ArrowRight"] || keys["d"]) player.x = Math.min(W - player.w / 2, player.x + player.speed * dtScale)
  }

  if (mouseControl && mouseTargetX !== null) {
    const diff = mouseTargetX - player.x
    const step = player.speed * 1.5 * dtScale
    if (Math.abs(diff) <= step) player.x = mouseTargetX
    else player.x += Math.sign(diff) * step
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x))
  }

  // Auto-fire: called every frame; cooldown timer gates actual shot rate
  if (keys[" "] || keys["w"] || keys["W"] || keys["ArrowUp"] || mouseHeld) {
    playerShoot()
  }

  // Cooldown in ms, decrement by actual elapsed time
  if (shootCooldown > 0) shootCooldown = Math.max(0, shootCooldown - dt)

  // --- Mothership timer + movement ---
  if (!motherSpawnedThisWave) {
    motherSpawnTimer += dt
    if (motherSpawnTimer >= motherSpawnDelay) spawnMothership()
  }
  if (mothership && mothership.alive) {
    // FIX: mothership speed also scaled by dtScale
    mothership.x += mothership.vx * dtScale
    if (mothership.x < -MOTHER_W || mothership.x > W + MOTHER_W) mothership = null
  }

  // --- Player bullets ---
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]
    // move by px/s × seconds elapsed this frame
    b.y += b.vy * (dt / 1000)

    if (b.y < 0) { bullets.splice(i, 1); continue }

    if (barricadeHit(b.x, b.y, false)) { bullets.splice(i, 1); continue }

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
    b.y += b.vy * (dt / 1000)

    if (b.y > H) { alienBullets.splice(i, 1); continue }

    if (barricadeHit(b.x, b.y, true)) { alienBullets.splice(i, 1); continue }

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

  // --- Swarm step (timer-based, unaffected by framerate) ---
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
      // FIX: descentStep is now derived from MAX_DESCENTS / swarm travel range
      // so descent distance is proportional on all screen sizes
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

  // --- Wave cleared ---
  if (aliens.every(a => !a.alive)) {
    nextWave()
    updateHUD()
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────
const GROUND_Y = H - Math.floor(H * 0.04)

function draw() {
  ctx.fillStyle = "#0a0a0f"
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = "#00ff88"
  ctx.fillRect(0, GROUND_Y, W, 1)

  drawBarricades()
  drawMothership()

  for (const a of aliens) {
    if (!a.alive) continue
    drawAlienPixels(a.x, a.y, a.type, a.frame, a.color)
  }

  drawPlayerPixels(player.x, player.y)

  ctx.fillStyle = "#ffffff"
  for (const b of bullets) {
    ctx.fillRect(b.x - 1, b.y - 6, 2, 12)
  }

  ctx.fillStyle = "#ff4444"
  for (const b of alienBullets) {
    ctx.fillRect(b.x - 1, b.y - 4, 2, 8)
    ctx.fillRect(b.x - 2, b.y,     2, 3)
  }

  for (const ex of explosions) {
    const alpha = ex.ttl / 25
    ctx.fillStyle = `rgba(255, 200, 0, ${alpha})`
    const r = (1 - alpha) * ALIEN_W
    ctx.beginPath()
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

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