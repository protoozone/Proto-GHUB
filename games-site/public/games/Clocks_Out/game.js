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
  WAIT:       0,
  JAB:        1,
  LEFT:       2,
  RIGHT:      3,
  BLOCK:      4,
  SP_ATK:     5,
  CON_ATK:    6,
  ENGAGE:     7,
  RECOVER:    8,
  ULT:        9,
  // Virtual actions (game-inserted, not player-selectable)
  CHARGE:     10,   // Takashi unique atk part 1
  HEAVY:      11,   // Takashi unique atk part 2 (2 dmg)
  FORCED_WAIT:12,   // Takashi parry penalty / carry-over
  REDEPLOY:   13,   // Andile warp passive — slot 1 of queue break
  TELEPORT:   14,   // Estelle ENGAGE part 2 — teleport away from enemy
}

const BTN_LABEL   = ['WAIT','JAB','LEFT','RIGHT','BLOCK','SP.ATK','CON.ATK','ENGAGE','RECOVER','ULT']
const ACTION_NAME  = ['WAIT','JAB','LEFT','RIGHT','BLOCK','SP.ATK','CON.ATK','ENGAGE','RECOVER','ULT',
                      'CHARGE','HEAVY','WAIT','REDEPLOY','TELEPORT']  // indices 10-14

// Action classes — used for resolution ordering and DEFEND precheck logic
const ACLASS = {
  NULL:    'NULL',      // WAIT, CHARGE, FORCED_WAIT
  MOVE:    'MOVE',      // LEFT, RIGHT, ENGAGE
  ATTACK:  'ATTACK',    // JAB, HEAVY
  DEFEND:  'DEFEND',    // BLOCK, PARRY (CON_ATK)
  RECOVER: 'RECOVER',   // RECOVER, ULT
  PUSH:    'PUSH',
  PASSIVE: 'PASSIVE',
}

function actionClass(action, charId) {
  switch (action) {
    case ACTION.WAIT:       return ACLASS.NULL
    case ACTION.CHARGE:     return ACLASS.NULL
    case ACTION.FORCED_WAIT:return ACLASS.NULL
    case ACTION.LEFT:       return ACLASS.MOVE
    case ACTION.RIGHT:      return ACLASS.MOVE
    case ACTION.JAB:        return ACLASS.ATTACK
    case ACTION.HEAVY:      return ACLASS.ATTACK
    case ACTION.BLOCK:      return ACLASS.DEFEND
    // Character-specific
    case ACTION.SP_ATK:
      if (charId === 'takashi') return ACLASS.NULL   // CHARGE step
      if (charId === 'lia')     return ACLASS.ATTACK // DEBUFF (parryable)
      if (charId === 'andile')  return ACLASS.NULL   // STATIC mark
      if (charId === 'estelle') return ACLASS.ATTACK // NECROTIC BOLT
      return ACLASS.ATTACK
    case ACTION.CON_ATK:
      if (charId === 'takashi') return ACLASS.DEFEND  // PARRY
      if (charId === 'lia')     return ACLASS.ATTACK  // CHAIN
      if (charId === 'andile')  return ACLASS.NULL    // IGNITE (not an attack)
      if (charId === 'estelle') return ACLASS.NULL    // SIPHON
      return ACLASS.ATTACK
    case ACTION.ENGAGE:
      if (charId === 'takashi') return ACLASS.MOVE    // DASH
      if (charId === 'lia')     return ACLASS.ATTACK  // PULL (parryable)
      if (charId === 'andile')  return ACLASS.MOVE    // WARP
      if (charId === 'estelle') return ACLASS.NULL    // FADE (forced wait, part 1)
      return ACLASS.MOVE
    case ACTION.RECOVER:
      if (charId === 'andile')  return ACLASS.MOVE    // BLINK teleport
      if (charId === 'estelle') return ACLASS.NULL    // DRAIN reserve heal
      return ACLASS.RECOVER
    case ACTION.ULT:        return ACLASS.RECOVER
    case ACTION.REDEPLOY:   return ACLASS.MOVE   // Andile warp — non-parryable teleport
    case ACTION.TELEPORT:   return ACLASS.MOVE   // Estelle ENGAGE part 2
    default:                return ACLASS.NULL
  }
}

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
  CHAR_P1:     'char_p1',
  CHAR_P2:     'char_p2',
  INPUT:       'input',
  RESOLVE:     'resolve',
  BETWEEN:     'between',
  WARP_SELECT: 'warp_select',  // Andile passive: both reinput remaining slots, Andile picks deploy tile
  DEAD:        'dead',
  SETOVER:     'setover',
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
    desc: 'Street Fighter: Self Healing High Damage.',
    abilityNames: { 5:'CHARGE', 6:'PARRY', 7:'DASH', 8:'CLEANSE' },
    ultName: 'FURY',
    info: [
      'PASSIVE Fighting Spirit: Heals 1hp/8acts.',
      'SP.ATK (5) Focus Strike: Fills 2 acts: act 1 charge [NULL], act 2 heavy 1t/2dmg. [ATK]',
      'CON.ATK (6) Counter: If enemy would [ATK] this act, deal 1dmg and take no dmg from this attack. If the enemy would not [ATK], flinch next act [NULL]. [NULL]',
      'ENGAGE (7) Quickstep: Moves 2 tiles in direction of opponent. [MOVE]',
      'RECOVER (8) Clear the Mind: Remove all status effects. If no status, gain 5% ult charge. [RECOV]',
      'ULT (9) Fighting Fury: Enter FURY for 4 actions. x2 all damage dealt. [NULL]',
    ],
    onSequenceStart(fighter, game) {
      // Nothing to do at sequence start
    },
    onResolveStep(fighter, action, opponent, game) {
      // Passive: heal 1HP every 8 actions (fires after actionCount increments)
      if (fighter.roundActionCount > 0 && fighter.roundActionCount % 6 === 0) {
        fighter.hp = Math.min(MAX_HP, fighter.hp + 1)
      }
      // RECOVER / CLEANSE — called via _applyRecover
      if (action === ACTION.RECOVER) {
        const hasStatus = fighter.stunned > 0 || fighter.poisoned > 0 || fighter.restrained > 0
        if (hasStatus) {
          fighter.stunned = 0; fighter.poisoned = 0; fighter.restrained = 0
        } else {
          fighter.chargeUlt(5)
        }
      }
      // CHARGE, HEAVY, PARRY, DASH, FURY — all handled by the engine
    },
    onUlt(fighter, opponent, game) {
      // Enter FURY for 4 actions
      fighter.fury = 4
      fighter.ult  = 0  // reset immediately; chargeUlt will be locked by fury
    },
  },
  {
    id: 'lia',
    name: 'LIA', // RASSI
    colour: '#c45c8a',
    desc: 'Chain Fighter: Distance Closer Tactical.',
    abilityNames: { 5:'DEBUFF', 6:'CHAIN', 7:'PULL', 8:'VAMP' },
    ultName: 'BIND',
    info: [
      'PASSIVE Master of Movement: If enemy moves within 1t of Lia, 1 unblockable damage.',
      'SP.ATK (5) Trip: 4t range. If enemy would [MOVE], cause next act to be stunned [NULL]. [ATK]',
      'CON.ATK (6) Envenomate: 1t. If enemy would not [MOVE], poison for 3 turns. [NULL]',
      'ENGAGE (7) Drag: 4t. Pull enemy towards 1t. Counts as enemy movement. [ATK]',
      'RECOVER (8) Neotech Drain: If the enemy is poisoned, heal 2HP. [RECOV]',
      'ULT (9) Ensnare: 2t. 2dmg, stun 2. [ATK]',
    ],
    onSequenceStart() {},
    onResolveStep(fighter, action, opponent, game) {
      if (action === ACTION.RECOVER) {
        // VAMP: heal 2hp if opponent is poisoned
        if (opponent.poisoned > 0) {
          fighter.hp = Math.min(MAX_HP, fighter.hp + 2)
        }
      }
    },
    onUlt(fighter, opponent, game) {
      // BIND: 2 tile range, 2 damage + stun 2 slots
      if (Math.abs(fighter.tile - opponent.tile) <= 2) {
        // Damage (blockable, no fury since Lia has no fury)
        const dmg = Math.max(0, 2 - (opponent.blocking ? 1 : 0))
        opponent.hp        -= dmg
        opponent.lastDamage += dmg
        if (dmg > 0) fighter.chargeUlt(5)
        // Stun 2 slots: current slot (resolveIdx) and next
        game._forceSlot(opponent, ACTION.FORCED_WAIT)
        // Second stun slot: one beyond the first
        const idx2 = game.resolveIdx + 1
        if (idx2 < game.slots) {
          opponent.queue[idx2] = ACTION.FORCED_WAIT
        } else {
          // Overflow: append to nextQueuePrefix
          if (!opponent.nextQueuePrefix.includes(ACTION.FORCED_WAIT)) {
            opponent.nextQueuePrefix.push(ACTION.FORCED_WAIT)
          }
        }
      }
    },
  },
  {
    id: 'andile',
    name: 'ANDILE', // KASONGO
    colour: '#4ab8c4',
    desc: 'Future Fighter: Teleporter Stunner.',
    abilityNames: { 5:'STATIC', 6:'IGNITE', 7:'WARP', 8:'BLINK' },
    ultName: 'ELECTRIFY',
    info: [
      'PASSIVE Charged: Jab applies static mark on contact.',
      'SP.ATK (5) Spark Arc: 2t. Applies static mark. [NULL]',
      'CON.ATK (6) Lightning Blast: 2t. Consumes static mark to deal 1 damage and 1 stun. [NULL]',
      'ENGAGE (7) Warp: Teleport within 1t of enemy (bias towards centre). [MOVE]',
      'RECOVER (8) Return: Teleport to centre (or 3/5 if occupied). Heal 1HP if not within 1t of enemy. [RECOV]',
      'ULT (9) Ignite: For 4 actions, Jab deals +1 damage. Any ATK within 1t deals 1dmg to enemy and applies static mark. [NULL]',
    ],
    onSequenceStart() {},
    onResolveStep(fighter, action, opponent, game) {
      // BLINK hp restore: if not adjacent to opponent after teleport
      if (action === ACTION.RECOVER) {
        if (Math.abs(fighter.tile - opponent.tile) > 1) {
          fighter.hp = Math.min(MAX_HP, fighter.hp + 1)
        }
      }
    },
    onUlt(fighter, opponent, game) {
      fighter.electrify = 4
      fighter.ult = 0
    },
  },
  {
    id: 'estelle',
    name: 'ESTELLE', // ORLOV
    colour: '#a07ad4',
    desc: 'Necromancer: HP Drain Punisher.',
    abilityNames: { 5:'BOLT', 6:'SIPHON', 7:'FADE', 8:'DRAIN' },
    ultName: 'REAP',
    info: [
      'PASSIVE Spirit Leech: Every 6 actions, drains 1hp from enemy (unblockable). Builds heal reserve.',
      'SP.ATK (5) Dark Bolt: Exactly 2t range. Deals 1 damage. [ATK]',
      'CON.ATK (6) Drain: 1t. If enemy not moving, steal 1hp from them. [NULL]',
      'ENGAGE (7) Crow Cowl: Fills 2 acts: act 1 charge [NULL], act 2 teleport 3t away from enemy [MOVE].',
      'RECOVER (8) Siphon Arts: Spend 1 from heal reserve to heal 1hp. Does nothing if reserve empty. [NULL]',
      'ULT (9) Trueform Summoning: 2t range. 2 damage, push enemy 2 tiles away. +1 damage if they hit a wall. [NULL]',
    ],
    onSequenceStart(fighter, game) {},
    onResolveStep(fighter, action, opponent, game) {
      // Passive: drain 1hp every 6 round-actions (unblockable)
      fighter.roundActionCount++
      if (fighter.roundActionCount % 6 === 0) {
        if (!opponent.warping) {
          opponent.hp        -= 1
          opponent.lastDamage += 1
          fighter.drainedHp  += 1
          fighter.healReserve += 1
          fighter.chargeUlt(5)
        }
      }
      // SIPHON: handled in _applyNullAbility
      // DRAIN: heal 1 from reserve
      if (action === ACTION.RECOVER) {
        if (fighter.healReserve > 0) {
          fighter.healReserve--
          fighter.hp = Math.min(MAX_HP, fighter.hp + 1)
        }
      }
    },
    onUlt(fighter, opponent, game) {
      // REAP: 2t range, 2 damage, push 2 tiles away, +1 if wall
      if (Math.abs(fighter.tile - opponent.tile) > 2) return
      const dmg = Math.max(0, 2 - (opponent.blocking ? 1 : 0))
      opponent.hp        -= dmg
      opponent.lastDamage += dmg
      if (dmg > 0) fighter.chargeUlt(5)
      // Push 2 tiles away from Estelle
      const dir  = opponent.tile >= fighter.tile ? 1 : -1
      const dest = Math.max(0, Math.min(TILE_COUNT - 1, opponent.tile + dir * 2))
      const hitWall = dest === 0 || dest === TILE_COUNT - 1
      const travelled = Math.abs(dest - opponent.tile)
      opponent.tile = dest
      if (hitWall && travelled < 2) {
        // Hit a wall before travelling full distance — bonus damage
        opponent.hp        -= 1
        opponent.lastDamage += 1
        fighter.chargeUlt(5)
      }
    },
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
    this.stunned          = 0
    this.poisoned         = 0
    this.restrained       = 0
    this.fury             = 0   // actions remaining in fury (Takashi ult)
    this.nextQueuePrefix  = []  // actions prepended to next queue (carry-over)
    this.parrying         = false  // DEFEND precheck state
    this.movedThisStep    = false  // set true if fighter moved this resolve step
    this.staticMarked     = false  // Andile: marked for ignite
    this.electrify        = 0     // Andile ult: actions remaining
    this.warpUsed         = false // Andile passive: once per match
    this.warping          = false // Andile: untargetable this step
    this.redeployTile     = null  // Andile warp: chosen tile (null = not yet set)
    this.drainedHp        = 0    // Estelle: total hp drained by passive this round
    this.healReserve      = 0    // Estelle: hp banked for RECOVER use
    this.roundActionCount = 0    // Estelle passive: resets each round
  }

  get colour() { return this.charDef?.colour ?? (this.id === 1 ? C.p1 : C.p2) }
  get name()   { return this.charDef?.name   ?? `P${this.id}` }

  fullReset() {
    this.tile             = this.id === 1 ? P1_START : P2_START
    this.hp               = MAX_HP
    this.facingRight      = this.id === 1
    this.queue            = []
    this.locked           = false
    this.blocking         = false
    this.lastDamage       = 0
    this.flash            = 0
    this.stunned          = 0
    this.poisoned         = 0
    this.restrained       = 0
    this.fury             = 0
    this.nextQueuePrefix  = []
    this.parrying         = false
    this.movedThisStep    = false
    this.staticMarked     = false
    this.electrify        = 0
    this.warpUsed         = false
    this.warping          = false
    this.redeployTile     = null
    this.drainedHp        = 0
    this.healReserve      = 0
    this.roundActionCount = 0
    // ult persists
  }

  clearSequence() {
    this.queue      = []
    this.locked     = false
    this.blocking   = false
    this.lastDamage = 0
  }

  chargeUlt(pct) {
    if (this.fury > 0) return  // fury locks ult at 0
    this.ult = Math.min(100, this.ult + pct)
  }
}

