// ================================================================
// MINESWEEPER — game.js
// ================================================================

const canvas     = document.getElementById('canvas');
const ctx        = canvas.getContext('2d');
const canvasWrap = document.getElementById('canvas-wrap');
const scrollBox  = document.getElementById('canvas-scroll');

function css(v){ return getComputedStyle(document.body).getPropertyValue(v).trim(); }
let darkMode = false;

// ---- Difficulties ----
const DIFFICULTIES = {
  beginner:     { w:9,  h:9,  mines:10 },
  intermediate: { w:16, h:16, mines:40 },
  expert:       { w:30, h:16, mines:99 },
};

// ---- Grid state ----
let COLS, ROWS, MINE_COUNT;
let board, revealed, flagged, exploded, adjCache;
let gameState  = 'idle';
let firstClick = true;
let minesLeft  = 0;

// ---- Cell sizing ----
const CELL_MAX  = 36;
const CELL_SCROLL_THRESHOLD = 18;
let cellSize = 26;

// ---- Timer ----
let timerInterval  = null;
let timerSeconds   = 0;
let timerCountdown = 0;
let timerElapsed   = 0;

// ---- Explosions ----
const explosions = [];
let explodeQueue = [];
let explodeTimer = 0;

// ---- Hold-to-action ----
const HOLD_MS      = 400;
let holdTimer      = null;
let holdCell       = null;
let holdActioned   = false;
let chordHighlight = null;

// ---- Mine input mode ----
let mineInputMode = 'count';

// ---- Drag-to-flag ----
let dragFlagging = false;
let dragFlagCell = null; // cell currently hovered during drag

// ================================================================
// BOARD
// ================================================================
function idx(x, y) { return y * COLS + x; }

function initBoard(cols, rows, mines) {
  mines = Math.max(0, Math.min(cols*rows - 1, mines));
  COLS = cols; ROWS = rows; MINE_COUNT = mines;
  board    = new Uint8Array(cols * rows);
  revealed = new Uint8Array(cols * rows);
  flagged  = new Uint8Array(cols * rows);
  exploded = new Uint8Array(cols * rows);
  adjCache = new Int8Array(cols * rows).fill(-1);
  firstClick = true;
  gameState  = 'idle';
  minesLeft  = mines;
  timerElapsed = timerCountdown > 0 ? timerCountdown : 0;
  stopTimer();
  updateLCDs();
  computeCanvasSize();
  clearOverlay();
  explosions.length = 0;
  explodeQueue = [];
  chordHighlight = null;
  dragFlagging = false;
  dragFlagCell = null;
  render();
}

function placeMines(safeX, safeY) {
  const safe = new Set();
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    const nx=safeX+dx, ny=safeY+dy;
    if (nx>=0&&nx<COLS&&ny>=0&&ny<ROWS) safe.add(idx(nx,ny));
  }
  let placed=0, attempts=0;
  while (placed < MINE_COUNT && attempts < COLS*ROWS*10) {
    attempts++;
    const r=Math.floor(Math.random()*COLS*ROWS);
    if (!board[r]&&!safe.has(r)) { board[r]=1; placed++; }
  }
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    adjCache[idx(x,y)] = board[idx(x,y)] ? -1 : countAdjMinesRaw(x,y);
}

function countAdjMinesRaw(x, y) {
  let n=0;
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    if (!dx&&!dy) continue;
    const nx=x+dx, ny=y+dy;
    if (nx>=0&&nx<COLS&&ny>=0&&ny<ROWS&&board[idx(nx,ny)]) n++;
  }
  return n;
}
function countAdjMines(x,y){ const v=adjCache[idx(x,y)]; return v<0?0:v; }
function countAdjFlags(x,y){
  let n=0;
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    if (!dx&&!dy) continue;
    const nx=x+dx, ny=y+dy;
    if (nx>=0&&nx<COLS&&ny>=0&&ny<ROWS&&flagged[idx(nx,ny)]) n++;
  }
  return n;
}

