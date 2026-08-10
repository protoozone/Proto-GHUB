// ─────────────────────────────────────────────
//  CONNECT N  —  game.js
// ─────────────────────────────────────────────

const CELL = 48
const ANIM_MS = 220

// ─── PIXEL FONT ──────────────────────────────

function drawLetter(grid, ch) {
  const glyphs = {
    A:['01110','10001','10001','11111','10001','10001','10001'],
    B:['11110','10001','10001','11110','10001','10001','11110'],
    C:['01110','10001','10000','10000','10000','10001','01110'],
    D:['11100','10010','10001','10001','10001','10010','11100'],
    E:['11111','10000','10000','11110','10000','10000','11111'],
    F:['11111','10000','10000','11110','10000','10000','10000'],
    G:['01110','10001','10000','10111','10001','10001','01111'],
    H:['10001','10001','10001','11111','10001','10001','10001'],
    I:['11111','00100','00100','00100','00100','00100','11111'],
    J:['11111','00010','00010','00010','00010','10010','01100'],
    K:['10001','10010','10100','11000','10100','10010','10001'],
    L:['10000','10000','10000','10000','10000','10000','11111'],
    M:['10001','11011','10101','10001','10001','10001','10001'],
    N:['10001','11001','10101','10011','10001','10001','10001'],
    O:['01110','10001','10001','10001','10001','10001','01110'],
    P:['11110','10001','10001','11110','10000','10000','10000'],
    Q:['01110','10001','10001','10001','10101','10010','01101'],
    R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'],
    T:['11111','00100','00100','00100','00100','00100','00100'],
    U:['10001','10001','10001','10001','10001','10001','01110'],
    V:['10001','10001','10001','10001','01010','01010','00100'],
    W:['10001','10001','10001','10001','10101','11011','10001'],
    X:['10001','10001','01010','00100','01010','10001','10001'],
    Y:['10001','10001','01010','00100','00100','00100','00100'],
    Z:['11111','00001','00010','00100','01000','10000','11111'],
  }
  const rows = glyphs[ch] || glyphs['A']
  const rowOffset = 1
  rows.forEach((row, ri) => {
    const gr = Math.floor((ri / 7) * 8) + rowOffset
    if (gr > 9) return
    row.split('').forEach((px, ci) => {
      if (px === '1') {
        const gc = ci * 2
        if (gc < 10) grid[gr * 10 + gc] = 1
        if (gc + 1 < 10) grid[gr * 10 + gc + 1] = 1
      }
    })
  })
}

function makeDefaultMarks() {
  const marks = []

  // X
  const x = Array(100).fill(0)
  ;[0,11,22,33,44,55,66,77,88,99,9,18,27,36,45,54,63,72,81,90].forEach(i => x[i] = 1)
  marks.push(x)

  // O
  const o = Array(100).fill(0)
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const dr = r - 4.5, dc = c - 4.5
      const dist = Math.sqrt(dr*dr + dc*dc)
      if (dist >= 3.2 && dist <= 4.8) o[r*10+c] = 1
    }
  marks.push(o)

  // A–Z
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(ch => {
    const m = Array(100).fill(0)
    drawLetter(m, ch)
    marks.push(m)
  })

  return marks
}

const DEFAULT_MARKS = makeDefaultMarks()

// ─── STATE ───────────────────────────────────

const state = {
  type: '5',
  players: 2,
  difficulty: 'normal',
  goFirst: 1,       // 1 = human goes first, 2 = AI goes first
  nInARow: 5,
  gridW: 15,
  gridH: 15,
  missingTiles: new Set(),
  playerMarks: [],
  playerCount: 2,
}

// In 1-player mode: humanPlayerIndex is 0 if goFirst=1, 1 if goFirst=2
// aiPlayerIndex is the other one
let humanPlayerIndex = 0
let isOnePlayer = false

let board = []
let currentPlayer = 0
let gameActive = false
let hoverCell = null
let animatingCell = null
let animFrame = null
let winCells = []
let timerInterval = null
let turnSeconds = 0

