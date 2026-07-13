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
  const rd = (h,i) => parseInt(h.slice(i,i+2),16);
  return Math.sqrt(['#r','#g','#b'].map((_,i)=>(rd(a,1+i*2)-rd(b,1+i*2))**2).reduce((s,v)=>s+v,0));
}
function colourDist2(a, b) {
  const [rA,gA,bA] = [1,3,5].map(i=>parseInt(a.slice(i,i+2),16));
  const [rB,gB,bB] = [1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
  return Math.sqrt((rA-rB)**2+(gA-gB)**2+(bA-bB)**2);
}
function textFor(hex) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return (r+g+b)<300?'#fff':'#000';
}
function colAlpha(hex,a){ return hex+Math.round(a*255).toString(16).padStart(2,'0'); }

// ─────────────────────────────────────────────────────────────────────────────
// 2D VECTOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const v2={
  add:(a,b)=>({x:a.x+b.x,y:a.y+b.y}),
  sub:(a,b)=>({x:a.x-b.x,y:a.y-b.y}),
  scale:(v,s)=>({x:v.x*s,y:v.y*s}),
  len:v=>Math.hypot(v.x,v.y),
  norm:v=>{const l=Math.hypot(v.x,v.y)||1;return{x:v.x/l,y:v.y/l};},
  lerp:(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),
  rot:(v,a)=>({x:v.x*Math.cos(a)-v.y*Math.sin(a),y:v.x*Math.sin(a)+v.y*Math.cos(a)}),
  angle:(v)=>Math.atan2(v.y,v.x),
};

// ─────────────────────────────────────────────────────────────────────────────
// GRID OUTER CORNER HELPERS
// Each grid has an outer corner at (col, row=0):
//   outerCorner(grid, col) = grid.mid + (col-1)*sq * sideDir + 6*sq * outDir
// col=0 → left outer corner, col=2 → right outer corner
// ─────────────────────────────────────────────────────────────────────────────
function outerCorner(grid, col, sq) {
  return v2.add(
    v2.add(grid.mid, v2.scale(grid.sideDir, (col - 1) * sq)),
    v2.scale(grid.outDir, 6 * sq)
  );
}

// outerCorner returns the CELL CENTRE of (col, row=0) — used for node positions.
// outerCornerPt returns the actual CORNER POINT of the outer face of that cell,
// i.e. cell centre + 0.5*sq outward + 0.5*sq along side toward outside.
// sideSgn: +1 = toward col-2 edge, -1 = toward col-0 edge
function outerCornerPt(grid, col, sq) {
  // col=0 → left outer corner point: cell centre + 0.5*sq outward - 0.5*sq along sideDir
  // col=2 → right outer corner point: cell centre + 0.5*sq outward + 0.5*sq along sideDir
  const centre = outerCorner(grid, col, sq);
  const sideSgn = col === 0 ? -1 : 1;
  return v2.add(
    v2.add(centre, v2.scale(grid.outDir, sq * 0.5)),
    v2.scale(grid.sideDir, sideSgn * sq * 0.5)
  );
}