function ensureFlood(safeX, safeY) {
  if (COLS*ROWS <= 9) return;
  const safe = new Set();
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    const nx=safeX+dx, ny=safeY+dy;
    if (nx>=0&&nx<COLS&&ny>=0&&ny<ROWS) safe.add(idx(nx,ny));
  }
  let iters=0;
  while (countAdjMinesRaw(safeX,safeY)>0 && iters++<500) {
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
      if (!dx&&!dy) continue;
      const nx=safeX+dx, ny=safeY+dy;
      if (nx<0||nx>=COLS||ny<0||ny>=ROWS) continue;
      const ni=idx(nx,ny);
      if (!board[ni]) continue;
      for (let a=0;a<200;a++) {
        const r=Math.floor(Math.random()*COLS*ROWS);
        if (!board[r]&&!safe.has(r)) { board[ni]=0; board[r]=1; break; }
      }
    }
  }
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++)
    adjCache[idx(x,y)] = board[idx(x,y)] ? -1 : countAdjMinesRaw(x,y);
}

// ================================================================
// REVEAL / CHORD
// ================================================================
function revealFlood(x, y) {
  const stack=[[x,y]];
  while (stack.length) {
    const [cx,cy]=stack.pop();
    if (cx<0||cx>=COLS||cy<0||cy>=ROWS) continue;
    const i=idx(cx,cy);
    if (revealed[i]||flagged[i]) continue;
    revealed[i]=1;
    if (adjCache[i]===0)
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
        if (!dx&&!dy) continue;
        stack.push([cx+dx,cy+dy]);
      }
  }
}

function chordCell(x, y) {
  const i=idx(x,y);
  if (!revealed[i]||board[i]) return false;
  const n=countAdjMines(x,y);
  if (n===0||countAdjFlags(x,y)!==n) return false;
  let hitMine=false;
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
    if (!dx&&!dy) continue;
    const nx=x+dx, ny=y+dy;
    if (nx<0||nx>=COLS||ny<0||ny>=ROWS) continue;
    const ni=idx(nx,ny);
    if (revealed[ni]||flagged[ni]) continue;
    if (board[ni]) { hitMine=true; revealed[ni]=1; exploded[ni]=1; }
    else revealFlood(nx,ny);
  }
  return hitMine;
}

function checkWin() {
  for (let i=0;i<COLS*ROWS;i++) if (!board[i]&&!revealed[i]) return false;
  return true;
}

// ================================================================
// EXPLOSIONS
// ================================================================
function createExplosion(px, py) {
  const N=18+Math.floor(Math.random()*14), particles=[];
  for (let i=0;i<N;i++) {
    const a=Math.random()*Math.PI*2, spd=1.5+Math.random()*3.5;
    particles.push({x:px,y:py,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:1,decay:0.026+Math.random()*0.024,size:2+Math.random()*4});
  }
  return {particles,done:false};
}

function stepExplosions() {
  for (const ex of explosions) {
    let alive=false;
    for (const p of ex.particles) {
      p.x+=p.vx; p.y+=p.vy; p.vx*=0.88; p.vy*=0.88; p.life-=p.decay;
      if (p.life>0) alive=true;
    }
    if (!alive) ex.done=true;
  }
  for (let i=explosions.length-1;i>=0;i--) if(explosions[i].done) explosions.splice(i,1);
}

function buildExplodeQueue(clickX, clickY) {
  const mines=[];
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if(board[idx(x,y)]) mines.push({x,y});
  let queue=[];
  if (COLS>=ROWS) {
    const leftBias=clickX<=COLS/2;
    const xs=leftBias?Array.from({length:COLS},(_,i)=>i):Array.from({length:COLS},(_,i)=>COLS-1-i);
    for (const x of xs) queue.push(...mines.filter(m=>m.x===x).sort((a,b)=>a.y-b.y));
  } else {
    const topBias=clickY<=ROWS/2;
    const ys=topBias?Array.from({length:ROWS},(_,i)=>i):Array.from({length:ROWS},(_,i)=>ROWS-1-i);
    for (const y of ys) queue.push(...mines.filter(m=>m.y===y).sort((a,b)=>a.x-b.x));
  }
  const BASE_DELAY=Math.max(30,Math.min(180,2000/Math.max(queue.length,1)));
  explodeQueue=queue.map((m,i)=>({x:m.x,y:m.y,delay:i*BASE_DELAY,fired:false}));
  explodeTimer=0;
}