// ─── DOM REFS ────────────────────────────────

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const toggleBtn = document.getElementById('toggleMode')
const startBtn = document.getElementById('start-btn')
const quitBtn = document.getElementById('quit-btn')
const resetBtn = document.getElementById('reset-btn')
const hud = document.getElementById('hud')
const gameArea = document.getElementById('game-area')
const menu = document.getElementById('menu')
const playerLabel = document.getElementById('player-label')
const playerSymbolPreview = document.getElementById('player-symbol-preview')
const turnTimerEl = document.getElementById('turn-timer')
const winOverlay = document.getElementById('win-overlay')
const winMessage = document.getElementById('win-message')
const winSub = document.getElementById('win-sub')
const winCanvas = document.getElementById('win-canvas')
const winResetBtn = document.getElementById('win-reset-btn')
const winMenuBtn = document.getElementById('win-menu-btn')

// ─── THEME TOGGLE ────────────────────────────

toggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('light')
  toggleBtn.textContent = document.body.classList.contains('light') ? 'DARK' : 'LIGHT'
  if (gameActive) drawBoard()
})

// ─── MENU HANDLERS ───────────────────────────

document.querySelectorAll('[data-group="type"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.type = btn.dataset.value
    document.querySelectorAll('[data-group="type"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')

    state.players = 2
    document.querySelectorAll('[data-group="players"]').forEach(b => b.classList.remove('selected'))
    const p2btn = document.querySelector('[data-group="players"][data-value="2"]')
    if (p2btn) p2btn.classList.add('selected')
    document.getElementById('input-n-players').value = 2

    if (state.type === '3') { state.nInARow = 3; state.gridW = 3; state.gridH = 3 }
    if (state.type === '5') { state.nInARow = 5; state.gridW = 15; state.gridH = 15 }
    if (state.type === 'custom') {
      state.nInARow = 5; state.gridW = 15; state.gridH = 15
      document.getElementById('input-n-in-a-row').value = 5
      document.getElementById('input-grid-w').value = 15
      document.getElementById('input-grid-h').value = 15
    }

    updateMenuVisibility()
    rebuildMarksPreviews()
  })
})

document.querySelectorAll('[data-group="players"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.players = parseInt(btn.dataset.value)
    document.querySelectorAll('[data-group="players"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    updateMenuVisibility()
    rebuildMarksPreviews()
  })
})

document.getElementById('input-n-players').addEventListener('input', e => {
  state.players = Math.max(2, parseInt(e.target.value) || 2)
  updateMenuVisibility()
  rebuildMarksPreviews()
})

document.querySelectorAll('[data-group="diff"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.difficulty = btn.dataset.value
    document.querySelectorAll('[data-group="diff"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })
})

document.querySelectorAll('[data-group="gofirst"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.goFirst = parseInt(btn.dataset.value)
    document.querySelectorAll('[data-group="gofirst"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })
})

document.getElementById('input-n-in-a-row').addEventListener('input', e => {
  state.nInARow = parseInt(e.target.value) || 5
  validateCustom()
})

document.getElementById('input-grid-w').addEventListener('input', e => {
  state.gridW = parseInt(e.target.value) || 15
  validateCustom()
})

document.getElementById('input-grid-h').addEventListener('input', e => {
  state.gridH = parseInt(e.target.value) || 15
  validateCustom()
})

function validateCustom() {
  if (state.nInARow > Math.max(state.gridW, state.gridH)) {
    alert(`N in a row (${state.nInARow}) exceeds the largest grid dimension. Win may be impossible.`)
  }
}

// ─── INIT MENU ───────────────────────────────

function initMenu() {
  document.querySelector('[data-group="type"][data-value="5"]').classList.add('selected')
  document.querySelector('[data-group="players"][data-value="2"]').classList.add('selected')
  document.querySelector('[data-group="diff"][data-value="normal"]').classList.add('selected')
  document.querySelector('[data-group="gofirst"][data-value="1"]').classList.add('selected')
  state.difficulty = 'normal'
  state.goFirst = 1
  document.getElementById('input-n-in-a-row').value = state.nInARow
  document.getElementById('input-grid-w').value = state.gridW
  document.getElementById('input-grid-h').value = state.gridH
  updateMenuVisibility()
  rebuildMarksPreviews()
}

function updateMenuVisibility() {
  const isCustom = state.type === 'custom'
  const onePlayer = state.players === 1

  document.getElementById('section-players').classList.toggle('visible', !isCustom)
  document.getElementById('section-custom').classList.toggle('visible', isCustom)
  document.getElementById('section-difficulty').classList.toggle('visible', onePlayer)
  document.getElementById('section-go-first').classList.toggle('visible', onePlayer)
}