// Cell centre for (col, row) in a grid
function cellCentre(grid, col, row, sq) {
  return v2.add(
    v2.add(grid.mid, v2.scale(grid.sideDir, (col - 1) * sq)),
    v2.scale(grid.outDir, (6 - row - 0.5) * sq)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH BUILDER  (shared for all n≥2)
// ─────────────────────────────────────────────────────────────────────────────
function buildPath(playerIndex, n) {
  const g = k => `g${(playerIndex + k) % n}`;
  const path = [];

  // Own grid: right arm inward, (2,1)→(2,6)
  for (let r = 1; r <= 6; r++) path.push(`${g(0)}_c2_r${r}`);

  // Each opponent grid in order
  for (let k = 1; k < n; k++) {
    const gid = g(k);
    // Enter at (0,6) [canonical = prev grid's (2,6)], traverse left arm out, top, right arm in
    for (let r = 5; r >= 0; r--) path.push(`${gid}_c0_r${r}`);
    path.push(`${gid}_c1_r0`);
    path.push(`${gid}_c2_r0`);
    for (let r = 1; r <= 6; r++) path.push(`${gid}_c2_r${r}`);
  }

  // Re-enter own grid: left arm out, top, then home stretch col 1
  const og = g(0);
  for (let r = 5; r >= 0; r--) path.push(`${og}_c0_r${r}`);
  path.push(`${og}_c1_r0`);
  for (let r = 1; r <= 6; r++) path.push(`${og}_c1_r${r}`);
  path.push('end');

  return path;
}

// Canonical node id: g[i]_c0_r6 is the same square as g[(i-1+n)%n]_c2_r6
function canonicalId(id, n) {
  const m = id.match(/^g(\d+)_c0_r6$/);
  if (m) return `g${(parseInt(m[1])-1+n)%n}_c2_r6`;
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE n=1: single straight lane
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard1(k, colours) {
  const LANE=16;
  const nodeIds=[...Array(LANE)].map((_,i)=>`lane_${i}`).concat(['end']);
  return { n:1, k, colours, paths:[nodeIds],
    layout(W,H) {
      const sq=Math.min(W*0.65/LANE, H*0.09);
      this.sq=sq;
      const sx=W*0.18, y=H*0.52;
      this.laneNodes=nodeIds.map((id,i)=>({id,x:sx+(i+0.5)*sq,y,isEnd:id==='end'}));
      this.basePos={x:W*0.09, y:H*0.5, r:Math.min(W*0.07,H*0.22)};
      this.nodes={}; this.laneNodes.forEach(nd=>this.nodes[nd.id]=nd);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE n=2: two arc-shaped home areas + two 3×6 grids + centre end zone
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard2(k, colours) {
  const paths=[buildPath(0,2),buildPath(1,2)];
  return { n:2, k, colours, paths,
    layout(W,H) {
      // Fit two stacked 3×6 grids with a 3×3 end zone between them
      // Total height needed: 6*sq + 3*sq + 6*sq = 15*sq → sq = H*avail/15
      const avail=Math.min(W,H)*0.88;
      const sq=Math.min(avail/15, W*0.88/3);
      this.sq=sq;
      const cx=W/2, cy=H/2;
      this.cx=cx; this.cy=cy;

      // Grid 0 above centre, grid 1 below.
      // The inner "n-gon" for n=2 is just the centre point — but we need
      // an inner structure. For n=2 the inner shape is a rectangle of width=3*sq,
      // height=3*sq (the end zone), so innerR equivalent = 1.5*sq (half the end zone height).
      // Row 6 (innermost) of each grid abuts the end zone.
      // Row r of grid 0: y = cy - 1.5*sq - (6-r-0.5)*sq  (row6 centre = cy-1.5*sq-0.5*sq? no)
      // Let's say: grid 0 row 6 centre is at y = cy - 1.5*sq - 0.5*sq = cy - 2*sq
      // grid 0 row r centre: y = cy - 2*sq - (5-r)*sq  ... let's define cleanly:
      // grid 0 row r: y = cy - (1.5 + 6 - r - 0.5)*sq = cy - (7-r)*sq
      // r=6: y = cy - 1*sq  ✓ (just inside end zone top)
      // r=0: y = cy - 7*sq  (outermost)
      // grid 1 row r: y = cy + (7-r)*sq

      this.gridFor = (g, col, row) => {
        const ySign = g===0 ? -1 : 1;
        return {
          x: cx + (col-1)*sq,
          y: cy + ySign*(7-row)*sq
        };
      };

      // Build all nodes
      this.nodes={};
      for (let g=0;g<2;g++) {
        for (let col=0;col<3;col++) {
          for (let row=0;row<7;row++) {
            const rawId=`g${g}_c${col}_r${row}`;
            const cid=canonicalId(rawId,2);
            if (!this.nodes[cid]) {
              // Use whichever grid owns this canonical id
              const cm=cid.match(/^g(\d+)_c(\d+)_r(\d+)$/);
              const [cg,cc,cr]=[parseInt(cm[1]),parseInt(cm[2]),parseInt(cm[3])];
              const pos=this.gridFor(cg,cc,cr);
              this.nodes[cid]={id:cid,x:pos.x,y:pos.y};
            }
          }
        }
      }
      this.nodes['end']={id:'end',x:cx,y:cy};

      // Grids for arc computation
      // For n=2, grids are axis-aligned:
      // grid 0: sideDir=(1,0), outDir=(0,-1), mid=(cx,cy-1.5*sq) [but we computed differently above]
      // Let's define grid objects matching the n≥3 convention:
      this.grids=[
        { mid:{x:cx,y:cy-1.5*sq}, sideDir:{x:1,y:0}, outDir:{x:0,y:-1} },
        { mid:{x:cx,y:cy+1.5*sq}, sideDir:{x:-1,y:0}, outDir:{x:0,y:1} },
      ];
      // Outer corners of each grid: outerCorner(grid, col, sq)
      // grid 0 col=0: cx-sq, cy-1.5*sq-6*sq = cx-sq, cy-7.5*sq  → outerLeft0
      // grid 0 col=2: cx+sq, cy-7.5*sq                            → outerRight0
      // grid 1 col=0: cx+sq, cy+7.5*sq  (sideDir=-1 so col0 is right in screen space)
      // grid 1 col=2: cx-sq, cy+7.5*sq

      // Arc home areas:
      // Home 0 (P0): arc from grid0(0,0) to grid1(2,0), centre = (cx, cy)
      // Home 1 (P1): arc from grid1(0,0) to grid0(2,0), centre = (cx, cy)
      // We draw each as an arc sector from angle A to angle B around (cx,cy).

      const g0L = outerCorner(this.grids[0], 0, sq); // grid0 left outer = top-left
      const g0R = outerCorner(this.grids[0], 2, sq); // grid0 right outer = top-right
      const g1L = outerCorner(this.grids[1], 0, sq); // grid1 "left" = bottom-right (sideDir=-1)
      const g1R = outerCorner(this.grids[1], 2, sq); // grid1 "right" = bottom-left

      // The radius for the arc = distance from cx,cy to any true outer corner
      const arcR = v2.len(v2.sub(outerCornerPt(this.grids[0],0,sq),{x:cx,y:cy}));
      this.arcR=arcR;

      // Home 0: arc from g0L to g1R going through the left side (CCW or CW?)
      // g0L is top-left, g1R is bottom-left → arc sweeps the left side
      // Home 1: arc from g0R to g1L going through the right side
      const a0L=v2.angle(v2.sub(g0L,{x:cx,y:cy})); // ~top-left angle
      const a0R=v2.angle(v2.sub(g0R,{x:cx,y:cy})); // ~top-right
      const a1L=v2.angle(v2.sub(g1L,{x:cx,y:cy})); // ~bottom-right
      const a1R=v2.angle(v2.sub(g1R,{x:cx,y:cy})); // ~bottom-left

      this.homes=[
        // P0 home: left sector, from g1R to g0L (going CCW = left arc)
        { player:0, cx, cy, r:arcR, a1:a1R, a2:a0L,
          midX:cx-arcR*0.65, midY:cy },
        // P1 home: right sector, from g0R to g1L (going CW = right arc)
        { player:1, cx, cy, r:arcR, a1:a0R, a2:a1L,
          midX:cx+arcR*0.65, midY:cy },
      ];
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE n≥3: inner n-gon + n grids + straight-line kites
// ─────────────────────────────────────────────────────────────────────────────
function buildBoardN(n, k, colours) {
  const paths=Array.from({length:n},(_,i)=>buildPath(i,n));
  return { n, k, colours, paths,
    layout(W,H) {
      const cx=W/2, cy=H/2;
      this.cx=cx; this.cy=cy;
      const margin=Math.min(W,H)*0.03;
      const avail=Math.min(W,H)/2-margin;
      const sinPN=Math.sin(Math.PI/n);
      // avail = innerR + 6*sq,  innerR = 1.5*sq/sinPN
      // avail = sq*(1.5/sinPN + 6)
      const sq=avail/(1.5/sinPN+6);
      this.sq=sq;
      const innerR=1.5*sq/sinPN;
      this.innerR=innerR;

      // Inner n-gon: side i midpoint at angle -π/2 + i*2π/n
      // Vertex i at angle -π/2 - π/n + i*2π/n
      const vAngle=i=>-Math.PI/2 - Math.PI/n + i*2*Math.PI/n;
      const innerVerts=Array.from({length:n},(_,i)=>({
        x:cx+innerR*Math.cos(vAngle(i)),
        y:cy+innerR*Math.sin(vAngle(i)),
      }));
      this.innerVerts=innerVerts;

      // Grid frames
      this.grids=Array.from({length:n},(_,i)=>{
        const vA=innerVerts[i], vB=innerVerts[(i+1)%n];
        const mid=v2.lerp(vA,vB,0.5);
        const sideDir=v2.norm(v2.sub(vB,vA));
        const outDir=v2.norm(v2.sub(mid,{x:cx,y:cy}));
        return {mid,sideDir,outDir,vA,vB};
      });

      // All grid nodes — junction nodes (c2_r6) get averaged position between adjacent grids
      this.nodes={};
      this.junctionFrames={}; // canonical id → {sideDir, outDir} averaged between two grids
      for (let g=0;g<n;g++) {
        const grid=this.grids[g];
        for (let col=0;col<3;col++) {
          for (let row=0;row<7;row++) {
            const id=`g${g}_c${col}_r${row}`;
            const cid=canonicalId(id,n);
            if(col===2&&row===6){
              // Junction node: average position of this grid's (2,6) and next grid's (0,6)
              const gNext=this.grids[(g+1)%n];
              const posI=cellCentre(grid,2,6,sq);
              const posJ=cellCentre(gNext,0,6,sq);
              const avgPos=v2.lerp(posI,posJ,0.5);
              // Averaged frame: sideDir and outDir averaged between the two grids
              const avgSide=v2.norm(v2.add(grid.sideDir,gNext.sideDir));
              const avgOut=v2.norm(v2.add(grid.outDir,gNext.outDir));
              if(!this.nodes[cid]){
                this.nodes[cid]={id:cid,x:avgPos.x,y:avgPos.y};
                this.junctionFrames[cid]={sideDir:avgSide,outDir:avgOut};
              }
            } else {
              if(!this.nodes[id]) this.nodes[id]={id,x:cellCentre(grid,col,row,sq).x,y:cellCentre(grid,col,row,sq).y};
            }
          }
        }
      }
      this.nodes['end']={id:'end',x:cx,y:cy};

      // Kite home areas: triangle between adjacent grids
      // Kite i: grid[i] right outer corner → innerVerts[(i+1)%n] → grid[(i+1)%n] left outer corner
      // Just 3 points — a triangle.
      this.kites=Array.from({length:n},(_,i)=>{
        const gi=this.grids[i];
        const gj=this.grids[(i+1)%n];
        const pR=outerCornerPt(gi,2,sq);   // true right outer corner of grid i
        const pL=outerCornerPt(gj,0,sq);   // true left outer corner of grid i+1
        const pI=innerVerts[(i+1)%n];       // shared inner n-gon vertex
        const pts=[pR,pL,pI];
        const kcx=(pR.x+pL.x+pI.x)/3;
        const kcy=(pR.y+pL.y+pI.y)/3;
        return {pts, cx:kcx, cy:kcy, player:i};
      });

      // Central triangles inside inner n-gon (finished piece display)
      // Triangle i: centre → innerVerts[i] → innerVerts[(i+1)%n]
      this.centralTris=Array.from({length:n},(_,i)=>({
        player:i,
        pts:[{x:cx,y:cy}, innerVerts[i], innerVerts[(i+1)%n]],
        lx:(cx+innerVerts[i].x+innerVerts[(i+1)%n].x)/3,
        ly:(cy+innerVerts[i].y+innerVerts[(i+1)%n].y)/3,
      }));
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BOARD BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildBoard(n, k, colours) {
  if (n===1) return buildBoard1(k,colours);
  if (n===2) return buildBoard2(k,colours);
  return buildBoardN(n,k,colours);
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────────────
function drawBoardPreview(canvas, n, k, colours) {
  if (!colours || colours.length < n) {
    colours = [];
    for (let i=0;i<n;i++) colours.push(randomColour(colours));
  }
  const board=buildBoard(n,k,colours);
  board.layout(canvas.width,canvas.height);
  renderBoard(canvas.getContext('2d'),board,null,canvas.width,canvas.height);
}

function renderBoard(ctx,board,gs,W,H) {
  ctx.fillStyle='#0f1118'; ctx.fillRect(0,0,W,H);
  if (board.n===1){renderBoard1(ctx,board,gs,W,H);return;}
  if (board.n===2){renderBoard2(ctx,board,gs,W,H);return;}
  renderBoardN(ctx,board,gs,W,H);
}

// ── Rotated cell drawer — draws a parallelogram aligned to sideDir/outDir ──
function drawCell(ctx, cx, cy, sq, sideDir, outDir, fill, stroke='#3d4f7066', lw=0.7) {
  const hs=sq*0.5;
  // Four corners: ±0.5*sq along sideDir, ±0.5*sq along outDir
  const corners=[
    v2.add(v2.add({x:cx,y:cy}, v2.scale(sideDir,-hs)), v2.scale(outDir,-hs)),
    v2.add(v2.add({x:cx,y:cy}, v2.scale(sideDir, hs)), v2.scale(outDir,-hs)),
    v2.add(v2.add({x:cx,y:cy}, v2.scale(sideDir, hs)), v2.scale(outDir, hs)),
    v2.add(v2.add({x:cx,y:cy}, v2.scale(sideDir,-hs)), v2.scale(outDir, hs)),
  ];
  ctx.save();
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=lw;
  ctx.beginPath();
  ctx.moveTo(corners[0].x,corners[0].y);
  for(let i=1;i<4;i++) ctx.lineTo(corners[i].x,corners[i].y);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ── Axis-aligned square (for n=1 and n=2 which are grid-aligned) ────────────
function drawSq(ctx, cx, cy, sq, fill, stroke='#3d4f7066', lw=0.7) {
  const hs=sq*0.5-0.5;
  ctx.save();
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=lw;
  ctx.fillRect(cx-hs,cy-hs,hs*2,hs*2);
  ctx.strokeRect(cx-hs,cy-hs,hs*2,hs*2);
  ctx.restore();
}

// ── Grid renderer — uses rotated cells for n≥3, axis-aligned for n≤2 ────────
function renderGrid(ctx, board, g, sq, colours) {
  const col=colours[g];
  const useRotated=board.n>=3;
  const grid=useRotated?board.grids[g]:null;

  for (let c=0;c<3;c++) {
    for (let r=0;r<7;r++) {
      const id=`g${g}_c${c}_r${r}`;
      const cid=canonicalId(id,board.n);
      const nd=board.nodes[cid]??board.nodes[id];
      if (!nd) continue;
      let fill='#1e2438';
      if (c===1&&r>=1) fill=colAlpha(col,0.22);
      else if (r===0)  fill=colAlpha(col,0.10);
      // Junction node drawn separately at end (on top)
      if(useRotated&&c===2&&r===6) continue;
      if(useRotated){
        drawCell(ctx,nd.x,nd.y,sq,grid.sideDir,grid.outDir,fill);
      } else {
        drawSq(ctx,nd.x,nd.y,sq,fill);
      }
    }
  }
}

// Draw junction nodes on top of all grids with averaged frame
function renderJunctions(ctx, board, sq, colours) {
  if(board.n<3) return;
  const {n,grids,nodes,junctionFrames}=board;
  for(let g=0;g<n;g++){
    const cid=`g${g}_c2_r6`;
    const nd=nodes[cid]; if(!nd) continue;
    const jf=junctionFrames[cid]; if(!jf) continue;
    // Colour: blend of g and (g+1)%n — use g's colour, slightly lighter stroke
    const col=colours[g%colours.length];
    drawCell(ctx,nd.x,nd.y,sq,jf.sideDir,jf.outDir,'#2a3560',col+'99',1.2);
  }
}

// ── n=1 ─────────────────────────────────────────────────────────────────────
function renderBoard1(ctx,board,gs,W,H) {
  const col=board.colours[0],sq=board.sq,b=board.basePos;
  ctx.save();
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
  ctx.fillStyle=colAlpha(col,0.25);ctx.fill();
  ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();
  ctx.restore();
  board.laneNodes.forEach(nd=>{
    if(nd.isEnd){
      ctx.save();ctx.beginPath();ctx.arc(nd.x,nd.y,sq*0.45,0,Math.PI*2);
      ctx.fillStyle='#e8d88a';ctx.fill();
      ctx.font=`${sq*0.55}px serif`;ctx.fillStyle='#1a1200';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',nd.x,nd.y);ctx.restore();
    } else drawSq(ctx,nd.x,nd.y,sq,'#1e2438');
  });
  const fr=sq*0.36;
  if(gs){
    gs.pieces.forEach(p=>{
      if(p.finished)return;
      let px,py;
      if(p.pathIndex<0){px=b.x+(p.kiteSlot-(board.k-1)/2)*fr*2.2;py=b.y;}
      else{const nd=board.laneNodes[p.pathIndex];if(!nd)return;px=nd.x;py=nd.y;}
      drawHighlight(ctx,px,py,fr,col,gs.validMoves.has(p.id),gs.selected===p.id);
      drawPawn(ctx,px,py,fr,col,p.figureNum+1);
    });
  } else {
    for(let f=0;f<board.k;f++) drawPawn(ctx,b.x+(f-(board.k-1)/2)*fr*2.2,b.y,fr,col,f+1);
  }
}

// ── n=2 ─────────────────────────────────────────────────────────────────────
function renderBoard2(ctx,board,gs,W,H) {
  const {colours,sq,cx,cy,homes,nodes,grids}=board;

  // Home areas: circular segments attaching to grid outer corners only.
  // Use true corner points (outerCornerPt) so arcs connect to grid edges precisely.
  const g0L=outerCornerPt(grids[0],0,sq); // top-left
  const g0R=outerCornerPt(grids[0],2,sq); // top-right
  const g1L=outerCornerPt(grids[1],0,sq); // bottom-right (grid1 sideDir reversed)
  const g1R=outerCornerPt(grids[1],2,sq); // bottom-left

  const arcR=board.arcR;
  const a0L=v2.angle(v2.sub(g0L,{x:cx,y:cy}));
  const a0R=v2.angle(v2.sub(g0R,{x:cx,y:cy}));
  const a1L=v2.angle(v2.sub(g1L,{x:cx,y:cy}));
  const a1R=v2.angle(v2.sub(g1R,{x:cx,y:cy}));

  // Home 0 (left): arc counterclockwise from g1R (bottom-left) to g0L (top-left)
  // Home 1 (right): arc clockwise from g0R (top-right) to g1L (bottom-right)
  [
    {ptA:g1R, ptB:g0L, aStart:a1R, aEnd:a0L, ccw:true,  player:0},
    {ptA:g0R, ptB:g1L, aStart:a0R, aEnd:a1L, ccw:false, player:1},
  ].forEach(({ptA,ptB,aStart,aEnd,ccw,player})=>{
    const col=colours[player];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ptA.x,ptA.y);
    ctx.arc(cx,cy,arcR,aStart,aEnd,ccw);
    ctx.closePath();
    ctx.fillStyle=colAlpha(col,0.30);ctx.fill();
    ctx.strokeStyle=colAlpha(col,0.7);ctx.lineWidth=1.5;ctx.stroke();
    ctx.restore();
  });

  // End zone (3×3 centre)
  for(let c=0;c<3;c++) for(let r=0;r<3;r++) {
    const fill=c===1?colAlpha('#e8d88a',0.15):'#1a2035';
    drawSq(ctx,cx+(c-1)*sq,cy+(r-1)*sq,sq,fill);
  }
  ctx.save();ctx.font=`${sq*0.85}px serif`;ctx.fillStyle='#e8d88a';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',cx,cy);ctx.restore();

  // Grids
  for(let g=0;g<2;g++) renderGrid(ctx,board,g,sq,colours);

  if(gs){
    renderFigures(ctx,board,gs);
    renderCentralCounts2(ctx,board,gs);
    renderGameOver(ctx,board,gs,W,H);
  } else {
    homes.forEach(h=>renderBasePawns(ctx,h.midX,h.midY,board.k,colours[h.player],sq));
  }
}

function renderCentralCounts2(ctx,board,gs) {
  const {colours,cx,cy,sq}=board;
  const counts=Array(board.n).fill(0);
  gs.pieces.forEach(p=>{if(p.finished)counts[p.player]++;});
  const lh=Math.max(10,sq*0.6);
  counts.forEach((c,i)=>{
    if(!c)return;
    const col=colours[i],tc=textFor(col);
    ctx.save();
    ctx.fillStyle=col;
    ctx.beginPath();ctx.roundRect(cx-sq*0.9,cy+sq*(1.5+i*0.75),sq*1.8,lh*0.85,3);ctx.fill();
    ctx.font=`bold ${Math.max(8,lh*0.7)}px system-ui`;
    ctx.fillStyle=tc;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(`×${c}`,cx,cy+sq*(1.5+i*0.75)+lh*0.4);ctx.restore();
  });
}

// ── n≥3 ─────────────────────────────────────────────────────────────────────
function renderBoardN(ctx,board,gs,W,H) {
  const {n,colours,sq,innerR,cx,cy,innerVerts,grids,kites,centralTris,nodes}=board;

  // Outer boundary: true corner points of each grid's outer row cells
  ctx.save();
  ctx.beginPath();
  for(let i=0;i<n;i++){
    const pL=outerCornerPt(grids[i],0,sq);
    const pR=outerCornerPt(grids[i],2,sq);
    if(i===0) ctx.moveTo(pL.x,pL.y);
    else ctx.lineTo(pL.x,pL.y);
    ctx.lineTo(pR.x,pR.y);
  }
  ctx.closePath();
  ctx.fillStyle='#151a28';ctx.fill();
  ctx.strokeStyle='#3a4060';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();

  // Kite triangles
  kites.forEach((kit,i)=>{
    const col=colours[i%colours.length];
    ctx.save();
    ctx.beginPath();
    kit.pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=colAlpha(col,0.30);ctx.fill();
    ctx.strokeStyle=colAlpha(col,0.7);ctx.lineWidth=1.5;ctx.stroke();
    ctx.restore();
  });

  // Grid cells — rendered after kites so they sit on top
  for(let g=0;g<n;g++) renderGrid(ctx,board,g,sq,colours);
  // Junction nodes on top of all grids with averaged angle
  renderJunctions(ctx,board,sq,colours);

  // Inner n-gon
  ctx.save();
  ctx.beginPath();
  innerVerts.forEach((v,i)=>i===0?ctx.moveTo(v.x,v.y):ctx.lineTo(v.x,v.y));
  ctx.closePath();
  ctx.fillStyle='#0d1018';ctx.fill();
  ctx.strokeStyle='#4a5580';ctx.lineWidth=1.5;ctx.stroke();
  ctx.restore();

  // Central triangles
  centralTris.forEach((tri,i)=>{
    const col=colours[i%colours.length];
    ctx.save();
    ctx.beginPath();
    tri.pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
    ctx.closePath();
    ctx.fillStyle=colAlpha(col,0.38);ctx.fill();
    ctx.strokeStyle=colAlpha(col,0.6);ctx.lineWidth=1;ctx.stroke();
    if(gs){
      const count=gs.pieces.filter(p=>p.player===i&&p.finished).length;
      if(count>0){
        ctx.font=`bold ${Math.max(9,sq*0.6)}px system-ui`;
        ctx.fillStyle=textFor(col);ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(`×${count}`,tri.lx,tri.ly);
      }
    }
    ctx.restore();
  });

  // End star
  ctx.save();ctx.font=`${Math.max(10,sq*0.85)}px serif`;ctx.fillStyle='#e8d88a';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',cx,cy);ctx.restore();

  if(gs){
    renderFigures(ctx,board,gs);
    renderGameOver(ctx,board,gs,W,H);
  } else {
    kites.forEach((kit,i)=>renderBasePawns(ctx,kit.cx,kit.cy,board.k,colours[i%colours.length],sq));
  }
}

// ── Shared figure rendering ──────────────────────────────────────────────────
function renderFigures(ctx,board,gs) {
  const {k,colours,kites,homes,nodes,paths,n}=board;
  const sq=board.sq, fr=Math.max(5,sq*0.35);

  // Build blockade map: cid → count of pieces per player at that node
  const nodeOccupancy={}; // cid → {playerIdx: count}
  gs.pieces.forEach(piece=>{
    if(piece.finished||piece.pathIndex<0)return;
    if(n===1)return;
    const rawId=paths[piece.player][piece.pathIndex];
    if(rawId==='end')return;
    const cid=canonicalId(rawId,n);
    if(!nodeOccupancy[cid])nodeOccupancy[cid]={};
    nodeOccupancy[cid][piece.player]=(nodeOccupancy[cid][piece.player]||0)+1;
  });

  gs.pieces.forEach(piece=>{
    if(piece.finished)return;
    const col=colours[piece.player%colours.length];
    const isV=gs.validMoves.has(piece.id), isSel=gs.selected===piece.id;
    let px,py;
    if(piece.pathIndex<0){
      let hx,hy;
      if(n>=3){const kit=kites[piece.player];hx=kit.cx;hy=kit.cy;}
      else{const h=homes[piece.player];hx=h.midX;hy=h.midY;}
      const cols=Math.ceil(Math.sqrt(k)),sp=fr*2.4;
      px=hx+(piece.kiteSlot%cols-(cols-1)/2)*sp;
      py=hy+(Math.floor(piece.kiteSlot/cols)-(Math.ceil(k/cols)-1)/2)*sp;
    } else {
      if(n===1){const nd=board.laneNodes?.[piece.pathIndex];if(!nd)return;px=nd.x;py=nd.y;}
      else {
        const rawId=paths[piece.player][piece.pathIndex];
        if(rawId==='end'){px=board.cx;py=board.cy;}
        else{
          const cid=canonicalId(rawId,n);
          const nd=nodes[cid]??nodes[rawId];
          if(!nd)return;px=nd.x;py=nd.y;
        }
      }
    }

    // Check if this piece is part of an active blockade
    let isBlockade=false;
    if(gs.rules&&gs.rules.blockading&&piece.pathIndex>=0&&n>1){
      const rawId=paths[piece.player][piece.pathIndex];
      if(rawId!=='end'){
        const cid=canonicalId(rawId,n);
        const occ=nodeOccupancy[cid]||{};
        if((occ[piece.player]||0)>=2)isBlockade=true;
      }
    }

    drawHighlight(ctx,px,py,fr,col,isV,isSel);
    drawPawn(ctx,px,py,fr,col,piece.figureNum+1,isBlockade);
  });
}

function renderGameOver(ctx,board,gs,W,H) {
  if(gs.phase!=='gameover')return;
  const col=board.colours[gs.winner%board.colours.length];
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);
  ctx.font=`bold ${Math.max(18,Math.min(W,H)*0.055)}px system-ui`;
  ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(`Player ${gs.winner+1} wins! 🎉`,W/2,H/2-18);
  ctx.font=`${Math.max(12,Math.min(W,H)*0.028)}px system-ui`;
  ctx.fillStyle='#e8e4d8aa';ctx.fillText('tap to play again',W/2,H/2+20);
  ctx.restore();
}

function drawPawn(ctx,x,y,r,col,num,isBlockade=false) {
  ctx.save();
  if(isBlockade){
    // Outer blockade ring
    ctx.beginPath();ctx.arc(x,y,r*1.45,0,Math.PI*2);
    ctx.strokeStyle='#ffffff99';ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle=col;ctx.fill();
  ctx.strokeStyle=isBlockade?'#fff':'#00000077';ctx.lineWidth=isBlockade?1.5:1;ctx.stroke();
  ctx.font=`bold ${Math.max(7,r*0.85)}px system-ui`;
  ctx.fillStyle=textFor(col);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(String(num),x,y);
  ctx.restore();
}
function drawHighlight(ctx,x,y,r,col,isV,isSel) {
  if(isV&&!isSel){ctx.save();ctx.beginPath();ctx.arc(x,y,r*2.1,0,Math.PI*2);ctx.fillStyle=colAlpha(col,0.22);ctx.fill();ctx.restore();}
  if(isSel){ctx.save();ctx.beginPath();ctx.arc(x,y,r*2.4,0,Math.PI*2);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
}
function renderBasePawns(ctx,cx,cy,k,col,sq) {
  const fr=Math.max(5,sq*0.35),cols=Math.ceil(Math.sqrt(k)),sp=fr*2.4;
  for(let f=0;f<k;f++) drawPawn(ctx,cx+(f%cols-(cols-1)/2)*sp,cy+(Math.floor(f/cols)-(Math.ceil(k/cols)-1)/2)*sp,fr,col,f+1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3-D DIE  (rolls flat on board, no height lift in rendering)
// ─────────────────────────────────────────────────────────────────────────────
const _G=0.09,_VR=0.6,_FF=0.90,_WF=0.70,_BR=0.38,_BF=0.994,_DT=0.12,_DM=0.72,_SF=28;
function _mm(a,b){return[a[0]*b[0]+a[1]*b[3]+a[2]*b[6],a[0]*b[1]+a[1]*b[4]+a[2]*b[7],a[0]*b[2]+a[1]*b[5]+a[2]*b[8],a[3]*b[0]+a[4]*b[3]+a[5]*b[6],a[3]*b[1]+a[4]*b[4]+a[5]*b[7],a[3]*b[2]+a[4]*b[5]+a[5]*b[8],a[6]*b[0]+a[7]*b[3]+a[8]*b[6],a[6]*b[1]+a[7]*b[4]+a[8]*b[7],a[6]*b[2]+a[7]*b[5]+a[8]*b[8]];}
function _mv(m,v){return[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];}
function _nv(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return l<1e-12?[0,1,0]:[v[0]/l,v[1]/l,v[2]/l];}
function _ra(ax,ay,az,a){const c=Math.cos(a),s=Math.sin(a),t=1-c;return[t*ax*ax+c,t*ax*ay-s*az,t*ax*az+s*ay,t*ay*ax+s*az,t*ay*ay+c,t*ay*az-s*ax,t*az*ax-s*ay,t*az*ay+s*ax,t*az*az+c];}
function _rz(a){const c=Math.cos(a),s=Math.sin(a);return[c,-s,0,s,c,0,0,0,1];}
function _rft(fr,to){const cx=fr[1]*to[2]-fr[2]*to[1],cy=fr[2]*to[0]-fr[0]*to[2],cz=fr[0]*to[1]-fr[1]*to[0];const sA=Math.sqrt(cx*cx+cy*cy+cz*cz),cA=fr[0]*to[0]+fr[1]*to[1]+fr[2]*to[2];if(sA<1e-9){if(cA>0)return[1,0,0,0,1,0,0,0,1];const px=Math.abs(fr[0])<0.9?1:0,py=Math.abs(fr[0])<0.9?0:1;const qx=fr[1]*0-fr[2]*py,qy=fr[2]*px,qz=fr[0]*py-fr[1]*px;const ql=Math.sqrt(qx*qx+qy*qy+qz*qz);const k=[qx/ql,qy/ql,qz/ql];return[2*k[0]*k[0]-1,2*k[0]*k[1],2*k[0]*k[2],2*k[1]*k[0],2*k[1]*k[1]-1,2*k[1]*k[2],2*k[2]*k[0],2*k[2]*k[1],2*k[2]*k[2]-1];}const k=[cx/sA,cy/sA,cz/sA];const tt=1-cA,ss=sA;return[tt*k[0]*k[0]+cA,tt*k[0]*k[1]-ss*k[2],tt*k[0]*k[2]+ss*k[1],tt*k[1]*k[0]+ss*k[2],tt*k[1]*k[1]+cA,tt*k[1]*k[2]-ss*k[0],tt*k[2]*k[0]-ss*k[1],tt*k[2]*k[1]+ss*k[0],tt*k[2]*k[2]+cA];}
function _sl(A,B,t){const AT=[A[0],A[3],A[6],A[1],A[4],A[7],A[2],A[5],A[8]];const R=_mm(B,AT);const cA=Math.max(-1,Math.min(1,(R[0]+R[4]+R[8]-1)/2));const ang=Math.acos(cA);if(ang<1e-6)return A;const s=1/(2*Math.sin(ang));const ax=(R[7]-R[5])*s,ay=(R[2]-R[6])*s,az=(R[3]-R[1])*s;return _mm(_ra(ax,ay,az,ang*t),A);}

const _CV=[[-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],[-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]];
const _CF=[{v:[3,2,1,0],n:[0,0,-1],val:1},{v:[4,5,6,7],n:[0,0,1],val:6},{v:[0,1,5,4],n:[0,-1,0],val:2},{v:[7,6,2,3],n:[0,1,0],val:5},{v:[0,4,7,3],n:[-1,0,0],val:3},{v:[1,2,6,5],n:[1,0,0],val:4}];
const _FS=96, _D6T={};
(()=>{for(const f of _CF){const c=document.createElement('canvas');c.width=c.height=_FS;const x=c.getContext('2d');x.fillStyle='#c0320a';x.beginPath();x.roundRect(2,2,_FS-4,_FS-4,8);x.fill();x.fillStyle='#fff';x.font=`bold ${_FS*0.52}px monospace`;x.textAlign='center';x.textBaseline='middle';x.fillText(String(f.val),_FS/2,_FS/2);_D6T[f.val]=c;}})();

function _sp(val){const f=_CF.find(x=>x.val===val);return _mm(_rz(Math.floor(Math.random()*4)*Math.PI/2),_rft(f.n,[0,0,1]));}
function _bap(snapM,ivz){const bv=[];let vv=ivz;while(vv>0.06){bv.push(vv);vv*=_VR;}bv.reverse();let omega=0.03+Math.random()*0.015;let axis=_nv([(Math.random()-.5),(Math.random()-.5),(Math.random()-.5)]);const fp=[snapM],fs=[];let M=snapM;for(let i=0;i<bv.length;i++){const ss=fp.length;const af=Math.ceil(2*bv[i]/_G);for(let ff=0;ff<af;ff++){M=_mm(_ra(axis[0],axis[1],axis[2],omega),M);fp.push(M);}fs.push({s:ss,e:fp.length-1});omega/=0.78;axis=_nv([(Math.random()-.5),(Math.random()-.5),(Math.random()-.5)]);}const tl=fp.length-1;fp.reverse();return{path:fp,segs:[...fs].reverse().map(({s,e})=>({s:tl-e,e:tl-s}))};}

function createDie(outcome,sx,sy){
  const snap=_sp(outcome);const ivz=1.5+Math.random()*0.7;
  const{path,segs}=_bap(snap,ivz);
  const dir=Math.random()*Math.PI*2;
  return{outcome,x:sx,y:sy,vx:Math.cos(dir)*(10+Math.random()*10),vy:Math.sin(dir)*(10+Math.random()*10),h:0.8+Math.random()*0.4,vz:ivz,apex:0,snap,path,segs,si:0,af:0,curM:path[0],settling:false,st:0,sf:null,done:false,scale:44,r:24};
}

function stepDie(die,W,H,pad){
  if(die.done)return;
  die.vz-=_G; die.h+=die.vz;
  if(die.h<=0){
    die.h=0; die.vz=Math.abs(die.vz)*_VR;
    die.apex=(die.vz*die.vz)/(2*_G);
    die.vx*=_FF; die.vy*=_FF;
    const ns=die.si+1; if(ns<die.segs.length)die.si=ns;
    if(die.vz<0.08)die.apex=0;
  }
  if(die.vz>0)die.apex=die.h+(die.vz*die.vz)/(2*_G);
  const fr=_BF-Math.max(0,1-die.apex/_DT)*(_BF-_DM);
  die.vx*=fr; die.vy*=fr; die.x+=die.vx; die.y+=die.vy;
  const rr=die.r, wd=0.7+Math.random()*0.1;
  if(die.x-rr<pad){die.x=pad+rr;die.vx=Math.abs(die.vx)*_BR*wd;die.vy*=_WF;}
  else if(die.x+rr>W-pad){die.x=W-pad-rr;die.vx=-Math.abs(die.vx)*_BR*wd;die.vy*=_WF;}
  if(die.y-rr<pad){die.y=pad+rr;die.vy=Math.abs(die.vy)*_BR*wd;die.vx*=_WF;}
  else if(die.y+rr>H-pad){die.y=H-pad-rr;die.vy=-Math.abs(die.vy)*_BR*wd;die.vx*=_WF;}
}

function animDie(die){
  if(die.done)return;
  const spd=Math.sqrt(die.vx*die.vx+die.vy*die.vy);
  if(die.settling){
    die.st+=1/_SF;
    if(die.st>=1){die.curM=die.snap;die.done=true;}
    else die.curM=_sl(die.sf,die.snap,Math.sqrt(die.st));
    return;
  }
  const mf=die.path.length-1;
  const csg=die.segs[die.si]??{s:0,e:mf};
  const gf=die.si<die.segs.length-1?csg.e:mf;
  die.af=Math.min(die.af+1,gf);
  die.curM=die.path[Math.floor(die.af)];
  if(spd<0.12&&die.h<0.01&&die.apex<0.02&&Math.abs(die.vz)<0.04){
    die.settling=true;die.st=0;die.sf=die.curM;die.vx=die.vy=die.vz=0;
  }
}

function drawDie(ctx,die){
  // Render flat on the board — no vertical lift (h not used for y offset)
  const m=die.curM, sc=die.scale, px=die.x, py=die.y;
  const tv=_CV.map(v=>_mv(m,v));
  const pv=tv.map(v=>[v[0]*sc+px, -v[1]*sc+py]);
  // Drop shadow
  ctx.save();ctx.globalAlpha=0.25;ctx.fillStyle='#000';
  ctx.beginPath();ctx.ellipse(px,py+die.r*0.15,die.r*0.85,die.r*0.22,0,0,Math.PI*2);ctx.fill();ctx.restore();
  // Faces
  _CF.map(f=>{
    const avgZ=f.v.reduce((s,i)=>s+tv[i][2],0)/4;
    const rn=_mv(m,f.n);
    return{...f,avgZ,vis:rn[2]>0};
  }).sort((a,b)=>a.avgZ-b.avgZ).forEach(f=>{
    if(!f.vis)return;
    const pts=f.v.map(i=>pv[i]);
    const pat=ctx.createPattern(_D6T[f.val],'no-repeat');
    const[p0,p1,,p3]=pts;
    const a=(p1[0]-p0[0])/_FS,b=(p1[1]-p0[1])/_FS,c=(p3[0]-p0[0])/_FS,d=(p3[1]-p0[1])/_FS;
    pat.setTransform(new DOMMatrix([a,b,c,d,p0[0],p0[1]]));
    ctx.fillStyle=pat;
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<4;i++)ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.28)';ctx.lineWidth=0.8;ctx.stroke();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME CLASS
// ─────────────────────────────────────────────────────────────────────────────
class LudoGame {
  constructor(canvas, hud, {n, k, colours, rules}) {
    this.canvas=canvas; this.hud=hud;
    this.n=n; this.k=k;
    this.colours=colours && colours.length>=n ? colours : (()=>{const c=[];for(let i=0;i<n;i++)c.push(randomColour(c));return c;})();
    this.rules=rules||{threeSixLoss:true,blockading:false};
    this._destroyed=false; this._raf=null; this._die=null; this._loop=false;
    this._boundClick=this._onClick.bind(this);
    this._boundRoll=()=>this.requestRoll();
    this.canvas.addEventListener('click',this._boundClick);
    this.hud.rollBtn.addEventListener('click',this._boundRoll);
    this.reset();
  }

  reset() {
    this.currentPlayer=0;
    this.diceValue=null;
    this.selected=null;
    this.validMoves=new Set();
    this.phase='roll';
    this.winner=null;
    this._die=null;
    this._sixStreak=Array(this.n).fill(0);
    this._transitioning=false;
    if(this._skipTimeout){clearTimeout(this._skipTimeout);this._skipTimeout=null;}

    this.board=buildBoard(this.n,this.k,this.colours);
    this.board.layout(this.canvas.width,this.canvas.height);

    this.pieces=[];
    for(let p=0;p<this.n;p++)
      for(let f=0;f<this.k;f++)
        this.pieces.push({id:`${p}_${f}`,player:p,figureNum:f,kiteSlot:f,pathIndex:-1,finished:false});

    this._updateHUD();
    this._startLoop();
  }

  destroy(){
    this._destroyed=true; this._loop=false;
    if(this._raf)cancelAnimationFrame(this._raf);
    if(this._skipTimeout){clearTimeout(this._skipTimeout);this._skipTimeout=null;}
    this.canvas.removeEventListener('click',this._boundClick);
    this.hud.rollBtn.removeEventListener('click',this._boundRoll);
  }

  _startLoop(){
    if(this._loop)return;
    this._loop=true;
    const tick=()=>{
      if(this._destroyed){this._loop=false;return;}
      if(this._die&&!this._die.done){
        stepDie(this._die,this.canvas.width,this.canvas.height,16);
        animDie(this._die);
        if(this._die.done) this._updateHUD(`Rolled ${this._die.outcome} — tap to confirm`);
      }
      this._render();
      this._raf=requestAnimationFrame(tick);
    };
    this._raf=requestAnimationFrame(tick);
  }

  // Snap a rolling die immediately to its settled result
  _snapDie(){
    if(!this._die||this._die.done)return;
    this._die.curM=this._die.snap;
    this._die.done=true;
    this._die.vx=this._die.vy=this._die.vz=0;
    this._die.h=0;
  }

  requestRoll(){
    if(this._transitioning){
      clearTimeout(this._skipTimeout);
      this._nextTurn();
      return;
    }
    if(this.phase!=='roll')return;
    // If die is mid-animation, snap it and confirm immediately
    if(this._die&&!this._die.done){
      this._snapDie();
      this._confirmDie();
      return;
    }
    // If die already settled, confirm it
    if(this._die&&this._die.done){
      this._confirmDie();
      return;
    }
    // Fresh roll
    const outcome=Math.floor(Math.random()*6)+1;
    const W=this.canvas.width,H=this.canvas.height;
    this._die=createDie(outcome,W/2+(Math.random()-.5)*80,H/2+(Math.random()-.5)*60);
    this._updateHUD('Rolling… (tap to skip)');
  }

  _confirmDie(){
    if(!this._die)return;
    if(!this._die.done)this._snapDie();
    const outcome=this._die.outcome;
    this._die=null;

    if(outcome===6){
      this._sixStreak[this.currentPlayer]++;
      if(this.rules.threeSixLoss && this._sixStreak[this.currentPlayer]>=3){
        this._sixStreak[this.currentPlayer]=0;
        this._transitioning=true;
        this._updateHUD('Three 6s — forfeited! (tap to continue)');
        this._skipTimeout=setTimeout(()=>this._nextTurn(),1200);
        return;
      }
    } else {
      this._sixStreak[this.currentPlayer]=0;
    }

    this.diceValue=outcome;
    this._afterRoll();
  }

  _afterRoll(){
    this.validMoves=new Set();
    const path=this.board.paths[this.currentPlayer];
    this._playerPieces(this.currentPlayer).forEach(piece=>{
      if(piece.finished)return;
      if(piece.pathIndex<0){
        // Need a 6 to exit base; pathIndex 0 = first board square
        if(this.diceValue===6&&!this._blockedAt(piece,0))
          this.validMoves.add(piece.id);
      } else {
        const target=piece.pathIndex+this.diceValue;
        const last=path.length-1;
        if(target===last){
          // Exact roll to end — end node is never blocked
          this.validMoves.add(piece.id);
        } else if(target<last&&!this._blockedAt(piece,target)){
          this.validMoves.add(piece.id);
        }
      }
    });
    if(this.validMoves.size===0){
      this._transitioning=true;
      this._updateHUD('No moves — skipping (tap to continue)');
      this._skipTimeout=setTimeout(()=>this._nextTurn(),1100);
    } else {
      this.phase='move';
      this._updateHUD(`Rolled ${this.diceValue} — tap a highlighted piece`);
    }
  }

  // Returns true if placing movingPiece at targetIdx would be blocked.
  // For n=1: use pathIndex directly (no canonical id needed).
  _blockedAt(movingPiece,targetIdx){
    if(this.n===1){
      // Self-capture check for n=1
      const ownThere=this._playerPieces(movingPiece.player)
        .filter(p=>p.id!==movingPiece.id&&!p.finished&&p.pathIndex===targetIdx).length;
      return ownThere>0;
    }
    const path=this.board.paths[movingPiece.player];
    if(targetIdx<0||targetIdx>=path.length)return false;
    const cid=canonicalId(path[targetIdx],this.n);

    // Self-capture always forbidden
    const ownThere=this._playerPieces(movingPiece.player)
      .filter(p=>p.id!==movingPiece.id&&!p.finished&&this._pieceNodeCid(p)===cid).length;
    if(ownThere>0)return true;

    // Blockade: opponents have ≥2 pieces on this node
    if(this.rules.blockading){
      const oppThere=this.pieces
        .filter(p=>p.player!==movingPiece.player&&!p.finished)
        .filter(p=>this._pieceNodeCid(p)===cid).length;
      if(oppThere>=2)return true;
    }
    return false;
  }

  // Canonical node id for a piece's current board position
  _pieceNodeCid(piece){
    if(piece.pathIndex<0||piece.finished)return null;
    if(this.n===1)return `lane_${piece.pathIndex}`;
    const path=this.board.paths[piece.player];
    if(piece.pathIndex>=path.length)return null;
    return canonicalId(path[piece.pathIndex],this.n);
  }

  _onClick(e){
    if(this._destroyed)return;
    if(this.phase==='gameover'){this.reset();return;}
    // Click during skip/forfeit timeout — cancel it and move on immediately
    if(this._transitioning){
      clearTimeout(this._skipTimeout);
      this._nextTurn();
      return;
    }
    // Click during animation or on settled die: snap/confirm
    if(this._die){
      if(!this._die.done)this._snapDie();
      else this._confirmDie();
      return;
    }
    if(this.phase!=='move')return;
    const rect=this.canvas.getBoundingClientRect();
    const px=(e.clientX-rect.left)*(this.canvas.width/rect.width);
    const py=(e.clientY-rect.top)*(this.canvas.height/rect.height);
    this._tryMove(px,py);
  }

  _tryMove(px,py){
    const fr=Math.max(8,this.board.sq*0.4);
    let clicked=null;
    for(const pid of this.validMoves){
      const piece=this.pieces.find(p=>p.id===pid);
      const{x,y}=this._piecePos(piece,fr);
      if(Math.hypot(px-x,py-y)<fr*1.8){clicked=piece;break;}
    }
    if(!clicked){
      if(this.selected){
        const sel=this.pieces.find(p=>p.id===this.selected);
        if(sel&&this.validMoves.has(sel.id)){
          const{x,y}=this._piecePos(sel,fr);
          if(Math.hypot(px-x,py-y)<fr*1.8){this._move(sel);return;}
        }
      }
      this.selected=null; return;
    }
    if(this.selected===clicked.id||this.validMoves.size===1)this._move(clicked);
    else this.selected=clicked.id;
  }

  _piecePos(piece,fr){
    const{board,k,n}=this;
    if(piece.pathIndex<0){
      let hx,hy;
      if(n>=3){const kit=board.kites[piece.player];hx=kit.cx;hy=kit.cy;}
      else if(n===2){const h=board.homes[piece.player];hx=h.midX;hy=h.midY;}
      else{hx=board.basePos.x;hy=board.basePos.y;}
      const cols=Math.ceil(Math.sqrt(k)),sp=fr*2.4;
      return{x:hx+(piece.kiteSlot%cols-(cols-1)/2)*sp,
             y:hy+(Math.floor(piece.kiteSlot/cols)-(Math.ceil(k/cols)-1)/2)*sp};
    }
    if(n===1){
      const idx=piece.pathIndex;
      const nd=board.laneNodes?.[idx];
      return nd?{x:nd.x,y:nd.y}:{x:0,y:0};
    }
    const rawId=board.paths[piece.player][piece.pathIndex];
    if(rawId==='end')return{x:board.cx,y:board.cy};
    const cid=canonicalId(rawId,n);
    const nd=board.nodes[cid]??board.nodes[rawId];
    return nd?{x:nd.x,y:nd.y}:{x:0,y:0};
  }

  _move(piece){
    const path=this.board.paths[piece.player];
    // Exit base: pathIndex 0 is the first board square (c2,r1 of own grid)
    piece.pathIndex=piece.pathIndex<0?0:piece.pathIndex+this.diceValue;

    // Capture check (not on own home stretch col-1 or end)
    if(piece.pathIndex>=0&&piece.pathIndex<path.length-1){
      const nodeId=path[piece.pathIndex];
      const isSafe=nodeId.startsWith(`g${piece.player}_c1_r`)||nodeId==='end';
      if(!isSafe){
        const cid=canonicalId(nodeId,this.n);
        // With blockading on, can only capture if landing square has exactly 1 opponent
        // (≥2 means it's a blockade and we can't land there — already filtered in _blockedAt)
        this.pieces.forEach(other=>{
          if(other.player===piece.player||other.id===piece.id||other.finished)return;
          const op=this.board.paths[other.player];
          if(other.pathIndex<0||other.pathIndex>=op.length)return;
          if(canonicalId(op[other.pathIndex],this.n)===cid)other.pathIndex=-1;
        });
      }
    }

    if(piece.pathIndex>=path.length-1){piece.pathIndex=path.length-1;piece.finished=true;}
    this.selected=null; this.validMoves=new Set();

    if(this._playerPieces(piece.player).every(p=>p.finished)){
      this.winner=piece.player; this.phase='gameover';
      this._updateHUD(`Player ${piece.player+1} wins!`); return;
    }
    if(this.diceValue===6){
      this.phase='roll'; this.diceValue=null;
      this._updateHUD('Rolled 6 — roll again!');
    } else this._nextTurn();
  }

  _nextTurn(){
    this._transitioning=false;
    this._skipTimeout=null;
    let next=(this.currentPlayer+1)%this.n, tries=0;
    while(this._playerPieces(next).every(p=>p.finished)&&tries++<this.n)
      next=(next+1)%this.n;
    this.currentPlayer=next; this.phase='roll'; this.diceValue=null;
    this.selected=null; this.validMoves=new Set();
    this._updateHUD();
  }

  _playerPieces(p){return this.pieces.filter(x=>x.player===p);}

  _updateHUD(msg){
    const col=this.colours[this.currentPlayer%this.colours.length];
    const tc=textFor(col);
    if(this.hud.badge){
      this.hud.badge.textContent=`P${this.currentPlayer+1}`;
      this.hud.badge.style.background=col;
      this.hud.badge.style.color=tc;
    }
    const rb=this.hud.rollBtn;
    if(rb){
      const canRoll=this.phase==='roll';
      rb.disabled=!canRoll; rb.style.opacity=canRoll?'1':'0.4';
      rb.textContent=(this._die&&this._die.done)?'Confirm'
                    :this._die?'Skip'
                    :'Roll';
    }
    if(this.hud.status)
      this.hud.status.textContent=msg??(this.phase==='roll'?'Roll the die':'');
  }

  _render(){
    const ctx=this.canvas.getContext('2d');
    const W=this.canvas.width,H=this.canvas.height;
    const gs={pieces:this.pieces,selected:this.selected,validMoves:this.validMoves,
               phase:this.phase,winner:this.winner,rules:this.rules};
    renderBoard(ctx,this.board,gs,W,H);
    if(this._die)drawDie(ctx,this._die);
    this._updateHUD();
  }

  render(){this._render();}
}