// ================================================================
// CANVAS SIZING
// ================================================================
function computeCanvasSize() {
  const panelW = document.getElementById('main-panel').clientWidth - 22;
  const maxH   = Math.min(window.innerHeight * 0.65, 600);
  const fitW   = Math.floor(panelW / COLS);
  const fitH   = Math.floor(maxH   / ROWS);
  cellSize = Math.min(CELL_MAX, Math.max(CELL_SCROLL_THRESHOLD, Math.min(fitW, fitH)));
  canvas.width  = COLS * cellSize;
  canvas.height = ROWS * cellSize;
  scrollBox.style.maxHeight = maxH + 'px';
  canvasWrap.style.width  = canvas.width  + 'px';
  canvasWrap.style.height = canvas.height + 'px';
}

// ================================================================
// RENDERING
// ================================================================
const NUM_COLORS=['','--num1','--num2','--num3','--num4','--num5','--num6','--num7','--num8'];

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const cMid=css('--face-mid'), cLight=css('--face-light'), cDark=css('--face-dark'),
        cVDark=css('--face-vdark'), cMine=css('--mine-color'), cFlag=css('--flag-color');
  const bw=Math.max(1,Math.floor(cellSize*0.08));

  for (let y=0;y<ROWS;y++) {
    for (let x=0;x<COLS;x++) {
      const px=x*cellSize, py=y*cellSize, cs=cellSize;
      const i=idx(x,y);
      const isRev=revealed[i], isFlag=flagged[i], isMine=board[i], isExpl=exploded[i];
      const isDragHover = dragFlagCell && dragFlagCell.x===x && dragFlagCell.y===y;

      if (isRev||(gameState==='lost'&&isMine)) {
        ctx.fillStyle=cMid; ctx.fillRect(px,py,cs,cs);
        ctx.fillStyle=cDark; ctx.fillRect(px,py,cs,1); ctx.fillRect(px,py,1,cs);
        if (isMine&&(isExpl||gameState==='lost')) {
          drawMine(px,py,cs,cMine,isExpl&&gameState==='lost');
        } else if (isRev&&!isMine) {
          const n=countAdjMines(x,y);
          if (n>0&&cs>=8) {
            ctx.fillStyle=css(NUM_COLORS[n]);
            ctx.font=`bold ${Math.max(6,Math.floor(cs*0.58))}px "Courier New",monospace`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(String(n),px+cs/2,py+cs/2+1);
          } else if (n>0&&cs>=4) {
            ctx.fillStyle=css(NUM_COLORS[n]);
            ctx.fillRect(px+cs/2-1,py+cs/2-1,2,2);
          }
        }
      } else {
        drawRaisedCell(px,py,cs,cMid,cLight,cDark,cVDark,bw);
        if (isFlag) {
          drawFlag(px,py,cs,cFlag);
          if (gameState==='lost'&&!isMine) drawWrongX(px,py,cs);
        } else if (gameState==='lost'&&isMine) {
          drawMine(px,py,cs,cMine,false);
        }
        // Ghost flag preview during drag
        if (isDragHover && !isFlag && gameState==='playing') {
          ctx.globalAlpha=0.5;
          drawFlag(px,py,cs,cFlag);
          ctx.globalAlpha=1;
        }
      }

      if (chordHighlight&&chordHighlight.x===x&&chordHighlight.y===y) {
        ctx.strokeStyle='rgba(255,220,0,0.85)';
        ctx.lineWidth=Math.max(2,cs*0.12);
        ctx.strokeRect(px+1,py+1,cs-2,cs-2);
      }
    }
  }

  stepExplosions();
  for (const ex of explosions) {
    for (const p of ex.particles) {
      if (p.life<=0) continue;
      ctx.globalAlpha=Math.max(0,p.life);
      ctx.fillStyle=darkMode?'rgba(255,160,60,1)':'rgba(220,80,0,1)';
      const s=p.size*(0.5+0.5*p.life);
      ctx.fillRect(p.x-s/2,p.y-s/2,s,s);
    }
  }
  ctx.globalAlpha=1;

  if (explodeQueue.length) {
    explodeTimer+=16;
    for (const e of explodeQueue.filter(e=>!e.fired&&explodeTimer>=e.delay)) {
      e.fired=true;
      exploded[idx(e.x,e.y)]=1;
      explosions.push(createExplosion(e.x*cellSize+cellSize/2,e.y*cellSize+cellSize/2));
    }
    if (explodeQueue.every(e=>e.fired)) explodeQueue=[];
  }

  if (explosions.length||explodeQueue.length) requestAnimationFrame(render);
}

