const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

// --- Canvas sizing ---
function getTargetSize() {
  const hudHeight = 40
  const margin = 24
  const availableH = window.innerHeight - hudHeight - margin
  const availableW = window.innerWidth - margin
  return Math.min(Math.floor(Math.min(availableW, availableH)), 520)
}

// --- Game state ---
let score, lives, running, paused
let ball, paddle, bricks
let selectedDiff = "easy"
let selectedLayout = "standard"

// --- Difficulty configs ---
const DIFF_CONFIGS = {
  easy:   { ballSpeed: 6, paddleW: 100},
  normal: { ballSpeed: 8, paddleW: 75},
  hard:   { ballSpeed: 10, paddleW: 55},
}

// --- Canvas dimensions ---
const W = getTargetSize()
const H = Math.round(W * 1.1)  // slightly taller than wide

// --- Brick grid constants ---
const BRICK_COLS   = 14
const BRICK_ROWS   = 8
const BRICK_PAD    = 2
const BRICK_TOP    = 48
const BRICK_H      = 18

// --- Brick colours by row (warm demolition palette) ---
const ROW_COLORS = [
  "#ff2a2a",  // row 0: red    (1 pt)
  "#ff6a00",  // row 1: orange (1 pt)
  "#ffc400",  // row 2: amber  (1 pt)
  "#aaff00",  // row 3: lime   (2 pt)
  "#00e5ff",  // row 4: cyan   (2 pt)
  "#5744ff",  // row 5: blue   (2 pt)
  "#9b44ff",  // row 6: purple (3 pt)
  "#ff44f6",  // row 7: violet (3 pt)
]
const ROW_POINTS = [3, 3, 2, 2, 2, 1, 1, 1]

// --- Brick width derived from canvas ---
function brickW() {
  return (W - BRICK_PAD * (BRICK_COLS + 1)) / BRICK_COLS
}

// --- Layout generators ---
function buildBricks(layout) {
  const bw = brickW()
  const grid = []
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      let active = true
      if (layout === "checkerboard") {
        active = (r + c) % 2 === 0
      } else if (layout === "diamond") {
        const cx = (BRICK_COLS - 1) / 2
        const cy = (BRICK_ROWS - 1) / 2
        const dist = Math.abs(c - cx) / (BRICK_COLS / 2) + Math.abs(r - cy) / (BRICK_ROWS / 2)
        active = dist <= 1.05
      }
      grid.push({
        x: BRICK_PAD + c * (bw + BRICK_PAD),
        y: BRICK_TOP + r * (BRICK_H + BRICK_PAD),
        w: bw,
        h: BRICK_H,
        color: ROW_COLORS[r],
        points: ROW_POINTS[r],
        active,
      })
    }
  }
  return grid
}

// --- Init ---
function initGame(diff, layout) {
  selectedDiff = diff
  selectedLayout = layout
  const cfg = DIFF_CONFIGS[diff]

  canvas.width  = W
  canvas.height = H

  score = 0
  lives = 3
  running = true
  paused  = false
  document.getElementById("pause-btn").textContent = "PAUSE"

  // Paddle
  paddle = {
    w: cfg.paddleW,
    h: 10,
    x: W / 2 - cfg.paddleW / 2,
    y: H - 36,
    speed: 0,
  }

  // Ball — start above paddle, angled upward
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 4)
  ball = {
    x: W / 2,
    y: paddle.y - 12,
    r: 6,
    vx: Math.cos(angle) * cfg.ballSpeed,
    vy: Math.sin(angle) * cfg.ballSpeed,
    speed: cfg.ballSpeed,
    stuck: true,  // wait for first launch input
  }

  bricks = buildBricks(layout)

  updateHUD()
  document.getElementById("hud").style.width = W + "px"
}

// --- HUD ---
function updateHUD() {
  document.getElementById("score-display").textContent =
    `SCORE: ${score} | LIVES: ${lives}`
}

// --- Volume (identical to Big Worm) ---
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

// --- Paddle: mouse ---
canvas.addEventListener("mousemove", (e) => {
  if (!running || paused) return
  const rect = canvas.getBoundingClientRect()
  const mx   = (e.clientX - rect.left) * (canvas.width / rect.width)
  paddle.x   = Math.max(0, Math.min(W - paddle.w, mx - paddle.w / 2))
  if (ball.stuck) ball.x = paddle.x + paddle.w / 2
})