// ─── PLAYER MARKS ────────────────────────────

let editingPlayerIndex = null
let pixelGridState = Array(100).fill(0)
let mouseDownOnGrid = false

function getPlayerCount() {
  if (state.type === 'custom') return Math.max(2, parseInt(document.getElementById('input-n-players').value) || 2)
  return state.players
}

function ensureMarks(count) {
  while (state.playerMarks.length < count) {
    const idx = state.playerMarks.length
    state.playerMarks.push([...(DEFAULT_MARKS[idx] || DEFAULT_MARKS[0])])
  }
}

function getPlayerColor(idx) {
  const hues = [0, 210, 120, 45, 280, 180, 320, 60, 150, 240]
  const h = hues[idx % hues.length]
  const isLight = document.body.classList.contains('light')
  return `hsl(${h}, 80%, ${isLight ? 35 : 65}%)`
}

function renderMarkToCanvas(cv, mark, color) {
  const c2 = cv.getContext('2d')
  const s = cv.width / 10
  c2.clearRect(0, 0, cv.width, cv.height)
  c2.fillStyle = color
  for (let i = 0; i < 100; i++) {
    if (mark[i]) c2.fillRect((i % 10) * s, Math.floor(i / 10) * s, s, s)
  }
}

function rebuildMarksPreviews() {
  const count = getPlayerCount()
  ensureMarks(count)

  const section = document.getElementById('section-player-marks')
  const list = document.getElementById('marks-list')
  list.innerHTML = ''
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:center;'

  for (let i = 0; i < count; i++) {
    const row = document.createElement('div')
    row.className = 'player-mark-row'

    const label = document.createElement('span')
    label.textContent = `P${i + 1}`
    row.appendChild(label)

    const cv = document.createElement('canvas')
    cv.width = 30; cv.height = 30
    cv.className = 'mark-preview'
    cv.title = `Edit Player ${i + 1} mark`
    renderMarkToCanvas(cv, state.playerMarks[i], getPlayerColor(i))
    const idx = i
    cv.addEventListener('click', () => openSymbolEditor(idx))
    row.appendChild(cv)

    list.appendChild(row)
  }

  section.classList.add('visible')
}

// ─── SYMBOL EDITOR ───────────────────────────

const editorOverlay = document.getElementById('symbol-editor-overlay')
const pixelGridEl = document.getElementById('pixel-grid')

function openSymbolEditor(playerIdx) {
  editingPlayerIndex = playerIdx
  pixelGridState = [...state.playerMarks[playerIdx]]
  buildPixelGrid()
  editorOverlay.classList.add('visible')
}

function buildPixelGrid() {
  pixelGridEl.innerHTML = ''
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div')
    cell.className = 'pixel-cell' + (pixelGridState[i] ? ' on' : '')
    cell.addEventListener('mousedown', e => {
      mouseDownOnGrid = true
      togglePixel(i)
      e.preventDefault()
    })
    cell.addEventListener('mouseover', () => {
      if (mouseDownOnGrid) togglePixel(i)
    })
    pixelGridEl.appendChild(cell)
  }
}

document.addEventListener('mouseup', () => { mouseDownOnGrid = false })

function togglePixel(i) {
  pixelGridState[i] = pixelGridState[i] ? 0 : 1
  pixelGridEl.children[i].classList.toggle('on', !!pixelGridState[i])
}

document.getElementById('editor-clear').addEventListener('click', () => {
  pixelGridState = Array(100).fill(0)
  buildPixelGrid()
})

document.getElementById('editor-save').addEventListener('click', () => {
  state.playerMarks[editingPlayerIndex] = [...pixelGridState]
  editorOverlay.classList.remove('visible')
  rebuildMarksPreviews()
  if (gameActive) drawBoard()
})

// ─── START GAME ──────────────────────────────