function drawRaisedCell(px,py,cs,cMid,cLight,cDark,cVDark,bw) {
  ctx.fillStyle=cMid; ctx.fillRect(px,py,cs,cs);
  ctx.fillStyle=cLight; ctx.fillRect(px,py,cs,bw); ctx.fillRect(px,py,bw,cs);
  ctx.fillStyle=cDark;  ctx.fillRect(px,py+cs-bw,cs,bw); ctx.fillRect(px+cs-bw,py,bw,cs);
  if (bw>1) { ctx.fillStyle=cVDark; ctx.fillRect(px+cs-1,py+cs-1,1,1); }
}

function drawMine(px,py,cs,color,isClicked) {
  const cx=px+cs/2,cy=py+cs/2,r=Math.max(1.5,cs*0.28);
  if (isClicked){ctx.fillStyle='#ff3300';ctx.fillRect(px,py,cs,cs);}
  ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  if (cs>=8) {
    ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,cs*0.07);
    for (let d=0;d<8;d++){const a=d*Math.PI/4;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*0.9,cy+Math.sin(a)*r*0.9);ctx.lineTo(cx+Math.cos(a)*r*1.55,cy+Math.sin(a)*r*1.55);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.5)';ctx.beginPath();ctx.arc(cx-r*0.25,cy-r*0.25,r*0.25,0,Math.PI*2);ctx.fill();
  }
}

function drawFlag(px,py,cs,cFlag) {
  if (cs<6) { ctx.fillStyle=cFlag; ctx.fillRect(px+cs*0.2,py+cs*0.2,cs*0.6,cs*0.6); return; }
  const cx=px+cs/2,base=py+cs*0.78,top=py+cs*0.18,poleX=cx-cs*0.06;
  ctx.strokeStyle=darkMode?'#ccc':'#000';ctx.lineWidth=Math.max(1,cs*0.08);
  ctx.beginPath();ctx.moveTo(poleX,base);ctx.lineTo(poleX,top);ctx.stroke();
  ctx.fillStyle=cFlag;
  ctx.beginPath();ctx.moveTo(poleX,top);ctx.lineTo(poleX+cs*0.32,top+cs*0.18);ctx.lineTo(poleX,top+cs*0.36);ctx.closePath();ctx.fill();
  ctx.fillStyle=darkMode?'#ccc':'#000';
  ctx.fillRect(px+cs*0.22,base-cs*0.06,cs*0.56,cs*0.08);
}

function drawWrongX(px,py,cs) {
  ctx.strokeStyle='#ff0000';ctx.lineWidth=Math.max(1.5,cs*0.1);
  ctx.beginPath();ctx.moveTo(px+cs*0.2,py+cs*0.2);ctx.lineTo(px+cs*0.8,py+cs*0.8);ctx.stroke();
  ctx.beginPath();ctx.moveTo(px+cs*0.8,py+cs*0.2);ctx.lineTo(px+cs*0.2,py+cs*0.8);ctx.stroke();
}

