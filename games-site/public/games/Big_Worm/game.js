const canvas = document.getElementById("game")
const ctx = canvas.getContext("2d")

function getTargetSize() {
  const hudHeight = 40
  const margin = 24
  const availableH = window.innerHeight - hudHeight - margin
  const availableW = window.innerWidth  - margin
  return Math.min(Math.floor(Math.min(availableW, availableH)), 520)
}

let COLS, ROWS, TICK, GRID
let snake, direction, nextDirection, food, score, running, paused
let difficulty = "random"

const SIZE_CONFIGS = {
  "5":  { cols: 5,  rows: 5,  tick: 200 },
  "10": { cols: 10, rows: 10, tick: 175 },
  "20": { cols: 20, rows: 20, tick: 150 },
  "60": { cols: 60, rows: 60, tick: 100 },
}

// --- Spiral generators ---

function* centralSpiral(cols, rows) {
  const ox = Math.floor((cols + 1) / 2)
  const oy = Math.floor((rows + 1) / 2)
  yield { x: ox, y: oy }
  let ring = 1
  while (ring < Math.max(cols, rows)) {
    let x = ox, y = oy - ring
    yield { x, y }
    for (let i = 0; i < ring; i++)     { x++; yield { x, y } }
    for (let i = 0; i < ring * 2; i++) { y++; yield { x, y } }
    for (let i = 0; i < ring * 2; i++) { x--; yield { x, y } }
    for (let i = 0; i < ring * 2; i++) { y--; yield { x, y } }
    ring++
  }
}

function* edgeSpiral(cols, rows) {
  const perimeterPoints = (ring) => {
    const x0 = ring, y0 = ring
    const x1 = cols - 1 - ring, y1 = rows - 1 - ring
    if (x1 <= x0 || y1 <= y0) return []
    const pts = []
    for (let x = x1; x >= x0; x--) pts.push({ x, y: y0 })
    for (let y = y0 + 1; y <= y1; y++) pts.push({ x: x0, y })
    for (let x = x0 + 1; x <= x1; x++) pts.push({ x, y: y1 })
    for (let y = y1 - 1; y >= y0 + 1; y--) pts.push({ x: x1, y })
    return pts
  }
  let ring = 0
  while (true) {
    const pts = perimeterPoints(ring)
    if (pts.length === 0) break
    const start = Math.floor(Math.random() * pts.length)
    for (let i = 0; i < pts.length; i++) yield pts[(start + i) % pts.length]
    ring++
  }
}

// --- Food placement ---

function placeFood() {
  const totalCells = COLS * ROWS
  if (score >= totalCells - 1) return null
  const snakeSet = new Set(snake.map(s => `${s.x},${s.y}`))
  if (difficulty === "random") {
    let pos
    do {
      pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
    } while (snakeSet.has(`${pos.x},${pos.y}`))
    return pos
  }
  const totalLocations = totalCells - snake.length
  let startProb
  if (difficulty === "central") {
    startProb = 0.10 + Math.max(0, 18 - totalLocations) * 0.05
  } else {
    startProb = 0.30 + Math.max(0, 14 - totalLocations) * 0.05
  }
  startProb = Math.min(startProb, 1)
  const gen = difficulty === "central"
    ? centralSpiral(COLS, ROWS)
    : edgeSpiral(COLS, ROWS)
  let prob = startProb
  while (true) {
    const { value, done } = gen.next()
    if (done) break
    const { x, y } = value
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue
    if (snakeSet.has(`${x},${y}`)) continue
    if (Math.random() < prob) return { x, y }
    prob = Math.min(prob + 0.05, 1)
  }
}

// --- Touch input ---
canvas.addEventListener("click", (e) => {
  if (!running || paused) return
  const rect = canvas.getBoundingClientRect()
  const tapX = (e.clientX - rect.left) * (canvas.width  / rect.width)
  const tapY = (e.clientY - rect.top)  * (canvas.height / rect.height)
  const headPixelX = (snake[0].x + 0.5) * GRID
  const headPixelY = (snake[0].y + 0.5) * GRID
  const dx = tapX - headPixelX
  const dy = tapY - headPixelY
  if (Math.abs(dx) > Math.abs(dy)) {
    // horizontal dominant
    if (dx > 0 && direction.x === 0) nextDirection = { x: 1,  y: 0 }
    if (dx < 0 && direction.x === 0) nextDirection = { x: -1, y: 0 }
  } else {
    // vertical dominant
    if (dy > 0 && direction.y === 0) nextDirection = { x: 0, y: 1  }
    if (dy < 0 && direction.y === 0) nextDirection = { x: 0, y: -1 }
  }
})