startBtn.addEventListener('click', () => {
  // parse missing tiles
  const raw = document.getElementById('input-missing-tiles').value.trim()
  state.missingTiles = new Set()
  if (raw) {
    raw.split('\n').forEach(line => {
      const parts = line.trim().split(',')
      if (parts.length === 2) {
        const x = parseInt(parts[0].trim())
        const y = parseInt(parts[1].trim())
        if (!isNaN(x) && !isNaN(y)) state.missingTiles.add(`${x},${y}`)
      }
    })
  }

  if (state.type === '3') { state.gridW = 3; state.gridH = 3; state.nInARow = 3 }
  if (state.type === '5') { state.gridW = 15; state.gridH = 15; state.nInARow = 5 }

  state.playerCount = getPlayerCount()
  ensureMarks(state.playerCount)

  // 1p mode always needs 2 board players regardless of state.players
  isOnePlayer = (state.players === 1 && state.type !== 'custom')
  if (isOnePlayer) {
    state.playerCount = 2
    ensureMarks(2)
  }
  humanPlayerIndex = state.goFirst === 1 ? 0 : 1

  initBoard()
  currentPlayer = 0
  gameActive = true
  winCells = []
  animatingCell = null

  menu.style.display = 'none'
  hud.classList.add('visible')
  gameArea.classList.add('visible')

  canvas.width = state.gridW * CELL
  canvas.height = state.gridH * CELL

  updateHUD()
  drawBoard()
  startTimer()

  if (isOnePlayer && currentPlayer !== humanPlayerIndex) {
    setTimeout(doAiMove, 420)
  }
})

// ─── BOARD ───────────────────────────────────

function initBoard() {
  board = []
  for (let r = 0; r < state.gridH; r++) {
    const row = []
    for (let c = 0; c < state.gridW; c++) {
      row.push(state.missingTiles.has(`${c},${r}`) ? -1 : 0)
    }
    board.push(row)
  }
}

// ─── DRAW ────────────────────────────────────

function drawBoard() {
  const isLight = document.body.classList.contains('light')
  const bgColor     = isLight ? '#f5f5f0' : '#0a0a0a'
  const cellBg      = isLight ? '#ffffff' : '#111111'
  const cellHover   = isLight ? '#f0f0ea' : '#1e1e1e'
  const borderColor = isLight ? '#cccccc' : '#2a2a2a'
  const missingColor= isLight ? '#e0e0dc' : '#050505'
  const winColor    = isLight ? '#fffacd' : '#1a1a00'

  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let r = 0; r < state.gridH; r++) {
    for (let c = 0; c < state.gridW; c++) {
      const x = c * CELL
      const y = r * CELL
      const val = board[r][c]

      if (val === -1) {
        ctx.fillStyle = missingColor
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
        continue
      }

      const isHovered = hoverCell && hoverCell.r === r && hoverCell.c === c && val === 0 && gameActive
      const isWin = winCells.some(wc => wc.r === r && wc.c === c)

      ctx.fillStyle = isWin ? winColor : isHovered ? cellHover : cellBg
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)

      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, CELL, CELL)

      if (val > 0) {
        drawMark(ctx, x, y, val - 1, animatingCell && animatingCell.r === r && animatingCell.c === c ? animatingCell.progress : 1)
      }

      if (isHovered) {
        ctx.save()
        ctx.globalAlpha = 0.22
        drawMark(ctx, x, y, currentPlayer, 1)
        ctx.restore()
      }
    }
  }
}

function drawMark(ctx, x, y, playerIdx, scale) {
  const mark = state.playerMarks[playerIdx]
  const color = getPlayerColor(playerIdx)
  const pad = 6
  const size = CELL - pad * 2
  const s = size / 10

  ctx.save()
  ctx.translate(x + CELL / 2, y + CELL / 2)
  ctx.scale(scale, scale)
  ctx.fillStyle = color
  for (let i = 0; i < 100; i++) {
    if (mark[i]) {
      ctx.fillRect(
        -CELL / 2 + pad + (i % 10) * s,
        -CELL / 2 + pad + Math.floor(i / 10) * s,
        s, s
      )
    }
  }
  ctx.restore()
}

// ─── INPUT ───────────────────────────────────

canvas.addEventListener('mousemove', e => {
  if (!gameActive) return
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const c = Math.floor((e.clientX - rect.left) * sx / CELL)
  const r = Math.floor((e.clientY - rect.top) * sy / CELL)
  if (r >= 0 && r < state.gridH && c >= 0 && c < state.gridW) {
    if (!hoverCell || hoverCell.r !== r || hoverCell.c !== c) {
      hoverCell = { r, c }
      drawBoard()
    }
  } else if (hoverCell) {
    hoverCell = null
    drawBoard()
  }
})