// ================================================================
// FLAG PALETTE — draw into a canvas element
// ================================================================
function drawPaletteFlag() {
  const pc = document.getElementById('palette-flag-canvas');
  if (!pc) return;
  const pctx = pc.getContext('2d');
  const cs = pc.width;
  pctx.clearRect(0,0,cs,cs);
  const cMid=css('--face-mid'), cLight=css('--face-light'), cDark=css('--face-dark'), cVDark=css('--face-vdark'), cFlag=css('--flag-color');
  // Raised cell
  pctx.fillStyle=cMid; pctx.fillRect(0,0,cs,cs);
  pctx.fillStyle=cLight; pctx.fillRect(0,0,cs,2); pctx.fillRect(0,0,2,cs);
  pctx.fillStyle=cDark;  pctx.fillRect(0,cs-2,cs,2); pctx.fillRect(cs-2,0,2,cs);
  pctx.fillStyle=cVDark; pctx.fillRect(cs-1,cs-1,1,1);
  // Flag drawing
  const cx=cs/2, base=cs*0.78, top=cs*0.18, poleX=cx-cs*0.06;
  pctx.strokeStyle=darkMode?'#ccc':'#000'; pctx.lineWidth=Math.max(1,cs*0.08);
  pctx.beginPath(); pctx.moveTo(poleX,base); pctx.lineTo(poleX,top); pctx.stroke();
  pctx.fillStyle=cFlag;
  pctx.beginPath(); pctx.moveTo(poleX,top); pctx.lineTo(poleX+cs*0.32,top+cs*0.18); pctx.lineTo(poleX,top+cs*0.36); pctx.closePath(); pctx.fill();
  pctx.fillStyle=darkMode?'#ccc':'#000';
  pctx.fillRect(cs*0.22,base-cs*0.06,cs*0.56,cs*0.08);
  // Also copy to ghost canvas
  const ghost = document.getElementById('flag-drag-icon');
  if (ghost) ghost.getContext('2d').drawImage(pc,0,0);
}

// ================================================================
// DRAG-TO-FLAG
// The palette element fires the drag. Canvas mouse/touch events are
// completely separate — dragFlagging blocks canvas mouseup from acting.
// ================================================================
const flagPalette  = document.getElementById('flag-palette');
const flagDragIcon = document.getElementById('flag-drag-icon');

function cellFromPoint(clientX, clientY) {
  const rect=canvas.getBoundingClientRect();
  const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
  const gx=Math.floor((clientX-rect.left)*scaleX/cellSize);
  const gy=Math.floor((clientY-rect.top)*scaleY/cellSize);
  if (gx<0||gx>=COLS||gy<0||gy>=ROWS) return null;
  return {x:gx,y:gy};
}

function moveDragIcon(cx, cy) {
  flagDragIcon.style.left = (cx - 18) + 'px';
  flagDragIcon.style.top  = (cy - 18) + 'px';
}

function startFlagDrag(cx, cy) {
  dragFlagging = true;
  dragFlagCell = null;
  drawPaletteFlag(); // ensure ghost is up to date
  flagDragIcon.style.display = 'block';
  moveDragIcon(cx, cy);
}

function moveFlagDrag(cx, cy) {
  if (!dragFlagging) return;
  moveDragIcon(cx, cy);
  dragFlagCell = cellFromPoint(cx, cy);
  render();
}

function endFlagDrag(cx, cy) {
  if (!dragFlagging) return;
  dragFlagging = false;
  flagDragIcon.style.display = 'none';
  const cell = cellFromPoint(cx, cy);
  dragFlagCell = null;
  if (cell && gameState === 'playing') {
    const i = idx(cell.x, cell.y);
    if (!revealed[i]) {
      flagged[i] ^= 1;
      minesLeft  += flagged[i] ? -1 : 1;
      updateLCDs();
    }
  }
  render();
}