// --- Paddle: touch ---
canvas.addEventListener("touchmove", (e) => {
  e.preventDefault()
  if (!running || paused) return
  const rect = canvas.getBoundingClientRect()
  const tx   = (e.touches[0].clientX - rect.left) * (canvas.width / rect.width)
  paddle.x   = Math.max(0, Math.min(W - paddle.w, tx - paddle.w / 2))
  if (ball.stuck) ball.x = paddle.x + paddle.w / 2
}, { passive: false })

// --- Launch ball on click / tap / space ---
function launchBall() {
  if (!ball.stuck) return
  ball.stuck = false
  // direction already set in init; just un-stick
}

canvas.addEventListener("click", (e) => {
  if (!running) {
    // click game-over options
    const rect  = canvas.getBoundingClientRect()
    const tapY  = (e.clientY - rect.top) * (canvas.height / rect.height)
    const menuY  = H / 2 + 56
    const resetY = H / 2 + 78
    if (tapY >= menuY  - 16 && tapY <= menuY  + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedLayout); return }
    return
  }
  if (paused) {
    const rect  = canvas.getBoundingClientRect()
    const tapY  = (e.clientY - rect.top) * (canvas.height / rect.height)
    const hubY   = H / 2 + 5
    const resetY = H / 2 + 30
    if (tapY >= hubY   - 16 && tapY <= hubY   + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedDiff, selectedLayout); return }
    return
  }
  launchBall()
})

// --- Keyboard ---
const keys = {}
document.addEventListener("keydown", (e) => {
  keys[e.key] = true

  if (e.key === "Escape" && running)  { togglePause(); return }
  if (e.key === " ") {
    e.preventDefault()
    if (running && !paused) launchBall()
    else if (running) togglePause()
    return
  }
  if (e.key === "Escape" && !running) { returnToMenu(); return }
  if (e.key === "r" || e.key === "R") {
    stopMusic(); playMusic()
    initGame(selectedDiff, selectedLayout)
    return
  }
  if (e.key === "q" || e.key === "Q") { stopMusic(); returnToMenu(); return }
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault()
})
document.addEventListener("keyup", (e) => { keys[e.key] = false })

// --- Pause ---
function togglePause() {
  if (!running) return
  paused = !paused
  document.getElementById("pause-btn").textContent = paused ? "RESUME" : "PAUSE"
  if (paused) drawPauseOverlay()
  else draw()
}

// --- Quit / menu ---
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

// --- Game loop ---
let lastTime = 0
function loop(ts) {
  requestAnimationFrame(loop)
  if (!running || paused) return
  const dt = Math.min(ts - lastTime, 50) / (1000 / 60)  // frame-rate normalised
  lastTime = ts
  update(dt)
  draw()
}
requestAnimationFrame(loop)

// --- Update ---
function update(dt) {
  // Keyboard paddle movement
  const PADDLE_SPEED = 6
  if (keys["ArrowLeft"]  || keys["a"]) paddle.x = Math.max(0, paddle.x - PADDLE_SPEED * dt)
  if (keys["ArrowRight"] || keys["d"]) paddle.x = Math.min(W - paddle.w, paddle.x + PADDLE_SPEED * dt)
  if (ball.stuck) {
    ball.x = paddle.x + paddle.w / 2
    return
  }

  // Move ball
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt

  // Wall bounces
  if (ball.x - ball.r < 0) {
    ball.x = ball.r
    ball.vx = Math.abs(ball.vx)
  }
  if (ball.x + ball.r > W) {
    ball.x = W - ball.r
    ball.vx = -Math.abs(ball.vx)
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r
    ball.vy = Math.abs(ball.vy)
  }

  // Ball lost
  if (ball.y - ball.r > H) {
    lives--
    updateHUD()
    if (lives <= 0) {
      endGame(false)
      return
    }
    // Reset ball to paddle
    ball.stuck = true
    ball.x = paddle.x + paddle.w / 2
    ball.y = paddle.y - ball.r - 2
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 4)
    ball.vx = Math.cos(angle) * ball.speed
    ball.vy = Math.sin(angle) * ball.speed
    return
  }

  // Paddle collision
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= paddle.y &&
    ball.y + ball.r <= paddle.y + paddle.h &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.w
  ) {
    ball.vy = -Math.abs(ball.vy)
    // Angle based on hit position within paddle
    const hitPos  = (ball.x - paddle.x) / paddle.w   // 0..1
    const deflect = (hitPos - 0.5) * 2               // -1..1
    ball.vx = deflect * ball.speed * 1.1
    // Maintain constant speed
    const spd = Math.hypot(ball.vx, ball.vy)
    ball.vx = (ball.vx / spd) * ball.speed
    ball.vy = (ball.vy / spd) * ball.speed
    ball.y  = paddle.y - ball.r
  }

  // Brick collisions
  let activeBricks = 0
  for (const brick of bricks) {
    if (!brick.active) continue
    activeBricks++

    const bLeft   = brick.x
    const bRight  = brick.x + brick.w
    const bTop    = brick.y
    const bBottom = brick.y + brick.h

    if (
      ball.x + ball.r > bLeft   &&
      ball.x - ball.r < bRight  &&
      ball.y + ball.r > bTop    &&
      ball.y - ball.r < bBottom
    ) {
      brick.active = false

      var scoreMod = 0
      if (ball.speed == 6) {
        scoreMod = 1
      } else if (ball.speed == 8) {
        scoreMod = 2
      } else {
        scoreMod = 3
      }

      score += brick.points*scoreMod
      updateHUD()

      // Determine which face was hit for correct bounce
      const overlapL = ball.x + ball.r - bLeft
      const overlapR = bRight  - (ball.x - ball.r)
      const overlapT = ball.y  + ball.r - bTop
      const overlapB = bBottom - (ball.y - ball.r)
      const minH = Math.min(overlapL, overlapR)
      const minV = Math.min(overlapT, overlapB)

      if (minH < minV) {
        ball.vx = -ball.vx
      } else {
        ball.vy = -ball.vy
      }
      break  // one brick per frame avoids tunnelling artifacts
    }
  }

  if (activeBricks === 0) endGame(true)
}

