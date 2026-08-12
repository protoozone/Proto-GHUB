// ─────────────────────────────────────────────
//  CONNECT N  —  game.js
// ─────────────────────────────────────────────

const CELL = 48
const ANIM_MS = 200
const DIRS = [[0,1],[1,0],[1,1],[1,-1]]

// ─── GLYPH SYSTEM ────────────────────────────

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
  rows.forEach((row, ri) => {
    const gr = Math.floor((ri / 7) * 8) + 1
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

function makeXGlyph() {
  const g = Array(100).fill(0)
  ;[0,11,22,33,44,55,66,77,88,99,9,18,27,36,45,54,63,72,81,90].forEach(i => g[i] = 1)
  return g
}

function makeOGlyph() {
  const g = Array(100).fill(0)
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 10; c++) {
      const dr = r - 4.5, dc = c - 4.5
      const dist = Math.sqrt(dr*dr + dc*dc)
      if (dist >= 3.2 && dist <= 4.8) g[r*10+c] = 1
    }
  return g
}

function makeLetterGlyph(ch) {
  const g = Array(100).fill(0)
  drawLetter(g, ch)
  return g
}

function defaultGlyphForSlot(idx) {
  if (idx === 0) return makeXGlyph()
  if (idx === 1) return makeOGlyph()
  return makeLetterGlyph('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(idx - 2) % 26])
}

// Persistent glyph cache — keyed by slot index, survives player count changes
const glyphCache = new Map()

function getGlyph(slotIdx) {
  if (!glyphCache.has(slotIdx)) glyphCache.set(slotIdx, defaultGlyphForSlot(slotIdx))
  return glyphCache.get(slotIdx)
}

function setGlyph(slotIdx, pixels) { glyphCache.set(slotIdx, [...pixels]) }
function resetGlyphToDefault(slotIdx) { glyphCache.set(slotIdx, defaultGlyphForSlot(slotIdx)) }

// ─── COLORS ──────────────────────────────────

const DEFAULT_HUES = [0,210,120,45,280,180,320,60,150,240,30,270,90,330,195,15,165,300,75,240]

function hslToHex(h, s, l) {
  s /= 100; l /= 100
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const x = v => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${x(f(0))}${x(f(8))}${x(f(4))}`
}

function defaultColorForSlot(idx) {
  return hslToHex(DEFAULT_HUES[idx % DEFAULT_HUES.length], 75, 55)
}

// ─── PRESET AGENT HELPERS ────────────────────
// For Connect 3 / Connect 5, we build a simple 2-agent list at start time.
// Gomoku (Connect 5) uses circle glyphs rendered via canvas arc — NOT via the
// pixel glyph system, so the glyph cache is never touched.

// Gomoku stone colors — white goes first, dark grey second
const GOMOKU_COLOR_FIRST  = '#ffffff'
const GOMOKU_COLOR_SECOND = '#444444'

function makePresetAgents(isOnePlayer, goFirst, difficulty) {
  const isGomokuMode = state.type === '5'
  const c0 = isGomokuMode ? GOMOKU_COLOR_FIRST  : defaultColorForSlot(0)
  const c1 = isGomokuMode ? GOMOKU_COLOR_SECOND : defaultColorForSlot(1)

  const human = { id: 0, type: 'human', name: 'P1', color: c0, slotIdx: 0 }
  const ai    = { id: 1, type: 'ai',    name: 'A1', color: c1, slotIdx: 1, difficulty, errorRate: 0 }
  const p2    = { id: 1, type: 'human', name: 'P2', color: c1, slotIdx: 1 }

  if (isOnePlayer) return goFirst === 1 ? [human, ai] : [ai, human]
  return [human, p2]
}

// ─── QUEUE STATE (custom mode) ───────────────

let queue = []
let nextId = 2
let humanCount = 0
let aiCount = 0
let savedQueue = null   // snapshot saved when game starts, restored on menu return

// Returns the lowest slot index not currently in use by the queue
function nextFreeSlot() {
  const used = new Set(queue.map(a => a.slotIdx))
  let i = 0
  while (used.has(i)) i++
  return i
}

function addHuman() {
  const slotIdx = nextFreeSlot()
  humanCount++
  queue.push({ id: nextId++, type: 'human', name: `P${humanCount}`, color: defaultColorForSlot(slotIdx), slotIdx })
  renderQueue()
}

function addAI() {
  const slotIdx = nextFreeSlot()
  aiCount++
  queue.push({ id: nextId++, type: 'ai', name: `A${aiCount}`, color: defaultColorForSlot(slotIdx), slotIdx, difficulty: 'normal', errorRate: 0 })
  renderQueue()
}

function removeAgent(id) {
  queue = queue.filter(a => a.id !== id)
  let h = 0, a = 0
  queue.forEach(agent => {
    if (agent.type === 'human') { h++; if (agent.name.match(/^P\d+$/)) agent.name = `P${h}` }
    else                        { a++; if (agent.name.match(/^A\d+$/)) agent.name = `A${a}` }
  })
  humanCount = h; aiCount = a
  renderQueue()
}

// ─── QUEUE RENDER ─────────────────────────────

const queueList = document.getElementById('queue-list')
const queueValidation = document.getElementById('queue-validation')
const startBtn = document.getElementById('start-btn')

function renderQueue() {
  queueList.innerHTML = ''
  queue.forEach((agent, i) => queueList.appendChild(buildCard(agent, i)))
  updateQueueValidation()
  setupDragAndDrop()
}

function buildCard(agent) {
  const card = document.createElement('div')
  card.className = 'player-card'
  card.dataset.id = agent.id

  const top = document.createElement('div')
  top.className = 'card-top'

  const handle = document.createElement('div')
  handle.className = 'drag-handle'
  handle.textContent = '⠿'

  const nameInput = document.createElement('input')
  nameInput.className = 'card-name-input'
  nameInput.type = 'text'
  nameInput.value = agent.name
  nameInput.maxLength = 12
  nameInput.addEventListener('input', () => { agent.name = nameInput.value })

  const badge = document.createElement('div')
  badge.className = 'card-type-badge'
  badge.textContent = agent.type === 'human' ? 'HUMAN' : 'AI'

  const glyphCv = document.createElement('canvas')
  glyphCv.className = 'card-glyph-preview'
  glyphCv.width = 26; glyphCv.height = 26
  glyphCv.title = 'Edit glyph'
  renderGlyphToCanvas(glyphCv, getGlyph(agent.slotIdx), agent.color)
  glyphCv.addEventListener('click', () => openEditor(agent, glyphCv))

  const swatch = document.createElement('div')
  swatch.className = 'card-color-swatch'
  swatch.style.background = agent.color
  const colorInput = document.createElement('input')
  colorInput.type = 'color'
  colorInput.value = agent.color
  colorInput.addEventListener('input', () => {
    agent.color = colorInput.value
    swatch.style.background = agent.color
    renderGlyphToCanvas(glyphCv, getGlyph(agent.slotIdx), agent.color)
  })
  swatch.appendChild(colorInput)

  const removeBtn = document.createElement('button')
  removeBtn.className = 'card-remove'
  removeBtn.textContent = '×'
  removeBtn.addEventListener('click', () => removeAgent(agent.id))

  top.append(handle, nameInput, badge, glyphCv, swatch, removeBtn)
  card.appendChild(top)

  if (agent.type === 'ai') {
    const aiRow = document.createElement('div')
    aiRow.className = 'card-ai-options'

    const diffLabel = document.createElement('label')
    diffLabel.textContent = 'DIFF'
    aiRow.appendChild(diffLabel)

    ;['easy','normal','hard'].forEach(d => {
      const btn = document.createElement('button')
      btn.className = 'ai-diff-btn' + (agent.difficulty === d ? ' selected' : '')
      btn.textContent = d.toUpperCase()
      btn.addEventListener('click', () => {
        agent.difficulty = d
        aiRow.querySelectorAll('.ai-diff-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
      })
      aiRow.appendChild(btn)
    })

    const errLabel = document.createElement('label')
    errLabel.textContent = 'ERR%'
    aiRow.appendChild(errLabel)

    const errInput = document.createElement('input')
    errInput.type = 'number'
    errInput.className = 'error-rate-input'
    errInput.min = 0; errInput.max = 100; errInput.value = agent.errorRate
    errInput.addEventListener('input', () => {
      agent.errorRate = Math.min(100, Math.max(0, parseInt(errInput.value) || 0))
    })
    aiRow.appendChild(errInput)

    card.appendChild(aiRow)
  }

  return card
}

function updateQueueValidation() {
  const n = queue.length
  startBtn.disabled = (state.type === 'custom' && n === 0)
  if (n === 0) queueValidation.textContent = 'ADD AT LEAST ONE PLAYER'
  else if (n === 1) queueValidation.textContent = 'SOLO MODE — PLACE FREELY'
  else queueValidation.textContent = ''
}

// ─── GLYPH RENDERING ─────────────────────────

function renderGlyphToCanvas(cv, pixels, color) {
  const c2 = cv.getContext('2d')
  const s = cv.width / 10
  c2.clearRect(0, 0, cv.width, cv.height)
  c2.fillStyle = color
  for (let i = 0; i < 100; i++)
    if (pixels[i]) c2.fillRect((i % 10) * s, Math.floor(i / 10) * s, s, s)
}

// ─── GLYPH EDITOR ────────────────────────────

const editorOverlay = document.getElementById('symbol-editor-overlay')
const pixelGridEl = document.getElementById('pixel-grid')
let editingAgent = null
let editingGlyphCv = null
let pixelState = Array(100).fill(0)
let mouseDownGrid = false

function openEditor(agent, glyphCv) {
  editingAgent = agent
  editingGlyphCv = glyphCv
  pixelState = [...getGlyph(agent.slotIdx)]
  buildPixelGrid()
  editorOverlay.classList.add('visible')
}

function buildPixelGrid() {
  pixelGridEl.innerHTML = ''
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div')
    cell.className = 'pixel-cell' + (pixelState[i] ? ' on' : '')
    cell.dataset.pi = i
    cell.addEventListener('mousedown', e => { mouseDownGrid = true; togglePixel(i); e.preventDefault() })
    cell.addEventListener('mouseover', () => { if (mouseDownGrid) togglePixel(i) })
    cell.addEventListener('touchstart', e => { mouseDownGrid = true; togglePixel(i); e.preventDefault() }, { passive: false })
    cell.addEventListener('touchmove', e => {
      e.preventDefault()
      const t = e.touches[0]
      const el = document.elementFromPoint(t.clientX, t.clientY)
      if (el && el.dataset.pi !== undefined) setPixelOn(parseInt(el.dataset.pi))
    }, { passive: false })
    pixelGridEl.appendChild(cell)
  }
}

document.addEventListener('mouseup', () => { mouseDownGrid = false })
document.addEventListener('touchend', () => { mouseDownGrid = false })

function togglePixel(i) {
  pixelState[i] = pixelState[i] ? 0 : 1
  pixelGridEl.children[i].classList.toggle('on', !!pixelState[i])
}

function setPixelOn(i) {
  if (!isNaN(i) && i >= 0 && i < 100) {
    pixelState[i] = 1
    pixelGridEl.children[i].classList.add('on')
  }
}

document.getElementById('editor-clear').addEventListener('click', () => {
  pixelState = Array(100).fill(0); buildPixelGrid()
})

document.getElementById('editor-reset').addEventListener('click', () => {
  if (!editingAgent) return
  pixelState = [...defaultGlyphForSlot(editingAgent.slotIdx)]
  buildPixelGrid()
})

document.getElementById('editor-save').addEventListener('click', () => {
  if (!editingAgent) return
  setGlyph(editingAgent.slotIdx, pixelState)
  if (editingGlyphCv) renderGlyphToCanvas(editingGlyphCv, pixelState, editingAgent.color)
  editorOverlay.classList.remove('visible')
  if (gameActive) drawBoard()
  // refresh marks section if visible
  if (state.type === '3') rebuildMarksSection()
})

// ─── DRAG AND DROP ────────────────────────────

const dragGhostEl = document.getElementById('drag-ghost')
let dragSrcId = null
let dragOverIdx = -1
let autoScrollInterval = null

function setupDragAndDrop() {
  queueList.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => initDrag(e, handle.closest('.player-card')))
    handle.addEventListener('touchstart', e => initDrag(e, handle.closest('.player-card')), { passive: false })
  })
}

function initDrag(e, card) {
  e.preventDefault()
  dragSrcId = parseInt(card.dataset.id)
  card.classList.add('dragging')

  // compact ghost: just show the agent name
  const agent = queue.find(a => a.id === dragSrcId)
  dragGhostEl.textContent = agent ? agent.name : '...'
  dragGhostEl.style.display = 'block'

  const move = ev => onDragMove(ev)
  const end  = ev => onDragEnd(ev, move, end)
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', end)
  document.addEventListener('touchmove', move, { passive: false })
  document.addEventListener('touchend', end)

  onDragMove(e)
}

function getXY(e) {
  return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                   : { x: e.clientX, y: e.clientY }
}

function onDragMove(e) {
  if (dragSrcId === null) return
  if (e.preventDefault) e.preventDefault()
  const { x, y } = getXY(e)

  dragGhostEl.style.left = (x + 12) + 'px'
  dragGhostEl.style.top  = (y + 12) + 'px'

  // auto-scroll
  const rect = queueList.getBoundingClientRect()
  clearInterval(autoScrollInterval)
  const threshold = 80
  if (y < rect.top + threshold) {
    const spd = Math.max(2, ((rect.top + threshold - y) / threshold) * 14)
    autoScrollInterval = setInterval(() => { queueList.scrollTop -= spd }, 16)
  } else if (y > rect.bottom - threshold) {
    const spd = Math.max(2, ((y - (rect.bottom - threshold)) / threshold) * 14)
    autoScrollInterval = setInterval(() => { queueList.scrollTop += spd }, 16)
  }

  // find insertion index and render placeholder
  const cards = [...queueList.querySelectorAll('.player-card:not(.dragging)')]
  let newIdx = cards.length
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect()
    if (y < r.top + r.height / 2) { newIdx = i; break }
  }

  if (newIdx !== dragOverIdx) {
    dragOverIdx = newIdx
    // re-render queue with placeholder
    renderQueueWithPlaceholder(dragSrcId, dragOverIdx)
  }
}

function renderQueueWithPlaceholder(srcId, insertIdx) {
  queueList.innerHTML = ''
  const srcQueueIdx = queue.findIndex(a => a.id === srcId)
  // build display order: skip src, insert placeholder at insertIdx
  const others = queue.filter(a => a.id !== srcId)
  let displayIdx = 0
  for (let i = 0; i <= others.length; i++) {
    if (i === insertIdx) {
      const ph = document.createElement('div')
      ph.className = 'drop-placeholder'
      queueList.appendChild(ph)
    }
    if (i < others.length) {
      const card = buildCard(others[i])
      if (others[i].id === srcId) card.classList.add('dragging')
      queueList.appendChild(card)
    }
  }
  // mark the dragging card
  queueList.querySelectorAll('.player-card').forEach(card => {
    if (parseInt(card.dataset.id) === srcId) card.classList.add('dragging')
  })
}

function onDragEnd(e, move, end) {
  document.removeEventListener('mousemove', move)
  document.removeEventListener('mouseup', end)
  document.removeEventListener('touchmove', move)
  document.removeEventListener('touchend', end)
  clearInterval(autoScrollInterval)

  dragGhostEl.style.display = 'none'

  if (dragSrcId !== null && dragOverIdx !== -1) {
    const srcIdx = queue.findIndex(a => a.id === dragSrcId)
    if (srcIdx !== -1) {
      const [moved] = queue.splice(srcIdx, 1)
      const insertAt = dragOverIdx > srcIdx ? dragOverIdx - 1 : dragOverIdx
      queue.splice(Math.min(insertAt, queue.length), 0, moved)
    }
  }

  dragSrcId = null
  dragOverIdx = -1
  renderQueue()
}

// ─── MENU STATE ──────────────────────────────

const state = {
  type: '5',
  players: 2,
  goFirst: 1,
  difficulty: 'normal',
  nInARow: 5,
  gridW: 15,
  gridH: 15,
  missingTiles: new Set(),
}

document.querySelectorAll('[data-group="type"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.type = btn.dataset.value
    document.querySelectorAll('[data-group="type"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    // reset players to 2 on type change
    state.players = 2
    document.querySelectorAll('[data-group="players"]').forEach(b => b.classList.remove('selected'))
    document.querySelector('[data-group="players"][data-value="2"]')?.classList.add('selected')
    if (state.type === '3') { state.nInARow = 3; state.gridW = 3; state.gridH = 3 }
    if (state.type === '5') { state.nInARow = 5; state.gridW = 15; state.gridH = 15 }
    if (state.type === 'custom') { state.nInARow = 5; state.gridW = 15; state.gridH = 15 }
    // glyphCache slots 0 & 1 are never touched for Gomoku so no revert needed —
    // Gomoku uses arc drawing, not the cache. Cache stays clean across switches.
    updateMenuVisibility()
  })
})

document.querySelectorAll('[data-group="players"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.players = parseInt(btn.dataset.value)
    document.querySelectorAll('[data-group="players"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    updateMenuVisibility()
  })
})

document.querySelectorAll('[data-group="gofirst"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.goFirst = parseInt(btn.dataset.value)
    document.querySelectorAll('[data-group="gofirst"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })
})

document.querySelectorAll('[data-group="diff"]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.difficulty = btn.dataset.value
    document.querySelectorAll('[data-group="diff"]').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })
})

document.getElementById('input-grid-w').addEventListener('input', e => { state.gridW = parseInt(e.target.value) || 15 })
document.getElementById('input-grid-h').addEventListener('input', e => { state.gridH = parseInt(e.target.value) || 15 })
document.getElementById('input-n-in-a-row').addEventListener('input', e => { state.nInARow = parseInt(e.target.value) || 5 })
document.getElementById('add-human-btn').addEventListener('click', addHuman)
document.getElementById('add-ai-btn').addEventListener('click', addAI)

document.getElementById('toggleMode').addEventListener('click', () => {
  document.body.classList.toggle('light')
  document.getElementById('toggleMode').textContent = document.body.classList.contains('light') ? 'DARK' : 'LIGHT'
  if (gameActive) drawBoard()
})

// ─── PRESET MARKS SECTION ────────────────────
// Shows glyph previews for P1 and P2 (or P1 + AI) in Connect 3.
// Not shown for Gomoku (circles, no editing) or Custom (queue handles it).

const presetMarkAgents = [
  { slotIdx: 0, name: 'P1', color: defaultColorForSlot(0) },
  { slotIdx: 1, name: 'P2', color: defaultColorForSlot(1) },
]

function rebuildMarksSection() {
  const list = document.getElementById('marks-list')
  list.innerHTML = ''
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:center;width:100%;'

  const count = 2  // always show both slots for Connect 3
  for (let i = 0; i < count; i++) {
    const agent = presetMarkAgents[i]
    agent.color = defaultColorForSlot(i)  // keep colors fresh

    const row = document.createElement('div')
    row.className = 'mark-row'

    const label = document.createElement('span')
    label.textContent = agent.name

    const cv = document.createElement('canvas')
    cv.className = 'mark-preview-cv'
    cv.width = 32; cv.height = 32
    cv.title = `Edit ${agent.name} mark`
    renderGlyphToCanvas(cv, getGlyph(agent.slotIdx), agent.color)
    cv.addEventListener('click', () => openEditor(agent, cv))

    const resetBtn = document.createElement('button')
    resetBtn.className = 'opt-btn'
    resetBtn.style.fontSize = '9px'
    resetBtn.style.padding = '3px 8px'
    resetBtn.textContent = 'RESET'
    resetBtn.addEventListener('click', () => {
      resetGlyphToDefault(agent.slotIdx)
      renderGlyphToCanvas(cv, getGlyph(agent.slotIdx), agent.color)
      if (gameActive) drawBoard()
    })

    row.append(label, cv, resetBtn)
    list.appendChild(row)
  }
}

function updateMenuVisibility() {
  const isCustom  = state.type === 'custom'
  const isGomoku  = state.type === '5'
  const onePlayer = !isCustom && state.players === 1

  // preset-only sections
  document.getElementById('section-players').classList.toggle('visible', !isCustom)
  document.getElementById('section-go-first').classList.toggle('visible', onePlayer)
  document.getElementById('section-difficulty').classList.toggle('visible', onePlayer)

  // marks section: show for Connect 3 only (not Gomoku, not custom)
  const showMarks = state.type === '3'
  document.getElementById('section-marks').classList.toggle('visible', showMarks)
  if (showMarks) rebuildMarksSection()

  // custom-only sections
  document.getElementById('section-grid').classList.toggle('visible', isCustom)
  document.getElementById('section-n-in-a-row').classList.toggle('visible', isCustom)
  document.getElementById('section-missing').classList.toggle('visible', isCustom)
  document.getElementById('section-queue').classList.toggle('visible', isCustom)

  if (isCustom) updateQueueValidation()
  else startBtn.disabled = false
}

function initMenu() {
  // type default: Connect 5
  state.type = '5'
  state.players = 2
  state.goFirst = 1
  state.difficulty = 'normal'
  state.nInARow = 5
  state.gridW = 15
  state.gridH = 15

  document.querySelector('[data-group="type"][data-value="5"]').classList.add('selected')
  document.querySelector('[data-group="players"][data-value="2"]').classList.add('selected')
  document.querySelector('[data-group="diff"][data-value="normal"]').classList.add('selected')
  document.querySelector('[data-group="gofirst"][data-value="1"]').classList.add('selected')
  document.getElementById('input-n-in-a-row').value = 5
  document.getElementById('input-grid-w').value = 15
  document.getElementById('input-grid-h').value = 15

  // seed queue for custom mode — always start fresh on boot
  queue = []; humanCount = 0; aiCount = 0
  addHuman(); addAI()

  updateMenuVisibility()
}

// ─── GAME RUNTIME ────────────────────────────

let board = []
let currentTurnIdx = 0
let gameActive = false
let isGomoku = false    // true when Connect 5 — uses circle rendering
let hoverCell = null
let animatingCell = null
let animFrame = null
let winCells = []
let timerInterval = null
let turnSeconds = 0

const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
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

// ─── START ───────────────────────────────────

document.getElementById('start-btn').addEventListener('click', () => {
  const isCustom = state.type === 'custom'

  if (isCustom) {
    if (queue.length === 0) return
    // snapshot the queue so we can restore it when returning to menu
    savedQueue = queue.map(a => ({ ...a }))
    // parse missing tiles
    const raw = document.getElementById('missing-tiles-input').value.trim()
    state.missingTiles = new Set()
    if (raw) raw.split('\n').forEach(line => {
      const p = line.trim().split(',')
      if (p.length === 2) {
        const x = parseInt(p[0]), y = parseInt(p[1])
        if (!isNaN(x) && !isNaN(y)) state.missingTiles.add(`${x},${y}`)
      }
    })
    isGomoku = false
  } else {
    // preset mode — build clean 2-agent queue, never touch glyph cache
    state.missingTiles = new Set()
    const onePlayer = state.players === 1
    queue = makePresetAgents(onePlayer, state.goFirst, state.difficulty)
    isGomoku = state.type === '5'
  }

  initBoard()
  currentTurnIdx = 0
  gameActive = true
  winCells = []
  animatingCell = null

  canvas.width = state.gridW * CELL
  canvas.height = state.gridH * CELL

  menu.style.display = 'none'
  document.body.classList.add('in-game')
  hud.classList.add('visible')
  gameArea.classList.add('visible')

  updateHUD()
  drawBoard()
  startTimer()
  triggerAIIfNeeded()
})

// ─── BOARD ───────────────────────────────────

function initBoard() {
  board = []
  for (let r = 0; r < state.gridH; r++) {
    const row = []
    for (let c = 0; c < state.gridW; c++)
      row.push(state.missingTiles.has(`${c},${r}`) ? -1 : 0)
    board.push(row)
  }
}

// ─── DRAW ────────────────────────────────────

function drawBoard() {
  const isLight = document.body.classList.contains('light')
  const bgColor      = isLight ? '#f5f5f0' : '#0a0a0a'
  const cellBg       = isLight ? '#ffffff' : '#111111'
  const cellHover    = isLight ? '#f0f0ea' : '#1e1e1e'
  const borderColor  = isLight ? '#cccccc' : '#2a2a2a'
  const missingColor = isLight ? '#e0e0dc' : '#050505'
  const winColor     = isLight ? '#ffff00' : '#aaaa00'

  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let r = 0; r < state.gridH; r++) {
    for (let c = 0; c < state.gridW; c++) {
      const x = c * CELL, y = r * CELL
      const val = board[r][c]

      if (val === -1) {
        ctx.fillStyle = missingColor
        ctx.fillRect(x+1, y+1, CELL-2, CELL-2)
        continue
      }

      const isHovered = hoverCell && hoverCell.r === r && hoverCell.c === c && val === 0 && gameActive
      const isWin = winCells.some(wc => wc.r === r && wc.c === c)

      ctx.fillStyle = isWin ? winColor : isHovered ? cellHover : cellBg
      ctx.fillRect(x+1, y+1, CELL-2, CELL-2)
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.strokeRect(x+0.5, y+0.5, CELL, CELL)

      if (val > 0) {
        const agent = queue[val - 1]
        if (agent) {
          const scale = animatingCell && animatingCell.r === r && animatingCell.c === c
            ? animatingCell.progress : 1
          drawMark(x, y, agent, scale)
        }
      }

      if (isHovered && gameActive) {
        ctx.save(); ctx.globalAlpha = 0.22
        const agent = queue[currentTurnIdx]
        if (agent) drawMark(x, y, agent, 1)
        ctx.restore()
      }
    }
  }
}

function drawMark(x, y, agent, scale) {
  ctx.save()
  ctx.translate(x + CELL/2, y + CELL/2)
  ctx.scale(scale, scale)

  if (isGomoku) {
    const radius = CELL / 2 - 5
    const color = agent.color

    // base stone
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // edge shadow — radial gradient darkening bottom-right rim
    const shadowGrad = ctx.createRadialGradient(
      radius * 0.25, radius * 0.25, radius * 0.5,   // inner circle offset top-left
      radius * 0.25, radius * 0.25, radius * 1.15   // outer circle beyond stone edge
    )
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0)')
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0.35)')
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = shadowGrad
    ctx.fill()

    // specular highlight — small soft ellipse near top-left
    const hx = -radius * 0.3
    const hy = -radius * 0.35
    const highlightGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, radius * 0.38)
    const isWhiteStone = color === '#ffffff' || color === GOMOKU_COLOR_FIRST
    highlightGrad.addColorStop(0, isWhiteStone ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)')
    highlightGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fillStyle = highlightGrad
    ctx.fill()

    // thin border for definition
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()

  } else {
    // Pixel glyph
    const pixels = getGlyph(agent.slotIdx)
    const pad = 6, size = CELL - pad * 2, s = size / 10
    ctx.fillStyle = agent.color
    for (let i = 0; i < 100; i++)
      if (pixels[i]) ctx.fillRect(-CELL/2 + pad + (i%10)*s, -CELL/2 + pad + Math.floor(i/10)*s, s, s)
  }

  ctx.restore()
}

// ─── INPUT ───────────────────────────────────

canvas.addEventListener('mousemove', e => {
  if (!gameActive) return
  const { r, c } = canvasToCell(e.clientX, e.clientY)
  if (r >= 0 && r < state.gridH && c >= 0 && c < state.gridW) {
    if (!hoverCell || hoverCell.r !== r || hoverCell.c !== c) { hoverCell = {r,c}; drawBoard() }
  } else if (hoverCell) { hoverCell = null; drawBoard() }
})

canvas.addEventListener('mouseleave', () => { hoverCell = null; if (gameActive) drawBoard() })

canvas.addEventListener('click', e => {
  if (!gameActive) return
  if (queue[currentTurnIdx]?.type === 'ai') return
  const { r, c } = canvasToCell(e.clientX, e.clientY)
  if (r < 0 || r >= state.gridH || c < 0 || c >= state.gridW) return
  if (board[r][c] !== 0) return
  placeMove(r, c)
})

canvas.addEventListener('touchend', e => {
  if (!gameActive) return
  e.preventDefault()
  if (queue[currentTurnIdx]?.type === 'ai') return
  const t = e.changedTouches[0]
  const { r, c } = canvasToCell(t.clientX, t.clientY)
  if (r < 0 || r >= state.gridH || c < 0 || c >= state.gridW) return
  if (board[r][c] !== 0) return
  placeMove(r, c)
}, { passive: false })

function canvasToCell(cx, cy) {
  const rect = canvas.getBoundingClientRect()
  return {
    r: Math.floor((cy - rect.top)  * (canvas.height / rect.height) / CELL),
    c: Math.floor((cx - rect.left) * (canvas.width  / rect.width)  / CELL),
  }
}

// ─── MOVE ────────────────────────────────────

function placeMove(r, c) {
  board[r][c] = currentTurnIdx + 1
  resetTimer()
  if (animFrame) cancelAnimationFrame(animFrame)
  const t0 = performance.now()
  animatingCell = { r, c, progress: 0 }

  function animate(now) {
    const t = Math.min((now - t0) / ANIM_MS, 1)
    animatingCell.progress = easeOutBack(t)
    drawBoard()
    if (t < 1) {
      animFrame = requestAnimationFrame(animate)
    } else {
      animatingCell = null
      drawBoard()
      scrollToCell(r, c)

      if (queue.length === 1) { startTimer(); return }

      const won = checkWin(r, c, currentTurnIdx + 1)
      if (won) {
        winCells = won; gameActive = false; stopTimer()
        drawBoard()
        setTimeout(() => showWin(currentTurnIdx), 300)
        return
      }
      if (isBoardFull()) { gameActive = false; stopTimer(); showDraw(); return }

      currentTurnIdx = (currentTurnIdx + 1) % queue.length
      updateHUD(); startTimer(); triggerAIIfNeeded()
    }
  }
  animFrame = requestAnimationFrame(animate)
}

function scrollToCell(r, c) {
  const scroll = document.getElementById('canvas-scroll')
  const cellCenterX = c * CELL + CELL / 2
  const cellCenterY = r * CELL + CELL / 2
  scroll.scrollTo({
    left: cellCenterX - scroll.clientWidth  / 2,
    top:  cellCenterY - scroll.clientHeight / 2,
    behavior: 'smooth'
  })
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(t-1,3) + c1 * Math.pow(t-1,2)
}

// ─── AI ──────────────────────────────────────

function triggerAIIfNeeded() {
  if (queue[currentTurnIdx]?.type === 'ai') setTimeout(doAiMove, 380)
}

function doAiMove() {
  if (!gameActive) return
  const agent = queue[currentTurnIdx]
  if (!agent || agent.type !== 'ai') return
  const move = getAiMove(agent)
  if (move) placeMove(move.r, move.c)
}

function getAiMove(agent) {
  const myIdx = currentTurnIdx + 1
  const empty = getEmptyCells()
  if (!empty.length) return null

  const diff = agent.difficulty
  const isTTT = state.type === '3'
  const errRate = (agent.errorRate || 0) / 100

  // first move on empty board: random for Gomoku and custom (not TTT)
  const boardEmpty = empty.length === state.gridW * state.gridH - state.missingTiles.size
  if (!isTTT && boardEmpty) return randomMove(empty)

  const best = isTTT ? getTTTMove(myIdx, diff, empty) : getGomokuMove(myIdx, diff, empty)

  // error: skip best, pick second
  if (best && Math.random() < errRate) {
    const others = empty.filter(e => !(e.r === best.r && e.c === best.c))
    if (others.length) {
      const scored = others.map(e => ({
        ...e,
        score: scoreCell(e.r, e.c, myIdx) + scoreCell(e.r, e.c, getBiggestThreatIdx(myIdx))
      })).sort((a,b) => b.score - a.score)
      return scored[0]
    }
  }
  return best
}

function getBiggestThreatIdx(myIdx) {
  let bestLen = 0, bestIdx = 0
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++) {
      const v = board[r][c]
      if (v <= 0 || v === myIdx) continue
      for (const [dr, dc] of DIRS) {
        const len = getLine(r, c, dr, dc, v).length
        if (len > bestLen) { bestLen = len; bestIdx = v }
      }
    }
  return bestIdx
}

function getAllOpponentThreatIdxs(myIdx) {
  const lengths = {}
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++) {
      const v = board[r][c]
      if (v <= 0 || v === myIdx) continue
      for (const [dr, dc] of DIRS)
        lengths[v] = Math.max(lengths[v] || 0, getLine(r,c,dr,dc,v).length)
    }
  return Object.entries(lengths).sort((a,b) => b[1]-a[1]).map(e => parseInt(e[0]))
}

// ── TIC TAC TOE ──

function getTTTMove(myIdx, diff, empty) {
  const threats = getAllOpponentThreatIdxs(myIdx)
  if (diff === 'easy') return randomMove(empty)
  if (diff === 'normal') {
    const win = findImmediateWin(myIdx, empty); if (win) return win
    for (const o of threats) { const b = findImmediateWin(o, empty); if (b) return b }
    return randomMove(empty)
  }
  return minimaxMove(myIdx, threats[0] || (myIdx === 1 ? 2 : 1))
}

// ── GOMOKU / CUSTOM ──

function getGomokuMove(myIdx, diff, empty) {
  const threats = getAllOpponentThreatIdxs(myIdx)
  const cutoff = state.nInARow >= 4 ? findThreatCutoff(myIdx, empty) : null

  if (diff === 'easy') return cutoff || randomMove(empty)

  if (diff === 'normal') {
    const win = findImmediateWin(myIdx, empty); if (win) return win
    for (const o of threats) { const b = findImmediateWin(o, empty); if (b) return b }
    if (cutoff) return cutoff
    return randomMove(empty)
  }

  const win = findImmediateWin(myIdx, empty); if (win) return win
  for (const o of threats) { const b = findImmediateWin(o, empty); if (b) return b }
  if (cutoff) return cutoff
  return heuristicMove(myIdx, threats, empty)
}

function findThreatCutoff(myIdx, empty) {
  const threshold = state.nInARow - 2
  let bestMove = null, bestLen = threshold - 1
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++) {
      const v = board[r][c]
      if (v <= 0 || v === myIdx) continue
      for (const [dr, dc] of DIRS) {
        const line = getLine(r, c, dr, dc, v)
        if (line.length < threshold) continue
        const first = line[0], last = line[line.length-1]
        for (const end of [
          {r: first.r-dr, c: first.c-dc},
          {r: last.r+dr,  c: last.c+dc},
        ]) {
          if (end.r<0||end.r>=state.gridH||end.c<0||end.c>=state.gridW) continue
          if (board[end.r][end.c] !== 0) continue
          if (line.length > bestLen) { bestLen = line.length; bestMove = end }
        }
      }
    }
  return bestMove
}

function heuristicMove(myIdx, threatIdxs, empty) {
  const candidates = getAdjacentEmpty()
  const pool = candidates.length > 0 ? candidates : empty
  let best = -Infinity, bestMove = null
  for (const {r, c} of pool) {
    let score = scoreCell(r, c, myIdx)
    threatIdxs.forEach((o, i) => { score += scoreCell(r, c, o) * (1.1 / (i+1)) })
    if (score > best) { best = score; bestMove = {r, c} }
  }
  return bestMove || randomMove(empty)
}

function getAdjacentEmpty() {
  const seen = new Set(), result = []
  for (let r = 0; r < state.gridH; r++)
    for (let c = 0; c < state.gridW; c++) {
      if (board[r][c] === 0) continue
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const nr=r+dr, nc=c+dc
          if (nr<0||nr>=state.gridH||nc<0||nc>=state.gridW||board[nr][nc]!==0) continue
          const k=`${nr},${nc}`; if (!seen.has(k)) { seen.add(k); result.push({r:nr,c:nc}) }
        }
    }
  return result
}

function scoreCell(r, c, player) {
  board[r][c] = player
  let total = 0
  for (const [dr,dc] of DIRS) {
    const line = getLine(r,c,dr,dc,player)
    total += Math.pow(10, line.length) * (isLineOpen(line,dr,dc) ? 2 : 1)
  }
  board[r][c] = 0
  return total
}

function isLineOpen(line, dr, dc) {
  const first=line[0], last=line[line.length-1]
  const r1=first.r-dr, c1=first.c-dc, r2=last.r+dr, c2=last.c+dc
  return (r1>=0&&r1<state.gridH&&c1>=0&&c1<state.gridW&&board[r1][c1]===0)
      || (r2>=0&&r2<state.gridH&&c2>=0&&c2<state.gridW&&board[r2][c2]===0)
}

// ── Minimax (TTT) ──

function minimaxMove(myIdx, oppIdx) {
  let best=-Infinity, bestMove=null
  for (const {r,c} of getEmptyCells()) {
    board[r][c]=myIdx
    const score=minimax(false,myIdx,oppIdx,0,-Infinity,Infinity)
    board[r][c]=0
    if (score>best) { best=score; bestMove={r,c} }
  }
  return bestMove
}

function minimax(isMax,myIdx,oppIdx,depth,alpha,beta) {
  const empty=getEmptyCells()
  for (let r=0;r<state.gridH;r++)
    for (let c=0;c<state.gridW;c++) {
      const v=board[r][c]; if (!v) continue
      if (checkWin(r,c,v)) return v===myIdx ? 10-depth : depth-10
    }
  if (!empty.length) return 0
  if (isMax) {
    let best=-Infinity
    for (const {r,c} of empty) {
      board[r][c]=myIdx
      best=Math.max(best,minimax(false,myIdx,oppIdx,depth+1,alpha,beta))
      board[r][c]=0; alpha=Math.max(alpha,best); if (beta<=alpha) break
    }
    return best
  } else {
    let best=Infinity
    for (const {r,c} of empty) {
      board[r][c]=oppIdx
      best=Math.min(best,minimax(true,myIdx,oppIdx,depth+1,alpha,beta))
      board[r][c]=0; beta=Math.min(beta,best); if (beta<=alpha) break
    }
    return best
  }
}

function getEmptyCells() {
  const cells=[]
  for (let r=0;r<state.gridH;r++)
    for (let c=0;c<state.gridW;c++)
      if (board[r][c]===0) cells.push({r,c})
  return cells
}

function findImmediateWin(playerIdx, empty) {
  for (const {r,c} of empty) {
    board[r][c]=playerIdx
    const won=checkWin(r,c,playerIdx)
    board[r][c]=0
    if (won) return {r,c}
  }
  return null
}

function randomMove(empty) { return empty[Math.floor(Math.random()*empty.length)] }

// ─── WIN CHECK ───────────────────────────────

function checkWin(r, c, player) {
  for (const [dr,dc] of DIRS) {
    const line = getLine(r,c,dr,dc,player)
    if (line.length >= state.nInARow) return line.slice(0, state.nInARow)
  }
  return null
}

function getLine(r, c, dr, dc, player) {
  const cells=[{r,c}]
  for (const sign of [-1,1]) {
    let nr=r+dr*sign, nc=c+dc*sign
    while (nr>=0&&nr<state.gridH&&nc>=0&&nc<state.gridW&&board[nr][nc]===player) {
      cells.push({r:nr,c:nc}); nr+=dr*sign; nc+=dc*sign
    }
  }
  return cells
}

function isBoardFull() {
  for (let r=0;r<state.gridH;r++)
    for (let c=0;c<state.gridW;c++)
      if (board[r][c]===0) return false
  return true
}

// ─── WIN UI ──────────────────────────────────

function showWin(agentIdx) {
  const agent = queue[agentIdx]
  winMessage.textContent = `${agent.name} WINS!`
  winSub.textContent = `CONNECT ${state.nInARow} ACHIEVED`

  const wctx = winCanvas.getContext('2d')
  wctx.clearRect(0, 0, 60, 60)
  wctx.fillStyle = agent.color
  if (isGomoku) {
    wctx.beginPath(); wctx.arc(30, 30, 22, 0, Math.PI*2); wctx.fill()
  } else {
    const pixels = getGlyph(agent.slotIdx)
    const s = 6
    for (let i=0;i<100;i++) if (pixels[i]) wctx.fillRect((i%10)*s, Math.floor(i/10)*s, s, s)
  }
  winOverlay.classList.add('visible')
}

function showDraw() {
  winMessage.textContent = "IT'S A DRAW"
  winSub.textContent = 'NO MOVES REMAINING'
  winCanvas.getContext('2d').clearRect(0,0,60,60)
  winOverlay.classList.add('visible')
}

document.getElementById('win-reset-btn').addEventListener('click', () => {
  winOverlay.classList.remove('visible'); resetGame()
})
document.getElementById('win-menu-btn').addEventListener('click', () => {
  winOverlay.classList.remove('visible'); returnToMenu()
})

// ─── HUD ─────────────────────────────────────

function updateHUD() {
  const agent = queue[currentTurnIdx]
  if (!agent) return
  playerLabel.textContent = agent.name
  playerLabel.style.color = agent.color

  const pv = playerSymbolPreview
  const pctx = pv.getContext('2d')
  pctx.clearRect(0, 0, pv.width, pv.height)
  if (isGomoku) {
    const cx = pv.width/2, cy = pv.height/2, r = pv.width/2 - 1
    // base
    pctx.beginPath(); pctx.arc(cx, cy, r, 0, Math.PI*2)
    pctx.fillStyle = agent.color; pctx.fill()
    // shadow
    const sg = pctx.createRadialGradient(cx+r*0.25, cy+r*0.25, r*0.5, cx+r*0.25, cy+r*0.25, r*1.15)
    sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.35)')
    pctx.beginPath(); pctx.arc(cx, cy, r, 0, Math.PI*2); pctx.fillStyle = sg; pctx.fill()
    // highlight
    const hx = cx - r*0.3, hy = cy - r*0.35
    const isWhite = agent.color === GOMOKU_COLOR_FIRST
    const hg = pctx.createRadialGradient(hx, hy, 0, hx, hy, r*0.38)
    hg.addColorStop(0, isWhite ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)')
    hg.addColorStop(1, 'rgba(255,255,255,0)')
    pctx.beginPath(); pctx.arc(cx, cy, r, 0, Math.PI*2); pctx.fillStyle = hg; pctx.fill()
    // border
    pctx.beginPath(); pctx.arc(cx, cy, r, 0, Math.PI*2)
    pctx.strokeStyle = 'rgba(0,0,0,0.3)'; pctx.lineWidth = 1; pctx.stroke()
  } else {
    renderGlyphToCanvas(pv, getGlyph(agent.slotIdx), agent.color)
  }
}

document.getElementById('quit-btn').addEventListener('click', returnToMenu)
document.getElementById('reset-btn').addEventListener('click', () => { if (animFrame) cancelAnimationFrame(animFrame); resetGame() })

function resetGame() {
  if (animFrame) cancelAnimationFrame(animFrame)
  animatingCell=null; winCells=[]; currentTurnIdx=0; gameActive=true
  initBoard(); updateHUD(); drawBoard(); resetTimer(); startTimer(); triggerAIIfNeeded()
}

function returnToMenu() {
  if (animFrame) cancelAnimationFrame(animFrame)
  gameActive = false; stopTimer()
  hud.classList.remove('visible')
  gameArea.classList.remove('visible')
  document.body.classList.remove('in-game')
  menu.style.display = 'flex'
  winOverlay.classList.remove('visible')
  isGomoku = false

  if (state.type === 'custom' && savedQueue) {
    // restore the queue exactly as it was before the game started
    queue = savedQueue.map(a => ({ ...a }))
    humanCount = queue.filter(a => a.type === 'human').length
    aiCount    = queue.filter(a => a.type === 'ai').length
    savedQueue = null
    renderQueue()
  } else {
    // preset mode — reset to clean default queue for next custom visit
    queue = []; humanCount = 0; aiCount = 0
    addHuman(); addAI()
  }
}

// ─── TIMER ───────────────────────────────────

function startTimer() {
  stopTimer(); turnSeconds=0; turnTimerEl.textContent='00:00'
  timerInterval = setInterval(() => {
    turnSeconds++
    const m=String(Math.floor(turnSeconds/60)).padStart(2,'0')
    const s=String(turnSeconds%60).padStart(2,'0')
    turnTimerEl.textContent=`${m}:${s}`
  }, 1000)
}

function resetTimer() { turnSeconds=0; turnTimerEl.textContent='00:00' }
function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval=null } }

// ─── BOOT ────────────────────────────────────

try {
  menu.style.display = 'flex'
  initMenu()
} catch(e) {
  console.error('Connect N boot error:', e)
}