// Mouse drag from palette
flagPalette.addEventListener('mousedown', e => {
  if (e.button !== 0 || gameState !== 'playing') return;
  e.preventDefault();
  startFlagDrag(e.clientX, e.clientY);
});

// Touch drag from palette
flagPalette.addEventListener('touchstart', e => {
  if (gameState !== 'playing') return;
  e.preventDefault();
  startFlagDrag(e.touches[0].clientX, e.touches[0].clientY);
}, {passive:false});

// Global move/up — not on canvas, so no canvas events fire
window.addEventListener('mousemove', e => { moveFlagDrag(e.clientX, e.clientY); });
window.addEventListener('mouseup',   e => {
  if (e.button === 0) endFlagDrag(e.clientX, e.clientY);
});
window.addEventListener('touchmove', e => {
  if (!dragFlagging) return;
  e.preventDefault();
  moveFlagDrag(e.touches[0].clientX, e.touches[0].clientY);
}, {passive:false});
window.addEventListener('touchend', e => {
  if (!dragFlagging) return;
  const t = e.changedTouches[0];
  endFlagDrag(t.clientX, t.clientY);
}, {passive:false});

// ================================================================
// GAME ACTIONS
// ================================================================
function doReveal(x, y) {
  if (gameState==='won'||gameState==='lost') return;
  const i=idx(x,y);
  if (flagged[i]) return;
  if (firstClick) {
    firstClick=false;
    placeMines(x,y);
    ensureFlood(x,y);
    gameState='playing';
    startTimer();
  }
  if (revealed[i]) return;
  if (board[i]) { triggerLoss(x,y); return; }
  revealFlood(x,y);
  checkWinState();
  updateLCDs();
  render();
}

function doChord(x, y) {
  if (gameState!=='playing') return;
  if (!revealed[idx(x,y)]) return;
  chordHighlight={x,y};
  render();
  setTimeout(()=>{
    chordHighlight=null;
    const hitMine=chordCell(x,y);
    if (hitMine) {
      for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
        const nx=x+dx,ny=y+dy;
        if (nx<0||nx>=COLS||ny<0||ny>=ROWS) continue;
        if (exploded[idx(nx,ny)]) { triggerLoss(nx,ny); return; }
      }
      triggerLoss(x,y);
    } else { checkWinState(); updateLCDs(); render(); }
  },120);
}

function doFlag(x, y) {
  if (gameState==='won'||gameState==='lost'||gameState==='idle') return;
  const i=idx(x,y);
  if (revealed[i]) return;
  flagged[i]^=1;
  minesLeft+=flagged[i]?-1:1;
  updateLCDs();
  render();
}

function triggerLoss(ox, oy) {
  gameState='lost';
  stopTimer();
  if (MINE_COUNT <= 1000) {
    buildExplodeQueue(ox,oy);
    explosions.push(createExplosion(ox*cellSize+cellSize/2,oy*cellSize+cellSize/2));
    requestAnimationFrame(render);
  } else {
    for (let i=0;i<COLS*ROWS;i++) if(board[i]) exploded[i]=1;
    render();
  }
  showOverlay('GAME OVER');
}

function checkWinState() {
  if (!checkWin()) return;
  gameState='won';
  stopTimer();
  for (let i=0;i<COLS*ROWS;i++) if(board[i]&&!flagged[i]){flagged[i]=1;minesLeft--;}
  minesLeft=0;
  updateLCDs();
  showOverlay('YOU WIN');
}

function doReset() {
  let w,h,m;
  if (activeDiff==='custom') {
    w=Math.max(1,Math.min(1000,parseInt(document.getElementById('cust-w').value)||16));
    h=Math.max(1,Math.min(1000,parseInt(document.getElementById('cust-h').value)||16));
    if (mineInputMode==='pct') {
      const pct=Math.max(1,Math.min(99,parseInt(document.getElementById('cust-pct').value)||15));
      m=Math.max(0,Math.floor(w*h*pct/100));
    } else {
      m=Math.max(0,parseInt(document.getElementById('cust-m').value)||0);
    }
  } else {
    const cfg=DIFFICULTIES[activeDiff];
    w=cfg.w; h=cfg.h; m=cfg.mines;
  }
  initBoard(w,h,m);
}