// --- Direction ---

function startDirection(x, y) {
  const distances = [
    { dir: { x: 0, y: -1 }, dist: y },
    { dir: { x: 1, y: 0 },  dist: COLS - 1 - x },
    { dir: { x: 0, y: 1 },  dist: ROWS - 1 - y },
    { dir: { x: -1, y: 0 }, dist: x },
  ]
  const max = Math.max(...distances.map(d => d.dist))
  return distances.find(d => d.dist === max).dir
}

// --- Init ---

function initGame(size, diff) {
  const cfg = SIZE_CONFIGS[size]
  COLS = cfg.cols
  ROWS = cfg.rows
  TICK = cfg.tick
  difficulty = diff
  GRID = Math.floor(getTargetSize() / COLS)
  canvas.width  = COLS * GRID
  canvas.height = ROWS * GRID

  const startX = Math.floor(COLS / 2)
  const startY = Math.floor(ROWS / 2)
  snake = [{ x: startX, y: startY }]
  direction = startDirection(startX, startY)
  nextDirection = null
  score = 0
  running = true
  paused = false
  updateHUD()
  food = placeFood()
  document.getElementById("hud").style.width = canvas.width + "px"
}

// --- HUD ---

function updateHUD() {
  document.getElementById("score-display").textContent = `SCORE: ${score}`
}

// --- Volume ---

const volTrack = document.getElementById("vol-track")
const volFill  = document.getElementById("vol-fill")
const volThumb = document.getElementById("vol-thumb")

setVolume(currentVolume)

function setVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v))
  const pct = (currentVolume * 100).toFixed(1) + "%"
  volFill.style.width  = pct
  volThumb.style.left  = pct
  setMusicVolume(currentVolume * 0.3)  // function exposed by midi-player.js
}

let dragging = false

volTrack.addEventListener("mousedown", (e) => {
  dragging = true
  updateFromEvent(e)
})

document.addEventListener("mousemove", (e) => {
  if (!dragging) return
  updateFromEvent(e)
})

document.addEventListener("mouseup", () => dragging = false)

function updateFromEvent(e) {
  const rect = volTrack.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  setVolume(ratio)
}

// --- Quit ---
function returnToMenu() {
  document.getElementById("menu").style.display = "";
  canvas.style.display = "none";
  document.getElementById("hud").style.display = "none";
}

// --- Input ---

// --- Input --- (replace existing keydown listener)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && running) { togglePause(); return }
  if (e.key === " ") { togglePause(); return }
  if (e.key === "Escape" && !running) { returnToMenu(); return }
  if (e.key === "r" || e.key === "R") {
    stopMusic()
    playMusic()
    initGame(selectedSize, selectedDiff)
    return
  }
  if (e.key === "q" || e.key === "Q") { stopMusic(); returnToMenu(); return }
  if (!running) return
  if ((e.key === "ArrowUp"    || e.key === "w") && direction.y === 0) nextDirection = { x: 0, y: -1 }
  if ((e.key === "ArrowDown"  || e.key === "s") && direction.y === 0) nextDirection = { x: 0, y: 1 }
  if ((e.key === "ArrowLeft"  || e.key === "a") && direction.x === 0) nextDirection = { x: -1, y: 0 }
  if ((e.key === "ArrowRight" || e.key === "d") && direction.x === 0) nextDirection = { x: 1, y: 0 }
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault()
})

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect()
  const tapX = (e.clientX - rect.left) * (canvas.width  / rect.width)
  const tapY = (e.clientY - rect.top)  * (canvas.height / rect.height)

  if (!running) {
    const menuY  = canvas.height / 2 + 56  // "press (ESC) to menu" text
    const resetY = canvas.height / 2 + 78  // reset text below it
    if (tapY >= menuY  - 16 && tapY <= menuY  + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedSize, selectedDiff); return }
    return
  }

  if (paused) {
    const hubY   = canvas.height / 2 + 5  // back to hub in pause overlay
    const resetY = canvas.height / 2 + 30  // reset in pause overlay
    if (tapY >= hubY   - 16 && tapY <= hubY   + 8) { returnToMenu(); return }
    if (tapY >= resetY - 16 && tapY <= resetY + 8) { stopMusic(); playMusic(); initGame(selectedSize, selectedDiff); return }
    return
  }

  // touch direction input
  const headPixelX = (snake[0].x + 0.5) * GRID
  const headPixelY = (snake[0].y + 0.5) * GRID
  const dx = tapX - headPixelX
  const dy = tapY - headPixelY
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0 && direction.x === 0) nextDirection = { x: 1,  y: 0 }
    if (dx < 0 && direction.x === 0) nextDirection = { x: -1, y: 0 }
  } else {
    if (dy > 0 && direction.y === 0) nextDirection = { x: 0, y: 1  }
    if (dy < 0 && direction.y === 0) nextDirection = { x: 0, y: -1 }
  }
})