canvas.addEventListener('mouseleave', () => {
  hoverCell = null
  if (gameActive) drawBoard()
})

canvas.addEventListener('click', e => {
  if (!gameActive) return
  if (isOnePlayer && currentPlayer !== humanPlayerIndex) return
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const c = Math.floor((e.clientX - rect.left) * sx / CELL)
  const r = Math.floor((e.clientY - rect.top) * sy / CELL)
  if (r < 0 || r >= state.gridH || c < 0 || c >= state.gridW) return
  if (board[r][c] !== 0) return
  placeMove(r, c)
})

canvas.addEventListener('touchend', e => {
  if (!gameActive) return
  e.preventDefault()
  const touch = e.changedTouches[0]
  const rect = canvas.getBoundingClientRect()
  const sx = canvas.width / rect.width
  const sy = canvas.height / rect.height
  const c = Math.floor((touch.clientX - rect.left) * sx / CELL)
  const r = Math.floor((touch.clientY - rect.top) * sy / CELL)
  if (r < 0 || r >= state.gridH || c < 0 || c >= state.gridW) return
  if (board[r][c] !== 0) return
  placeMove(r, c)
}, { passive: false })

// ─── MOVE ────────────────────────────────────

function placeMove(r, c) {
  board[r][c] = currentPlayer + 1
  resetTimer()

  if (animFrame) cancelAnimationFrame(animFrame)
  const startTime = performance.now()
  animatingCell = { r, c, progress: 0 }

  function animate(now) {
    const t = Math.min((now - startTime) / ANIM_MS, 1)
    animatingCell.progress = easeOutBack(t)
    drawBoard()
    if (t < 1) {
      animFrame = requestAnimationFrame(animate)
    } else {
      animatingCell = null
      drawBoard()

      const won = checkWin(r, c, currentPlayer + 1)
      if (won) {
        winCells = won
        gameActive = false
        stopTimer()
        drawBoard()
        setTimeout(() => showWin(currentPlayer), 300)
        return
      }

      if (isBoardFull()) {
        gameActive = false
        stopTimer()
        showDraw()
        return
      }

      currentPlayer = (currentPlayer + 1) % state.playerCount
      updateHUD()
      startTimer()

      // trigger AI if it's the AI's turn
      if (isOnePlayer && currentPlayer !== humanPlayerIndex) {
        setTimeout(doAiMove, 420)
      }
    }
  }

  animFrame = requestAnimationFrame(animate)
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// ─── WIN CHECK ───────────────────────────────

const DIRS = [[0,1],[1,0],[1,1],[1,-1]]

function checkWin(r, c, player) {
  for (const [dr, dc] of DIRS) {
    const line = getLine(r, c, dr, dc, player)
    if (line.length >= state.nInARow) return line.slice(0, state.nInARow)
  }
  return null
}

function getLine(r, c, dr, dc, player) {
  const cells = [{ r, c }]
  for (const sign of [-1, 1]) {
    let nr = r + dr * sign, nc = c + dc * sign
    while (nr >= 0 && nr < state.gridH && nc >= 0 && nc < state.gridW && board[nr][nc] === player) {
      cells.push({ r: nr, c: nc })
      nr += dr * sign
      nc += dc * sign
    }
  }
  return cells
}

function isBoardFull() {
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++)
      if (board[r][c] === 0) return false
  return true
}

// ─── WIN UI ──────────────────────────────────

function showWin(playerIdx) {
  winMessage.textContent = `PLAYER ${playerIdx + 1} WINS!`
  winSub.textContent = `CONNECT ${state.nInARow} ACHIEVED`

  const wctx = winCanvas.getContext('2d')
  wctx.clearRect(0, 0, 60, 60)
  const mark = state.playerMarks[playerIdx]
  wctx.fillStyle = getPlayerColor(playerIdx)
  const s = 6
  for (let i = 0; i < 100; i++)
    if (mark[i]) wctx.fillRect((i % 10) * s, Math.floor(i / 10) * s, s, s)

  winOverlay.classList.add('visible')
}

function showDraw() {
  winMessage.textContent = "IT'S A DRAW"
  winSub.textContent = 'NO MOVES REMAINING'
  const wctx = winCanvas.getContext('2d')
  wctx.clearRect(0, 0, 60, 60)
  winOverlay.classList.add('visible')
}