// ================================================================
// CANVAS MOUSE INPUT
// Guard every handler: if dragFlagging, ignore completely.
// ================================================================
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (dragFlagging) return;
  const cell=cellFromPoint(e.clientX,e.clientY);
  if (cell) doFlag(cell.x,cell.y);
});

canvas.addEventListener('mousedown', e => {
  if (e.button!==0||dragFlagging) return;
  holdActioned=false;
  const cell=cellFromPoint(e.clientX,e.clientY);
  if (!cell) return;
  holdCell=cell;
  holdTimer=setTimeout(()=>{
    holdActioned=true; holdTimer=null;
    const i=idx(holdCell.x,holdCell.y);
    if (revealed[i]) doChord(holdCell.x,holdCell.y);
    else doFlag(holdCell.x,holdCell.y);
  },HOLD_MS);
});

canvas.addEventListener('mouseup', e => {
  if (e.button!==0||dragFlagging) return;
  if (holdTimer){clearTimeout(holdTimer);holdTimer=null;}
  if (holdActioned){holdActioned=false;return;}
  const cell=cellFromPoint(e.clientX,e.clientY);
  if (!cell) return;
  if (revealed[idx(cell.x,cell.y)]) doChord(cell.x,cell.y);
  else doReveal(cell.x,cell.y);
});

canvas.addEventListener('mouseleave', () => {
  if (holdTimer){clearTimeout(holdTimer);holdTimer=null;}
  holdActioned=false;
});

// ================================================================
// TOUCH INPUT ON CANVAS
// ================================================================
let touchCell=null, touchHoldTimer=null, touchActioned=false;

canvas.addEventListener('touchstart', e => {
  if (dragFlagging) return;
  e.preventDefault(); e.stopPropagation();
  touchActioned=false; touchCell=null;
  if (e.touches.length!==1){if(touchHoldTimer){clearTimeout(touchHoldTimer);touchHoldTimer=null;}return;}
  const t=e.touches[0];
  touchCell=cellFromPoint(t.clientX,t.clientY);
  if (!touchCell) return;
  touchHoldTimer=setTimeout(()=>{
    touchHoldTimer=null; touchActioned=true;
    if (navigator.vibrate) navigator.vibrate(40);
    const i=idx(touchCell.x,touchCell.y);
    if (revealed[i]) doChord(touchCell.x,touchCell.y);
    else doFlag(touchCell.x,touchCell.y);
  },HOLD_MS);
},{passive:false});

canvas.addEventListener('touchend', e => {
  if (dragFlagging) return;
  e.preventDefault(); e.stopPropagation();
  if (touchHoldTimer){clearTimeout(touchHoldTimer);touchHoldTimer=null;}
  if (touchActioned){touchActioned=false;touchCell=null;return;}
  if (!touchCell) return;
  const cell=touchCell; touchCell=null;
  const i=idx(cell.x,cell.y);
  if (revealed[i]) doChord(cell.x,cell.y);
  else doReveal(cell.x,cell.y);
},{passive:false});

canvas.addEventListener('touchcancel', e => {
  if (touchHoldTimer){clearTimeout(touchHoldTimer);touchHoldTimer=null;}
  touchActioned=false; touchCell=null;
},{passive:false});

canvas.addEventListener('touchmove', e => {
  if (dragFlagging) return;
  e.preventDefault();
  if (!touchHoldTimer) return;
  const t=e.touches[0], cur=cellFromPoint(t.clientX,t.clientY);
  if (!cur||!touchCell||cur.x!==touchCell.x||cur.y!==touchCell.y){
    clearTimeout(touchHoldTimer); touchHoldTimer=null;
  }
},{passive:false});