document.getElementById("pause-btn").addEventListener("click", togglePause)
document.getElementById("reset-btn").addEventListener("click", () => {
  stopMusic()
  returnToMenu()
})

// --- Pause ---

function togglePause() {
  if (!running) return
  paused = !paused
  document.getElementById("pause-btn").textContent = paused ? "RESUME" : "PAUSE"
  if (paused) drawPauseOverlay()
  else { draw() }
}

// --- Game loop ---

let lastTick = 0
function loop(ts) {
  requestAnimationFrame(loop)
  if (!running || paused) return
  if (ts - lastTick < TICK) return
  lastTick = ts
  update()
  draw()
}
requestAnimationFrame(loop)

// --- Update ---

function update() {
  if (nextDirection) {
    direction = nextDirection
    nextDirection = null
  }
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  }
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return endGame(false)
  if (snake.some(s => s.x === head.x && s.y === head.y)) return endGame(false)
  snake.unshift(head)
  if (head.x === food.x && head.y === food.y) {
    score++
    updateHUD()
    if (score >= COLS * ROWS - 1) return endGame(true)
    food = placeFood()
  } else {
    snake.pop()
  }
}

// --- Draw ---

function draw() {
  ctx.fillStyle = "#0a0a0f"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  snake.forEach(({ x, y }, i) => {
    ctx.fillStyle = i === 0 ? "#00ffff" : "#0089a1"
    ctx.fillRect(x * GRID, y * GRID, GRID - 2, GRID - 2)
  })
  ctx.fillStyle = "#ff006a"
  ctx.fillRect(food.x * GRID, food.y * GRID, GRID - 2, GRID - 2)
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.7)"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px monospace"
  ctx.textAlign = "center"
  ctx.fillText("PAUSED", canvas.width / 2, canvas.height / 2 - 20)
  ctx.font = "13px monospace"
  ctx.fillStyle = "#aaaaaa"
  ctx.fillText("Press ESC/SPACE/PAUSE to resume", canvas.width / 2, canvas.height / 2 + 10)
  ctx.fillText("Press R to restart", canvas.width / 2, canvas.height / 2 + 35)
}

function endGame(won) {
  running = false
  stopMusic()
  document.getElementById("pause-btn").textContent = "PAUSE"
  setTimeout(() => {
    ctx.fillStyle = "rgba(0,0,0,0.7)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = won ? "#00ffff" : "#ffffff"
    ctx.font = "bold 20px monospace"
    ctx.textAlign = "center"
    ctx.fillText(won ? "YOU WIN!" : "GAME OVER", canvas.width / 2, canvas.height / 2)
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 30)
    ctx.font = "13px monospace"
    ctx.fillStyle = "#aaaaaa"
    ctx.fillText("ESC: Back to Main Menu", canvas.width / 2, canvas.height / 2 + 56)
    ctx.fillText("R: Restart", canvas.width / 2, canvas.height / 2 + 76)
  }, 50)
}

// --- Menu wiring ---

let selectedSize = "20"
let selectedDiff = "random"

document.querySelectorAll(".opt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const group = btn.dataset.group
    document.querySelectorAll(`.opt-btn[data-group="${group}"]`)
            .forEach(b => b.classList.remove("selected"))
    btn.classList.add("selected")
    if (group === "size") selectedSize = btn.dataset.value
    if (group === "diff") selectedDiff = btn.dataset.value
  })
})

document.getElementById("start-btn").addEventListener("click", () => {
  document.getElementById("menu").style.display = "none"
  document.getElementById("hud").style.display = "flex"
  document.getElementById("game").style.display = "block"
  playMusic()
  initGame(selectedSize, selectedDiff)
})

// load music
loadMidi("Here_Comes_The_Big_Worm.mid")