winResetBtn.addEventListener('click', () => {
  winOverlay.classList.remove('visible')
  resetGame()
})

winMenuBtn.addEventListener('click', () => {
  winOverlay.classList.remove('visible')
  returnToMenu()
})

// ─── HUD ─────────────────────────────────────

function updateHUD() {
  playerLabel.textContent = `PLAYER ${currentPlayer + 1}`
  renderMarkToCanvas(playerSymbolPreview, state.playerMarks[currentPlayer], getPlayerColor(currentPlayer))
}

quitBtn.addEventListener('click', returnToMenu)

resetBtn.addEventListener('click', () => {
  if (animFrame) cancelAnimationFrame(animFrame)
  resetGame()
})

function resetGame() {
  if (animFrame) cancelAnimationFrame(animFrame)
  animatingCell = null
  winCells = []
  currentPlayer = 0
  gameActive = true
  initBoard()
  updateHUD()
  drawBoard()
  resetTimer()
  startTimer()
  if (isOnePlayer && currentPlayer !== humanPlayerIndex) {
    setTimeout(doAiMove, 420)
  }
}

function returnToMenu() {
  if (animFrame) cancelAnimationFrame(animFrame)
  gameActive = false
  stopTimer()
  hud.classList.remove('visible')
  gameArea.classList.remove('visible')
  menu.style.display = ''
  winOverlay.classList.remove('visible')
}

// ─── TIMER ───────────────────────────────────

function startTimer() {
  stopTimer()
  turnSeconds = 0
  turnTimerEl.textContent = '00:00'
  timerInterval = setInterval(() => {
    turnSeconds++
    const m = String(Math.floor(turnSeconds / 60)).padStart(2, '0')
    const s = String(turnSeconds % 60).padStart(2, '0')
    turnTimerEl.textContent = `${m}:${s}`
  }, 1000)
}

function resetTimer() {
  turnSeconds = 0
  turnTimerEl.textContent = '00:00'
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

// ─── AI ──────────────────────────────────────

function doAiMove() {
  if (!gameActive) return
  const move = getAiMove()
  if (move) placeMove(move.r, move.c)
}

function getAiMove() {
  const aiIdx = currentPlayer + 1   // board value for AI
  const humanIdx = humanPlayerIndex + 1

  const empty = getEmptyCells()
  if (empty.length === 0) return null

  const isTicTacToe = state.type === '3'

  if (isTicTacToe) {
    return getTTTMove(aiIdx, humanIdx, empty)
  } else {
    return getGomokuMove(aiIdx, humanIdx, empty)
  }
}

// ── Empty cells helper ──

function getEmptyCells() {
  const cells = []
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++)
      if (board[r][c] === 0) cells.push({ r, c })
  return cells
}

// ─────────────────────────────────────────────
//  TIC TAC TOE AI  (minimax for 3x3)
// ─────────────────────────────────────────────

function getTTTMove(aiIdx, humanIdx, empty) {
  if (state.difficulty === 'easy') {
    return randomMove(empty)
  }

  if (state.difficulty === 'normal') {
    // Take win if available
    const win = findImmediateWin(aiIdx, empty)
    if (win) return win
    // Block human win
    const block = findImmediateWin(humanIdx, empty)
    if (block) return block
    // Otherwise random
    return randomMove(empty)
  }

  // Hard: minimax with 5% mistake rate
  if (Math.random() < 0.05) return randomMove(empty)
  return minimaxMove(aiIdx, humanIdx)
}

function findImmediateWin(playerIdx, empty) {
  for (const { r, c } of empty) {
    board[r][c] = playerIdx
    const won = checkWin(r, c, playerIdx)
    board[r][c] = 0
    if (won) return { r, c }
  }
  return null
}

function minimaxMove(aiIdx, humanIdx) {
  let bestScore = -Infinity
  let bestMove = null
  const empty = getEmptyCells()

  for (const { r, c } of empty) {
    board[r][c] = aiIdx
    const score = minimax(false, aiIdx, humanIdx, 0, -Infinity, Infinity)
    board[r][c] = 0
    if (score > bestScore) {
      bestScore = score
      bestMove = { r, c }
    }
  }
  return bestMove
}