// ================================================================
// TIMER
// ================================================================
function startTimer() {
  stopTimer();
  timerSeconds=0;
  timerElapsed=timerCountdown>0?timerCountdown:0;
  timerInterval=setInterval(()=>{
    timerSeconds++;
    if (timerCountdown>0) {
      timerElapsed=Math.max(0,timerCountdown-timerSeconds);
      if (timerElapsed===0&&gameState==='playing') {
        stopTimer(); gameState='lost';
        showOverlay('⏰ TIME\'S UP!');
        render();
      }
    } else {
      timerElapsed=timerSeconds;
    }
    updateLCDs();
  },1000);
}

function stopTimer(){if(timerInterval){clearInterval(timerInterval);timerInterval=null;}}

function secsToHMS(s) {
  s=Math.max(0,Math.min(359999,s));
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

function updateLCDs() {
  const mines=Math.max(-9999,Math.min(99999,minesLeft));
  const sign=mines<0?'-':'';
  document.getElementById('mine-lcd').textContent=sign+String(Math.abs(mines)).padStart(5,'0');
  document.getElementById('timer-lcd').textContent=secsToHMS(timerElapsed);
}

// ================================================================
// OVERLAY
// ================================================================
function showOverlay(msg){
  document.getElementById('overlay-msg').textContent=msg;
  document.getElementById('overlay').classList.add('show');
}
function clearOverlay(){document.getElementById('overlay').classList.remove('show');}
document.getElementById('overlay').addEventListener('click', doReset);

// ================================================================
// CONTROLS
// ================================================================
let activeDiff='beginner';

document.querySelectorAll('.diff-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeDiff=btn.dataset.diff;
    document.getElementById('custom-wrap').style.display=activeDiff==='custom'?'flex':'none';
    if (activeDiff!=='custom') {
      const cfg=DIFFICULTIES[activeDiff];
      initBoard(cfg.w,cfg.h,cfg.mines);
    }
  });
});

document.getElementById('mode-count').addEventListener('click',()=>{
  mineInputMode='count';
  document.getElementById('mode-count').classList.add('active');
  document.getElementById('mode-pct').classList.remove('active');
  document.getElementById('cust-m').style.display='';
  document.getElementById('cust-pct').style.display='none';
  document.getElementById('pct-symbol').style.display='none';
  document.getElementById('mine-input-label').textContent='MINES';
});
document.getElementById('mode-pct').addEventListener('click',()=>{
  mineInputMode='pct';
  document.getElementById('mode-pct').classList.add('active');
  document.getElementById('mode-count').classList.remove('active');
  document.getElementById('cust-m').style.display='none';
  document.getElementById('cust-pct').style.display='';
  document.getElementById('pct-symbol').style.display='';
  document.getElementById('mine-input-label').textContent='DENSITY';
});

document.getElementById('apply-custom').addEventListener('click', doReset);
document.getElementById('reset-btn').addEventListener('click', doReset);

document.getElementById('apply-timer').addEventListener('click',()=>{
  const h=parseInt(document.getElementById('t-h').value)||0;
  const m=parseInt(document.getElementById('t-m').value)||0;
  const s=parseInt(document.getElementById('t-s').value)||0;
  timerCountdown=h*3600+m*60+s;
  timerElapsed=timerCountdown;
  updateLCDs();
});

document.getElementById('clear-timer').addEventListener('click',()=>{
  timerCountdown=0;
  ['t-h','t-m','t-s'].forEach(id=>document.getElementById(id).value=0);
  timerElapsed=0;
  updateLCDs();
});

// ================================================================
// DARK MODE
// ================================================================
const darkToggle=document.getElementById('dark-toggle');
darkToggle.addEventListener('click',()=>{
  darkMode=!darkMode;
  document.body.classList.toggle('dark',darkMode);
  darkToggle.classList.toggle('on',darkMode);
  drawPaletteFlag();
  render();
});

// ================================================================
// RESIZE
// ================================================================
window.addEventListener('resize',()=>{computeCanvasSize();render();});

// ================================================================
// BOOT
// ================================================================
drawPaletteFlag();
initBoard(9,9,10);