// --- Draw ---
function draw() {
  ctx.fillStyle = "#0a0a0f"
  ctx.fillRect(0, 0, W, H)

  // Bricks
  for (const brick of bricks) {
    if (!brick.active) continue
    ctx.fillStyle = brick.color
    ctx.fillRect(brick.x, brick.y, brick.w, brick.h)
  }

  // Paddle
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h)

  // Ball
  ctx.beginPath()
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2)
  ctx.fillStyle = "#ff6a00"
  ctx.fill()

  // "tap / space to launch" prompt
  if (ball.stuck && running) {
    ctx.fillStyle = "#888888"
    ctx.font = "11px monospace"
    ctx.textAlign = "center"
    ctx.fillText("CLICK / SPACE TO LAUNCH", W / 2, H - 10)
  }
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px monospace"
  ctx.textAlign = "center"
  ctx.fillText("PAUSED", W / 2, H / 2 - 20)
  ctx.font = "13px monospace"
  ctx.fillStyle = "#aaaaaa"
  ctx.fillText("Press ESC/SPACE/PAUSE to resume", W / 2, H / 2 + 10)
  ctx.fillText("Press R to restart", W / 2, H / 2 + 35)
}

function endGame(won) {
  running = false
  stopMusic()
  document.getElementById("pause-btn").textContent = "PAUSE"
  setTimeout(() => {
    ctx.fillStyle = "rgba(0,0,0,0.7)"
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = won ? "#ff6a00" : "#ffffff"
    ctx.font = "bold 20px monospace"
    ctx.textAlign = "center"
    ctx.fillText(won ? "DEMOLITION COMPLETE!" : "GAME OVER", W / 2, H / 2)
    ctx.fillText(`Score: ${score}`, W / 2, H / 2 + 30)
    ctx.font = "13px monospace"
    ctx.fillStyle = "#aaaaaa"
    ctx.fillText("ESC: Back to Main Menu", W / 2, H / 2 + 56)
    ctx.fillText("R: Restart", W / 2, H / 2 + 76)
  }, 50)
}

// --- Menu wiring ---
document.querySelectorAll(".opt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.group
    if (!group) return
    document.querySelectorAll(`.opt-btn[data-group="${group}"]`)
            .forEach(b => b.classList.remove("selected"))
    btn.classList.add("selected")
    if (group === "diff")   selectedDiff   = btn.dataset.value
    if (group === "layout") selectedLayout = btn.dataset.value
  })
})

document.getElementById("start-btn").addEventListener("click", () => {
  document.getElementById("menu").style.display = "none"
  document.getElementById("hud").style.display  = "flex"
  document.getElementById("game").style.display = "block"
  playMusic()
  initGame(selectedDiff, selectedLayout)
})

// Load music
loadMidi("Demolishing_Time.mid")