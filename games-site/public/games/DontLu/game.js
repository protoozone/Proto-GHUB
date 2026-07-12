'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// COLOUR UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function randomColour(exclude = []) {
  let best = null, bestDist = -1;
  for (let t = 0; t < 80; t++) {
    const h = Math.random() * 360;
    const s = 55 + Math.random() * 30;
    const l = 38 + Math.random() * 22;
    const hex = hslToHex(h, s, l);
    const d = exclude.length ? Math.min(...exclude.map(e => colourDist(e, hex))) : 999;
    if (d > bestDist) { bestDist = d; best = hex; }
  }
  return best;
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function colourDist(a, b) {
  const [rA,gA,bA] = [1,3,5].map(i=>parseInt(a.slice(i,i+2),16));
  const [rB,gB,bB] = [1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
  return Math.sqrt((rA-rB)**2+(gA-gB)**2+(bA-bB)**2);
}
function textFor(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return (r+g+b) < 300 ? '#fff' : '#000';
}
function colAlpha(hex, a) {
  return hex + Math.round(a*255).toString(16).padStart(2,'0');
}
function colLighten(hex, amt=40) {
  return '#'+[1,3,5].map(i=>Math.min(255,parseInt(hex.slice(i,i+2),16)+amt).toString(16).padStart(2,'0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2D VECTOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const v2 = {
  add: (a,b)=>({x:a.x+b.x,y:a.y+b.y}),
  sub: (a,b)=>({x:a.x-b.x,y:a.y-b.y}),
  scale: (v,s)=>({x:v.x*s,y:v.y*s}),
  len: v=>Math.hypot(v.x,v.y),
  norm: v=>{const l=Math.hypot(v.x,v.y)||1;return{x:v.x/l,y:v.y/l};},
  perp: v=>({x:-v.y,y:v.x}),
  lerp: (a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),
  dot: (a,b)=>a.x*b.x+a.y*b.y,
};

// ─────────────────────────────────────────────────────────────────────────────
// BOARD DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// Grid coordinate convention (shared for all cases):
//   Each player i has a 3-column × 6-row grid.
//   (col, row) where col∈{0,1,2}, row∈{0..6}
//     col 0 = "left" arm  (CCW side, previous player's direction)
//     col 1 = home-stretch column (centre)
//     col 2 = "right" arm (CW side, next player / starting side)
//     row 0 = outermost (furthest from centre)
//     row 6 = innermost (connects to inner structure / shared node)
//   The shared squares: grid[i] (0,6) === grid[i-1] (2,6)  (same physical square)
//
// PATH for player i:
//   Start at own grid (2,1) — outermost row of right arm (skipping (2,0) corner)
//   Travel inward: (2,1)→(2,2)→(2,3)→(2,4)→(2,5)→(2,6)  [5 steps, (2,6)=shared with grid i+1]
//   Then for each opponent grid j = i+1, i+2, ..., i+n-1  (mod n):
//     Enter at (0,6) of grid j  [same square as (2,6) of grid j-1, already stepped on]
//     Travel: (0,5)→(0,4)→(0,3)→(0,2)→(0,1)→(0,0)  [col 0 outward]
//             (1,0)→(2,0)                              [across top]
//             (2,1)→(2,2)→(2,3)→(2,4)→(2,5)→(2,6)  [col 2 inward, (2,6) = shared with next]
//   After all opponents, re-enter own grid at (0,6):
//     (0,5)→(0,4)→(0,3)→(0,2)→(0,1)→(0,0)  [col 0 outward]
//     (1,0)→                                  [top centre]
//     home stretch: (1,1)→(1,2)→(1,3)→(1,4)→(1,5)→(1,6)→END
//
// Node ID scheme: `g${gridIndex}_c${col}_r${row}`   for grid nodes
//                 `end`                               for the centre end node

function buildPath(playerIndex, n) {
  const gid = i => `g${((playerIndex + i) % n)}`;
  const path = [];

  // Own grid: right arm inward (2,1)→(2,6)
  for (let r = 1; r <= 6; r++) path.push(`${gid(0)}_c2_r${r}`);

  // Each opponent grid
  for (let k = 1; k < n; k++) {
    const g = gid(k);
    // left arm outward (0,5)→(0,0), top row (1,0),(2,0), right arm inward (2,1)→(2,6)
    for (let r = 5; r >= 0; r--) path.push(`${g}_c0_r${r}`);
    path.push(`${g}_c1_r0`);
    path.push(`${g}_c2_r0`);
    for (let r = 1; r <= 6; r++) path.push(`${g}_c2_r${r}`);
  }

  // Re-enter own grid at (0,6) — already on (2,6) of last grid which === (0,6) of own
  // left arm outward (0,5)→(0,0), top centre (1,0), then home stretch (1,1)→(1,6)→end
  const og = gid(0);
  for (let r = 5; r >= 0; r--) path.push(`${og}_c0_r${r}`);
  path.push(`${og}_c1_r0`);
  for (let r = 1; r <= 6; r++) path.push(`${og}_c1_r${r}`);
  path.push('end');

  return path;
}

// Verify: path length = 5 + (n-1)*14 + 7 + 1 + 1 = 5+14n-14+9 = 14n
// Wait let me count:
// own (2,1..6) = 6 nodes
// per opponent: col0 (5..0)=6, (1,0)=1, (2,0)=1, col2 (1..6)=6 → 14 each, (n-1)*14
// own return: col0 (5..0)=6, (1,0)=1, home (1,1..6)=6, end=1 → 14
// total = 6 + (n-1)*14 + 14 = 6 + 14n - 14 + 14 = 14n + 6
// Hmm. Let me just count for n=2: 6 + 14 + 14 = 34. Let's verify separately.

// ─────────────────────────────────────────────────────────────────────────────
// CASE 1: n=1  —  single straight lane
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard1(k, colours) {
  const LANE = 16;
  const nodeIds = [];
  for (let i = 0; i < LANE; i++) nodeIds.push(`lane_${i}`);
  nodeIds.push('end');
  const path = [...nodeIds];
  return {
    n: 1, k, colours,
    nodeIds,
    path,
    layout(W, H) {
      const sq = Math.min((W * 0.65) / LANE, H * 0.09);
      this.sq = sq;
      const startX = W * 0.18, y = H * 0.52;
      this.laneNodes = nodeIds.map((id, i) => ({
        id, x: startX + (i + 0.5) * sq, y,
        isEnd: id === 'end'
      }));
      this.basePos = { x: W * 0.09, y: H * 0.5, r: Math.min(W * 0.07, H * 0.22) };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE 2: n=2  —  two semicircles + two 3×6 grids + 3×3 end zone
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard2(k, colours) {
  // Two grids: grid 0 = top, grid 1 = bottom
  // Grid (col, row): col∈{0,1,2}, row∈{0..6}
  // Shared: g0_c2_r6 === g1_c0_r6  (rightmost-inner of top = leftmost-inner of bottom)
  //     and g1_c2_r6 === g0_c0_r6  (rightmost-inner of bottom = leftmost-inner of top)
  // End zone: 3×3 square at centre between the grids
  // P0 starts at g0_c2_r1, P1 starts at g1_c2_r1

  const paths = [buildPath(0, 2), buildPath(1, 2)];

  return {
    n: 2, k, colours, paths,
    layout(W, H) {
      const endSz = Math.min(W, H) * 0.18;   // 3×3 end zone total size
      const sq    = endSz / 3;               // one grid square
      this.sq   = sq;
      this.endSz = endSz;

      const cx = W / 2, cy = H / 2;
      this.cx = cx; this.cy = cy;

      // Grid 0 sits above centre, grid 1 below
      // Row 6 (innermost) of each grid is adjacent to the end zone
      // Row 6 y-coord for grid 0: cy - endSz/2 - 0 (flush with end zone top)
      // Actually row 6 is the innermost row cell top, so the cell occupies
      // [cy - endSz/2 - sq, cy - endSz/2] for grid 0
      // Row r of grid 0: y centre = cy - endSz/2 - sq*(6-r) + sq/2
      //                            = cy - endSz/2 - sq*(5.5-r)
      // Col c: x centre = cx + (c-1)*sq

      this.gridPos = (g, col, row) => {
        const ySign = g === 0 ? -1 : 1;
        const x = cx + (col - 1) * sq;
        const y = cy + ySign * (endSz / 2 + sq * (6 - row) - sq / 2);
        return { x, y };
      };

      // All unique node positions (deduplicate shared corners)
      this.nodes = {};
      for (let g = 0; g < 2; g++) {
        for (let col = 0; col < 3; col++) {
          for (let row = 0; row < 7; row++) {
            // Shared node: g0_c2_r6 and g1_c0_r6 are the same physical position
            // Canonical id: always use the one with lower g
            let id = `g${g}_c${col}_r${row}`;
            // Remap shared squares
            if (g === 1 && col === 0 && row === 6) id = 'g0_c2_r6';
            if (g === 0 && col === 2 && row === 6) {
              // g0_c2_r6 is also g1_c0_r6 — keep g0_c2_r6 as canonical
            }
            if (!this.nodes[id]) {
              const pos = this.gridPos(g, col, row);
              this.nodes[id] = { id, x: pos.x, y: pos.y, g, col, row };
            }
          }
        }
      }
      this.nodes['end'] = { id: 'end', x: cx, y: cy };

      // Semicircle bases: left (P1) and right (P0)... actually P0 top, P1 bottom
      // P0 base: semicircle above grid 0
      const baseR = Math.min(W * 0.14, H * 0.16);
      this.bases = [
        { x: cx, y: cy - endSz / 2 - sq * 6 - baseR * 0.7, r: baseR, player: 0 },
        { x: cx, y: cy + endSz / 2 + sq * 6 + baseR * 0.7, r: baseR, player: 1 },
      ];
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE n≥3: 2n-gon with inner n-gon + n grids + kite triangles
// ─────────────────────────────────────────────────────────────────────────────
function buildBoardN(n, k, colours) {
  const paths = Array.from({ length: n }, (_, i) => buildPath(i, n));

  return {
    n, k, colours, paths,
    layout(W, H) {
      const cx = W / 2, cy = H / 2;
      this.cx = cx; this.cy = cy;

      // We need to fit n grids of width 3*sq around an inner n-gon.
      // Inner n-gon side length = 3*sq  →  innerR = (3*sq/2) / sin(π/n)
      // Outer extent of grid = innerR + 6*sq  (6 rows outward)
      // We want outer extent ≤ min(W,H)/2 - margin
      const margin = Math.min(W, H) * 0.03;
      const avail  = Math.min(W, H) / 2 - margin;
      const sinPN  = Math.sin(Math.PI / n);
      // avail = innerR + 6*sq = (3*sq)/(2*sinPN) + 6*sq = sq*(1.5/sinPN + 6)
      const sq = avail / (1.5 / sinPN + 6);
      this.sq = sq;

      const innerR = (1.5 * sq) / sinPN;
      this.innerR  = innerR;

      // Inner n-gon vertices: vertex i at angle startAngle + i*2π/n
      // We want grid 0 to face "up" (away from top of canvas),
      // so the midpoint of side 0 points straight up → side 0 midpoint at angle -π/2
      // Side i goes from vertex i to vertex i+1
      // Midpoint of side i is at angle: -π/2 + i*2π/n  from centre
      // Vertex i is at angle: -π/2 - π/n + i*2π/n
      const vAngle = i => -Math.PI / 2 - Math.PI / n + i * 2 * Math.PI / n;
      const innerVerts = Array.from({ length: n }, (_, i) => ({
        x: cx + innerR * Math.cos(vAngle(i)),
        y: cy + innerR * Math.sin(vAngle(i)),
      }));
      this.innerVerts = innerVerts;

      // For each grid i:
      //   side i goes from innerVerts[i] to innerVerts[(i+1)%n]
      //   outDir = unit vector from centre through midpoint of side i
      //   sideDir = unit vector from innerVerts[i] to innerVerts[(i+1)%n]  (col 0→2 direction)
      //   origin = midpoint of side i
      //   cell centre (col, row):
      //     along = (col - 1) * sq   along sideDir  (col1 = centre of side)
      //     out   = (6 - row - 0.5) * sq  along outDir  (row6 = innermost, row0 = outermost)
      //     → pos = origin + along*sideDir + out*outDir

      this.grids = Array.from({ length: n }, (_, i) => {
        const vA = innerVerts[i];
        const vB = innerVerts[(i + 1) % n];
        const mid = v2.lerp(vA, vB, 0.5);
        const sideDir = v2.norm(v2.sub(vB, vA));   // col 0→2
        const outDir  = v2.norm(v2.sub(mid, {x:cx,y:cy})); // inward→outward
        return { mid, sideDir, outDir, vA, vB };
      });

      // Compute all node positions
      this.nodes = {};
      for (let g = 0; g < n; g++) {
        const grid = this.grids[g];
        for (let col = 0; col < 3; col++) {
          for (let row = 0; row < 7; row++) {
            const id = `g${g}_c${col}_r${row}`;
            const along = v2.scale(grid.sideDir, (col - 1) * sq);
            const out   = v2.scale(grid.outDir,  (6 - row - 0.5) * sq);
            const pos   = v2.add(v2.add(grid.mid, along), out);
            this.nodes[id] = { id, x: pos.x, y: pos.y };
          }
        }
      }

      // Shared nodes: g[i]_c2_r6 and g[(i+1)%n]_c0_r6 are the same square.
      // Resolve: use g[i]_c2_r6 as canonical, and remap g[(i+1)%n]_c0_r6 in path lookup.
      // We'll handle this in nodePos() lookup below.

      this.nodes['end'] = { id: 'end', x: cx, y: cy };

      // Kite triangles: between adjacent grids.
      // Kite i is between grid i (right side, col 2) and grid (i+1) (left side, col 0).
      // Vertices of kite i:
      //   inner corner = innerVerts[(i+1)%n]
      //   outer-right corner of grid i at (col=2, row=0): outermost right
      //   outer polygon vertex at that corner
      //   outer-left corner of grid (i+1) at (col=0, row=0)
      //
      // The outer polygon vertex between grid i and grid i+1:
      //   It's at the intersection of the extensions of the outer edges of the two grids.
      //   Simpler: it's in the direction of innerVerts[(i+1)%n] from centre, at distance outerR.
      //   outerR = innerR + 6*sq
      const outerR = innerR + 6 * sq;
      this.outerR = outerR;

      this.kites = Array.from({ length: n }, (_, i) => {
        const gridI  = this.grids[i];
        const gridJ  = this.grids[(i + 1) % n];
        // Outer-right corner of grid i = (col=2, row=0) cell centre offset to corner
        // Cell (2,0) centre: along = sq, out = 5.5*sq  → corner at + 0.5*sideDir + 0.5*outDir
        const outerRight = v2.add(
          v2.add(gridI.mid, v2.scale(gridI.sideDir, sq)),
          v2.scale(gridI.outDir, 6 * sq)
        );
        const outerLeft = v2.add(
          v2.add(gridJ.mid, v2.scale(gridJ.sideDir, -sq)),
          v2.scale(gridJ.outDir, 6 * sq)
        );
        const innerCorner = innerVerts[(i + 1) % n];
        // Outer polygon vertex: along the direction of innerCorner from centre, at outerR
        const outerDir  = v2.norm(v2.sub(innerCorner, {x:cx,y:cy}));
        const outerVertex = v2.add({x:cx,y:cy}, v2.scale(outerDir, outerR));

        const pts = [innerCorner, outerRight, outerVertex, outerLeft];
        const kcx = pts.reduce((s,p)=>s+p.x,0)/4;
        const kcy = pts.reduce((s,p)=>s+p.y,0)/4;
        return { pts, cx: kcx, cy: kcy, player: i };
      });

      // Small central triangles: connecting each side midpoint to centre.
      // Triangle i: centre → midpoint of side i → midpoint of side (i+1)%n
      // But "midpoint of side" is at innerR outward, so actually:
      //   Triangle i vertices: {x:cx,y:cy}, innerVerts[i], innerVerts[(i+1)%n]
      // This creates n triangles that subdivide the inner n-gon.
      this.centralTris = Array.from({ length: n }, (_, i) => ({
        player: i,
        pts: [
          {x:cx,y:cy},
          innerVerts[i],
          innerVerts[(i+1)%n],
        ],
        // Label position: centroid
        lx: (cx + innerVerts[i].x + innerVerts[(i+1)%n].x) / 3,
        ly: (cy + innerVerts[i].y + innerVerts[(i+1)%n].y) / 3,
      }));
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED BOARD BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard(n, k, colours) {
  if (n === 1) return buildBoard1(k, colours);
  if (n === 2) return buildBoard2(k, colours);
  return buildBoardN(n, k, colours);
}

// Resolve a node id to its canonical id (handles shared squares)
function canonicalId(id, n) {
  // g[i]_c0_r6  ===  g[(i-1+n)%n]_c2_r6
  const m = id.match(/^g(\d+)_c0_r6$/);
  if (m) {
    const prev = (parseInt(m[1]) - 1 + n) % n;
    return `g${prev}_c2_r6`;
  }
  return id;
}

function nodePos(board, id) {
  const cid = canonicalId(id, board.n);
  return board.nodes?.[cid] ?? board.nodes?.[id];
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────────────
function drawBoardPreview(canvas, n, k) {
  const colours = [];
  for (let i = 0; i < n; i++) colours.push(randomColour(colours));
  const board = buildBoard(n, k, colours);
  board.layout(canvas.width, canvas.height);
  const ctx = canvas.getContext('2d');
  renderBoard(ctx, board, null, canvas.width, canvas.height);
}

function renderBoard(ctx, board, gs, W, H) {
  ctx.fillStyle = '#0f1118';
  ctx.fillRect(0, 0, W, H);

  if (board.n === 1) { renderBoard1(ctx, board, gs, W, H); return; }
  if (board.n === 2) { renderBoard2(ctx, board, gs, W, H); return; }
  renderBoardN(ctx, board, gs, W, H);
}

// ── n=1 rendering ────────────────────────────────────────────────────────────
function renderBoard1(ctx, board, gs, W, H) {
  const col = board.colours[0];
  const sq  = board.sq;
  const fr  = sq * 0.38;

  // Base circle
  const b = board.basePos;
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fillStyle = colAlpha(col, 0.25); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Lane squares
  for (const nd of board.laneNodes) {
    ctx.save();
    if (nd.isEnd) {
      ctx.beginPath(); ctx.arc(nd.x, nd.y, sq*0.45, 0, Math.PI*2);
      ctx.fillStyle = '#e8d88a'; ctx.fill();
      ctx.font = `${sq*0.55}px serif`; ctx.fillStyle='#1a1200';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('★', nd.x, nd.y);
    } else {
      drawSquare(ctx, nd.x, nd.y, sq, '#1e2438', '#3d4f70', 0.8);
    }
    ctx.restore();
  }

  if (gs) {
    gs.pieces.forEach(p => {
      if (p.finished) return;
      const isV = gs.validMoves.has(p.id), isSel = gs.selected===p.id;
      let px, py;
      if (p.pathIndex < 0) {
        px = b.x + (p.kiteSlot - (board.k-1)/2) * fr * 2.2; py = b.y;
      } else {
        const nd = board.laneNodes[p.pathIndex]; if(!nd) return;
        px = nd.x; py = nd.y;
      }
      drawPawnHighlight(ctx, px, py, fr, col, isV, isSel);
      drawPawn(ctx, px, py, fr, col, p.figureNum+1);
    });
  } else {
    for (let f = 0; f < board.k; f++) {
      const px = b.x + (f - (board.k-1)/2) * fr * 2.2;
      drawPawn(ctx, px, b.y, fr, col, f+1);
    }
  }
}

// ── n=2 rendering ────────────────────────────────────────────────────────────
function renderBoard2(ctx, board, gs, W, H) {
  const { colours, sq, endSz, cx, cy, bases, nodes } = board;

  // Draw end zone (3×3 grid at centre)
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      const x = cx + (col-1)*sq, y = cy + (row-1)*sq;
      // Colour by which player's home stretch passes through col 1
      const fill = col===1 ? '#e8d88a33' : '#1e2438';
      drawSquare(ctx, x, y, sq, fill, '#3d4f70', 0.8);
    }
  }

  // End star at centre
  ctx.save();
  ctx.font=`${sq*0.9}px serif`; ctx.fillStyle='#e8d88a';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('★', cx, cy);
  ctx.restore();

  // Draw grids 0 (top) and 1 (bottom)
  for (let g = 0; g < 2; g++) {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 7; row++) {
        const id = `g${g}_c${col}_r${row}`;
        const nd = board.nodes[canonicalId(id, 2)] ?? board.nodes[id];
        if (!nd) continue;
        // Colouring: col 1 rows 1-6 = home stretch for this player
        let fill = '#1e2438';
        if (col === 1 && row >= 1) fill = colAlpha(colours[g], 0.22);
        else if (col !== 1 && row === 0) fill = colAlpha(colours[g], 0.12); // top row
        drawSquare(ctx, nd.x, nd.y, sq, fill, '#3d4f70', 0.8);
      }
    }
  }

  // Semicircle bases
  bases.forEach(b => {
    const col = colours[b.player];
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = colAlpha(col, 0.28); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.font=`bold ${Math.max(10,b.r*0.35)}px system-ui`;
    ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(`P${b.player+1}`, b.x, b.y);
    ctx.restore();
  });

  if (gs) {
    renderFiguresN(ctx, board, gs, 2);
    renderGameOver(ctx, board, gs, W, H);
  } else {
    bases.forEach(b => renderBasePawns(ctx, b.x, b.y, board.k, colours[b.player], board.sq));
  }
}

// ── n≥3 rendering ────────────────────────────────────────────────────────────
function renderBoardN(ctx, board, gs, W, H) {
  const { n, colours, sq, innerR, outerR, cx, cy, innerVerts, grids, kites, centralTris, nodes } = board;

  // Outer polygon background
  const outerVerts = innerVerts.map(v => {
    const d = v2.norm(v2.sub(v, {x:cx,y:cy}));
    return v2.add({x:cx,y:cy}, v2.scale(d, outerR));
  });
  // Actually outer polygon has 2n sides — the outer verts include both inner polygon
  // vertex directions AND the kite outer vertices
  // Outer polygon = kite outer vertices (there are n of them, one per kite)
  // + grid outer corners (2 per grid = 2n total points around the outside)
  // Simplest: draw as the convex hull of all outer corners
  // outer corners of grid i: (col=0,row=0) and (col=2,row=0)
  const allOuterPts = [];
  for (let i = 0; i < n; i++) {
    const g = grids[i];
    allOuterPts.push(v2.add(v2.add(g.mid, v2.scale(g.sideDir, -sq)), v2.scale(g.outDir, 6*sq)));
    allOuterPts.push(v2.add(v2.add(g.mid, v2.scale(g.sideDir,  sq)), v2.scale(g.outDir, 6*sq)));
  }
  // Interleave: outer-left of grid i, outer-right of grid i, [kite outer vertex], outer-left of grid i+1...
  // Actually: go around: outerLeft[i], outerRight[i], kiteVertex[i], outerLeft[i+1], ...
  const boundary = [];
  for (let i = 0; i < n; i++) {
    const g  = grids[i];
    const gn = grids[(i+1)%n];
    const outerRight = v2.add(v2.add(g.mid,  v2.scale(g.sideDir,  sq)), v2.scale(g.outDir, 6*sq));
    const kV = kites[i].pts[2]; // outer polygon vertex between kite
    boundary.push(outerRight, kV);
  }

  ctx.save();
  ctx.beginPath();
  boundary.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.closePath();
  ctx.fillStyle='#151a28'; ctx.fill();
  ctx.strokeStyle='#3a4060'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();

  // Kite triangles (home areas)
  kites.forEach((kit, i) => {
    const col = colours[i % colours.length];
    ctx.save();
    ctx.beginPath();
    kit.pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = colAlpha(col, 0.30); ctx.fill();
    ctx.strokeStyle = colAlpha(col, 0.7); ctx.lineWidth=1.5; ctx.stroke();
    ctx.restore();
  });

  // Grid cells
  for (let g = 0; g < n; g++) {
    const col = colours[g % colours.length];
    for (let col2 = 0; col2 < 3; col2++) {
      for (let row = 0; row < 7; row++) {
        const id  = `g${g}_c${col2}_r${row}`;
        const cid = canonicalId(id, n);
        const nd  = nodes[cid] ?? nodes[id];
        if (!nd) continue;

        let fill = '#1e2438';
        if (col2 === 1 && row >= 1) fill = colAlpha(col, 0.20); // home stretch
        else if (row === 0)         fill = colAlpha(col, 0.10); // back row

        drawSquare(ctx, nd.x, nd.y, sq, fill, '#3d4f7055', 0.7);
      }
    }
  }

  // Inner n-gon fill
  ctx.save();
  ctx.beginPath();
  innerVerts.forEach((v,i)=>i===0?ctx.moveTo(v.x,v.y):ctx.lineTo(v.x,v.y));
  ctx.closePath();
  ctx.fillStyle='#0f1220'; ctx.fill();
  ctx.strokeStyle='#4a5580'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.restore();

  // Central triangles (finished piece display) — subdivide inner n-gon
  centralTris.forEach((tri, i) => {
    const col = colours[i % colours.length];
    ctx.save();
    ctx.beginPath();
    tri.pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle = colAlpha(col, 0.35); ctx.fill();
    ctx.strokeStyle = colAlpha(col, 0.6); ctx.lineWidth=1; ctx.stroke();
    ctx.restore();

    // ×N count if game state present
    if (gs) {
      const count = gs.pieces.filter(p=>p.player===i&&p.finished).length;
      if (count > 0) {
        ctx.save();
        ctx.font=`bold ${Math.max(9,sq*0.65)}px system-ui`;
        ctx.fillStyle=textFor(col); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(`×${count}`, tri.lx, tri.ly);
        ctx.restore();
      }
    }
  });

  // End star at centre
  ctx.save();
  ctx.font=`${Math.max(10,sq*0.9)}px serif`; ctx.fillStyle='#e8d88a';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('★', cx, cy);
  ctx.restore();

  if (gs) {
    renderFiguresN(ctx, board, gs, n);
    renderGameOver(ctx, board, gs, W, H);
  } else {
    kites.forEach((kit, i) => {
      renderBasePawns(ctx, kit.cx, kit.cy, board.k, colours[i % colours.length], sq);
    });
  }
}

// ── Shared figure rendering ──────────────────────────────────────────────────
function renderFiguresN(ctx, board, gs, n) {
  const { k, colours, kites, nodes, paths } = board;
  const sq  = board.sq;
  const fr  = Math.max(5, sq * 0.36);

  gs.pieces.forEach(piece => {
    if (piece.finished) return;
    const col     = colours[piece.player % colours.length];
    const isValid = gs.validMoves.has(piece.id);
    const isSel   = gs.selected === piece.id;
    let px, py;

    if (piece.pathIndex < 0) {
      // In home kite / base
      const kit = n >= 3 ? kites[piece.player] : board.bases[piece.player];
      const cols = Math.ceil(Math.sqrt(k));
      const sp   = fr * 2.4;
      const ox   = kit.cx ?? kit.x;
      const oy   = kit.cy ?? kit.y;
      px = ox + (piece.kiteSlot % cols - (cols-1)/2) * sp;
      py = oy + (Math.floor(piece.kiteSlot/cols) - (Math.ceil(k/cols)-1)/2) * sp;
    } else {
      const rawId  = paths[piece.player][piece.pathIndex];
      const cid    = canonicalId(rawId, n);
      const nd     = nodes[cid] ?? nodes[rawId];
      if (!nd) return;
      px = nd.x; py = nd.y;
    }

    drawPawnHighlight(ctx, px, py, fr, col, isValid, isSel);
    drawPawn(ctx, px, py, fr, col, piece.figureNum + 1);
  });
}

function renderGameOver(ctx, board, gs, W, H) {
  if (gs.phase !== 'gameover') return;
  const col = board.colours[gs.winner % board.colours.length];
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fillRect(0,0,W,H);
  ctx.font=`bold ${Math.max(18,Math.min(W,H)*0.055)}px system-ui`;
  ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(`Player ${gs.winner+1} wins! 🎉`, W/2, H/2-18);
  ctx.font=`${Math.max(12,Math.min(W,H)*0.028)}px system-ui`;
  ctx.fillStyle='#e8e4d8aa'; ctx.fillText('tap to play again', W/2, H/2+20);
  ctx.restore();
}

// ── Primitive drawers ────────────────────────────────────────────────────────
function drawSquare(ctx, cx, cy, sq, fill, stroke, lw=0.8) {
  const hs = sq * 0.5 - 0.5;
  ctx.save();
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=lw;
  ctx.beginPath(); ctx.rect(cx-hs, cy-hs, hs*2, hs*2);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawPawn(ctx, x, y, r, col, num) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle=col; ctx.fill();
  ctx.strokeStyle='#00000088'; ctx.lineWidth=1; ctx.stroke();
  ctx.font=`bold ${Math.max(7,r*0.85)}px system-ui`;
  ctx.fillStyle=textFor(col); ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(num), x, y);
  ctx.restore();
}

function drawPawnHighlight(ctx, x, y, r, col, isValid, isSelected) {
  if (isValid && !isSelected) {
    ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*2,0,Math.PI*2);
    ctx.fillStyle=colAlpha(col, 0.20); ctx.fill(); ctx.restore();
  }
  if (isSelected) {
    ctx.save(); ctx.beginPath(); ctx.arc(x,y,r*2.3,0,Math.PI*2);
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
  }
}

function renderBasePawns(ctx, cx, cy, k, col, sq) {
  const fr   = Math.max(5, sq*0.36);
  const cols = Math.ceil(Math.sqrt(k));
  const sp   = fr * 2.4;
  for (let f = 0; f < k; f++) {
    const px = cx + (f%cols - (cols-1)/2) * sp;
    const py = cy + (Math.floor(f/cols) - (Math.ceil(k/cols)-1)/2) * sp;
    drawPawn(ctx, px, py, fr, col, f+1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-D DIE (D6 rolling over board)
// ─────────────────────────────────────────────────────────────────────────────
const _G=0.09,_VR=0.6,_FF=0.90,_WF=0.70,_BR=0.38,_BF=0.994,_DT=0.12,_DM=0.72,_SF=28;
function _mm(a,b){return[a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8]];}
function _mv(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];}
function _nv(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return l<1e-12?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
function _ra(ax,ay,az,a){const c=Math.cos(a),s=Math.sin(a),t=1-c;return[t*ax*ax+c,t*ax*ay-s*az,t*ax*az+s*ay,t*ay*ax+s*az,t*ay*ay+c,t*ay*az-s*ax,t*az*ax-s*ay,t*az*ay+s*ax,t*az*az+c];}
function _rz(a){const c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1];}
function _rft(f,t){const cx=f[1]*t[2]-f[2]*t[1],cy=f[2]*t[0]-f[0]*t[2],cz=f[0]*t[1]-f[1]*t[0];const sA=Math.sqrt(cx*cx+cy*cy+cz*cz),cA=f[0]*t[0]+f[1]*t[1]+f[2]*t[2];if(sA<1e-9){if(cA>0)return[1,0,0,0,1,0,0,0,1];const px=Math.abs(f[0])<0.9?1:0,py=Math.abs(f[0])<0.9?0:1;const qx=f[1]*0-f[2]*py,qy=f[2]*px,qz=f[0]*py-f[1]*px;const ql=Math.sqrt(qx*qx+qy*qy+qz*qz);const k=[qx/ql,qy/ql,qz/ql];return[2*k[0]*k[0]-1,2*k[0]*k[1],2*k[0]*k[2],2*k[1]*k[0],2*k[1]*k[1]-1,2*k[1]*k[2],2*k[2]*k[0],2*k[2]*k[1],2*k[2]*k[2]-1];}const k=[cx/sA,cy/sA,cz/sA];const tt=1-cA,ss=sA;return[tt*k[0]*k[0]+cA,tt*k[0]*k[1]-ss*k[2],tt*k[0]*k[2]+ss*k[1],tt*k[1]*k[0]+ss*k[2],tt*k[1]*k[1]+cA,tt*k[1]*k[2]-ss*k[0],tt*k[2]*k[0]-ss*k[1],tt*k[2]*k[1]+ss*k[0],tt*k[2]*k[2]+cA];}
function _sl(A,B,t){const AT=[A[0],A[3],A[6],A[1],A[4],A[7],A[2],A[5],A[8]];const R=_mm(B,AT);const cA=Math.max(-1,Math.min(1,(R[0]+R[4]+R[8]-1)/2));const ang=Math.acos(cA);if(ang<1e-6)return A;const s=1/(2*Math.sin(ang));const ax=(R[7]-R[5])*s,ay=(R[2]-R[6])*s,az=(R[3]-R[1])*s;return _mm(_ra(ax,ay,az,ang*t),A);}
const _CV=[[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],[-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]];
const _CF=[{v:[3,2,1,0],n:[0,0,-1],val:1},{v:[4,5,6,7],n:[0,0,1],val:6},{v:[0,1,5,4],n:[0,-1,0],val:2},{v:[7,6,2,3],n:[0,1,0],val:5},{v:[0,4,7,3],n:[-1,0,0],val:3},{v:[1,2,6,5],n:[1,0,0],val:4}];
const _FS=96,_D6T={};
(()=>{for(const f of _CF){const c=document.createElement('canvas');c.width=c.height=_FS;const x=c.getContext('2d');x.fillStyle='#c0320a';x.beginPath();x.roundRect(2,2,_FS-4,_FS-4,8);x.fill();x.fillStyle='#fff';x.font=`bold ${_FS*0.52}px monospace`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(f.val),_FS/2,_FS/2);_D6T[f.val]=c;}})();
function _sp(val){const f=_CF.find(x=>x.val===val);const R=_rft(f.n,[0,0,1]);return _mm(_rz(Math.floor(Math.random()*4)*Math.PI/2),R);}
function _bap(snapM,ivz){const bv=[];let vv=ivz;while(vv>0.06){bv.push(vv);vv*=_VR;}bv.reverse();let omega=0.03+Math.random()*0.015;let axis=_nv([(Math.random()-.5),(Math.random()-.5),(Math.random()-.5)]);const fp=[snapM],fs=[];let M=snapM;for(let i=0;i<bv.length;i++){const ss=fp.length;const af=Math.ceil(2*bv[i]/_G);for(let ff=0;ff<af;ff++){M=_mm(_ra(axis[0],axis[1],axis[2],omega),M);fp.push(M);}fs.push({s:ss,e:fp.length-1});omega/=0.78;axis=_nv([(Math.random()-.5),(Math.random()-.5),(Math.random()-.5)]);}const tl=fp.length-1;fp.reverse();return{path:fp,segs:[...fs].reverse().map(({s,e})=>({s:tl-e,e:tl-s}))};}
function createDie(outcome,sx,sy){const snap=_sp(outcome);const ivz=1.5+Math.random()*0.7;const{path,segs}=_bap(snap,ivz);const dir=Math.random()*Math.PI*2;return{outcome,x:sx,y:sy,vx:Math.cos(dir)*(8+Math.random()*8),vy:Math.sin(dir)*(8+Math.random()*8),h:0.8+Math.random()*0.4,vz:ivz,apex:0,snap,path,segs,si:0,af:0,curM:path[0],settling:false,st:0,sf:null,done:false,scale:42,r:22};}
function stepDie(die,W,H,pad){if(die.done)return;die.vz-=_G;die.h+=die.vz;if(die.h<=0){die.h=0;die.vz=Math.abs(die.vz)*_VR;die.apex=(die.vz*die.vz)/(2*_G);die.vx*=_FF;die.vy*=_FF;const ns=die.si+1;if(ns<die.segs.length)die.si=ns;if(die.vz<0.08)die.apex=0;}if(die.vz>0)die.apex=die.h+(die.vz*die.vz)/(2*_G);const fr=_BF-Math.max(0,1-die.apex/_DT)*(_BF-_DM);die.vx*=fr;die.vy*=fr;die.x+=die.vx;die.y+=die.vy;const rr=die.r,wd=0.7+Math.random()*0.1;if(die.x-rr<pad){die.x=pad+rr;die.vx=Math.abs(die.vx)*_BR*wd;die.vy*=_WF;}else if(die.x+rr>W-pad){die.x=W-pad-rr;die.vx=-Math.abs(die.vx)*_BR*wd;die.vy*=_WF;}if(die.y-rr<pad){die.y=pad+rr;die.vy=Math.abs(die.vy)*_BR*wd;die.vx*=_WF;}else if(die.y+rr>H-pad){die.y=H-pad-rr;die.vy=-Math.abs(die.vy)*_BR*wd;die.vx*=_WF;}}
function animDie(die){if(die.done)return;const spd=Math.sqrt(die.vx*die.vx+die.vy*die.vy);if(die.settling){die.st+=1/_SF;if(die.st>=1){die.curM=die.snap;die.done=true;}else die.curM=_sl(die.sf,die.snap,Math.sqrt(die.st));return;}const mf=die.path.length-1;const csg=die.segs[die.si]??{s:0,e:mf};const gf=die.si<die.segs.length-1?csg.e:mf;die.af=Math.min(die.af+1,gf);die.curM=die.path[Math.floor(die.af)];if(spd<0.12&&die.h<0.01&&die.apex<0.02&&Math.abs(die.vz)<0.04){die.settling=true;die.st=0;die.sf=die.curM;die.vx=die.vy=die.vz=0;}}
function drawDie(ctx,die){
  const m=die.curM,sc=die.scale,px=die.x,py=die.y-die.h*55;
  const tv=_CV.map(v=>_mv(m,v));const pv=tv.map(v=>[v[0]*sc+px,-v[1]*sc+py]);
  if(die.h<0.5){ctx.save();ctx.globalAlpha=Math.max(0,0.3*(1-die.h*2));ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(die.x,die.y+die.r*0.25,die.r*0.8,die.r*0.28,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  _CF.map(f=>{const avgZ=f.v.reduce((s,i)=>s+tv[i][2],0)/4;const rn=_mv(m,f.n);return{...f,avgZ,vis:rn[2]>0};}).sort((a,b)=>a.avgZ-b.avgZ).forEach(f=>{if(!f.vis)return;const pts=f.v.map(i=>pv[i]);const pat=ctx.createPattern(_D6T[f.val],'no-repeat');const[p0,p1,,p3]=pts;const a=(p1[0]-p0[0])/_FS,b=(p1[1]-p0[1])/_FS,c=(p3[0]-p0[0])/_FS,d=(p3[1]-p0[1])/_FS;pat.setTransform(new DOMMatrix([a,b,c,d,p0[0],p0[1]]));ctx.fillStyle=pat;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<4;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.8;ctx.stroke();});
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME CLASS
// ─────────────────────────────────────────────────────────────────────────────
class LudoGame {
  constructor(canvas, hud, {n, k}) {
    this.canvas = canvas;
    this.hud    = hud;
    this.n = n; this.k = k;
    this.colours = [];
    for (let i = 0; i < n; i++) this.colours.push(randomColour(this.colours));
    this._destroyed = false;
    this._raf  = null;
    this._die  = null;
    this._loop = false;
    this._boundClick = this._onClick.bind(this);
    this.canvas.addEventListener('click', this._boundClick);
    this.hud.rollBtn.addEventListener('click', () => this.requestRoll());
    this.reset();
  }

  reset() {
    this.currentPlayer = 0;
    this.diceValue     = null;
    this.selected      = null;
    this.validMoves    = new Set();
    this.phase         = 'roll';
    this.winner        = null;
    this._die          = null;

    this.board = buildBoard(this.n, this.k, this.colours);
    this.board.layout(this.canvas.width, this.canvas.height);

    this.pieces = [];
    for (let p = 0; p < this.n; p++)
      for (let f = 0; f < this.k; f++)
        this.pieces.push({id:`${p}_${f}`, player:p, figureNum:f, kiteSlot:f, pathIndex:-1, finished:false});

    this._updateHUD();
    this._startLoop();
  }

  destroy() {
    this._destroyed = true; this._loop = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.canvas.removeEventListener('click', this._boundClick);
  }

  _startLoop() {
    if (this._loop) return;
    this._loop = true;
    const tick = () => {
      if (this._destroyed) { this._loop = false; return; }
      if (this._die && !this._die.done) {
        stepDie(this._die, this.canvas.width, this.canvas.height, 16);
        animDie(this._die);
        if (this._die.done) this._updateHUD(`Rolled ${this._die.outcome} — tap to confirm`);
      }
      this._render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  requestRoll() {
    if (this.phase !== 'roll') return;
    if (this._die && !this._die.done) return;
    const outcome = Math.floor(Math.random()*6)+1;
    const W = this.canvas.width, H = this.canvas.height;
    this._die = createDie(outcome, W/2+(Math.random()-.5)*80, H/2+(Math.random()-.5)*60);
    this._updateHUD('Rolling…');
  }

  _confirmDie() {
    if (!this._die || !this._die.done) return;
    this.diceValue = this._die.outcome;
    this._die = null;
    this._afterRoll();
  }

  _afterRoll() {
    this.validMoves = new Set();
    const path = this.board.paths[this.currentPlayer];
    this._playerPieces(this.currentPlayer).forEach(piece => {
      if (piece.finished) return;
      if (piece.pathIndex < 0) {
        if (this.diceValue === 6 && !this._selfCapture(piece, 0))
          this.validMoves.add(piece.id);
      } else {
        const target = piece.pathIndex + this.diceValue;
        const last   = path.length - 1;
        if (target === last) this.validMoves.add(piece.id);
        else if (target < last && !this._selfCapture(piece, target))
          this.validMoves.add(piece.id);
      }
    });

    if (this.validMoves.size === 0) {
      this._updateHUD('No moves — skipping');
      setTimeout(() => this._nextTurn(), 1100);
    } else {
      this.phase = 'move';
      this._updateHUD(`Rolled ${this.diceValue} — tap a highlighted piece`);
    }
  }

  _selfCapture(piece, targetIdx) {
    return this._playerPieces(piece.player)
      .some(p => p.id !== piece.id && !p.finished && p.pathIndex === targetIdx);
  }

  _onClick(e) {
    if (this._destroyed) return;
    if (this.phase === 'gameover') { this.reset(); return; }
    if (this._die && this._die.done) { this._confirmDie(); return; }
    if (this.phase !== 'move') return;
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX-rect.left)*(this.canvas.width/rect.width);
    const py = (e.clientY-rect.top)*(this.canvas.height/rect.height);
    this._tryMove(px, py);
  }

  _tryMove(px, py) {
    const fr = Math.max(8, this.board.sq * 0.42);
    let clicked = null;
    for (const pid of this.validMoves) {
      const piece = this.pieces.find(p => p.id === pid);
      const {x, y} = this._piecePos(piece, fr);
      if (Math.hypot(px-x, py-y) < fr * 1.7) { clicked = piece; break; }
    }
    if (!clicked) {
      if (this.selected) {
        const sel = this.pieces.find(p => p.id === this.selected);
        if (sel && this.validMoves.has(sel.id)) {
          const {x,y} = this._piecePos(sel, fr);
          if (Math.hypot(px-x, py-y) < fr*1.7) { this._move(sel); return; }
        }
      }
      this.selected = null; return;
    }
    if (this.selected === clicked.id || this.validMoves.size === 1) this._move(clicked);
    else this.selected = clicked.id;
  }

  _piecePos(piece, fr) {
    const { board, k, n } = this;
    if (piece.pathIndex < 0) {
      const kit = n >= 3 ? board.kites[piece.player] : board.bases?.[piece.player] ?? board.basePos;
      const ox = kit.cx ?? kit.x, oy = kit.cy ?? kit.y;
      const cols = Math.ceil(Math.sqrt(k)), sp = fr * 2.4;
      return {
        x: ox + (piece.kiteSlot%cols - (cols-1)/2) * sp,
        y: oy + (Math.floor(piece.kiteSlot/cols) - (Math.ceil(k/cols)-1)/2) * sp
      };
    }
    const rawId = board.paths[piece.player][piece.pathIndex];
    if (rawId === 'end') {
      return n >= 3 ? {x: board.cx, y: board.cy} : {x: board.cx, y: board.cy};
    }
    const cid = canonicalId(rawId, n);
    const nd  = board.nodes?.[cid] ?? board.nodes?.[rawId];
    if (nd) return {x: nd.x, y: nd.y};
    // n=1 fallback
    const idx = board.laneNodes?.findIndex(x => x.id === rawId);
    if (idx >= 0) return {x: board.laneNodes[idx].x, y: board.laneNodes[idx].y};
    return {x: 0, y: 0};
  }

  _move(piece) {
    const path = this.board.paths[piece.player];
    piece.pathIndex = piece.pathIndex < 0 ? 0 : piece.pathIndex + this.diceValue;

    // Capture check — not on own home stretch or shared entry
    if (piece.pathIndex >= 0 && piece.pathIndex < path.length - 1) {
      const nodeId = path[piece.pathIndex];
      const homePfx = `g${piece.player}_c1_r`;
      const isSafe  = nodeId.startsWith(homePfx) || nodeId === 'end';
      if (!isSafe) {
        const cid = canonicalId(nodeId, this.n);
        this.pieces.forEach(other => {
          if (other.player === piece.player || other.id === piece.id || other.finished) return;
          const op   = this.board.paths[other.player];
          if (other.pathIndex < 0 || other.pathIndex >= op.length) return;
          const ocid = canonicalId(op[other.pathIndex], this.n);
          if (ocid === cid) other.pathIndex = -1;
        });
      }
    }

    if (piece.pathIndex >= path.length - 1) {
      piece.pathIndex = path.length - 1;
      piece.finished  = true;
    }

    this.selected   = null;
    this.validMoves = new Set();

    if (this._playerPieces(piece.player).every(p => p.finished)) {
      this.winner = piece.player;
      this.phase  = 'gameover';
      this._updateHUD(`Player ${piece.player+1} wins!`);
      return;
    }

    if (this.diceValue === 6) {
      this.phase = 'roll'; this.diceValue = null;
      this._updateHUD('Rolled 6 — roll again!');
    } else {
      this._nextTurn();
    }
  }

  _nextTurn() {
    let next = (this.currentPlayer + 1) % this.n, tries = 0;
    while (this._playerPieces(next).every(p => p.finished) && tries++ < this.n)
      next = (next + 1) % this.n;
    this.currentPlayer = next;
    this.phase = 'roll'; this.diceValue = null;
    this.selected = null; this.validMoves = new Set();
    this._updateHUD();
  }

  _playerPieces(p) { return this.pieces.filter(x => x.player === p); }

  _updateHUD(msg) {
    const col = this.colours[this.currentPlayer % this.colours.length];
    const tc  = textFor(col);
    if (this.hud.badge) {
      this.hud.badge.textContent = `P${this.currentPlayer+1}`;
      this.hud.badge.style.background = col;
      this.hud.badge.style.color = tc;
    }
    const rb = this.hud.rollBtn;
    if (rb) {
      const canRoll = this.phase==='roll' && (!this._die || this._die.done);
      rb.disabled     = !canRoll;
      rb.style.opacity= canRoll ? '1' : '0.4';
      rb.textContent  = (this._die && this._die.done) ? '✓ Confirm' : '🎲 Roll';
    }
    if (this.hud.status)
      this.hud.status.textContent = msg ?? (this.phase==='roll' ? 'Roll the die' : '');
  }

  _render() {
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const gs = {
      pieces: this.pieces, selected: this.selected,
      validMoves: this.validMoves, phase: this.phase, winner: this.winner
    };
    renderBoard(ctx, this.board, gs, W, H);
    if (this._die) drawDie(ctx, this._die);
    this._updateHUD();
  }

  render() { this._render(); }
}