function minimax(isMaximising, aiIdx, humanIdx, depth, alpha, beta) {
  const empty = getEmptyCells()

  // Check terminal states — scan all placed cells for a win
  for (let r = 0; r < state.gridH; r++) {
    for (let c = 0; c < state.gridW; c++) {
      const v = board[r][c]
      if (v === 0) continue
      if (checkWin(r, c, v)) {
        return v === aiIdx ? 10 - depth : depth - 10
      }
    }
  }

  if (empty.length === 0) return 0

  if (isMaximising) {
    let best = -Infinity
    for (const { r, c } of empty) {
      board[r][c] = aiIdx
      best = Math.max(best, minimax(false, aiIdx, humanIdx, depth + 1, alpha, beta))
      board[r][c] = 0
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  } else {
    let best = Infinity
    for (const { r, c } of empty) {
      board[r][c] = humanIdx
      best = Math.min(best, minimax(true, aiIdx, humanIdx, depth + 1, alpha, beta))
      board[r][c] = 0
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
    return best
  }
}

// ─────────────────────────────────────────────
//  GOMOKU AI  (heuristic threat scoring)
// ─────────────────────────────────────────────

function getGomokuMove(aiIdx, humanIdx, empty) {
  if (state.difficulty === 'easy') {
    return randomMove(empty)
  }

  if (state.difficulty === 'normal') {
    // Take immediate win
    const win = findImmediateWin(aiIdx, empty)
    if (win) return win
    // Block immediate human win
    const block = findImmediateWin(humanIdx, empty)
    if (block) return block
    // Otherwise random
    return randomMove(empty)
  }

  // Hard: score every empty cell by threat value, with 5% mistake rate
  if (Math.random() < 0.05) return randomMove(empty)
  return heuristicMove(aiIdx, humanIdx, empty)
}

function heuristicMove(aiIdx, humanIdx, empty) {
  // Only consider cells adjacent to existing pieces (more efficient)
  const candidates = getAdjacentEmpty()
  const pool = candidates.length > 0 ? candidates : empty

  let bestScore = -Infinity
  let bestMove = null

  for (const { r, c } of pool) {
    const attackScore = scoreCell(r, c, aiIdx)
    const defendScore = scoreCell(r, c, humanIdx) * 1.1  // slight defend bias
    const total = attackScore + defendScore

    if (total > bestScore) {
      bestScore = total
      bestMove = { r, c }
    }
  }

  return bestMove || randomMove(empty)
}

function getAdjacentEmpty() {
  const seen = new Set()
  const result = []
  const radius = 2

  for (let r = 0; r < state.gridH; r++) {
    for (let c = 0; c < state.gridW; c++) {
      if (board[r][c] === 0) continue
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const nr = r + dr, nc = c + dc
          if (nr < 0 || nr >= state.gridH || nc < 0 || nc >= state.gridW) continue
          if (board[nr][nc] !== 0) continue
          const key = `${nr},${nc}`
          if (!seen.has(key)) { seen.add(key); result.push({ r: nr, c: nc }) }
        }
      }
    }
  }
  return result
}

// Score how good placing `player` at (r,c) would be
function scoreCell(r, c, player) {
  // Temporarily place
  board[r][c] = player
  let total = 0

  for (const [dr, dc] of DIRS) {
    const line = getLine(r, c, dr, dc, player)
    const len = line.length
    // Check if both ends are open (open four is much stronger than closed)
    const open = isLineOpen(line, dr, dc, player)
    total += lineScore(len, open)
  }

  board[r][c] = 0
  return total
}

function lineScore(len, open) {
  // Exponential value: longer lines = much higher score
  // Open lines worth more than closed
  const base = Math.pow(10, len)
  return open ? base * 2 : base
}

function isLineOpen(line, dr, dc, player) {
  // Check if at least one end of the line has an empty cell
  const first = line[0]
  const last = line[line.length - 1]
  const r1 = first.r - dr, c1 = first.c - dc
  const r2 = last.r + dr, c2 = last.c + dc
  const end1Open = r1 >= 0 && r1 < state.gridH && c1 >= 0 && c1 < state.gridW && board[r1][c1] === 0
  const end2Open = r2 >= 0 && r2 < state.gridH && c2 >= 0 && c2 < state.gridW && board[r2][c2] === 0
  return end1Open || end2Open
}

// ── Shared helpers ──

function randomMove(empty) {
  return empty[Math.floor(Math.random() * empty.length)]
}

// ─── BOOT ────────────────────────────────────

initMenu()