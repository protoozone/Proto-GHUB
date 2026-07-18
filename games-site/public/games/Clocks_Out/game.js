/**
 * Clock's Out — game.js
 *
 * LAYOUT (top to bottom):
 *   P2 control panel  [flipped 180°, pinned top]
 *   space
 *   P2 queue slots
 *   P2 HUD            [HP, ult, timer — flipped]
 *   Arena tiles
 *   P1 HUD            [HP, ult, timer]
 *   P1 queue slots
 *   space
 *   P1 control panel  [pinned bottom]
 *
 * P2 LEFT/RIGHT are flipped to match physical orientation.
 * P2 button strip is mirrored horizontally (btn 0 right edge, btn 9 left edge).
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const TILE_COUNT = 9
const MAX_HP     = 10
const P1_START   = 1
const P2_START   = TILE_COUNT - 2
const BTN_COUNT  = 10

const ACTION = {
  WAIT:    0,
  JAB:     1,
  LEFT:    2,
  RIGHT:   3,
  BLOCK:   4,
  SP_ATK:  5,
  CON_ATK: 6,
  ENGAGE:  7,
  RECOVER: 8,
  ULT:     9,
}

const BTN_LABEL  = ['WAIT','JAB','LEFT','RIGHT','BLOCK','SP.ATK','CON.ATK','ENGAGE','RECOVER','ULT']
const ACTION_NAME = ['WAIT','JAB','LEFT','RIGHT','BLOCK','SP.ATK','CON.ATK','ENGAGE','RECOVER','ULT']

const P1_KEY_MAP = {
  'Digit0':0,'Digit1':1,'Digit2':2,'Digit3':3,'Digit4':4,
  'Digit5':5,'Digit6':6,'Digit7':7,'Digit8':8,'Digit9':9,
}
const P2_KEY_MAP = {
  'Numpad0':0,'Numpad1':1,'Numpad2':2,'Numpad3':3,'Numpad4':4,
  'Numpad5':5,'Numpad6':6,'Numpad7':7,'Numpad8':8,'Numpad9':9,
}

// For P2, flip movement direction
const P2_MOVEMENT_FLIP = { [ACTION.LEFT]: ACTION.RIGHT, [ACTION.RIGHT]: ACTION.LEFT }
function p2Action(raw) { return P2_MOVEMENT_FLIP[raw] ?? raw }

// ── Colours ───────────────────────────────────────────────────────────────────
const C = {
  bg:         '#0d0d0f',
  surface:    '#15171c',
  surface2:   '#1c1f27',
  border:     '#2c2f3a',
  borderBrt:  '#44475a',
  accent:     '#c0c8d8',
  accentHot:  '#e8eaf0',
  muted:      '#6b7080',
  p1:         '#5b9bd5',
  p2:         '#d55b5b',
  tile:       '#1a1c24',
  tileAlt:    '#16181f',
  tileCentre: '#1e1c28',
  dmg:        '#e07070',
  ult:        '#c8a84e',
}

// ── Phases ────────────────────────────────────────────────────────────────────
const PHASE = {
  CHAR_P1: 'char_p1',
  CHAR_P2: 'char_p2',
  INPUT:   'input',
  RESOLVE: 'resolve',
  BETWEEN: 'between',
  DEAD:    'dead',
  SETOVER: 'setover',
}

// ── Characters ────────────────────────────────────────────────────────────────
const DUMMY_MOVESET = {
  abilityNames: { 5:'SP.ATK', 6:'CON.ATK', 7:'ENGAGE', 8:'RECOVER' },
  ultName: 'ULT',
  onSequenceStart() {},
  onResolveStep()   {},
  onUlt()           {},
}

const CHARACTERS = [
  {
    id: 'dummy',
    name: 'DUMMY',
    colour: '#8899aa',
    desc: 'No abilities.',
    ...DUMMY_MOVESET,
  },
  {
    id: 'takashi',
    name: 'TAKASHI', // RYU
    colour: '#e8954a',
    desc: 'Street Fighter. Self Healing High Damage.',
    ...DUMMY_MOVESET,
  },
  {
    id: 'lia',
    name: 'LIA', // RASSI
    colour: '#c45c8a',
    desc: 'Chain Fighter. Distance Closer Tactical.',
    ...DUMMY_MOVESET,
  },
  {
    id: 'andile',
    name: 'ANDILE', // KASONGO
    colour: '#4ab8c4',
    desc: 'Future Fighter. Teleporter Stunner.',
    ...DUMMY_MOVESET,
  },
  {
    id: 'estelle',
    name: 'ESTELLE', // ORLOV
    colour: '#a07ad4',
    desc: 'Necromancer. HP Drain Punisher.',
    ...DUMMY_MOVESET,
  },
]

// ── Fighter ───────────────────────────────────────────────────────────────────
class Fighter {
  constructor(id, slots) {
    this.id          = id
    this.slots       = slots
    this.charDef     = null
    this.tile        = id === 1 ? P1_START : P2_START
    this.hp          = MAX_HP
    this.facingRight = id === 1
    this.ult         = 0
    this.queue       = []
    this.locked      = false
    this.blocking    = false
    this.lastDamage  = 0
    this.flash       = 0
    this.stunned     = 0
    this.poisoned    = 0
    this.restrained  = 0
  }

  get colour() { return this.charDef?.colour ?? (this.id === 1 ? C.p1 : C.p2) }
  get name()   { return this.charDef?.name   ?? `P${this.id}` }

  fullReset() {
    this.tile        = this.id === 1 ? P1_START : P2_START
    this.hp          = MAX_HP
    this.facingRight = this.id === 1
    this.queue       = []
    this.locked      = false
    this.blocking    = false
    this.lastDamage  = 0
    this.flash       = 0
    this.stunned     = 0
    this.poisoned    = 0
    this.restrained  = 0
    // ult persists
  }

  clearSequence() {
    this.queue      = []
    this.locked     = false
    this.blocking   = false
    this.lastDamage = 0
  }

  chargeUlt(pct) { this.ult = Math.min(100, this.ult + pct) }
}

// ── Layout helper ─────────────────────────────────────────────────────────────
// Returns all zone rects given canvas W, H and slot count
function computeLayout(W, H, slots) {
  const btnH    = Math.max(48, Math.min(H * 0.17, 76))
  const btnW    = W / BTN_COUNT
  const space   = Math.max(8, H * 0.025)

  // Queue slots
  const slotSz  = Math.max(24, Math.min(
    (W * 0.72) / slots - 6,
    Math.min(H * 0.07, 44)
  ))
  const slotGap = 5
  const queueW  = slots * (slotSz + slotGap) - slotGap
  const queueH  = slotSz

  // HUD strip
  const hudH    = Math.max(18, H * 0.04)

  // Total middle content: queue + hud + arena + hud + queue
  const tileW   = W / TILE_COUNT
  const arenaH  = Math.min(tileW * 1.1, (H - btnH * 2 - space * 2 - queueH * 2 - hudH * 2) * 0.95)

  const totalMid = queueH + hudH + arenaH + hudH + queueH
  const midY     = btnH + space + (H - btnH * 2 - space * 2 - totalMid) / 2

  const p2QueueY = midY
  const p2HudY   = p2QueueY + queueH + 4
  const arenaY   = p2HudY + hudH + 4
  const p1HudY   = arenaY + arenaH + 4
  const p1QueueY = p1HudY + hudH + 4

  return {
    W, H,
    btnH, btnW,
    space,
    slotSz, slotGap, queueW, queueH,
    hudH,
    arenaH, arenaY,
    tileW,
    p1QueueY, p2QueueY,
    p1HudY,   p2HudY,
    queueStartX: (W - queueW) / 2,
  }
}

// ── Main game class ───────────────────────────────────────────────────────────
class ClocksOutGame {
  constructor(canvas, hud, opts = {}) {
    this.canvas   = canvas
    this.ctx      = canvas.getContext('2d')
    this.hud      = hud
    this.slots    = opts.slots    ?? 3
    this.timerS   = opts.timerS   ?? 5
    this.matchFmt = opts.matchFmt ?? 1

    this.roundWins   = [0, 0]
    this.actionCount = 0

    this.p1 = new Fighter(1, this.slots)
    this.p2 = new Fighter(2, this.slots)

    this.charSelectIdx = [0, 0]

    this.phase        = PHASE.CHAR_P1
    this.timeLeft     = 0
    this.lastTick     = null
    this.resolveIdx   = 0
    this.resolveTimer = 0
    this.betweenTimer = 0
    this.deadTimer    = 0

    this.RESOLVE_STEP_MS = 700
    this.BETWEEN_MS      = 2000
    this.DEAD_MS         = 1800

    this.log = []

    this._boundKey   = this._onKey.bind(this)
    this._boundRAF   = this._loop.bind(this)
    this._boundClick = this._onClick.bind(this)

    document.addEventListener('keydown', this._boundKey)
    canvas.addEventListener('pointerdown', this._boundClick)
    this._rafId = requestAnimationFrame(this._boundRAF)
  }

  destroy() {
    document.removeEventListener('keydown', this._boundKey)
    this.canvas.removeEventListener('pointerdown', this._boundClick)
    cancelAnimationFrame(this._rafId)
  }

  reset() {
    this.roundWins     = [0, 0]
    this.actionCount   = 0
    this.p1.charDef    = null
    this.p2.charDef    = null
    this.p1.ult        = 0
    this.p2.ult        = 0
    this.charSelectIdx = [0, 0]
    this.log           = []
    this.phase         = PHASE.CHAR_P1
    if (this.hud.timer)  this.hud.timer.textContent  = '—'
    if (this.hud.p1hp)   this.hud.p1hp.textContent   = '—'
    if (this.hud.p2hp)   this.hud.p2hp.textContent   = '—'
    if (this.hud.status) this.hud.status.textContent  = ''
  }

  resize() { this._render() }

  // ── Character select ────────────────────────────────────────────────────────
  _confirmChar(playerIdx, charIdx) {
    const f = playerIdx === 0 ? this.p1 : this.p2
    f.charDef = CHARACTERS[charIdx]
    this.phase = playerIdx === 0 ? PHASE.CHAR_P2 : (this._startMatch(), PHASE.INPUT)
  }

  // ── Match / sequence lifecycle ───────────────────────────────────────────────
  _startMatch() {
    this.actionCount = 0
    this.p1.fullReset()
    this.p2.fullReset()
    this.log = []
    this._startSequence()
  }

  _startSequence() {
    this.p1.clearSequence()
    this.p2.clearSequence()
    this.log      = []
    this.phase    = PHASE.INPUT
    this.timeLeft = this.timerS * 1000
    this.lastTick = null
    this.p1.charDef?.onSequenceStart(this.p1, this)
    this.p2.charDef?.onSequenceStart(this.p2, this)
    this._updateHud()
  }

  _lockIn(fighter) {
    fighter.locked = true
    if (this.p1.locked && this.p2.locked) this._beginResolve()
  }

  _beginResolve() {
    this.phase        = PHASE.RESOLVE
    this.resolveIdx   = 0
    this.resolveTimer = this.RESOLVE_STEP_MS
  }

  _resolveStep() {
    const i  = this.resolveIdx
    const a1 = this.p1.queue[i] ?? ACTION.WAIT
    const a2 = this.p2.queue[i] ?? ACTION.WAIT

    this.p1.blocking   = false; this.p2.blocking   = false
    this.p1.lastDamage = 0;     this.p2.lastDamage = 0

    if (a1 === ACTION.BLOCK) this.p1.blocking = true
    if (a2 === ACTION.BLOCK) this.p2.blocking = true

    // Phase 1: movement
    if (!this.p1.stunned && !this.p1.restrained) this._applyMove(this.p1, a1)
    if (!this.p2.stunned && !this.p2.restrained) this._applyMove(this.p2, a2)

    this.p1.tile = Math.max(0, Math.min(TILE_COUNT - 1, this.p1.tile))
    this.p2.tile = Math.max(0, Math.min(TILE_COUNT - 1, this.p2.tile))

    // Collision: 50/50, loser pushed toward their start side
    if (this.p1.tile === this.p2.tile) {
      if (Math.random() < 0.5) this.p2.tile = Math.min(TILE_COUNT - 1, this.p2.tile + 1)
      else                     this.p1.tile = Math.max(0, this.p1.tile - 1)
    }

    // Update facing
    if (this.p1.tile !== this.p2.tile) {
      this.p1.facingRight = this.p1.tile < this.p2.tile
      this.p2.facingRight = this.p2.tile < this.p1.tile
    }

    // Phase 2: attacks
    if (!this.p1.stunned) this._applyAction(this.p1, a1, this.p2)
    if (!this.p2.stunned) this._applyAction(this.p2, a2, this.p1)

    this.p1.hp = Math.max(0, this.p1.hp)
    this.p2.hp = Math.max(0, this.p2.hp)

    // Ult charge
    if (this.p2.lastDamage > 0) { this.p1.chargeUlt(2.5); this.p2.chargeUlt(2.5) }
    if (this.p1.lastDamage > 0) { this.p2.chargeUlt(2.5); this.p1.chargeUlt(2.5) }
    if (this.p1.blocking && this.p2.lastDamage > 0) this.p1.chargeUlt(5)
    if (this.p2.blocking && this.p1.lastDamage > 0) this.p2.chargeUlt(5)

    if (this.p1.lastDamage > 0) this.p1.flash = 350
    if (this.p2.lastDamage > 0) this.p2.flash = 350

    // Status tick
    const tickStatus = (f) => {
      if (f.stunned    > 0) f.stunned--
      if (f.restrained > 0) f.restrained--
      if (f.poisoned   > 0) { f.hp = Math.max(0, f.hp - 1); f.poisoned-- }
    }
    tickStatus(this.p1); tickStatus(this.p2)

    this.p1.charDef?.onResolveStep(this.p1, a1, this.p2, this)
    this.p2.charDef?.onResolveStep(this.p2, a2, this.p1, this)
    this.actionCount++

    let entry = `${i+1}  P1:${ACTION_NAME[a1]}  P2:${ACTION_NAME[a2]}`
    if (this.p1.lastDamage) entry += `  ‹P1 -${this.p1.lastDamage}›`
    if (this.p2.lastDamage) entry += `  ‹P2 -${this.p2.lastDamage}›`
    this.log.push(entry)

    this._updateHud()
    this.resolveIdx++

    const died = this.p1.hp <= 0 || this.p2.hp <= 0
    const done = this.resolveIdx >= this.slots || died
    if (done) {
      if (died) this._onDeath()
      else { this.phase = PHASE.BETWEEN; this.betweenTimer = this.BETWEEN_MS }
    }
  }

  _applyMove(f, action) {
    // Movement is always in absolute canvas terms: LEFT = tile--, RIGHT = tile++
    // P2's input is already flipped at input time via p2Action()
    if (action === ACTION.LEFT)  f.tile -= 1
    if (action === ACTION.RIGHT) f.tile += 1
  }

  _applyAction(attacker, action, defender) {
    if (action === ACTION.JAB) {
      if (Math.abs(attacker.tile - defender.tile) <= 1) {
        const dmg = Math.max(0, 1 - (defender.blocking ? 1 : 0))
        defender.hp -= dmg; defender.lastDamage += dmg
      }
    }
    if (action === ACTION.ULT && attacker.ult >= 100) {
      attacker.charDef?.onUlt(attacker, defender, this)
      attacker.ult = 0
    }
    if (action >= ACTION.SP_ATK && action <= ACTION.RECOVER) {
      attacker.charDef?.onResolveStep(attacker, action, defender, this)
    }
  }

  _onDeath() {
    if      (this.p1.hp <= 0 && this.p2.hp > 0) this.roundWins[1]++
    else if (this.p2.hp <= 0 && this.p1.hp > 0) this.roundWins[0]++

    this._updateHud()
    const needed  = Math.ceil(this.matchFmt / 2)
    const setDone = this.roundWins[0] >= needed || this.roundWins[1] >= needed
    this.phase     = setDone ? PHASE.SETOVER : PHASE.DEAD
    this.deadTimer = this.DEAD_MS
  }

  _nextMatch() {
    this.actionCount = 0
    this.p1.fullReset()
    this.p2.fullReset()
    this._startSequence()
  }

  // ── Keyboard input ───────────────────────────────────────────────────────────
  _onKey(e) {
    const code = e.code

    if (this.phase === PHASE.CHAR_P1) {
      if (code === 'ArrowLeft')  { this.charSelectIdx[0] = (this.charSelectIdx[0] - 1 + CHARACTERS.length) % CHARACTERS.length; e.preventDefault() }
      if (code === 'ArrowRight') { this.charSelectIdx[0] = (this.charSelectIdx[0] + 1) % CHARACTERS.length; e.preventDefault() }
      if (code === 'Enter')      { this._confirmChar(0, this.charSelectIdx[0]); e.preventDefault() }
      return
    }
    if (this.phase === PHASE.CHAR_P2) {
      if (code === 'ArrowLeft')  { this.charSelectIdx[1] = (this.charSelectIdx[1] - 1 + CHARACTERS.length) % CHARACTERS.length; e.preventDefault() }
      if (code === 'ArrowRight') { this.charSelectIdx[1] = (this.charSelectIdx[1] + 1) % CHARACTERS.length; e.preventDefault() }
      if (code === 'Enter')      { this._confirmChar(1, this.charSelectIdx[1]); e.preventDefault() }
      if (code === 'Backspace')  { this.phase = PHASE.CHAR_P1; e.preventDefault() }
      return
    }
    if (this.phase === PHASE.SETOVER) {
      if (code === 'Space' || code === 'Enter') {
        e.preventDefault()
        if (typeof exitGame === 'function') exitGame(); else this.reset()
      }
      return
    }
    if (this.phase !== PHASE.INPUT) return

    if (P1_KEY_MAP[code] !== undefined) { this._pushAction(this.p1, P1_KEY_MAP[code]); e.preventDefault() }
    if (P2_KEY_MAP[code] !== undefined) { this._pushAction(this.p2, p2Action(P2_KEY_MAP[code])); e.preventDefault() }
    if (code === 'Backspace')     { this._undoAction(this.p1); e.preventDefault() }
    if (code === 'NumpadDecimal') { this._undoAction(this.p2); e.preventDefault() }
  }

  // ── Touch / click input ──────────────────────────────────────────────────────
  _onClick(e) {
    e.preventDefault()
    const rect   = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width  / rect.width
    const scaleY = this.canvas.height / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top)  * scaleY
    const W  = this.canvas.width
    const H  = this.canvas.height

    // Character select: tap a card
    if (this.phase === PHASE.CHAR_P1 || this.phase === PHASE.CHAR_P2) {
      const pIdx = this.phase === PHASE.CHAR_P1 ? 0 : 1
      const hit  = this._charSelectHitTest(cx, cy, W, H)
      if (hit !== null) { this.charSelectIdx[pIdx] = hit; this._confirmChar(pIdx, hit) }
      return
    }

    // Setover: tap anywhere
    if (this.phase === PHASE.SETOVER) {
      if (typeof exitGame === 'function') exitGame(); else this.reset()
      return
    }

    if (this.phase !== PHASE.INPUT) return

    const L = computeLayout(W, H, this.slots)

    // P2 strip: top, buttons are mirrored (btn 9 on left, btn 0 on right)
    if (cy >= 0 && cy < L.btnH) {
      // Mirror: tap at cx maps to button (BTN_COUNT - 1 - floor(cx/btnW))
      const btnIdx = BTN_COUNT - 1 - Math.floor(cx / L.btnW)
      if (btnIdx >= 0 && btnIdx < BTN_COUNT) this._pushAction(this.p2, p2Action(btnIdx))
      return
    }

    // P1 strip: bottom, normal order
    if (cy >= H - L.btnH && cy < H) {
      const btnIdx = Math.floor(cx / L.btnW)
      if (btnIdx >= 0 && btnIdx < BTN_COUNT) this._pushAction(this.p1, btnIdx)
      return
    }
  }

  _pushAction(fighter, actionId) {
    if (fighter.queue.length >= this.slots) return
    fighter.queue.push(actionId)
    if (fighter.queue.length === this.slots) this._lockIn(fighter)
  }

  _undoAction(fighter) {
    if (fighter.queue.length > 0) { fighter.queue.pop(); fighter.locked = false }
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────
  _updateHud() {
    if (this.hud.p1hp)   this.hud.p1hp.textContent   = `${Math.max(0, this.p1.hp)}HP`
    if (this.hud.p2hp)   this.hud.p2hp.textContent   = `${Math.max(0, this.p2.hp)}HP`
    if (this.hud.status) {
      const [w1, w2] = this.roundWins
      this.hud.status.textContent = this.matchFmt > 1
        ? `${w1} – ${w2}  (first to ${Math.ceil(this.matchFmt / 2)})`
        : ''
    }
  }

  _updateTimerDisplay() {
    if (!this.hud.timer) return
    this.hud.timer.textContent = (this.timeLeft / 1000).toFixed(1)
    this.hud.timer.style.color = this.timeLeft < 2000 ? C.p2 : C.accentHot
  }

  // ── Loop ────────────────────────────────────────────────────────────────────
  _loop(ts) {
    this._rafId = requestAnimationFrame(this._boundRAF)
    const dt = this.lastTick ? ts - this.lastTick : 0
    this.lastTick = ts

    if (this.p1.flash > 0) this.p1.flash = Math.max(0, this.p1.flash - dt)
    if (this.p2.flash > 0) this.p2.flash = Math.max(0, this.p2.flash - dt)

    if (this.phase === PHASE.INPUT) {
      this.timeLeft = Math.max(0, this.timeLeft - dt)
      this._updateTimerDisplay()
      if (this.timeLeft <= 0) { this.p1.locked = true; this.p2.locked = true; this._beginResolve() }
    }
    if (this.phase === PHASE.RESOLVE) {
      this.resolveTimer -= dt
      if (this.resolveTimer <= 0) { this.resolveTimer = this.RESOLVE_STEP_MS; this._resolveStep() }
    }
    if (this.phase === PHASE.BETWEEN) {
      this.betweenTimer -= dt
      if (this.betweenTimer <= 0) this._startSequence()
    }
    if (this.phase === PHASE.DEAD) {
      this.deadTimer -= dt
      if (this.deadTimer <= 0) this._nextMatch()
    }

    this._render()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  _render() {
    const { canvas, ctx } = this
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, H)

    if (this.phase === PHASE.CHAR_P1 || this.phase === PHASE.CHAR_P2) {
      this._drawCharSelect(W, H); return
    }

    const L = computeLayout(W, H, this.slots)
    this._drawButtonStrip(L, this.p2, true)
    this._drawButtonStrip(L, this.p1, false)
    this._drawQueue(L, this.p2, L.p2QueueY, true)
    this._drawHud(L, this.p2, L.p2HudY, true)
    this._drawArena(L)
    this._drawFighters(L)
    this._drawHud(L, this.p1, L.p1HudY, false)
    this._drawQueue(L, this.p1, L.p1QueueY, false)
    this._drawLog(L)
    this._drawPhaseUI(L)
  }

  // ── Button strip ─────────────────────────────────────────────────────────────
  _drawButtonStrip(L, fighter, isP2) {
    const { ctx }        = this
    const { W, H, btnH, btnW } = L
    const y              = isP2 ? 0 : H - btnH
    const col            = fighter.colour
    const isInput        = this.phase === PHASE.INPUT

    ctx.save()
    if (isP2) {
      // Rotate 180° around strip centre so P2 reads it right-side up from their end
      ctx.translate(W / 2, y + btnH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + btnH / 2))
    }

    for (let i = 0; i < BTN_COUNT; i++) {
      // For P2 (after rotation), visual left = btn 9, visual right = btn 0
      // But we draw in normal order 0→9; the ctx rotation handles the flip
      const x      = i * btnW
      const isUlt  = i === 9
      const ultRdy = fighter.ult >= 100

      // Background
      ctx.fillStyle = (isUlt && ultRdy && isInput) ? C.ult + '22' : C.surface
      ctx.fillRect(x, y, btnW, btnH)

      // Border
      ctx.strokeStyle = isUlt && ultRdy ? C.ult : (isInput ? col + '55' : C.border)
      ctx.lineWidth   = 1
      ctx.strokeRect(x + 0.5, y + 0.5, btnW - 1, btnH - 1)

      // Colour strip along bottom of button (which faces arena after flip)
      ctx.fillStyle = isInput ? col : C.muted + '33'
      ctx.fillRect(x, y + btnH - 3, btnW, 3)

      // Number (small, top of button = away from arena)
      ctx.fillStyle    = isInput ? col + '77' : C.muted + '33'
      ctx.font         = `${Math.max(7, btnW * 0.15)}px 'Courier New', monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(i, x + btnW / 2, y + 3)

      // Label
      const labelCol = !isInput        ? C.muted + '44'
                     : isUlt && ultRdy ? C.ult
                     : col
      ctx.fillStyle    = labelCol
      ctx.font         = `bold ${Math.max(7, Math.min(btnW * 0.2, 10))}px 'Courier New', monospace`
      ctx.textBaseline = 'middle'
      ctx.fillText(BTN_LABEL[i], x + btnW / 2, y + btnH * 0.62)
    }

    // Player label at far left (which is far right from P2's view after rotation)
    ctx.fillStyle    = col
    ctx.font         = `bold ${Math.max(8, btnH * 0.2)}px 'Courier New', monospace`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${fighter.id}`, 4, y + btnH / 2)

    ctx.restore()
  }

  // ── HUD strip ────────────────────────────────────────────────────────────────
  _drawHud(L, fighter, y, flipped) {
    const { ctx }   = this
    const { W, hudH } = L
    const col       = fighter.colour
    const opp       = fighter.id === 1 ? this.p2 : this.p1

    ctx.save()
    if (flipped) {
      ctx.translate(W / 2, y + hudH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + hudH / 2))
    }

    // Background strip
    ctx.fillStyle = C.surface + 'cc'
    ctx.fillRect(0, y, W, hudH)
    ctx.strokeStyle = C.border
    ctx.lineWidth   = 1
    ctx.strokeRect(0, y, W, hudH)

    const mid = y + hudH / 2
    ctx.textBaseline = 'middle'
    ctx.font         = `bold ${Math.max(8, hudH * 0.52)}px 'Courier New', monospace`

    // P label + name
    ctx.fillStyle = col
    ctx.textAlign = 'left'
    ctx.fillText(`P${fighter.id}: ${fighter.name}`, 8, mid)

    // HP bar (centre-left)
    const barW = W * 0.22, barH = Math.max(4, hudH * 0.35)
    const barX = W * 0.32, barY = y + (hudH - barH) / 2
    ctx.fillStyle = C.surface2; ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = fighter.hp > MAX_HP * 0.4 ? col : C.dmg
    ctx.fillRect(barX, barY, barW * Math.max(0, fighter.hp / MAX_HP), barH)
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barW, barH)

    // HP text
    ctx.fillStyle = col
    ctx.font      = `bold ${Math.max(7, hudH * 0.45)}px 'Courier New', monospace`
    ctx.textAlign = 'left'
    ctx.fillText(`${Math.max(0, fighter.hp)}HP`, barX + barW + 5, mid)

    // Ult meter (centre-right)
    const ultW = W * 0.16, ultH = Math.max(4, hudH * 0.35)
    const ultX = W * 0.62, ultY = y + (hudH - ultH) / 2
    const ultRdy = fighter.ult >= 100
    ctx.fillStyle = C.surface2; ctx.fillRect(ultX, ultY, ultW, ultH)
    ctx.fillStyle = ultRdy ? C.ult : col + '88'
    ctx.fillRect(ultX, ultY, ultW * (fighter.ult / 100), ultH)
    ctx.strokeStyle = ultRdy ? C.ult : C.border; ctx.lineWidth = 1
    ctx.strokeRect(ultX, ultY, ultW, ultH)

    ctx.fillStyle = ultRdy ? C.ult : C.muted
    ctx.font      = `${Math.max(6, hudH * 0.38)}px 'Courier New', monospace`
    ctx.textAlign = 'left'
    ctx.fillText(ultRdy ? 'ULT!' : `ULT ${Math.floor(fighter.ult)}%`, ultX + ultW + 5, mid)

    // Timer (far right) — only show on the P1 HUD (non-flipped) once, to avoid duplication
    if (!flipped && this.phase === PHASE.INPUT) {
      ctx.fillStyle = this.timeLeft < 2000 ? C.dmg : C.accentHot
      ctx.font      = `bold ${Math.max(9, hudH * 0.55)}px 'Courier New', monospace`
      ctx.textAlign = 'right'
      ctx.fillText((this.timeLeft / 1000).toFixed(1), W - 8, mid)
    }
    if (flipped && this.phase === PHASE.INPUT) {
      ctx.fillStyle = this.timeLeft < 2000 ? C.dmg : C.accentHot
      ctx.font      = `bold ${Math.max(9, hudH * 0.55)}px 'Courier New', monospace`
      ctx.textAlign = 'right'
      ctx.fillText((this.timeLeft / 1000).toFixed(1), W - 8, mid)
    }

    // Match score if Bo3/5
    if (this.matchFmt > 1) {
      const [w1, w2] = this.roundWins
      const score    = `${w1}–${w2}`
      ctx.fillStyle  = C.muted
      ctx.font       = `${Math.max(6, hudH * 0.38)}px 'Courier New', monospace`
      ctx.textAlign  = 'right'
      ctx.fillText(score, W - (this.phase === PHASE.INPUT ? 38 : 8), mid)
    }

    ctx.restore()
  }

  // ── Queue strip ──────────────────────────────────────────────────────────────
  _drawQueue(L, fighter, y, flipped) {
    const { ctx }                           = this
    const { W, slotSz, slotGap, queueStartX } = L
    const col                               = fighter.colour
    const isResolving = this.phase === PHASE.RESOLVE || this.phase === PHASE.BETWEEN
      || this.phase === PHASE.DEAD || this.phase === PHASE.SETOVER
    const activeIdx = this.resolveIdx - 1

    ctx.save()
    if (flipped) {
      ctx.translate(W / 2, y + slotSz / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + slotSz / 2))
    }

    for (let i = 0; i < this.slots; i++) {
      const x      = queueStartX + i * (slotSz + slotGap)
      const action = fighter.queue[i]
      const filled = action !== undefined
      const isActive = isResolving && i === activeIdx
      const isPast   = isResolving && i < activeIdx

      let boxCol = C.surface2, lineCol = C.border, lineW = 1
      if (isActive)                    { boxCol = col + '2a'; lineCol = col; lineW = 2 }
      else if (isPast)                 { boxCol = col + '10'; lineCol = col + '33' }
      else if (filled && !isResolving) { boxCol = col + '14'; lineCol = col + '55' }

      ctx.fillStyle = boxCol; ctx.fillRect(x, y, slotSz, slotSz)
      ctx.strokeStyle = lineCol; ctx.lineWidth = lineW
      ctx.strokeRect(x, y, slotSz, slotSz)

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'

      if (!filled) {
        ctx.fillStyle = C.muted + '33'
        ctx.font      = `${slotSz * 0.3}px 'Courier New', monospace`
        ctx.fillText(i + 1, x + slotSz / 2, y + slotSz / 2)
      } else if (!isResolving) {
        // Hidden — dot only
        ctx.fillStyle = col + 'cc'
        ctx.beginPath()
        ctx.arc(x + slotSz / 2, y + slotSz / 2, slotSz * 0.15, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const alpha = isActive ? 'ff' : (isPast ? '55' : 'aa')
        ctx.fillStyle = col + alpha
        ctx.font = `bold ${Math.max(6, slotSz * 0.2)}px 'Courier New', monospace`
        ctx.fillText(ACTION_NAME[action] ?? '?', x + slotSz / 2, y + slotSz / 2)
      }
    }

    // Locked badge
    if (fighter.locked && this.phase === PHASE.INPUT) {
      const endX = queueStartX + this.slots * (slotSz + slotGap)
      ctx.fillStyle = col + '77'; ctx.font = `7px 'Courier New', monospace`
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('LOCKED', endX + 4, y + slotSz / 2)
    }

    ctx.restore()
  }

  // ── Arena ────────────────────────────────────────────────────────────────────
  _drawArena(L) {
    const { ctx }            = this
    const { W, arenaY, arenaH, tileW } = L
    const centre             = Math.floor(TILE_COUNT / 2)

    for (let i = 0; i < TILE_COUNT; i++) {
      const x  = i * tileW
      let   bg = i % 2 === 0 ? C.tile : C.tileAlt
      if (i === centre) bg = C.tileCentre
      ctx.fillStyle   = bg
      ctx.fillRect(x, arenaY, tileW, arenaH)
      ctx.strokeStyle = C.border; ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, arenaY + 0.5, tileW - 1, arenaH - 1)
      if (i === centre) {
        ctx.fillStyle = C.muted + '44'
        ctx.fillRect(x + tileW / 2 - 1, arenaY, 2, arenaH)
      }
      ctx.fillStyle = C.muted + '44'
      ctx.font = `${Math.max(7, tileW * 0.15)}px 'Courier New', monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillText(i, x + tileW / 2, arenaY + arenaH - 3)
    }
  }

  // ── Fighters ─────────────────────────────────────────────────────────────────
  _drawFighters(L) {
    const { ctx }            = this
    const { W, arenaY, arenaH, tileW } = L

    const draw = (f) => {
      const col    = f.colour
      const cx     = f.tile * tileW + tileW / 2
      const cy     = arenaY + arenaH * 0.45
      const size   = Math.min(tileW * 0.6, arenaH * 0.55)
      const flashA = f.flash > 0 ? Math.min(1, f.flash / 180) : 0
      const half   = size / 2

      ctx.save()
      ctx.translate(cx, cy)

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.4)
      g.addColorStop(0, col + '28'); g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(0, 0, size * 1.4, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle   = flashA > 0 ? `rgba(220,90,90,${flashA * 0.7})` : col + '1a'
      ctx.fillRect(-half, -half, size, size)
      ctx.strokeStyle = flashA > 0 ? `rgba(255,140,140,${0.5 + flashA * 0.5})` : col
      ctx.lineWidth   = 2; ctx.strokeRect(-half, -half, size, size)

      ctx.fillStyle = flashA > 0 ? `rgba(255,160,160,${0.6 + flashA * 0.4})` : col
      ctx.font = `${size * 0.48}px Arial`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(f.facingRight ? '▶' : '◀', 0, 0)

      if (f.blocking) {
        ctx.strokeStyle = '#99ccff'; ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.strokeRect(-half - 4, -half - 4, size + 8, size + 8)
        ctx.setLineDash([])
      }

      // Status badges
      let badgeY = half + 4
      const badge = (text, c) => {
        ctx.fillStyle = c; ctx.font = `7px 'Courier New', monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(text, 0, badgeY); badgeY += 9
      }
      if (f.stunned    > 0) badge(`STUN ${f.stunned}`, '#ddcc44')
      if (f.poisoned   > 0) badge(`PSND ${f.poisoned}`, '#88dd66')
      if (f.restrained > 0) badge(`REST ${f.restrained}`, '#cc88ee')

      ctx.restore()
    }

    draw(this.p1); draw(this.p2)
  }

  // ── Log ──────────────────────────────────────────────────────────────────────
  _drawLog(L) {
    if (!this.log.length) return
    const { ctx }            = this
    const { W, arenaY, arenaH } = L
    const recent = this.log.slice(-3)
    const lineH  = 11
    const startY = arenaY + arenaH * 0.72
    ctx.font = `8px 'Courier New', monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    recent.forEach((entry, i) => {
      ctx.fillStyle = `rgba(192,200,216,${0.2 + 0.8 * ((i + 1) / recent.length)})`
      ctx.fillText(entry, W / 2, startY + i * lineH)
    })
  }

  // ── Phase UI ─────────────────────────────────────────────────────────────────
  _drawPhaseUI(L) {
    const { ctx }   = this
    const { W, H, arenaY } = L

    // Timer progress bar above arena
    if (this.phase === PHASE.INPUT) {
      const pct = this.timeLeft / (this.timerS * 1000)
      ctx.fillStyle = C.border; ctx.fillRect(0, arenaY - 3, W, 2)
      ctx.fillStyle = pct > 0.4 ? C.p1 : C.dmg
      ctx.fillRect(0, arenaY - 3, W * pct, 2)
    }

    if (this.phase === PHASE.BETWEEN) {
      const pct = this.betweenTimer / this.BETWEEN_MS
      ctx.fillStyle = C.muted + '44'; ctx.fillRect(0, arenaY - 3, W * pct, 2)
    }

    if (this.phase === PHASE.DEAD || this.phase === PHASE.SETOVER) {
      ctx.fillStyle = 'rgba(13,13,15,0.86)'
      ctx.fillRect(0, 0, W, H)

      let line1, line2 = ''
      const [w1, w2] = this.roundWins
      if (this.phase === PHASE.SETOVER) {
        line1 = w1 > w2 ? `${this.p1.name} WINS`
               : w2 > w1 ? `${this.p2.name} WINS` : 'DRAW'
        if (this.matchFmt > 1) line2 = `${w1}  —  ${w2}`
      } else {
        const winner = this.p1.hp <= 0 && this.p2.hp > 0 ? this.p2.name
                     : this.p2.hp <= 0 && this.p1.hp > 0 ? this.p1.name : null
        line1 = winner ? `${winner} WINS` : 'DOUBLE KO'
        if (this.matchFmt > 1) line2 = `${w1} – ${w2}`
      }

      ctx.fillStyle = C.accentHot
      ctx.font = `bold ${Math.min(W * 0.07, 38)}px 'Arial Narrow', Arial, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(line1, W / 2, H / 2 - (line2 ? 20 : 8))

      if (line2) {
        ctx.fillStyle = C.muted; ctx.font = `14px 'Courier New', monospace`
        ctx.fillText(line2, W / 2, H / 2 + 12)
      }

      if (this.phase === PHASE.SETOVER) {
        ctx.fillStyle = C.muted + 'aa'; ctx.font = `10px 'Courier New', monospace`
        ctx.fillText('TAP  /  SPACE — main menu', W / 2, H / 2 + (line2 ? 46 : 30))
      }
      ctx.textBaseline = 'alphabetic'
    }
  }

  // ── Character select ─────────────────────────────────────────────────────────
  _charSelectHitTest(cx, cy, W, H) {
    const COLS  = 3
    const pad   = W * 0.05
    const gap   = 8
    const cellW = (W - pad * 2 - gap * (COLS - 1)) / COLS
    const cellH = Math.min(cellW * 0.68, 80)
    const gridY = H * 0.22
    for (let i = 0; i < CHARACTERS.length; i++) {
      const x = pad + (i % COLS) * (cellW + gap)
      const y = gridY + Math.floor(i / COLS) * (cellH + gap)
      if (cx >= x && cx <= x + cellW && cy >= y && cy <= y + cellH) return i
    }
    return null
  }

  _drawCharSelect(W, H) {
    const { ctx } = this
    const isP1   = this.phase === PHASE.CHAR_P1
    const pIdx   = isP1 ? 0 : 1
    const selIdx = this.charSelectIdx[pIdx]
    const pCol   = isP1 ? C.p1 : C.p2
    const navHint = isP1
      ? '← / →  or TAP  to select'
      : '← / →  or TAP  to select    BACKSPACE  back'

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = C.accentHot
    ctx.font = `bold ${Math.min(W * 0.055, 26)}px 'Arial Narrow', Arial, sans-serif`
    ctx.fillText("CLOCK'S OUT", W / 2, H * 0.09)

    ctx.fillStyle = pCol
    ctx.font = `bold ${Math.min(W * 0.033, 14)}px 'Courier New', monospace`
    ctx.fillText(`P${pIdx + 1} — CHOOSE YOUR FIGHTER`, W / 2, H * 0.16)

    const COLS  = 3
    const pad   = W * 0.05
    const gap   = 8
    const cellW = (W - pad * 2 - gap * (COLS - 1)) / COLS
    const cellH = Math.min(cellW * 0.68, 80)
    const gridY = H * 0.22

    CHARACTERS.forEach((char, i) => {
      const col  = i % COLS
      const row  = Math.floor(i / COLS)
      const x    = pad + col * (cellW + gap)
      const y    = gridY + row * (cellH + gap)
      const isSel = i === selIdx

      ctx.fillStyle   = isSel ? char.colour + '22' : C.surface
      ctx.fillRect(x, y, cellW, cellH)
      ctx.strokeStyle = isSel ? pCol : C.border
      ctx.lineWidth   = isSel ? 2 : 1
      ctx.strokeRect(x, y, cellW, cellH)

      ctx.fillStyle = char.colour; ctx.fillRect(x, y, 4, cellH)

      const sw = Math.min(cellH * 0.48, cellW * 0.26)
      const sx = x + 12, sy = y + (cellH - sw) / 2
      ctx.fillStyle   = char.colour + '18'; ctx.fillRect(sx, sy, sw, sw)
      ctx.strokeStyle = char.colour + (isSel ? 'cc' : '55'); ctx.lineWidth = 1
      ctx.strokeRect(sx, sy, sw, sw)

      const tx = sx + sw + 8
      ctx.fillStyle = isSel ? char.colour : C.accent
      ctx.font = `bold ${Math.min(cellH * 0.2, 13)}px 'Arial Narrow', Arial, sans-serif`
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(char.name, tx, y + cellH * 0.16)

      ctx.fillStyle = C.muted
      ctx.font = `${Math.min(cellH * 0.14, 10)}px 'Courier New', monospace`
      const maxDW = cellW - (tx - x) - 6
      let desc = char.desc
      while (desc.length > 1 && ctx.measureText(desc).width > maxDW) desc = desc.slice(0, -1)
      if (desc.length < char.desc.length) desc = desc.slice(0, -1) + '…'
      ctx.fillText(desc, tx, y + cellH * 0.46)

      if (isSel) {
        ctx.fillStyle = pCol; ctx.font = `bold 8px 'Courier New', monospace`
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
        ctx.fillText('▶ SELECT', x + cellW - 4, y + cellH - 4)
      }
    })

    const ROWS  = Math.ceil(CHARACTERS.length / COLS)
    const prevY = gridY + ROWS * (cellH + gap) + 10
    const sel   = CHARACTERS[selIdx]
    ctx.fillStyle = sel.colour
    ctx.font = `bold ${Math.min(W * 0.042, 18)}px 'Arial Narrow', Arial, sans-serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillText(sel.name, W / 2, prevY + 16)
    ctx.fillStyle = C.muted; ctx.font = `10px 'Courier New', monospace`
    ctx.fillText(sel.desc, W / 2, prevY + 30)

    ctx.fillStyle = C.muted + '88'; ctx.font = `9px 'Courier New', monospace`
    ctx.fillText(navHint, W / 2, H - 10)

    if (!isP1 && this.p1.charDef) {
      ctx.fillStyle = C.p1; ctx.textAlign = 'left'
      ctx.fillText(`P1: ${this.p1.charDef.name}`, 10, H - 10)
    }
  }
}