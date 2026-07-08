// --- MIDI Player (vanilla Web Audio, no dependencies) ---
let audioCtx = null
let masterGain = null
let scheduledNodes = []
let loopTimeout = null
let songDuration = 0
let parsedTracks = null
let musicPlaying = false
let currentVolume = 0.2

function buildBandLimitedWave(ctx) {
  const MAX_HARM_FREQ = 8000   // Hz — matches the lowpass cutoff below
  const REF_FREQ      = 500    // Hz — representative centre pitch
  const maxN = Math.floor(MAX_HARM_FREQ / REF_FREQ)   // highest harmonic index
 
  const size = maxN + 1
  const real = new Float32Array(size)   // cosine terms — zero (no DC, no cosines)
  const imag = new Float32Array(size)   // sine terms
 
  for (let k = 1; k <= maxN; k++) {
    if (k % 2 !== 0) imag[k] = (4 / Math.PI) / k   // 1/n roll-off, odd only
  }
 
  // disableNormalization preserves our 1/n amplitudes exactly
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true })
}

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext()
 
    masterGain = audioCtx.createGain()
    masterGain.gain.value = currentVolume
 
    // Hard lowpass at 8 kHz — removes anything above and prevents any
    // residual harmonics from high-pitched notes reaching the output.
    // Q = 0.5 → gentle Butterworth-like slope, no resonant peak.
    filterNode = audioCtx.createBiquadFilter()
    filterNode.type      = 'lowpass'
    filterNode.frequency.value = 8000
    filterNode.Q.value   = 0.5
 
    // Brick-wall limiter — catches transient peaks when many voices fire
    // simultaneously. ratio 20:1 + knee 0 ≈ hard limit at −3 dBFS.
    const limiter = audioCtx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value      = 0
    limiter.ratio.value     = 20
    limiter.attack.value    = 0.001
    limiter.release.value   = 0.1
 
    masterGain.connect(filterNode)
    filterNode.connect(limiter)
    limiter.connect(audioCtx.destination)
 
    bandLimitedWave = buildBandLimitedWave(audioCtx)

  }

  return audioCtx
}

function parseMidi(buffer) {
  const data = new DataView(buffer)
  let pos = 0
  function readUint32() { const v = data.getUint32(pos); pos += 4; return v }
  function readUint16() { const v = data.getUint16(pos); pos += 2; return v }
  function readUint8()  { const v = data.getUint8(pos);  pos += 1; return v }
  function readVarLen() {
    let val = 0, b
    do { b = readUint8(); val = (val << 7) | (b & 0x7f) } while (b & 0x80)
    return val
  }
  pos += 4
  pos += 4
  const format      = readUint16()
  const numTracks   = readUint16()
  const timeDivision = readUint16()
  const tracks = []
  for (let t = 0; t < numTracks; t++) {
    pos += 4
    const chunkLen = readUint32()
    const chunkEnd = pos + chunkLen
    const events = []
    let tick = 0
    let lastStatus = 0
    while (pos < chunkEnd) {
      const delta = readVarLen()
      tick += delta
      let statusByte = data.getUint8(pos)
      if (statusByte & 0x80) { lastStatus = statusByte; pos++ }
      else { statusByte = lastStatus }
      const type    = statusByte & 0xf0
      const channel = statusByte & 0x0f
      if (type === 0x90) {
        const note = readUint8()
        const vel  = readUint8()
        events.push({ tick, type: vel > 0 ? "noteOn" : "noteOff", note, vel, channel })
      } else if (type === 0x80) {
        const note = readUint8()
        const vel  = readUint8()
        events.push({ tick, type: "noteOff", note, vel, channel })
      } else if (type === 0xa0) { pos += 2
      } else if (type === 0xb0) { pos += 2
      } else if (type === 0xc0) { pos += 1
      } else if (type === 0xd0) { pos += 1
      } else if (type === 0xe0) { pos += 2
      } else if (statusByte === 0xff) {
        const metaType = readUint8()
        const metaLen  = readVarLen()
        if (metaType === 0x51) {
          const t0 = readUint8(), t1 = readUint8(), t2 = readUint8()
          events.push({ tick, type: "tempo", uspb: (t0 << 16) | (t1 << 8) | t2 })
        } else {
          pos += metaLen
        }
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        pos += readVarLen()
      } else {
        pos++
      }
    }
    pos = chunkEnd
    tracks.push(events)
  }
  return { format, timeDivision, tracks }
}

function buildNotes(parsed) {
  const { timeDivision, tracks } = parsed
  const tempoMap = []
  tracks.forEach(events => {
    events.forEach(e => {
      if (e.type === "tempo") tempoMap.push({ tick: e.tick, uspb: e.uspb })
    })
  })
  tempoMap.sort((a, b) => a.tick - b.tick)
  function tickToSeconds(tick) {
    let seconds = 0, curTick = 0, curTempo = 500000
    for (const tm of tempoMap) {
      if (tm.tick >= tick) break
      seconds += (Math.min(tm.tick, tick) - curTick) * curTempo / timeDivision / 1e6
      curTick = tm.tick
      curTempo = tm.uspb
    }
    seconds += (tick - curTick) * curTempo / timeDivision / 1e6
    return seconds
  }
  const allNotes = []
  let maxEnd = 0
  tracks.forEach(events => {
    const active = {}
    events.forEach(e => {
      if (e.type === "noteOn") {
        active[e.note] = e.tick
      } else if (e.type === "noteOff" && active[e.note] != null) {
        const startSec = tickToSeconds(active[e.note])
        const endSec   = tickToSeconds(e.tick)
        allNotes.push({ freq: midiNoteToFreq(e.note), start: startSec, end: endSec })
        if (endSec > maxEnd) maxEnd = endSec
        delete active[e.note]
      }
    })
  })
  return { notes: allNotes, duration: maxEnd }
}

function midiNoteToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

async function loadMidi(url) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const parsed = parseMidi(buf)
  const { notes, duration } = buildNotes(parsed)
  parsedTracks = notes
  songDuration = duration
}

function scheduleNotes(offset = 0) {
  const ctx = getAudioCtx()
  const now = ctx.currentTime
  scheduledNodes = []
  parsedTracks.forEach(({ freq, start, end }) => {
    if (end <= offset) return
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.value = freq
    gain.gain.value = 0.15
    osc.connect(gain)
    gain.connect(masterGain)        // ← through masterGain, not ctx.destination
    const startTime = now + Math.max(0, start - offset)
    const endTime   = now + (end - offset)
    osc.start(startTime)
    gain.gain.setValueAtTime(0.15, startTime)
    gain.gain.setValueAtTime(0, endTime)
    osc.stop(endTime + 0.01)
    scheduledNodes.push(osc)
  })
  loopTimeout = setTimeout(() => {
    if (musicPlaying) scheduleNotes(0)
  }, (songDuration - offset) * 1000)
}

function playMusic() {
  if (!parsedTracks) return
  getAudioCtx().resume()
  musicPlaying = true
  scheduleNotes(0)
}

function pauseMusic() {
  musicPlaying = false
  clearTimeout(loopTimeout)
  scheduledNodes.forEach(n => { try { n.stop() } catch(e) {} })
  scheduledNodes = []
  audioCtx?.suspend()
}

function stopMusic() {
  pauseMusic()
  musicPlaying = false
}

function setMusicVolume(v) {
  currentVolume = Math.max(0, Math.min(1, v))
  if (masterGain) masterGain.gain.value = currentVolume
}