// ── Layout helper ─────────────────────────────────────────────────────────────
function computeLayout(W, H, slots) {
  const mobile  = W < 600
  const btnRows = mobile ? 2 : 1
  const btnH    = mobile
    ? Math.max(64, Math.min(H * 0.2, 100))
    : Math.max(48, Math.min(H * 0.17, 76))
  const btnRowH = btnH / btnRows
  const btnW    = mobile ? W / 5 : W / BTN_COUNT
  const undoH   = Math.max(18, Math.min(H * 0.04, 28))
  const space   = Math.max(6, H * 0.02)
  const timerH  = Math.max(14, H * 0.03)
  const hudH    = Math.max(20, H * 0.045)
  const pad     = 3

  const slotSz  = Math.max(20, Math.min((W * 0.72) / slots - 6, Math.min(H * 0.06, 40)))
  const slotGap = 5
  const queueW  = slots * (slotSz + slotGap) - slotGap
  const queueH  = slotSz
  const tileW   = W / TILE_COUNT

  // Each end: btnH + undoH + space
  const endH  = btnH + undoH + space
  const midH  = H - endH * 2
  const fixedMid = (timerH + pad + queueH + pad + hudH + pad) * 2
  const arenaH = Math.max(tileW * 0.7, Math.min(tileW * 1.1, midH - fixedMid))
  const totalMid = timerH + pad + queueH + pad + hudH + pad + arenaH + pad + hudH + pad + queueH + pad + timerH
  const midStartY = endH + Math.max(0, (midH - totalMid) / 2)

  // P2 zones (top)
  const p2BtnY  = 0
  const p2UndoY = btnH           // undo bar just below P2 buttons

  // Middle zones
  let y = midStartY
  const p2TimerY = y;  y += timerH + pad
  const p2QueueY = y;  y += queueH + pad
  const p2HudY   = y;  y += hudH   + pad
  const arenaY   = y;  y += arenaH + pad
  const p1HudY   = y;  y += hudH   + pad
  const p1QueueY = y;  y += queueH + pad
  const p1TimerY = y

  // P1 zones (bottom)
  const p1UndoY = H - btnH - undoH
  const p1BtnY  = H - btnH

  return {
    W, H,
    mobile, btnRows, btnH, btnRowH, btnW, undoH, space,
    timerH, hudH, pad,
    slotSz, slotGap, queueW, queueH,
    arenaH, arenaY, tileW,
    p2BtnY, p2UndoY,
    p2TimerY, p2QueueY, p2HudY,
    p1HudY, p1QueueY, p1TimerY,
    p1UndoY, p1BtnY,
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
    this.charInfoOpen  = false

    this.phase        = PHASE.CHAR_P1
    this.timeLeft     = 0
    this.lastTick     = null
    this.resolveIdx   = 0
    this.resolveTimer = 0
    this.betweenTimer = 0
    this.deadTimer    = 0

    // How many slots are in the current warp input window
    this._warpWindowSize = 0

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

  // ── Warp window target ───────────────────────────────────────────────────────
  // During WARP_SELECT the queue fills to resolveIdx + _warpWindowSize.
  // During normal INPUT it fills to this.slots.
  get _inputSlotTarget() {
    return this.phase === PHASE.WARP_SELECT
      ? this.resolveIdx + this._warpWindowSize
      : this.slots
  }

  // ── Character select ────────────────────────────────────────────────────────
  _confirmChar(playerIdx, charIdx) {
    const f = playerIdx === 0 ? this.p1 : this.p2
    f.charDef = CHARACTERS[charIdx]
    this.charInfoOpen = false
    if (playerIdx === 0) {
      this.phase = PHASE.CHAR_P2
    } else {
      this._startMatch()
    }
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
    // Apply any carry-over actions from previous sequence
    const applyPrefix = (f) => {
      f.clearSequence()
      if (f.nextQueuePrefix.length > 0) {
        f.queue = [...f.nextQueuePrefix]
        f.nextQueuePrefix = []
      }
    }
    applyPrefix(this.p1)
    applyPrefix(this.p2)
    this.log = []

    // If a warping Andile has REDEPLOY pre-filled, open WARP_SELECT so their
    // first keypress sets the tile rather than pushing a second action
    const hasWarpPrefix = (f) => f.warping && f.queue[0] === ACTION.REDEPLOY
    if (hasWarpPrefix(this.p1) || hasWarpPrefix(this.p2)) {
      this._warpWindowSize = this.slots
      this.resolveIdx      = 0
      this.phase           = PHASE.WARP_SELECT
    } else {
      this.phase = PHASE.INPUT
    }

    this.timeLeft = this.timerS * 1000
    this.lastTick = null
    this.p1.charDef?.onSequenceStart(this.p1, this)
    this.p2.charDef?.onSequenceStart(this.p2, this)
    this._updateHud()
  }

  _lockIn(fighter) {
    fighter.locked = true
    if (this.p1.locked && this.p2.locked) {
      if (this.phase === PHASE.WARP_SELECT) this._resumeResolve()
      else this._beginResolve()
    }
  }

  _beginResolve() {
    this.phase        = PHASE.RESOLVE
    this.resolveIdx   = 0
    this.resolveTimer = this.RESOLVE_STEP_MS
  }

  // Resume resolving mid-sequence (after warp select) — does NOT reset resolveIdx
  _resumeResolve() {
    this.phase        = PHASE.RESOLVE
    this.resolveTimer = this.RESOLVE_STEP_MS
  }

  _resolveStep() {
    const i  = this.resolveIdx
    const a1 = this.p1.queue[i] ?? ACTION.WAIT
    const a2 = this.p2.queue[i] ?? ACTION.WAIT
    const c1 = this.p1.charDef?.id
    const c2 = this.p2.charDef?.id
    const ac1 = actionClass(a1, c1)
    const ac2 = actionClass(a2, c2)
    this._ac1 = ac1; this._ac2 = ac2

    // Reset per-step state
    this.p1.blocking      = false; this.p2.blocking      = false
    this.p1.parrying      = false; this.p2.parrying      = false
    this.p1.lastDamage    = 0;     this.p2.lastDamage    = 0
    this.p1.movedThisStep = false; this.p2.movedThisStep = false

    // ── Phase 0: DEFEND precheck ─────────────────────────────────────────────
    if (ac1 === ACLASS.DEFEND) {
      if (a1 === ACTION.BLOCK)   this.p1.blocking = true
      if (a1 === ACTION.CON_ATK) this.p1.parrying = true
    }
    if (ac2 === ACLASS.DEFEND) {
      if (a2 === ACTION.BLOCK)   this.p2.blocking = true
      if (a2 === ACTION.CON_ATK) this.p2.parrying = true
    }

    // ── Phase 1: MOVE ────────────────────────────────────────────────────────
    if (!this.p1.stunned && !this.p1.restrained && ac1 === ACLASS.MOVE) {
      this._applyMove(this.p1, a1, this.p2)
    }
    if (!this.p2.stunned && !this.p2.restrained && ac2 === ACLASS.MOVE) {
      this._applyMove(this.p2, a2, this.p1)
    }

    this.p1.tile = Math.max(0, Math.min(TILE_COUNT - 1, this.p1.tile))
    this.p2.tile = Math.max(0, Math.min(TILE_COUNT - 1, this.p2.tile))

    // ── Phase 2: Collision ───────────────────────────────────────────────────
    if (this.p1.tile === this.p2.tile) {
      const p1CanLeft  = this.p1.tile > 0
      const p2CanRight = this.p2.tile < TILE_COUNT - 1
      if (p1CanLeft && p2CanRight) {
        if (Math.random() < 0.5) this.p2.tile++
        else                     this.p1.tile--
      } else if (p1CanLeft) {
        this.p1.tile--
      } else if (p2CanRight) {
        this.p2.tile++
      }
    }

    // Update facing after movement
    if (this.p1.tile !== this.p2.tile) {
      this.p1.facingRight = this.p1.tile < this.p2.tile
      this.p2.facingRight = this.p2.tile < this.p1.tile
    }

    // ── Lia passive ──────────────────────────────────────────────────────────
    const liaPassive = (lia, opp) => {
      if (lia.charDef?.id !== 'lia') return
      if (opp.warping) return
      if (opp.movedThisStep && Math.abs(lia.tile - opp.tile) <= 1) {
        opp.hp        -= 1
        opp.lastDamage += 1
        lia.chargeUlt(5)
      }
    }
    liaPassive(this.p1, this.p2)
    liaPassive(this.p2, this.p1)

    // ── Phase 3a: ULT ────────────────────────────────────────────────────────
    if (a1 === ACTION.ULT && this.p1.ult >= 100 && !this.p1.stunned) {
      this.p1.charDef?.onUlt(this.p1, this.p2, this)
      this.p1.ult = 0
    }
    if (a2 === ACTION.ULT && this.p2.ult >= 100 && !this.p2.stunned) {
      this.p2.charDef?.onUlt(this.p2, this.p1, this)
      this.p2.ult = 0
    }

    // ── Phase 3b: ATTACK ─────────────────────────────────────────────────────
    if (!this.p1.stunned && ac1 === ACLASS.ATTACK) {
      this._applyAttack(this.p1, a1, this.p2)
    }
    if (!this.p2.stunned && ac2 === ACLASS.ATTACK) {
      this._applyAttack(this.p2, a2, this.p1)
    }

    // DEFEND resolution
    if (this.p1.parrying) this._resolveParry(this.p1, this.p2, ac2)
    if (this.p2.parrying) this._resolveParry(this.p2, this.p1, ac1)

    this.p1.hp = Math.max(0, this.p1.hp)
    this.p2.hp = Math.max(0, this.p2.hp)

    // ── Andile electrify retaliation ─────────────────────────────────────────
    const electrifyRetaliate = (andile, opp, oppAC) => {
      if (andile.charDef?.id !== 'andile') return
      if (andile.warping) return
      if (andile.electrify <= 0) return
      if (oppAC !== ACLASS.ATTACK) return
      if (Math.abs(andile.tile - opp.tile) > 1) return
      opp.hp        -= 1
      opp.lastDamage += 1
      opp.staticMarked = true
      andile.chargeUlt(5)
    }
    electrifyRetaliate(this.p1, this.p2, ac2)
    electrifyRetaliate(this.p2, this.p1, ac1)

    // ── Phase 4: RECOVER ─────────────────────────────────────────────────────
    if (ac1 === ACLASS.RECOVER && !this.p1.stunned) this._applyRecover(this.p1, a1, this.p2)
    if (ac2 === ACLASS.RECOVER && !this.p2.stunned) this._applyRecover(this.p2, a2, this.p1)

    // ── Phase 4b: NULL character abilities ───────────────────────────────────
    if (ac1 === ACLASS.NULL && !this.p1.stunned) this._applyNullAbility(this.p1, a1, this.p2)
    if (ac2 === ACLASS.NULL && !this.p2.stunned) this._applyNullAbility(this.p2, a2, this.p1)

    // ── Ult charge ───────────────────────────────────────────────────────────
    this.p1.chargeUlt(2.5)
    this.p2.chargeUlt(2.5)
    if (this.p2.lastDamage > 0) this.p1.chargeUlt(5)
    if (this.p1.lastDamage > 0) this.p2.chargeUlt(5)
    const wasAttack1 = ac1 === ACLASS.ATTACK
    const wasAttack2 = ac2 === ACLASS.ATTACK
    if (this.p1.blocking && this.p1.lastDamage === 0 && wasAttack2) this.p1.chargeUlt(5)
    if (this.p2.blocking && this.p2.lastDamage === 0 && wasAttack1) this.p2.chargeUlt(5)

    // ── Fury / electrify tick ────────────────────────────────────────────────
    if (this.p1.fury > 0) { this.p1.fury--; if (this.p1.fury === 0) this.p1.ult = 0 }
    if (this.p2.fury > 0) { this.p2.fury--; if (this.p2.fury === 0) this.p2.ult = 0 }
    if (this.p1.electrify > 0) this.p1.electrify--
    if (this.p2.electrify > 0) this.p2.electrify--

    if (this.p1.lastDamage > 0) this.p1.flash = 350
    if (this.p2.lastDamage > 0) this.p2.flash = 350

    // ── Status tick ──────────────────────────────────────────────────────────
    const tickStatus = (f) => {
      if (f.stunned    > 0) f.stunned--
      if (f.restrained > 0) f.restrained--
      if (f.poisoned   > 0) { f.hp = Math.max(0, f.hp - 1); f.poisoned-- }
    }
    tickStatus(this.p1); tickStatus(this.p2)

    // ── Passive hooks ────────────────────────────────────────────────────────
    this.p1.charDef?.onResolveStep(this.p1, a1, this.p2, this)
    this.p2.charDef?.onResolveStep(this.p2, a2, this.p1, this)
    this.actionCount++
    this.p1.roundActionCount++
    this.p2.roundActionCount++

    let entry = `${i+1}  P1:${ACTION_NAME[a1] ?? a1}  P2:${ACTION_NAME[a2] ?? a2}`
    if (this.p1.lastDamage) entry += `  ‹P1 -${this.p1.lastDamage}›`
    if (this.p2.lastDamage) entry += `  ‹P2 -${this.p2.lastDamage}›`
    this.log.push(entry)

    // ── Andile warp passive ───────────────────────────────────────────────────
    // Check each fighter independently — both could be Andile
    const checkWarp = (andile) => {
      if (andile.charDef?.id !== 'andile') return false
      if (andile.warpUsed) return false
      if (andile.hp > 3) return false
      andile.warpUsed = true
      andile.warping  = true
      return true
    }
    const warp1 = checkWarp(this.p1)
    const warp2 = checkWarp(this.p2)

    this._updateHud()
    this.resolveIdx++

    const died = this.p1.hp <= 0 || this.p2.hp <= 0
    const done = this.resolveIdx >= this.slots || died

    if ((warp1 || warp2) && !died) {
      // Queue break: enter warp select with remaining slots
      this._beginWarpSelect()
      return
    }

    if (done) {
      if (died) this._onDeath()
      else { this.phase = PHASE.BETWEEN; this.betweenTimer = this.BETWEEN_MS }
    }
  }

  _dealDamage(attacker, defender, baseDmg) {
    if (defender.parrying) return 0
    if (defender.warping)  return 0
    const fury = attacker.fury > 0 ? 2 : 1
    const dmg  = Math.max(0, baseDmg * fury - (defender.blocking ? 1 : 0))
    defender.hp        -= dmg
    defender.lastDamage += dmg
    if (dmg > 0) attacker.chargeUlt(5)
    return dmg
  }

  _applyMove(f, action, opponent) {
    const prevTile = f.tile
    if (action === ACTION.LEFT)  f.tile -= 1
    if (action === ACTION.RIGHT) f.tile += 1
    if (action === ACTION.ENGAGE && f.charDef?.id === 'takashi') {
      const dir  = opponent.tile > f.tile ? 1 : -1
      f.tile += dir * 2
      f.tile = Math.max(0, Math.min(TILE_COUNT - 1, f.tile))
    }
    if (action === ACTION.ENGAGE && f.charDef?.id === 'andile') {
      const et = opponent.tile
      const centre = Math.floor(TILE_COUNT / 2)
      let land
      if (et === 0)                  land = 1
      else if (et === TILE_COUNT-1)  land = TILE_COUNT - 2
      else if (et === centre)        land = Math.random() < 0.5 ? centre - 1 : centre + 1
      else if (et < centre)          land = et + 1
      else                           land = et - 1
      if (land === opponent.tile) land = et < centre ? et - 1 : et + 1
      f.tile = Math.max(0, Math.min(TILE_COUNT - 1, land))
    }
    if (action === ACTION.RECOVER && f.charDef?.id === 'andile') {
      const centre = Math.floor(TILE_COUNT / 2)
      let land = centre
      if (opponent.tile === centre) land = Math.random() < 0.5 ? centre - 1 : centre + 1
      f.tile = land
    }
    if (action === ACTION.REDEPLOY && f.charDef?.id === 'andile') {
      const dest = f.redeployTile !== null ? f.redeployTile : this._andileAutoWarp(f, opponent)
      f.tile         = dest
      f.warping      = false
      f.redeployTile = null
    }
    if (action === ACTION.TELEPORT && f.charDef?.id === 'estelle') {
      // Teleport 3 tiles away from opponent
      const dir = f.tile >= opponent.tile ? 1 : -1  // away from opponent
      f.tile = Math.max(0, Math.min(TILE_COUNT - 1, f.tile + dir * 3))
    }
    if (f.tile !== prevTile) f.movedThisStep = true
  }

  _applyAttack(attacker, action, defender) {
    if (action === ACTION.JAB) {
      if (Math.abs(attacker.tile - defender.tile) <= 1) {
        const base = attacker.electrify > 0 ? 2 : 1
        this._dealDamage(attacker, defender, base)
        if (attacker.charDef?.id === 'andile') {
          defender.staticMarked = true
        }
      }
    }
    if (action === ACTION.HEAVY) {
      if (Math.abs(attacker.tile - defender.tile) <= 1) {
        this._dealDamage(attacker, defender, 2)
      }
    }
    if (action === ACTION.CON_ATK && attacker.charDef?.id === 'lia') {
      if (Math.abs(attacker.tile - defender.tile) <= 1) {
        const oppAC = attacker === this.p1 ? this._ac2 : this._ac1
        if (oppAC !== ACLASS.MOVE) {
          defender.poisoned = Math.max(defender.poisoned, 3)
          attacker.chargeUlt(5)
        } else {
          this._forceSlot(attacker, ACTION.FORCED_WAIT)
        }
      }
    }
    if (action === ACTION.SP_ATK && attacker.charDef?.id === 'lia') {
      if (Math.abs(attacker.tile - defender.tile) <= 4) {
        const oppAC = attacker === this.p1 ? this._ac2 : this._ac1
        if (oppAC === ACLASS.MOVE) {
          this._forceSlot(defender, ACTION.FORCED_WAIT)
          attacker.chargeUlt(5)
        }
      }
    }
    // Estelle SP_ATK — NECROTIC BOLT: exactly 2 tile range, 1 damage
    if (action === ACTION.SP_ATK && attacker.charDef?.id === 'estelle') {
      const dist = Math.abs(attacker.tile - defender.tile)
      if (dist === 2) {
        this._dealDamage(attacker, defender, 1)
      }
    }

    if (action === ACTION.ENGAGE && attacker.charDef?.id === 'lia') {
      if (Math.abs(attacker.tile - defender.tile) <= 4) {
        const prevTile = defender.tile
        const dir = attacker.tile > defender.tile ? 1 : -1
        const target = Math.max(0, Math.min(TILE_COUNT - 1, defender.tile + dir))
        if (target !== attacker.tile) {
          defender.tile = target
          if (defender.tile !== prevTile) {
            defender.movedThisStep = true
            if (Math.abs(attacker.tile - defender.tile) <= 1) {
              defender.hp        -= 1
              defender.lastDamage += 1
              attacker.chargeUlt(5)
            }
          }
        }
      }
    }
  }

  _andileAutoWarp(andile, opponent) {
    const et = opponent.tile
    const centre = Math.floor(TILE_COUNT / 2)
    if (et < centre)       return TILE_COUNT - 1
    if (et > centre)       return 0
    return Math.random() < 0.5 ? 0 : TILE_COUNT - 1
  }

  // ── Warp select ──────────────────────────────────────────────────────────────
  // Called after a resolve step triggers Andile's passive.
  // resolveIdx has already been incremented, so it points to the first unplayed slot.
  // We preserve the already-resolved prefix and open a new input window for the tail.
  _beginWarpSelect() {
    const remaining = this.slots - this.resolveIdx

    if (remaining <= 0) {
      // Warp triggered on the last slot — start a fresh sequence.
      // Pre-fill each warping Andile's slot 0 with REDEPLOY via nextQueuePrefix.
      // The tile choice (redeployTile) is set by first valid key press during input.
      if (this.p1.warping) { this.p1.nextQueuePrefix = [ACTION.REDEPLOY]; this.p1.redeployTile = null }
      if (this.p2.warping) { this.p2.nextQueuePrefix = [ACTION.REDEPLOY]; this.p2.redeployTile = null }
      this._startSequence()
      return
    }

    // Mid-sequence warp: truncate queues to resolved prefix, replan the tail
    this.p1.queue = this.p1.queue.slice(0, this.resolveIdx)
    this.p2.queue = this.p2.queue.slice(0, this.resolveIdx)
    this.p1.locked = false
    this.p2.locked = false
    this.p1.nextQueuePrefix = []
    this.p2.nextQueuePrefix = []

    if (this.p1.warping) this.p1.redeployTile = null
    if (this.p2.warping) this.p2.redeployTile = null

    this._warpWindowSize = remaining

    this.phase    = PHASE.WARP_SELECT
    this.timeLeft = this.timerS * 1000
    this.lastTick = null
    this.log      = []
  }

  _commitWarpSelect(timedOut = false) {
    const target = this.resolveIdx + this._warpWindowSize

    // Auto-warp any Andile who didn't pick a tile in time
    const autoWarpIfNeeded = (f, opp) => {
      if (!f.warping) return
      if (f.redeployTile === null) f.redeployTile = this._andileAutoWarp(f, opp)
    }
    autoWarpIfNeeded(this.p1, this.p2)
    autoWarpIfNeeded(this.p2, this.p1)

    // Pad both queues to the target length with WAIT
    while (this.p1.queue.length < target) this.p1.queue.push(ACTION.WAIT)
    while (this.p2.queue.length < target) this.p2.queue.push(ACTION.WAIT)

    this.p1.locked = true
    this.p2.locked = true
    this._resumeResolve()
  }

  // ── NULL-class character abilities ────────────────────────────────────────────
  _applyNullAbility(attacker, action, defender) {
    if (action === ACTION.SP_ATK && attacker.charDef?.id === 'andile') {
      if (Math.abs(attacker.tile - defender.tile) <= 2) {
        defender.staticMarked = true
        attacker.chargeUlt(5)
      }
    }
    if (action === ACTION.CON_ATK && attacker.charDef?.id === 'andile') {
      if (defender.staticMarked && Math.abs(attacker.tile - defender.tile) <= 2) {
        defender.staticMarked = false
        defender.hp        -= 1
        defender.lastDamage += 1
        attacker.chargeUlt(5)
        this._forceSlot(defender, ACTION.FORCED_WAIT)
      }
    }
    // Estelle CON_ATK — SIPHON: 1t, if enemy not moving steal 1hp
    if (action === ACTION.CON_ATK && attacker.charDef?.id === 'estelle') {
      const oppAC = attacker === this.p1 ? this._ac2 : this._ac1
      if (Math.abs(attacker.tile - defender.tile) <= 1 && oppAC !== ACLASS.MOVE && !defender.warping) {
        defender.hp        -= 1
        defender.lastDamage += 1
        attacker.hp = Math.min(MAX_HP, attacker.hp + 1)
        attacker.chargeUlt(5)
      }
    }
  }

  // Forces the NEXT slot in the queue to a given action
  _forceSlot(fighter, action) {
    const nextIdx = this.resolveIdx + 1
    if (nextIdx < this.slots) {
      fighter.queue[nextIdx] = action
    } else {
      if (!fighter.nextQueuePrefix.length) fighter.nextQueuePrefix = [action]
      else fighter.nextQueuePrefix[0] = action
    }
  }

  _resolveParry(parrier, opponent, oppActionClass) {
    if (oppActionClass === ACLASS.ATTACK) {
      const parryDmg = parrier.fury > 0 ? 2 : 1
      opponent.hp        -= parryDmg
      opponent.lastDamage += parryDmg
      parrier.chargeUlt(5)
    } else {
      this._forceSlot(parrier, ACTION.FORCED_WAIT)
    }
  }

  _applyRecover(fighter, action, opponent) {
    if (action === ACTION.RECOVER) {
      fighter.charDef?.onResolveStep(fighter, action, opponent, this)
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

    if (this.phase === PHASE.CHAR_P1 || this.phase === PHASE.CHAR_P2) {
      const pIdx = this.phase === PHASE.CHAR_P1 ? 0 : 1
      if (this.charInfoOpen) {
        if (code === 'Enter') { this._confirmChar(pIdx, this.charSelectIdx[pIdx]); e.preventDefault() }
        if (code === 'Escape' || code === 'Backspace') { this.charInfoOpen = false; e.preventDefault() }
        return
      }
      if (code === 'ArrowLeft')  { this.charSelectIdx[pIdx] = (this.charSelectIdx[pIdx] - 1 + CHARACTERS.length) % CHARACTERS.length; e.preventDefault() }
      if (code === 'ArrowRight') { this.charSelectIdx[pIdx] = (this.charSelectIdx[pIdx] + 1) % CHARACTERS.length; e.preventDefault() }
      if (code === 'Enter') {
        const char = CHARACTERS[this.charSelectIdx[pIdx]]
        if (char.info) { this.charInfoOpen = true } else { this._confirmChar(pIdx, this.charSelectIdx[pIdx]) }
        e.preventDefault()
      }
      if (code === 'Backspace' && pIdx === 1) { this.phase = PHASE.CHAR_P1; this.charInfoOpen = false; e.preventDefault() }
      return
    }

    if (this.phase === PHASE.SETOVER) {
      if (code === 'Space' || code === 'Enter') {
        e.preventDefault()
        if (typeof exitGame === 'function') exitGame(); else this.reset()
      }
      return
    }

    // ── WARP_SELECT input ────────────────────────────────────────────────────
    if (this.phase === PHASE.WARP_SELECT) {
      // P1 input
      if (P1_KEY_MAP[code] !== undefined) {
        const btnIdx = P1_KEY_MAP[code]
        if (this.p1.warping) {
          // First keypress (1-9) sets deploy tile.
          // If REDEPLOY is already pre-filled (fresh-sequence case), just set the tile.
          // Otherwise push REDEPLOY into the queue now.
          if (this.p1.redeployTile === null && btnIdx >= 1) {
            this.p1.redeployTile = btnIdx - 1
            const alreadyFilled = this.p1.queue[this.resolveIdx] === ACTION.REDEPLOY
            if (!alreadyFilled) {
              this.p1.queue.push(ACTION.REDEPLOY)
            }
            if (this.p1.queue.length >= this._inputSlotTarget) this.p1.locked = true
          } else if (this.p1.redeployTile !== null && this.p1.queue.length < this._inputSlotTarget) {
            this._pushAction(this.p1, btnIdx)
          }
        } else {
          this._pushAction(this.p1, btnIdx)
        }
        e.preventDefault()
      }
      if (code === 'Backspace' || code === 'Minus') {
        if (this.p1.warping) {
          if (this.p1.queue.length <= this.resolveIdx + 1) {
            // Undo the REDEPLOY slot — also clear the tile choice
            if (this.p1.queue.length > this.resolveIdx) {
              this.p1.queue.pop()
              this.p1.redeployTile = null
            }
          } else {
            this.p1.queue.pop()
          }
          this.p1.locked = false
        } else {
          this._undoAction(this.p1)
        }
        e.preventDefault()
      }

      // P2 input
      if (P2_KEY_MAP[code] !== undefined) {
        const raw    = P2_KEY_MAP[code]
        const btnIdx = p2Action(raw)
        if (this.p2.warping) {
          if (this.p2.redeployTile === null && raw >= 1) {
            this.p2.redeployTile = raw - 1
            const alreadyFilled = this.p2.queue[this.resolveIdx] === ACTION.REDEPLOY
            if (!alreadyFilled) {
              this.p2.queue.push(ACTION.REDEPLOY)
            }
            if (this.p2.queue.length >= this._inputSlotTarget) this.p2.locked = true
          } else if (this.p2.redeployTile !== null && this.p2.queue.length < this._inputSlotTarget) {
            this._pushAction(this.p2, btnIdx)
          }
        } else {
          this._pushAction(this.p2, btnIdx)
        }
        e.preventDefault()
      }
      if (code === 'NumpadDecimal' || code === 'NumpadSubtract') {
        if (this.p2.warping) {
          if (this.p2.queue.length <= this.resolveIdx + 1) {
            if (this.p2.queue.length > this.resolveIdx) {
              this.p2.queue.pop()
              this.p2.redeployTile = null
            }
          } else {
            this.p2.queue.pop()
          }
          this.p2.locked = false
        } else {
          this._undoAction(this.p2)
        }
        e.preventDefault()
      }

      // Check if both players are ready to commit
      this._checkWarpCommit()
      return
    }

    if (this.phase !== PHASE.INPUT) return

    if (P1_KEY_MAP[code] !== undefined) { this._pushAction(this.p1, P1_KEY_MAP[code]); e.preventDefault() }
    if (P2_KEY_MAP[code] !== undefined) { this._pushAction(this.p2, p2Action(P2_KEY_MAP[code])); e.preventDefault() }
    if (code === 'Backspace')       { this._undoAction(this.p1); e.preventDefault() }
    if (code === 'NumpadDecimal')   { this._undoAction(this.p2); e.preventDefault() }
    if (code === 'Minus')           { this._undoAction(this.p1); e.preventDefault() }
    if (code === 'NumpadSubtract')  { this._undoAction(this.p2); e.preventDefault() }
  }

  // Check whether both sides have finished their warp-select input
  _checkWarpCommit() {
    const target = this._inputSlotTarget

    const p1Ready = this.p1.warping
      ? (this.p1.redeployTile !== null && this.p1.queue.length >= target)
      : (this.p1.queue.length >= target)
    const p2Ready = this.p2.warping
      ? (this.p2.redeployTile !== null && this.p2.queue.length >= target)
      : (this.p2.queue.length >= target)

    if (p1Ready && !this.p1.locked) this.p1.locked = true
    if (p2Ready && !this.p2.locked) this.p2.locked = true
    if (p1Ready && p2Ready) this._commitWarpSelect()
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

    if (this.phase === PHASE.CHAR_P1 || this.phase === PHASE.CHAR_P2) {
      const pIdx = this.phase === PHASE.CHAR_P1 ? 0 : 1
      if (this.charInfoOpen) {
        const pw = Math.min(W * 0.9, 420), ph = Math.min(H * 0.75, 500)
        const px = (W - pw) / 2, py = (H - ph) / 2
        if (cx >= px && cx <= px + pw && cy >= py && cy <= py + ph) {
          this._confirmChar(pIdx, this.charSelectIdx[pIdx])
        } else {
          this.charInfoOpen = false
        }
        return
      }
      const hit = this._charSelectHitTest(cx, cy, W, H)
      if (hit !== null) {
        if (hit === this.charSelectIdx[pIdx]) {
          const char = CHARACTERS[hit]
          if (char.info) { this.charInfoOpen = true } else { this._confirmChar(pIdx, hit) }
        } else {
          this.charSelectIdx[pIdx] = hit
        }
      }
      return
    }

    if (this.phase === PHASE.SETOVER) {
      if (typeof exitGame === 'function') exitGame(); else this.reset()
      return
    }

    const L = computeLayout(W, H, this.slots)

    // ── WARP_SELECT touch ────────────────────────────────────────────────────
    if (this.phase === PHASE.WARP_SELECT) {
      // P1 strip (bottom)
      if (cy >= L.p1BtnY) {
        const btnIdx = this._btnHitTest(L, cx, cy, L.p1BtnY, false)
        if (btnIdx !== null) {
          if (this.p1.warping) {
            if (this.p1.redeployTile === null && btnIdx >= 1) {
              this.p1.redeployTile = btnIdx - 1
              const alreadyFilled = this.p1.queue[this.resolveIdx] === ACTION.REDEPLOY
              if (!alreadyFilled) this.p1.queue.push(ACTION.REDEPLOY)
              if (this.p1.queue.length >= this._inputSlotTarget) this.p1.locked = true
            } else if (this.p1.redeployTile !== null && this.p1.queue.length < this._inputSlotTarget) {
              this._pushAction(this.p1, btnIdx)
            }
          } else {
            this._pushAction(this.p1, btnIdx)
          }
        }
      }
      // P1 undo bar
      if (cy >= L.p1UndoY && cy < L.p1BtnY) {
        if (this.p1.warping) {
          if (this.p1.queue.length <= this.resolveIdx + 1) {
            if (this.p1.queue.length > this.resolveIdx) { this.p1.queue.pop(); this.p1.redeployTile = null }
          } else { this.p1.queue.pop() }
          this.p1.locked = false
        } else { this._undoAction(this.p1) }
      }

      // P2 strip (top)
      if (cy < L.p2BtnY + L.btnH) {
        const btnIdx = this._btnHitTest(L, cx, cy, L.p2BtnY, true)
        if (btnIdx !== null) {
          const raw = btnIdx  // raw before p2Action flip
          if (this.p2.warping) {
            if (this.p2.redeployTile === null && raw >= 1) {
              this.p2.redeployTile = raw - 1
              const alreadyFilled = this.p2.queue[this.resolveIdx] === ACTION.REDEPLOY
              if (!alreadyFilled) this.p2.queue.push(ACTION.REDEPLOY)
              if (this.p2.queue.length >= this._inputSlotTarget) this.p2.locked = true
            } else if (this.p2.redeployTile !== null && this.p2.queue.length < this._inputSlotTarget) {
              this._pushAction(this.p2, p2Action(raw))
            }
          } else {
            this._pushAction(this.p2, p2Action(raw))
          }
        }
      }
      // P2 undo bar
      if (cy >= L.p2UndoY && cy < L.p2UndoY + L.undoH) {
        if (this.p2.warping) {
          if (this.p2.queue.length <= this.resolveIdx + 1) {
            if (this.p2.queue.length > this.resolveIdx) { this.p2.queue.pop(); this.p2.redeployTile = null }
          } else { this.p2.queue.pop() }
          this.p2.locked = false
        } else { this._undoAction(this.p2) }
      }

      this._checkWarpCommit()
      return
    }

    if (this.phase !== PHASE.INPUT) return

    // P2 button strip
    if (cy >= L.p2BtnY && cy < L.p2BtnY + L.btnH) {
      const btnIdx = this._btnHitTest(L, cx, cy, L.p2BtnY, true)
      if (btnIdx !== null) this._pushAction(this.p2, p2Action(btnIdx))
      return
    }
    // P2 undo bar
    if (cy >= L.p2UndoY && cy < L.p2UndoY + L.undoH) {
      this._undoAction(this.p2)
      return
    }
    // P1 undo bar
    if (cy >= L.p1UndoY && cy < L.p1UndoY + L.undoH) {
      this._undoAction(this.p1)
      return
    }
    // P1 button strip
    if (cy >= L.p1BtnY && cy < H) {
      const btnIdx = this._btnHitTest(L, cx, cy, L.p1BtnY, false)
      if (btnIdx !== null) this._pushAction(this.p1, btnIdx)
      return
    }
  }

  _btnHitTest(L, cx, cy, stripY, isP2) {
    const { W, btnH, btnRowH, btnW, mobile } = L
    let lx = isP2 ? W - cx : cx
    const rawLy = cy - stripY
    let ly = isP2 ? btnH - 1 - rawLy : rawLy
    if (ly < 0 || ly >= btnH) return null
    if (lx < 0 || lx >= W)   return null
    if (mobile) {
      const col_ = Math.floor(lx / btnW)
      const row_ = Math.floor(ly / btnRowH)
      const idx  = row_ * 5 + col_
      return (idx >= 0 && idx < BTN_COUNT) ? idx : null
    } else {
      const idx = Math.floor(lx / btnW)
      return (idx >= 0 && idx < BTN_COUNT) ? idx : null
    }
  }

  _pushAction(fighter, actionId) {
    const target = this._inputSlotTarget
    if (fighter.queue.length >= target) return
    if (actionId === ACTION.SP_ATK && fighter.charDef?.id === 'takashi') {
      const free = target - fighter.queue.length
      if (free >= 2) {
        fighter.queue.push(ACTION.CHARGE, ACTION.HEAVY)
      } else if (free === 1) {
        fighter.queue.push(ACTION.CHARGE)
        fighter.nextQueuePrefix = [ACTION.HEAVY]
      }
    } else if (actionId === ACTION.ENGAGE && fighter.charDef?.id === 'estelle') {
      const free = target - fighter.queue.length
      if (free >= 2) {
        fighter.queue.push(ACTION.FORCED_WAIT, ACTION.TELEPORT)
      } else if (free === 1) {
        fighter.queue.push(ACTION.FORCED_WAIT)
        fighter.nextQueuePrefix = [ACTION.TELEPORT]
      }
    } else {
      fighter.queue.push(actionId)
    }
    if (fighter.queue.length >= target) this._lockIn(fighter)
  }

  _undoAction(fighter) {
    if (fighter.queue.length === 0) return
    const last = fighter.queue[fighter.queue.length - 1]
    fighter.queue.pop()
    if (last === ACTION.HEAVY &&
        fighter.queue.length > 0 &&
        fighter.queue[fighter.queue.length - 1] === ACTION.CHARGE) {
      fighter.queue.pop()
    }
    if (last === ACTION.CHARGE && fighter.nextQueuePrefix[0] === ACTION.HEAVY) {
      fighter.nextQueuePrefix.shift()
    }
    // Estelle FADE pair: undo TELEPORT removes preceding FORCED_WAIT too
    if (last === ACTION.TELEPORT &&
        fighter.queue.length > 0 &&
        fighter.queue[fighter.queue.length - 1] === ACTION.FORCED_WAIT) {
      fighter.queue.pop()
    }
    if (last === ACTION.FORCED_WAIT && fighter.nextQueuePrefix[0] === ACTION.TELEPORT) {
      fighter.nextQueuePrefix.shift()
    }
    fighter.locked = false
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  _updateHud() {}
  _updateTimerDisplay() {}

  // ── Loop ────────────────────────────────────────────────────────────────────
  _loop(ts) {
    this._rafId = requestAnimationFrame(this._boundRAF)
    const dt = this.lastTick ? ts - this.lastTick : 0
    this.lastTick = ts

    if (this.p1.flash > 0) this.p1.flash = Math.max(0, this.p1.flash - dt)
    if (this.p2.flash > 0) this.p2.flash = Math.max(0, this.p2.flash - dt)

    if (this.phase === PHASE.INPUT) {
      this.timeLeft = Math.max(0, this.timeLeft - dt)
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
    if (this.phase === PHASE.WARP_SELECT) {
      this.timeLeft = Math.max(0, this.timeLeft - dt)
      if (this.timeLeft <= 0) this._commitWarpSelect(true)
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
    this._drawUndoBar(L, this.p2, true)
    this._drawButtonStrip(L, this.p1, false)
    this._drawUndoBar(L, this.p1, false)
    this._drawTimer(L, true)
    this._drawQueue(L, this.p2, L.p2QueueY, true)
    this._drawHud(L, this.p2, L.p2HudY, true)
    this._drawArena(L)
    this._drawFighters(L)
    this._drawHud(L, this.p1, L.p1HudY, false)
    this._drawQueue(L, this.p1, L.p1QueueY, false)
    this._drawTimer(L, false)
    this._drawLog(L)
    this._drawPhaseUI(L)
  }

  // ── Button strip ─────────────────────────────────────────────────────────────
  _drawButtonStrip(L, fighter, isP2) {
    const { ctx }                          = this
    const { W, H, btnH, btnRowH, btnW, mobile } = L
    const y       = isP2 ? L.p2BtnY : L.p1BtnY
    const col     = fighter.colour
    const isInput = this.phase === PHASE.INPUT || this.phase === PHASE.WARP_SELECT

    ctx.save()
    if (isP2) {
      ctx.translate(W / 2, y + btnH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + btnH / 2))
    }

    for (let i = 0; i < BTN_COUNT; i++) {
      const col_ = mobile ? i % 5 : i
      const row_ = mobile ? Math.floor(i / 5) : 0
      const bx   = col_ * btnW
      const by   = y + row_ * btnRowH
      const bw   = btnW
      const bh   = btnRowH

      const isUlt  = i === 9
      const ultRdy = fighter.ult >= 100

      ctx.fillStyle = (isUlt && ultRdy && isInput) ? C.ult + '22' : C.surface
      ctx.fillRect(bx, by, bw, bh)

      ctx.strokeStyle = isUlt && ultRdy ? C.ult : (isInput ? col + '55' : C.border)
      ctx.lineWidth   = 1
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1)

      const isInnerRow = !mobile || row_ === 1
      if (isInnerRow) {
        ctx.fillStyle = isInput ? col : C.muted + '33'
        ctx.fillRect(bx, by + bh - 3, bw, 3)
      }

      ctx.fillStyle    = isInput ? col + '77' : C.muted + '33'
      ctx.font         = `${Math.max(7, bw * 0.15)}px 'Courier New', monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(i, bx + bw / 2, by + 3)

      const labelCol = !isInput        ? C.muted + '44'
                     : isUlt && ultRdy ? C.ult
                     : col
      ctx.fillStyle    = labelCol
      ctx.font         = `bold ${Math.max(7, Math.min(bw * 0.2, 11))}px 'Courier New', monospace`
      ctx.textBaseline = 'middle'
      ctx.fillText(BTN_LABEL[i], bx + bw / 2, by + bh * 0.62)
    }

    ctx.fillStyle    = col
    ctx.font         = `bold ${Math.max(8, btnRowH * 0.28)}px 'Courier New', monospace`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${fighter.id}`, 4, y + btnH / 2)

    ctx.restore()
  }

  // ── Undo bar ─────────────────────────────────────────────────────────────────
  _drawUndoBar(L, fighter, isP2) {
    const { ctx }        = this
    const { W, undoH }   = L
    const y              = isP2 ? L.p2UndoY : L.p1UndoY
    const col            = fighter.colour
    const isInput        = this.phase === PHASE.INPUT || this.phase === PHASE.WARP_SELECT

    ctx.save()
    if (isP2) {
      ctx.translate(W / 2, y + undoH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + undoH / 2))
    }

    ctx.fillStyle = C.surface2
    ctx.fillRect(0, y, W, undoH)
    ctx.strokeStyle = isInput ? col + '66' : C.border
    ctx.lineWidth   = 1
    ctx.strokeRect(0, y, W, undoH)
    ctx.fillStyle = isInput ? col : C.muted + '33'
    ctx.fillRect(0, y, 3, undoH)
    ctx.fillStyle    = isInput ? col : C.muted + '44'
    ctx.font         = `bold ${Math.max(7, undoH * 0.52)}px 'Courier New', monospace`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${fighter.id}  UNDO  ←`, W / 2, y + undoH / 2)

    ctx.restore()
  }

  // ── Timer strip ──────────────────────────────────────────────────────────────
  _drawTimer(L, flipped) {
    const { ctx }       = this
    const { W, timerH } = L
    const y             = flipped ? L.p2TimerY : L.p1TimerY
    const isInput       = this.phase === PHASE.INPUT || this.phase === PHASE.WARP_SELECT
    const isBetween     = this.phase === PHASE.BETWEEN

    ctx.save()
    if (flipped) {
      ctx.translate(W / 2, y + timerH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + timerH / 2))
    }

    ctx.fillStyle = C.surface
    ctx.fillRect(0, y, W, timerH)

    if (isInput) {
      const pct = this.timeLeft / (this.timerS * 1000)
      ctx.fillStyle = pct > 0.4 ? C.p1 + '55' : C.dmg + '55'
      ctx.fillRect(0, y, W * pct, timerH)
    }
    if (isBetween) {
      const pct = this.betweenTimer / this.BETWEEN_MS
      ctx.fillStyle = C.muted + '33'
      ctx.fillRect(0, y, W * pct, timerH)
    }

    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.strokeRect(0, y, W, timerH)

    const mid = y + timerH / 2
    ctx.textBaseline = 'middle'

    if (isInput) {
      const secs = (this.timeLeft / 1000).toFixed(1)
      ctx.fillStyle = this.timeLeft < 2000 ? C.dmg : C.accentHot
      ctx.font      = `bold ${Math.max(8, timerH * 0.62)}px 'Courier New', monospace`
      ctx.textAlign = 'left'
      ctx.fillText(secs, 8, mid)
    } else if (isBetween) {
      ctx.fillStyle = C.muted + '88'
      ctx.font      = `${Math.max(7, timerH * 0.52)}px 'Courier New', monospace`
      ctx.textAlign = 'left'
      ctx.fillText('next sequence…', 8, mid)
    } else if (this.phase === PHASE.RESOLVE) {
      ctx.fillStyle = C.muted + 'aa'
      ctx.font      = `bold ${Math.max(7, timerH * 0.52)}px 'Courier New', monospace`
      ctx.textAlign = 'left'
      ctx.fillText('EXECUTING', 8, mid)
    }

    if (this.matchFmt > 1) {
      const [w1, w2] = this.roundWins
      ctx.fillStyle  = C.muted
      ctx.font       = `${Math.max(7, timerH * 0.5)}px 'Courier New', monospace`
      ctx.textAlign  = 'right'
      ctx.fillText(`${w1}–${w2}`, W - 8, mid)
    }

    ctx.restore()
  }

  // ── HUD strip ────────────────────────────────────────────────────────────────
  _drawHud(L, fighter, y, flipped) {
    const { ctx }     = this
    const { W, hudH } = L
    const col         = fighter.colour
    const ultRdy      = fighter.ult >= 100

    ctx.save()
    if (flipped) {
      ctx.translate(W / 2, y + hudH / 2)
      ctx.rotate(Math.PI)
      ctx.translate(-W / 2, -(y + hudH / 2))
    }

    ctx.fillStyle = C.surface
    ctx.fillRect(0, y, W, hudH)
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.strokeRect(0, y, W, hudH)

    const innerPad = 3
    const barAreaH = hudH - innerPad * 2
    const hpH      = Math.floor(barAreaH * 0.52)
    const ultH     = barAreaH - hpH - 2
    const hpY      = y + innerPad
    const ultBarY  = hpY + hpH + 2

    const nameW = W * 0.28
    const scoreW = W * 0.1
    const barX  = nameW + 6
    const barW  = W - barX - scoreW - 10

    ctx.fillStyle    = col
    ctx.font         = `bold ${Math.max(7, hudH * 0.38)}px 'Courier New', monospace`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(`P${fighter.id}: ${fighter.name}`, innerPad + 4, y + hudH / 2)

    ctx.fillStyle = C.surface2;  ctx.fillRect(barX, hpY, barW, hpH)
    ctx.fillStyle = fighter.hp > MAX_HP * 0.4 ? col : C.dmg
    ctx.fillRect(barX, hpY, barW * Math.max(0, fighter.hp / MAX_HP), hpH)
    ctx.strokeStyle = C.border; ctx.lineWidth = 1
    ctx.strokeRect(barX, hpY, barW, hpH)
    ctx.fillStyle    = C.accentHot
    ctx.font         = `bold ${Math.max(6, hpH * 0.75)}px 'Courier New', monospace`
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${Math.max(0, fighter.hp)}HP`, barX + barW - 3, hpY + hpH / 2)

    const inFury   = fighter.fury > 0
    const ultFillW = inFury ? barW * (fighter.fury / 4) : barW * (fighter.ult / 100)
    const ultColour = (inFury || ultRdy) ? C.ult : col + '77'
    ctx.fillStyle = C.surface2; ctx.fillRect(barX, ultBarY, barW, ultH)
    ctx.fillStyle = ultColour;  ctx.fillRect(barX, ultBarY, ultFillW, ultH)
    ctx.strokeStyle = (inFury || ultRdy) ? C.ult : C.border; ctx.lineWidth = 1
    ctx.strokeRect(barX, ultBarY, barW, ultH)
    ctx.fillStyle    = (inFury || ultRdy) ? C.ult : C.muted
    ctx.font         = `${Math.max(5, ultH * 0.72)}px 'Courier New', monospace`
    ctx.textAlign    = 'right'
    ctx.textBaseline = 'middle'
    const ultLabel = inFury ? `FURY ${fighter.fury}` : ultRdy ? 'ULT READY' : `ULT ${Math.floor(fighter.ult)}%`
    ctx.fillText(ultLabel, barX + barW - 3, ultBarY + ultH / 2)

    if (this.matchFmt > 1) {
      const [w1, w2] = this.roundWins
      ctx.fillStyle    = C.muted
      ctx.font         = `bold ${Math.max(7, hudH * 0.36)}px 'Courier New', monospace`
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${w1}–${w2}`, W - innerPad - 4, y + hudH / 2)
    }

    ctx.restore()
  }

  // ── Queue strip ──────────────────────────────────────────────────────────────
  _drawQueue(L, fighter, y, flipped) {
    const { ctx }                             = this
    const { W, slotSz, slotGap, queueStartX } = L
    const col       = fighter.colour
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
    const { ctx }                    = this
    const { W, arenaY, arenaH, tileW } = L
    const centre                     = Math.floor(TILE_COUNT / 2)

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
    const { ctx }                   = this
    const { arenaY, arenaH, tileW } = L

    const draw = (f) => {
      const col    = f.colour
      const cx     = f.tile * tileW + tileW / 2
      const cy     = arenaY + arenaH / 2
      const flashA = f.flash > 0 ? Math.min(1, f.flash / 180) : 0
      const size   = Math.min(tileW * 0.62, arenaH * 0.72)
      const half   = size / 2

      ctx.save()
      ctx.translate(cx, cy)

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.3)
      g.addColorStop(0, col + '28'); g.addColorStop(1, 'transparent')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(0, 0, size * 1.3, 0, Math.PI * 2); ctx.fill()

      ctx.fillStyle   = flashA > 0 ? `rgba(220,90,90,${flashA * 0.7})` : col + '1a'
      ctx.fillRect(-half, -half, size, size)
      ctx.strokeStyle = flashA > 0 ? `rgba(255,140,140,${0.5 + flashA * 0.5})` : col
      ctx.lineWidth   = 2; ctx.strokeRect(-half, -half, size, size)

      ctx.fillStyle    = flashA > 0 ? `rgba(255,160,160,${0.7 + flashA * 0.3})` : col
      ctx.font         = `${size * 0.48}px Arial`
      ctx.textAlign    = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(f.facingRight ? '▶' : '◀', 0, 0)

      ctx.fillStyle    = col
      ctx.font         = `bold ${Math.max(7, size * 0.28)}px 'Courier New', monospace`
      ctx.textAlign    = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(`P${f.id}`, 0, -half - 2)

      if (f.blocking) {
        ctx.strokeStyle = '#99ccff'; ctx.lineWidth = 2
        ctx.setLineDash([4, 3])
        ctx.strokeRect(-half - 4, -half - 4, size + 8, size + 8)
        ctx.setLineDash([])
      }

      let badgeY = half + 4
      const badge = (text, c) => {
        ctx.fillStyle = c; ctx.font = `7px 'Courier New', monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(text, 0, badgeY); badgeY += 9
      }
      if (f.fury       > 0) badge(`FURY ${f.fury}`,       C.ult)
      if (f.electrify  > 0) badge(`ELEC ${f.electrify}`,  '#66ddff')
      if (f.staticMarked)   badge('MARKED',               '#aaddff')
      if (f.stunned    > 0) badge(`STUN ${f.stunned}`,   '#ddcc44')
      if (f.poisoned   > 0) badge(`PSND ${f.poisoned}`,  '#88dd66')
      if (f.restrained > 0) badge(`REST ${f.restrained}`, '#cc88ee')

      ctx.restore()
    }

    draw(this.p1); draw(this.p2)
  }

  // ── Log ──────────────────────────────────────────────────────────────────────
  _drawLog(L) {
    if (!this.log.length) return
    const { ctx }               = this
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
    const { ctx }          = this
    const { W, H, arenaY } = L

    if (this.phase === PHASE.WARP_SELECT) {
      // Show a banner for each warping Andile
      const pct = this.timeLeft / (this.timerS * 1000)
      ctx.fillStyle = pct > 0.4 ? C.p1 + '55' : C.dmg + '55'
      ctx.fillRect(0, L.arenaY - 3, W * pct, 2)

      ctx.fillStyle    = C.accentHot
      ctx.font         = `bold ${Math.min(W * 0.06, 28)}px 'Arial Narrow', Arial, sans-serif`
      ctx.textAlign    = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Queue Break!', W / 2, L.arenaY + L.arenaH / 2)
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
      const nameFont = Math.min(cellH * 0.2, 13)
      const descFont = Math.min(cellH * 0.14, 10)
      const nameY = y + cellH * 0.2
      const descY = nameY + nameFont + 1

      ctx.fillStyle = isSel ? char.colour : C.accent
      ctx.font = `bold ${nameFont}px 'Arial Narrow', Arial, sans-serif`
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(char.name, tx, nameY)

      ctx.fillStyle = C.muted
      ctx.font = `${descFont}px 'Courier New', monospace`
      const maxDW = cellW - (tx - x) - 6
      let desc = char.desc
      while (desc.length > 1 && ctx.measureText(desc).width > maxDW) desc = desc.slice(0, -1)
      if (desc.length < char.desc.length) desc = desc.slice(0, -1) + '…'
      ctx.fillText(desc, tx, descY)

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

    // ── Info popup ──
    if (this.charInfoOpen) {
      const char  = CHARACTERS[selIdx]
      const info  = char.info ?? []
      const pw    = Math.min(W * 0.9, 420)
      const fontSize  = 10
      const lineH     = 14
      const maxTextW  = (pw) => pw - 28

      const measureLines = (pww) => {
        let h = 54 + 8
        ctx.font = `${fontSize}px 'Courier New', monospace`
        info.forEach(line => {
          const colon = line.indexOf(':')
          if (colon > -1) {
            const kw    = ctx.measureText(line.slice(0, colon + 1)).width
            const rest  = line.slice(colon + 1)
            const avail = maxTextW(pww) - kw
            let row = '', rows = 1
            for (const w of rest.split(' ')) {
              const test = row + w + ' '
              if (ctx.measureText(test).width > avail && row) { rows++; row = w + ' ' }
              else row = test
            }
            h += rows * lineH + 4
          } else {
            h += lineH + 4
          }
        })
        return h + 28
      }

      const ph  = Math.min(H * 0.88, measureLines(pw))
      const ppx = (W - pw) / 2
      const ppy = (H - ph) / 2

      ctx.fillStyle = 'rgba(13,13,15,0.88)'
      ctx.fillRect(0, 0, W, H)

      ctx.fillStyle = C.surface
      ctx.fillRect(ppx, ppy, pw, ph)
      ctx.strokeStyle = char.colour; ctx.lineWidth = 2
      ctx.strokeRect(ppx, ppy, pw, ph)
      ctx.fillStyle = char.colour
      ctx.fillRect(ppx, ppy, pw, 4)

      ctx.fillStyle = char.colour
      ctx.font      = `bold ${Math.min(pw * 0.08, 20)}px 'Arial Narrow', Arial, sans-serif`
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(char.name, ppx + 12, ppy + 10)

      ctx.fillStyle = C.muted
      ctx.font      = `${fontSize}px 'Courier New', monospace`
      ctx.fillText(char.desc, ppx + 12, ppy + 30)

      ctx.strokeStyle = C.border; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(ppx + 12, ppy + 44)
      ctx.lineTo(ppx + pw - 12, ppy + 44)
      ctx.stroke()

      let curY = ppy + 52
      const tlx = ppx + 12

      info.forEach(line => {
        const colon = line.indexOf(':')
        if (colon > -1) {
          ctx.fillStyle = char.colour
          ctx.font      = `bold ${fontSize}px 'Courier New', monospace`
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'
          ctx.fillText(line.slice(0, colon + 1), tlx, curY)
          const kw    = ctx.measureText(line.slice(0, colon + 1)).width
          ctx.fillStyle = C.accent
          ctx.font      = `${fontSize}px 'Courier New', monospace`
          const rest  = line.slice(colon + 1)
          const avail = maxTextW(pw) - kw
          let row = '', firstRow = true
          const flush = (r) => {
            const x = firstRow ? tlx + kw : tlx
            ctx.fillText(r.trim(), x, curY)
            curY += lineH
            firstRow = false
          }
          for (const w of rest.split(' ')) {
            const test = row + w + ' '
            const avail2 = firstRow ? avail : maxTextW(pw)
            if (ctx.measureText(test).width > avail2 && row) { flush(row); row = w + ' ' }
            else row = test
          }
          if (row.trim()) flush(row)
          curY += 3
        } else {
          ctx.fillStyle = C.accent
          ctx.font      = `${fontSize}px 'Courier New', monospace`
          ctx.textAlign = 'left'; ctx.textBaseline = 'top'
          ctx.fillText(line, tlx, curY)
          curY += lineH + 3
        }
      })

      ctx.fillStyle    = pCol + 'bb'
      ctx.font         = `bold ${fontSize}px 'Courier New', monospace`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('TAP PANEL / ENTER to confirm    ESC / BACKSPACE to go back', ppx + pw / 2, ppy + ph - 8)
    }
  }
}