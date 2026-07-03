// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  animEnabled: true,
  flipping: false,
  counts: { heads: 0, tails: 0, side: 0 },
  history: [],
};

// ─── Probability ─────────────────────────────────────────────────────────────

const PROB = { heads: 0.4999, tails: 0.4999, side: 0.0002 };

function rollOutcome() {
  const r = Math.random();
  if (r < PROB.heads) return 'heads';
  if (r < PROB.heads + PROB.tails) return 'tails';
  return 'side';
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const tableSurface = document.getElementById('table-surface');
const coin         = document.getElementById('coin');
const coinScene    = document.getElementById('coin-scene');
const coinEdge     = document.getElementById('coin-edge');
const promptEl     = document.getElementById('prompt');
const resultEl     = document.getElementById('result-text');
const skipToggle   = document.getElementById('skip-toggle');
const historyList  = document.getElementById('history-list');

coinEdge.style.display = 'none';

// ─── Skip toggle ─────────────────────────────────────────────────────────────

skipToggle.addEventListener('click', () => {
  state.animEnabled = !state.animEnabled;
  skipToggle.classList.toggle('on', !state.animEnabled);
});

// ─── Coin click ──────────────────────────────────────────────────────────────

tableSurface.addEventListener('click', () => {
  if (state.flipping) return;
  flip();
});

// ─── Physics vars ─────────────────────────────────────────────────────────────

let rotY          = 0;    // current face angle in degrees (accumulates freely)
let rps           = 0;    // rotations per second, signed (+ or -)
let rafId         = null;
let lastTime      = null;
let outcome       = null;

// Vertical bounce vars
let arcY          = 0;    // current height in px (0 = table)
let arcVY         = 0;    // vertical velocity px/s (positive = up)
let peakVY        = 0;    // current bounce peak velocity, decays 0.6x per landing
const GRAVITY     = 900;  // px/s²
let airborne      = true; // true during flight/bounces, false when settled on table

function stopSim() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  lastTime = null;
}

// ─── Flip entry ──────────────────────────────────────────────────────────────

function flip() {
  state.flipping = true;
  promptEl.style.opacity = '0';
  resultEl.textContent   = '';

  outcome = rollOutcome();
  coinEdge.style.display = outcome === 'side' ? 'block' : 'none';

  if (!state.animEnabled) {
    applyInstantResult(outcome);
    return;
  }

  // Fresh spin: 2–20 rps, random direction
  rps     = (2 + Math.random() * 18) * (Math.random() < 0.5 ? 1 : -1);
  rotY    = 0;
  airborne = true;

  // Random initial toss height
  peakVY  = 200 + Math.random() * 400;
  arcY    = 0;
  arcVY   = peakVY;

  stopSim();
  lastTime = null;
  rafId = requestAnimationFrame(simStep);
}

// ─── Simulation loop ──────────────────────────────────────────────────────────

function simStep(ts) {
  if (lastTime === null) { lastTime = ts; rafId = requestAnimationFrame(simStep); return; }
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  if (airborne) {
    // ── Vertical physics ──
    arcVY -= GRAVITY * dt;
    arcY  += arcVY * dt;

    // ── Spin: constant during flight, no decel in air ──
    rotY += rps * 360 * dt;

    coinScene.style.transform = `translate(-50%,-50%) translateY(${-arcY}px)`;
    coin.style.transform      = `rotateY(${rotY}deg)`;

    if (arcY <= 0 && arcVY < 0) {
      // ── Bounce landing ──
      arcY   = 0;
      peakVY *= 0.6;

      // Apply spin decay + 50/50 direction flip on every landing
      rps *= 0.7;
      if (Math.random() < 0.5) rps = -rps;

      if (peakVY > 15) {
        // Still airborne — re-launch
        arcVY = peakVY;
        coinScene.style.transform = 'translate(-50%,-50%) translateY(0px)';
      } else {
        // Settled on table — spin-only decel until rps < 1
        arcVY    = 0;
        arcY     = 0;
        airborne = false;
        coinScene.style.transform = 'translate(-50%,-50%) translateY(0px)';
      }
    }

  } else {
    // ── Spin-only decel on table ──
    // Continuous exponential decay each frame
    rps  *= Math.pow(0.7, dt / 0.08);
    rotY += rps * 360 * dt;
    coin.style.transform = `rotateY(${rotY}deg)`;

    if (Math.abs(rps) < 1) {
      stopSim();
      snapToResult();
      return;
    }
  }

  rafId = requestAnimationFrame(simStep);
}

// ─── Snap to face ─────────────────────────────────────────────────────────────

function snapToResult() {
  const targetAngle = outcome === 'heads' ? 0 : outcome === 'tails' ? 180 : 90;

  // Normalise rotY mod 360 so we snap the shortest distance
  const current  = ((rotY % 360) + 360) % 360;
  let   delta    = targetAngle - current;
  // Keep delta in [-180, 180] for shortest path
  if (delta >  180) delta -= 360;
  if (delta < -180) delta += 360;

  const snapTarget = rotY + delta;

  const anim = coin.animate([
    { transform: `rotateY(${rotY}deg)` },
    { transform: `rotateY(${snapTarget}deg)` },
  ], { duration: 120, easing: 'ease-out', fill: 'forwards' });

  anim.onfinish = () => {
    coin.getAnimations().forEach(a => a.cancel());
    coin.style.transform = `rotateY(${targetAngle}deg)`;
    rotY = targetAngle;
    recordResult(outcome);
    state.flipping = false;
  };
}

// ─── Instant result ───────────────────────────────────────────────────────────

function applyInstantResult(o) {
  const angle = o === 'heads' ? 0 : o === 'tails' ? 180 : 90;
  stopSim();
  coin.style.transform      = `rotateY(${angle}deg)`;
  coinScene.style.transform = 'translate(-50%,-50%) translateY(0px)';
  rotY = angle;
  recordResult(o);
  state.flipping = false;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

function resetCoin() {
  stopSim();
  coinEdge.style.display    = 'none';
  coin.style.transform      = 'rotateY(0deg)';
  coinScene.style.transform = 'translate(-50%,-50%)';
  rotY = 0; rps = 0; arcY = 0; arcVY = 0; airborne = true;
}

// ─── Record & UI ─────────────────────────────────────────────────────────────

function recordResult(o) {
  state.counts[o]++;
  state.history.unshift({ outcome: o });
  if (state.history.length > 100) state.history.pop();
  resultEl.textContent   = o.toUpperCase();
  promptEl.style.opacity = '1';
  promptEl.textContent   = 'CLICK TO FLIP AGAIN';
  updateSidebar();
}

function updateSidebar() {
  const total = state.counts.heads + state.counts.tails + state.counts.side;
  ['heads', 'tails', 'side'].forEach(k => {
    const row = document.getElementById(`row-${k}`);
    if (state.counts[k] === 0) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    const pct = (state.counts[k] / total) * 100;
    document.getElementById(`bar-${k}`).style.width   = `${pct}%`;
    document.getElementById(`count-${k}`).textContent = state.counts[k];
  });

  historyList.innerHTML = '';
  state.history.forEach((entry, i) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const isSide = entry.outcome === 'side';
    div.innerHTML = `
      <span>#${state.history.length - i}</span>
      <span class="h-result${isSide ? ' side' : ''}">${entry.outcome.toUpperCase()}</span>
    `;
    historyList.appendChild(div);
  });
}