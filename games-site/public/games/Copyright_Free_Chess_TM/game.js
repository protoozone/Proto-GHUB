/**
 * game.js — Multi-player chess board scaffold + 3P playable game
 *
 * Exports:
 *   buildBoard(playerCount)          → BoardGraph
 *   renderBoard(canvas, board, n)    → draws geometry (all variants)
 *   ThreePlayerGame                  → class encapsulating full 3P chess
 */

// ─── Constants ───────────────────────────────────────────────────────────────
const PLAYER_COLORS = [
  '#c0392b','#2980b9','#27ae60','#f39c12',
  '#8e44ad','#16a085','#e67e22','#2c3e50',
]
const LIGHT_SQ = '#f0d9b5'
const DARK_SQ  = '#b58863'
const BORDER   = '#1a0f08'
const BG       = '#0f1118'



// ═══════════════════════════════════════════════════════════════════════════════
// BOARD BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════
function build2Player() {
  const squares = new Map(), adj = new Map()
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const id = `0:${f}:${r}`
    squares.set(id, { id, segment:0, col:f, row:r, color:(f+r)%2===0?'dark':'light' })
  }
  for (const sq of squares.values()) {
    const {col:f,row:r} = sq
    adj.set(sq.id, {
      N: squares.get(`0:${f}:${r+1}`)?.id??null, S: squares.get(`0:${f}:${r-1}`)?.id??null,
      E: squares.get(`0:${f+1}:${r}`)?.id??null, W: squares.get(`0:${f-1}:${r}`)?.id??null,
      NE:squares.get(`0:${f+1}:${r+1}`)?.id??null, NW:squares.get(`0:${f-1}:${r+1}`)?.id??null,
      SE:squares.get(`0:${f+1}:${r-1}`)?.id??null, SW:squares.get(`0:${f-1}:${r-1}`)?.id??null,
    })
  }
  return { squares, adj, type:'2p' }
}

function build4Player() {
  const squares = new Map(), adj = new Map()
  function isValid(c,r) {
    if (c<0||c>13||r<0||r>13) return false
    if (c<3&&r<3||c<3&&r>10||c>10&&r<3||c>10&&r>10) return false
    return true
  }
  for (let c=0;c<14;c++) for (let r=0;r<14;r++) {
    if (!isValid(c,r)) continue
    const id=`0:${c}:${r}`
    squares.set(id,{id,segment:0,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for (const sq of squares.values()) {
    const {col:c,row:r}=sq
    const get=(dc,dr)=>isValid(c+dc,r+dr)?`0:${c+dc}:${r+dr}`:null
    adj.set(sq.id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  return { squares, adj, type:'4p' }
}

function build3Player() {
  const squares = new Map(), adj = new Map()
  for (let seg=0;seg<3;seg++) for (let c=0;c<8;c++) for (let r=0;r<4;r++) {
    const id=`${seg}:${c}:${r}`
    squares.set(id,{id,segment:seg,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
    const id=`3:${c}:${r}`
    squares.set(id,{id,segment:3,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for (let seg=0;seg<3;seg++) for (let c=0;c<8;c++) for (let r=0;r<4;r++) {
    const id=`${seg}:${c}:${r}`
    const get=(dc,dr)=>{const nc=c+dc,nr=r+dr;if(nc<0||nc>7||nr<0||nr>3)return null;return `${seg}:${nc}:${nr}`}
    adj.set(id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) {
    const id=`3:${c}:${r}`
    const get=(dc,dr)=>{const nc=c+dc,nr=r+dr;if(nc<0||nc>3||nr<0||nr>3)return null;return `3:${nc}:${nr}`}
    adj.set(id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  for (let c=0;c<8;c++) {
    const s=adj.get(`0:${c}:3`), t=adj.get(`3:${Math.floor(c/2)}:0`)
    if(s) s.N=`3:${Math.floor(c/2)}:0`; if(t&&c%2===0) t.S=`0:${c}:3`
  }
  for (let c=0;c<8;c++) {
    const s=adj.get(`1:${c}:3`), t=adj.get(`3:0:${Math.floor(c/2)}`)
    if(s) s.N=`3:0:${Math.floor(c/2)}`; if(t&&c%2===0) t.W=`1:${c}:3`
  }
  for (let c=0;c<8;c++) {
    const s=adj.get(`2:${c}:3`), t=adj.get(`3:3:${Math.floor(c/2)}`)
    if(s) s.N=`3:3:${Math.floor(c/2)}`; if(t&&c%2===0) t.E=`2:${c}:3`
  }
  return { squares, adj, type:'3p' }
}

function build5Player() {
  const squares=new Map(),adj=new Map()
  const TAPER=[8,7,5,4],COL_OFF=[0,0,1,2]
  function isValidInSeg(c,r){return r>=0&&r<4&&c>=COL_OFF[r]&&c<COL_OFF[r]+TAPER[r]}
  for (let seg=0;seg<5;seg++) for (let r=0;r<4;r++) for (let c=COL_OFF[r];c<COL_OFF[r]+TAPER[r];c++) {
    const id=`${seg}:${c}:${r}`
    squares.set(id,{id,segment:seg,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for (let i=0;i<5;i++) {
    const id=`5:${i}:0`
    squares.set(id,{id,segment:5,col:i,row:0,color:i%2===0?'dark':'light'})
  }
  for (let seg=0;seg<5;seg++) for (let r=0;r<4;r++) for (let c=COL_OFF[r];c<COL_OFF[r]+TAPER[r];c++) {
    const id=`${seg}:${c}:${r}`
    const get=(dc,dr)=>{const nc=c+dc,nr=r+dr;if(!isValidInSeg(nc,nr))return null;return `${seg}:${nc}:${nr}`}
    adj.set(id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  for (let i=0;i<5;i++) adj.set(`5:${i}:0`,{E:`5:${(i+1)%5}:0`,W:`5:${(i+4)%5}:0`,N:null,S:null,NE:null,NW:null,SE:null,SW:null})
  for (let seg=0;seg<5;seg++) {
    const ctrId=`5:${seg}:0`
    for (let c=COL_OFF[3];c<COL_OFF[3]+TAPER[3];c++){const s=adj.get(`${seg}:${c}:3`);if(s)s.N=ctrId}
    const ca=adj.get(ctrId);if(ca)ca.S=`${seg}:${COL_OFF[3]}:3`
  }
  return { squares, adj, type:'5p' }
}

function build6Player() {
  const squares=new Map(),adj=new Map()
  const TOTAL_RINGS=7,CELLS_PER_RING=48
  for (let ring=0;ring<TOTAL_RINGS;ring++) for (let cell=0;cell<CELLS_PER_RING;cell++) {
    const id=`r${ring}:c${cell}`,isNull=ring===6,seg=Math.floor(cell/8)
    squares.set(id,{id,segment:seg,ring,cell,color:isNull?'null':(cell+ring)%2===0?'dark':'light',impassable:isNull})
  }
  for (const sq of squares.values()) {
    if(sq.impassable){adj.set(sq.id,{});continue}
    const{ring,cell}=sq,tc=CELLS_PER_RING
    const vId=id=>{if(!id)return null;const s=squares.get(id);return s&&!s.impassable?id:null}
    adj.set(sq.id,{
      N:vId(ring>0?`r${ring-1}:c${cell}`:null),S:vId(ring<TOTAL_RINGS-1?`r${ring+1}:c${cell}`:null),
      E:vId(`r${ring}:c${(cell+1)%tc}`),W:vId(`r${ring}:c${(cell-1+tc)%tc}`),
      NE:vId(ring>0?`r${ring-1}:c${(cell+1)%tc}`:null),NW:vId(ring>0?`r${ring-1}:c${(cell-1+tc)%tc}`:null),
      SE:vId(ring<TOTAL_RINGS-1?`r${ring+1}:c${(cell+1)%tc}`:null),SW:vId(ring<TOTAL_RINGS-1?`r${ring+1}:c${(cell-1+tc)%tc}`:null),
    })
  }
  return { squares, adj, type:'6p' }
}

function build8Player() {
  const squares=new Map(),adj=new Map(),SIZE=16,CUT=4
  function isValid(c,r){
    if(c<0||c>=SIZE||r<0||r>=SIZE)return false
    if(c<CUT&&r<CUT||c<CUT&&r>=SIZE-CUT||c>=SIZE-CUT&&r<CUT||c>=SIZE-CUT&&r>=SIZE-CUT)return false
    return true
  }
  for(let c=0;c<SIZE;c++)for(let r=0;r<SIZE;r++){
    if(!isValid(c,r))continue
    const id=`0:${c}:${r}`
    squares.set(id,{id,segment:0,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for(const sq of squares.values()){
    const{col:c,row:r}=sq
    const get=(dc,dr)=>isValid(c+dc,r+dr)?`0:${c+dc}:${r+dr}`:null
    adj.set(sq.id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  return { squares, adj, type:'8p' }
}

function build16Player() {
  const squares=new Map(),adj=new Map(),SIZE=24,CUT=8
  function isValid(c,r){
    if(c<0||c>=SIZE||r<0||r>=SIZE)return false
    if(c<CUT&&r<CUT||c<CUT&&r>=SIZE-CUT||c>=SIZE-CUT&&r<CUT||c>=SIZE-CUT&&r>=SIZE-CUT)return false
    return true
  }
  for(let c=0;c<SIZE;c++)for(let r=0;r<SIZE;r++){
    if(!isValid(c,r))continue
    const id=`0:${c}:${r}`
    squares.set(id,{id,segment:0,col:c,row:r,color:(c+r)%2===0?'dark':'light'})
  }
  for(const sq of squares.values()){
    const{col:c,row:r}=sq
    const get=(dc,dr)=>isValid(c+dc,r+dr)?`0:${c+dc}:${r+dr}`:null
    adj.set(sq.id,{N:get(0,1),S:get(0,-1),E:get(1,0),W:get(-1,0),NE:get(1,1),NW:get(-1,1),SE:get(1,-1),SW:get(-1,-1)})
  }
  return { squares, adj, type:'16p' }
}

function buildBoard(playerCount) {
  switch(playerCount){
    case 1: case 2: return build2Player()
    case 3:  return build3Player()
    case 4:  return build4Player()
    case 5:  return build5Player()
    case 6:  return build6Player()
    case 8:  return build8Player()
    case 16: return build16Player()
    default: return build2Player()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDERERS (geometry viewer)
// ═══════════════════════════════════════════════════════════════════════════════
function drawSquare(ctx,x,y,w,h,color){
  ctx.fillStyle=color==='dark'?DARK_SQ:color==='light'?LIGHT_SQ:color==='null'?'#333':color
  ctx.fillRect(x,y,w,h)
  ctx.strokeStyle=BORDER;ctx.lineWidth=0.5;ctx.strokeRect(x,y,w,h)
}
function renderGrid(ctx,board,ox,oy,sz,cols,rows,isValid){
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
    if(isValid&&!isValid(c,r))continue
    const sq=board.squares.get(`0:${c}:${r}`);if(!sq)continue
    drawSquare(ctx,ox+c*sz,oy+(rows-1-r)*sz,sz,sz,sq.color)
  }
}
function drawPlayerLabel(ctx,x,y,text,color,align='center'){
  ctx.save();ctx.font='bold 12px system-ui,sans-serif';ctx.fillStyle=color
  ctx.textAlign=align==='left'?'left':align==='right'?'right':'center'
  ctx.textBaseline=align==='top'?'top':align==='bottom'?'bottom':'middle'
  ctx.fillText(text,x,y);ctx.restore()
}

function render2P(ctx,board,W,H){
  const pad=24,sq=Math.floor(Math.min(W,H-pad*2)/8),bw=sq*8
  const ox=(W-bw)/2,oy=(H-bw)/2
  renderGrid(ctx,board,ox,oy,sq,8,8,null)
  drawPlayerLabel(ctx,W/2,oy-10,'P2','#888','bottom')
  drawPlayerLabel(ctx,W/2,oy+bw+10,'P1','#f0e8d0','top')
}

function render4P(ctx,board,W,H){
  const SIZE=14,CUT=3,sq=Math.floor(Math.min(W,H)*0.9/SIZE),bw=sq*SIZE
  const ox=(W-bw)/2,oy=(H-bw)/2
  function isValid(c,r){
    if(c<CUT&&r<CUT||c<CUT&&r>SIZE-CUT-1||c>SIZE-CUT-1&&r<CUT||c>SIZE-CUT-1&&r>SIZE-CUT-1)return false
    return true
  }
  renderGrid(ctx,board,ox,oy,sq,SIZE,SIZE,isValid)
  const MID=ox+bw/2
  drawPlayerLabel(ctx,MID,oy+bw+14,'P1','#f0e8d0','top')
  drawPlayerLabel(ctx,MID,oy-14,'P3',PLAYER_COLORS[3],'bottom')
  drawPlayerLabel(ctx,ox-14,oy+bw/2,'P2',PLAYER_COLORS[1],'right')
  drawPlayerLabel(ctx,ox+bw+14,oy+bw/2,'P4','#888','left')
}

function render3P(ctx,board,W,H){
  // Use the canonical ORIG pixel coordinates (same data the game engine uses),
  // scaled and centred to fit the viewer canvas.
  const PAD   = 18          // px padding inside canvas
  const vCX   = W / 2, vCY = H / 2
  const sc    = (Math.min(W, H) / 2 - PAD) / ORIG_R * 0.95  // 0.95 = 5% inward margin

  // Map an ORIG coord to viewer canvas space
  const toV = (ox, oy) => [
    (ox - ORIG_CX) * sc + vCX,
    (oy - ORIG_CY) * sc + vCY,
  ]

  // Hex background
  const hexPts = []
  for(let i=0;i<6;i++){
    const a=Math.PI/3*i
    hexPts.push([vCX + ORIG_R*sc*Math.cos(a), vCY + ORIG_R*sc*Math.sin(a)])
  }
  ctx.beginPath()
  hexPts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y))
  ctx.closePath(); ctx.fillStyle='#ddd5c0'; ctx.fill()
  ctx.strokeStyle=BORDER; ctx.lineWidth=1.5*sc; ctx.stroke()

  // Grid lines (light)
  const lp=(a,b,t)=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
  const mp=i=>{const[x0,y0]=hexPts[i],[x1,y1]=hexPts[(i+1)%6];return[(x0+x1)/2,(y0+y1)/2]}
  const ln=(p,q)=>{ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke()}
  ctx.strokeStyle='#aaa'; ctx.lineWidth=0.5*sc
  for(let i=1;i<7;i++){
    const a=lp(hexPts[i-1],hexPts[i],.625),b=lp(hexPts[i-1],hexPts[i],.75)
    const c2=lp(hexPts[i-1],hexPts[i],.875),g=lp(hexPts[i-1],hexPts[i],.125)
    const h=lp(hexPts[i-1],hexPts[i],.25),k=lp(hexPts[i-1],hexPts[i],.375)
    const d=lp(lp(hexPts[i],hexPts[(i+1)%6],.5),lp(hexPts[(i+3)%6],hexPts[(i+4)%6],.5),.125)
    const e=lp(lp(hexPts[i],hexPts[(i+1)%6],.5),lp(hexPts[(i+3)%6],hexPts[(i+4)%6],.5),.25)
    const f=lp(lp(hexPts[i],hexPts[(i+1)%6],.5),lp(hexPts[(i+3)%6],hexPts[(i+4)%6],.5),.375)
    const j=lp(lp(hexPts[(i+1)%6],hexPts[(i+2)%6],.5),lp(hexPts[(i+4)%6],hexPts[(i+5)%6],.5),.625)
    const l2=lp(lp(hexPts[(i+1)%6],hexPts[(i+2)%6],.5),lp(hexPts[(i+4)%6],hexPts[(i+5)%6],.5),.75)
    const m=lp(lp(hexPts[(i+1)%6],hexPts[(i+2)%6],.5),lp(hexPts[(i+4)%6],hexPts[(i+5)%6],.5),.875)
    ln(a,f);ln(b,e);ln(c2,d);ln(g,m);ln(h,l2);ln(k,j)
  }
  ctx.strokeStyle='#888'; ctx.lineWidth=0.8*sc
  for(let i=0;i<3;i++) ln(mp(i),mp(i+3))

  // Draw each cell as a dot at its ORIG position — coloured by territory
  // Cell radius: approximate half-distance between adjacent cells
  const dotR = Math.round(8 * sc)
  const SEG_COLORS = ['#c0392b','#ecf0f1','#2980b9']  // red, white, blue per segment

  // Draw all active cells from ORIG lookup coloured by chess-board light/dark
  // We need to know which segment each cell ID belongs to.
  // Use the colSets: ABCD=seg0(red) bottom, ABCD+IJKL=white left, EFGH+IJKL=black right
  // Actually colour by standard light/dark square checkerboard
  const cellColor = id => {
    const col = id.charCodeAt(0) - 65  // A=0..L=11
    const row = parseInt(id.slice(1))
    return (col + row) % 2 === 0 ? DARK_SQ : LIGHT_SQ
  }

  ctx.strokeStyle = BORDER; ctx.lineWidth = 0.5

  for (const [id, [ox, oy]] of Object.entries(ORIG)) {
    const [x, y] = toV(ox, oy)
    ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI*2)
    ctx.fillStyle = cellColor(id); ctx.fill(); ctx.stroke()
  }

  // Player labels
  const lblSc = Math.round(11 * sc)
  ctx.font = `bold ${lblSc}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'

  const [rx, ry] = toV(ORIG['D1'][0], ORIG['D1'][1])
  ctx.fillStyle = '#e74c3c'
  ctx.fillText('Red', rx + 28*sc, ry + 30*sc)

  const [wx, wy] = toV(ORIG['A5'][0], ORIG['A5'][1])
  ctx.fillStyle = '#ddd'
  ctx.fillText('White', wx - 34*sc, wy)

  const [bx, by] = toV(ORIG['H12'][0], ORIG['H12'][1])
  ctx.fillStyle = '#2980b9'
  ctx.fillText('Black', bx + 34*sc, by)
}

function render5P(ctx,board,W,H){
  const SEGS=5,sq=Math.floor(Math.min(W,H)*0.038)
  const TAPER=[8,7,5,4],COL_OFF=[0,0,1,2]
  const CX=W/2,CY=H/2,segH=4*sq,angleSep=(2*Math.PI)/SEGS
  for(let seg=0;seg<SEGS;seg++){
    const angle=angleSep*seg-Math.PI/2
    ctx.save();ctx.translate(CX,CY);ctx.rotate(angle)
    for(let r=0;r<4;r++){
      const cols=TAPER[r],off=COL_OFF[r],startX=-(cols/2)*sq
      for(let ci=0;ci<cols;ci++){
        const c=off+ci,s=board.squares.get(`${seg}:${c}:${r}`);if(!s)continue
        drawSquare(ctx,startX+ci*sq,-sq*(r+1)-24,sq,sq,s.color)
      }
    }
    ctx.restore()
  }
  ctx.beginPath();ctx.arc(CX,CY,16,0,Math.PI*2)
  ctx.fillStyle=DARK_SQ;ctx.fill();ctx.strokeStyle=BORDER;ctx.lineWidth=1;ctx.stroke()
  for(let seg=0;seg<SEGS;seg++){
    const angle=angleSep*seg-Math.PI/2
    const labelR=segH+sq*4+40
    drawPlayerLabel(ctx,CX+Math.cos(angle)*labelR,CY+Math.sin(angle)*labelR,`P${seg+1}`,PLAYER_COLORS[seg],'center')
  }
}

function render6P(ctx,board,W,H){
  const CX=W/2,CY=H/2,TOTAL_RINGS=7,CELLS_PER_RING=48
  const maxR=Math.min(W,H)*0.46,ringW=maxR/TOTAL_RINGS
  for(let ring=TOTAL_RINGS-1;ring>=0;ring--){
    const outerR=maxR-ring*ringW,innerR=outerR-ringW
    for(let cell=0;cell<CELLS_PER_RING;cell++){
      const sq=board.squares.get(`r${ring}:c${cell}`);if(!sq)continue
      const sa=(cell/CELLS_PER_RING)*Math.PI*2-Math.PI/2
      const ea=((cell+1)/CELLS_PER_RING)*Math.PI*2-Math.PI/2
      ctx.beginPath();ctx.arc(CX,CY,outerR,sa,ea);ctx.arc(CX,CY,innerR,ea,sa,true);ctx.closePath()
      ctx.fillStyle=sq.impassable?'#222':sq.color==='dark'?DARK_SQ:LIGHT_SQ
      ctx.fill();ctx.strokeStyle=BORDER;ctx.lineWidth=0.5;ctx.stroke()
    }
  }
  for(let p=0;p<6;p++){
    const angle=(p/6)*Math.PI*2-Math.PI/2+(Math.PI/6)
    drawPlayerLabel(ctx,CX+Math.cos(angle)*(maxR+24),CY+Math.sin(angle)*(maxR+24),`P${p+1}`,PLAYER_COLORS[p],'center')
  }
  ctx.beginPath();ctx.arc(CX,CY,ringW*0.8,0,Math.PI*2)
  ctx.fillStyle='#1a1a1a';ctx.fill();ctx.strokeStyle=BORDER;ctx.lineWidth=1;ctx.stroke()
}

function render8P(ctx,board,W,H){
  const SIZE=16,CUT=4,sq=Math.floor(Math.min(W,H)*0.88/SIZE),bw=sq*SIZE
  const ox=(W-bw)/2,oy=(H-bw)/2
  function isValid(c,r){
    if(c<CUT&&r<CUT||c<CUT&&r>=SIZE-CUT||c>=SIZE-CUT&&r<CUT||c>=SIZE-CUT&&r>=SIZE-CUT)return false
    return true
  }
  renderGrid(ctx,board,ox,oy,sq,SIZE,SIZE,isValid)
  const labels=['P1','P2','P3','P4','P5','P6','P7','P8']
  const positions=[
    [ox+bw/2,oy+bw+14,'top'],[ox+bw+14,oy+bw*0.75,'left'],[ox+bw+14,oy+bw*0.5,'left'],
    [ox+bw+14,oy+bw*0.25,'left'],[ox+bw/2,oy-14,'bottom'],[ox-14,oy+bw*0.25,'right'],
    [ox-14,oy+bw*0.5,'right'],[ox-14,oy+bw*0.75,'right'],
  ]
  positions.forEach(([x,y,a],i)=>drawPlayerLabel(ctx,x,y,labels[i],PLAYER_COLORS[i],a))
}

function render16P(ctx,board,W,H){
  const SIZE=24,CUT=8,sq=Math.floor(Math.min(W,H)*0.88/SIZE),bw=sq*SIZE
  const ox=(W-bw)/2,oy=(H-bw)/2
  function isValid(c,r){
    if(c<CUT&&r<CUT||c<CUT&&r>=SIZE-CUT||c>=SIZE-CUT&&r<CUT||c>=SIZE-CUT&&r>=SIZE-CUT)return false
    return true
  }
  renderGrid(ctx,board,ox,oy,sq,SIZE,SIZE,isValid)
}

function renderBoard(canvas,board,playerCount){
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height
  ctx.fillStyle=BG;ctx.fillRect(0,0,W,H)
  switch(board.type){
    case '2p': render2P(ctx,board,W,H,playerCount);break
    case '3p': render3P(ctx,board,W,H);break
    case '4p': render4P(ctx,board,W,H);break
    case '5p': render5P(ctx,board,W,H);break
    case '6p': render6P(ctx,board,W,H);break
    case '8p': render8P(ctx,board,W,H);break
    case '16p':render16P(ctx,board,W,H);break
  }
}

// Convert col/row indices to human-readable "A1"-style label.
// col 0→A, 1→B, … row 0→1, 1→2, …
function sqLabel(col, row) {
  return String.fromCharCode(65 + col) + (row + 1)
}

// ═══════════════════════════════════════════════════════════════════════════════
// TWO-PLAYER CHESS GAME ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Standard 8×8 coordinate helpers ─────────────────────────────────────────
// Square IDs are "col:row" strings where col 0–7 = a–h, row 0–7 = rank 1–8

function sq2id(col, row) { return `0:${col}:${row}` }
function sq2col(id) { return parseInt(id.split(':')[1]) }
function sq2row(id) { return parseInt(id.split(':')[2]) }
function sq2valid(col, row) { return col >= 0 && col < 8 && row >= 0 && row < 8 }

function sq2adjacent(id) {
  const col = sq2col(id), row = sq2row(id)
  const res = {}
  const dirs = { N:[0,1],S:[0,-1],E:[1,0],W:[-1,0],NE:[1,1],NW:[-1,1],SE:[1,-1],SW:[-1,-1] }
  for (const [d, [dc, dr]] of Object.entries(dirs)) {
    const nc = col+dc, nr = row+dr
    res[d] = sq2valid(nc, nr) ? sq2id(nc, nr) : null
  }
  return res
}

function sq2rookMoves(id, occ) {
  const col = sq2col(id), row = sq2row(id), r = new Set()
  for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let c = col+dc, rw = row+dr
    while (sq2valid(c, rw)) { r.add(sq2id(c,rw)); if (occ(sq2id(c,rw))) break; c+=dc; rw+=dr }
  }
  return r
}
function sq2bishopMoves(id, occ) {
  const col = sq2col(id), row = sq2row(id), r = new Set()
  for (const [dc, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let c = col+dc, rw = row+dr
    while (sq2valid(c, rw)) { r.add(sq2id(c,rw)); if (occ(sq2id(c,rw))) break; c+=dc; rw+=dr }
  }
  return r
}
function sq2queenMoves(id, occ) { return new Set([...sq2rookMoves(id,occ),...sq2bishopMoves(id,occ)]) }
function sq2kingMoves(id) {
  const col = sq2col(id), row = sq2row(id), r = new Set()
  for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const nc = col+dc, nr = row+dr
    if (sq2valid(nc, nr)) r.add(sq2id(nc, nr))
  }
  return r
}
function sq2knightMoves(id) {
  const col = sq2col(id), row = sq2row(id), r = new Set()
  for (const [dc, dr] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
    const nc = col+dc, nr = row+dr
    if (sq2valid(nc, nr)) r.add(sq2id(nc, nr))
  }
  return r
}

// ── Standard pawn logic ───────────────────────────────────────────────────────
function sq2pawnMoves(id, player, board, enPassant) {
  const col = sq2col(id), row = sq2row(id)
  const dir    = player === 'white' ? 1 : -1
  const startR = player === 'white' ? 1 : 6
  const promoR = player === 'white' ? 7 : 0
  const moves = [], captures = []
  let epCapture = null

  // Forward
  const fwd1 = sq2valid(col, row+dir) ? sq2id(col, row+dir) : null
  if (fwd1 && !board.has(fwd1)) {
    moves.push(fwd1)
    if (row === startR) {
      const fwd2 = sq2id(col, row+dir*2)
      if (!board.has(fwd2)) moves.push(fwd2)
    }
  }

  // Diagonal captures
  for (const dc of [-1, 1]) {
    const nc = col+dc, nr = row+dir
    if (!sq2valid(nc, nr)) continue
    const tgt = sq2id(nc, nr)
    const occ = board.get(tgt)
    if (occ && occ.player !== player) captures.push(tgt)
    // En passant
    if (enPassant && enPassant.player !== player) {
      if (enPassant.pawnCell === sq2id(nc, row) && enPassant.skippedCell === tgt && !board.has(tgt)) {
        captures.push(tgt)
        epCapture = { to: tgt, capturedCell: enPassant.pawnCell }
      }
    }
  }

  return { moves, captures, epCapture }
}

function sq2isPromotion(id, player) {
  const row = sq2row(id)
  return (player === 'white' && row === 7) || (player === 'black' && row === 0)
}

// Pixel coords for the 8×8 board rendered inside the game canvas.
// We'll compute them dynamically at render time from canvas size.
const SQ2_COLS = 8, SQ2_ROWS = 8

class TwoPlayerGame {
  constructor(canvas, hudEl, opts = {}) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.hudEl  = hudEl
    this.showCoords     = false
    this.stalemateMode  = opts.stalemateMode ?? 'draw'
    this.enPassantEnabled = opts.enPassant ?? true

    this._onResize = () => { this._sized(); this.render() }
    this._onClick  = e => {
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height)
      this._handleClick(this._nearestCell(px, py))
    }
    window.addEventListener('resize', this._onResize)
    canvas.addEventListener('click', this._onClick)

    this._sized()
    this.reset()
  }

  destroy() {
    window.removeEventListener('resize', this._onResize)
    this.canvas.removeEventListener('click', this._onClick)
  }

  _sized() {
    const wrap = this.canvas.parentElement
    const rect = wrap ? wrap.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight }
    const S = Math.max(200, Math.min(rect.width, rect.height) - 8)
    this.canvas.width = this.canvas.height = S
    this.S  = S
    // Board occupies 90% of canvas, centred
    this.sqSize = Math.floor(S * 0.9 / 8)
    this.ox = Math.floor((S - this.sqSize * 8) / 2)
    this.oy = Math.floor((S - this.sqSize * 8) / 2)
  }

  _cellToXY(id) {
    const col = sq2col(id), row = sq2row(id)
    return [
      this.ox + col * this.sqSize + this.sqSize / 2,
      this.oy + (7 - row) * this.sqSize + this.sqSize / 2,
    ]
  }

  _nearestCell(px, py) {
    const col = Math.floor((px - this.ox) / this.sqSize)
    const row = 7 - Math.floor((py - this.oy) / this.sqSize)
    if (!sq2valid(col, row)) return null
    return sq2id(col, row)
  }

  reset() {
    this.board           = new Map()
    this.selected        = null
    this.validMoves      = []
    this.validCaptures   = []
    this.validCastles    = []
    this.validEpCapture  = null
    this.currentPlayer   = 'white'
    this.winner          = null
    this.gameOver        = false
    this.gameOverReason  = null
    this.checkAttackers  = []
    this.pendingPromotion = null
    this.enPassant       = null

    // White pieces (row 0 = rank 1)
    const backRow = ['R','N','B','Q','K','B','N','R']
    backRow.forEach((t, col) => {
      this.board.set(sq2id(col, 0), { player:'white', type:t, hasMoved:false })
      this.board.set(sq2id(col, 1), { player:'white', type:'P', hasMoved:false })
    })
    // Black pieces (row 7 = rank 8)
    const backRowB = ['R','N','B','Q','K','B','N','R']
    backRowB.forEach((t, col) => {
      this.board.set(sq2id(col, 7), { player:'black', type:t, hasMoved:false })
      this.board.set(sq2id(col, 6), { player:'black', type:'P', hasMoved:false })
    })

    this._updateCheckStatus()
    this._updateHUD()
    this.render()
  }

  // ── Attack / check helpers ───────────────────────────────────────────────────
  _attackersOf(targetCell, byPlayer, board) {
    const occ = id => board.has(id)
    const attackers = []
    for (const [id, piece] of board) {
      if (piece.player !== byPlayer) continue
      let attacks = new Set()
      if (piece.type === 'K') attacks = sq2kingMoves(id)
      else if (piece.type === 'N') attacks = sq2knightMoves(id)
      else if (piece.type === 'R') attacks = sq2rookMoves(id, occ)
      else if (piece.type === 'B') attacks = sq2bishopMoves(id, occ)
      else if (piece.type === 'Q') attacks = sq2queenMoves(id, occ)
      else if (piece.type === 'P') {
        const fakeBoard = new Map(board)
        if (!fakeBoard.has(targetCell)) fakeBoard.set(targetCell, { player:'__dummy__', type:'P' })
        const pm = sq2pawnMoves(id, piece.player, fakeBoard, null)
        pm.captures.forEach(c => attacks.add(c))
      }
      if (attacks.has(targetCell)) attackers.push(id)
    }
    return attackers
  }

  _isInCheck(player, board) {
    let kingCell = null
    for (const [id, piece] of board) {
      if (piece.player === player && piece.type === 'K') { kingCell = id; break }
    }
    if (!kingCell) return false
    const opp = player === 'white' ? 'black' : 'white'
    return this._attackersOf(kingCell, opp, board).length > 0
  }

  _updateCheckStatus() {
    this.checkAttackers = []
    for (const [id, piece] of this.board) {
      if (piece.type !== 'K') continue
      const opp = piece.player === 'white' ? 'black' : 'white'
      const attackers = this._attackersOf(id, opp, this.board)
      if (attackers.length > 0) this.checkAttackers.push({ king: id, by: attackers })
    }
  }

  // ── Move generation ───────────────────────────────────────────────────────────
  _getRawMoves(cellId, board) {
    const piece = board.get(cellId)
    if (!piece) return { moves:[], captures:[], epCapture:null }
    const occ = id => board.has(id)
    let moves = [], captures = [], epCapture = null

    if (piece.type === 'P') {
      const ep = this.enPassantEnabled ? this.enPassant : null
      const r = sq2pawnMoves(cellId, piece.player, board, ep)
      moves = r.moves; captures = r.captures; epCapture = r.epCapture
    } else {
      let raw = new Set()
      if (piece.type === 'K') raw = sq2kingMoves(cellId)
      else if (piece.type === 'R') raw = sq2rookMoves(cellId, occ)
      else if (piece.type === 'B') raw = sq2bishopMoves(cellId, occ)
      else if (piece.type === 'Q') raw = sq2queenMoves(cellId, occ)
      else if (piece.type === 'N') raw = sq2knightMoves(cellId)
      raw.forEach(id => {
        const o = board.get(id)
        if (!o) moves.push(id)
        else if (o.player !== piece.player) captures.push(id)
      })
    }
    return { moves, captures, epCapture }
  }

  _getCastleMoves(cellId) {
    const piece = this.board.get(cellId)
    if (!piece || piece.type !== 'K' || piece.hasMoved) return []
    const row = sq2row(cellId)
    const castles = []

    // Kingside
    const ksRookId = sq2id(7, row)
    const ksRook = this.board.get(ksRookId)
    if (ksRook && ksRook.type === 'R' && ksRook.player === piece.player && !ksRook.hasMoved) {
      const between = [sq2id(5,row), sq2id(6,row)]
      if (between.every(id => !this.board.has(id))) {
        const crossed = [sq2id(5,row), sq2id(6,row)]
        let ok = true
        for (const sq of [cellId, ...crossed]) {
          const sim = new Map(this.board); sim.delete(cellId); sim.set(sq, {...piece, hasMoved:true})
          if (this._isInCheck(piece.player, sim)) { ok = false; break }
        }
        if (ok) castles.push({ kingDest: sq2id(6,row), rookFrom: ksRookId, rookDest: sq2id(5,row), side:'kingside' })
      }
    }

    // Queenside
    const qsRookId = sq2id(0, row)
    const qsRook = this.board.get(qsRookId)
    if (qsRook && qsRook.type === 'R' && qsRook.player === piece.player && !qsRook.hasMoved) {
      const between = [sq2id(1,row), sq2id(2,row), sq2id(3,row)]
      if (between.every(id => !this.board.has(id))) {
        const crossed = [sq2id(3,row), sq2id(2,row)]
        let ok = true
        for (const sq of [cellId, ...crossed]) {
          const sim = new Map(this.board); sim.delete(cellId); sim.set(sq, {...piece, hasMoved:true})
          if (this._isInCheck(piece.player, sim)) { ok = false; break }
        }
        if (ok) castles.push({ kingDest: sq2id(2,row), rookFrom: qsRookId, rookDest: sq2id(3,row), side:'queenside' })
      }
    }

    return castles
  }

  _getLegalMoves(cellId) {
    const piece = this.board.get(cellId)
    if (!piece) return { moves:[], captures:[], castles:[], epCapture:null }

    const raw     = this._getRawMoves(cellId, this.board)
    const castles = piece.type === 'K' ? this._getCastleMoves(cellId) : []

    const simulateMove = to => {
      const sim = new Map(this.board)
      sim.delete(cellId)
      if (raw.epCapture && raw.epCapture.to === to) sim.delete(raw.epCapture.capturedCell)
      sim.set(to, { ...piece, hasMoved: true })
      return sim
    }

    const filterArr = arr => arr.filter(to => !this._isInCheck(piece.player, simulateMove(to)))
    const filteredCaptures = filterArr(raw.captures)
    const epCapture = (raw.epCapture && filteredCaptures.includes(raw.epCapture.to)) ? raw.epCapture : null

    return { moves: filterArr(raw.moves), captures: filteredCaptures, castles, epCapture }
  }

  _hasAnyLegalMove(player) {
    for (const [id, piece] of this.board) {
      if (piece.player !== player) continue
      const { moves, captures, castles } = this._getLegalMoves(id)
      if (moves.length > 0 || captures.length > 0 || castles.length > 0) return true
    }
    return false
  }

  // ── Click / select / execute ─────────────────────────────────────────────────
  _handleClick(cellId) {
    if (this.gameOver || this.pendingPromotion) return
    if (!cellId) { this._deselect(); return }

    if (this.selected) {
      if (this.validMoves.includes(cellId) || this.validCaptures.includes(cellId)) {
        this._executeMove(this.selected, cellId); return
      }
      const castle = this.validCastles?.find(c => c.kingDest === cellId)
      if (castle) { this._executeCastle(this.selected, castle); return }
      const p = this.board.get(cellId)
      if (p && p.player === this.currentPlayer) { this._selectCell(cellId); return }
      this._deselect(); return
    }

    const p = this.board.get(cellId)
    if (p && p.player === this.currentPlayer) this._selectCell(cellId)
  }

  _deselect() {
    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.render()
  }

  _selectCell(cellId) {
    this.selected = cellId
    const r = this._getLegalMoves(cellId)
    this.validMoves = r.moves; this.validCaptures = r.captures; this.validCastles = r.castles || []
    this.validEpCapture = r.epCapture || null
    this.render()
  }

  _executeCastle(kingFrom, castle) {
    const king = this.board.get(kingFrom)
    const rook = this.board.get(castle.rookFrom)
    this.board.delete(kingFrom); this.board.delete(castle.rookFrom)
    this.board.set(castle.kingDest, { ...king, hasMoved:true })
    this.board.set(castle.rookDest, { ...rook, hasMoved:true })
    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.enPassant = null
    this._finishTurn()
  }

  _executeMove(from, to) {
    const piece = this.board.get(from)
    const isEP  = !!(this.validEpCapture && this.validEpCapture.to === to)

    let nextEnPassant = null
    if (piece.type === 'P') {
      const dir = piece.player === 'white' ? 1 : -1
      if (sq2row(to) === sq2row(from) + dir * 2) {
        nextEnPassant = { pawnCell: to, skippedCell: sq2id(sq2col(from), sq2row(from)+dir), player: piece.player }
      }
    }

    this.board.delete(from)
    if (isEP) this.board.delete(this.validEpCapture.capturedCell)
    this.board.set(to, { ...piece, hasMoved:true })

    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.enPassant = this.enPassantEnabled ? nextEnPassant : null

    if (piece.type === 'P' && sq2isPromotion(to, piece.player)) {
      this.pendingPromotion = { from, to, player: piece.player }
      this._updateCheckStatus()
      this._updateHUD(); this.render()
      this._showPromotionPicker(to, piece.player)
      return
    }

    this._finishTurn()
  }

  choosePromotion(type) {
    if (!this.pendingPromotion) return
    const { to, player } = this.pendingPromotion
    this.board.set(to, { player, type, hasMoved:true })
    this.pendingPromotion = null
    this._hidePromotionPicker()
    this._finishTurn()
  }

  _finishTurn() {
    this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white'
    this._updateCheckStatus()

    const inCheck = this.checkAttackers.some(c => {
      const kp = this.board.get(c.king); return kp && kp.player === this.currentPlayer
    })
    const hasMove = this._hasAnyLegalMove(this.currentPlayer)

    if (!hasMove) {
      this.gameOver = true
      if (inCheck) {
        this.winner         = this.currentPlayer === 'white' ? 'black' : 'white'
        this.gameOverReason = 'checkmate'
      } else {
        this.gameOverReason = 'stalemate'
        this.winner = this.stalemateMode === 'loss'
          ? (this.currentPlayer === 'white' ? 'black' : 'white')
          : null
      }
    }

    this._updateHUD()
    this.render()
  }

  _showPromotionPicker(cell, player) {
    this.canvas.dispatchEvent(new CustomEvent('promotion', { detail:{ cell, player }, bubbles:true }))
  }
  _hidePromotionPicker() {
    this.canvas.dispatchEvent(new CustomEvent('promotionDone', { bubbles:true }))
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  _updateHUD() {
    if (!this.hudEl) return
    const PCOLORS = { white:'#f0f0f0', black:'#222222' }
    const PTXT    = { white:'#111111', black:'#ffffff' }
    const PNAMES  = { white:'P1', black:'P2' }

    if (this.gameOver) {
      if (this.gameOverReason === 'stalemate' && this.winner === null) {
        this.hudEl.badge.textContent = 'Draw'
        this.hudEl.badge.style.background = '#555'
        this.hudEl.badge.style.color = '#fff'
        this.hudEl.status.textContent = 'Stalemate (no legal moves)'
      } else if (this.winner) {
        const reason = this.gameOverReason === 'checkmate' ? 'Checkmate' : 'Stalemate'
        this.hudEl.badge.textContent = `${PNAMES[this.winner]} wins! 👑`
        this.hudEl.badge.style.background = PCOLORS[this.winner]
        this.hudEl.badge.style.color = PTXT[this.winner]
        this.hudEl.status.textContent = reason
      }
    } else if (this.pendingPromotion) {
      const p = this.pendingPromotion.player
      this.hudEl.badge.textContent = PNAMES[p]
      this.hudEl.badge.style.background = PCOLORS[p]
      this.hudEl.badge.style.color = PTXT[p]
      this.hudEl.status.textContent = 'Choose promotion piece'
    } else {
      const inCheckNow = this.checkAttackers.some(c => {
        const kp = this.board.get(c.king); return kp && kp.player === this.currentPlayer
      })
      this.hudEl.badge.textContent = PNAMES[this.currentPlayer]
      this.hudEl.badge.style.background = PCOLORS[this.currentPlayer]
      this.hudEl.badge.style.color = PTXT[this.currentPlayer]
      this.hudEl.status.textContent = inCheckNow ? 'Check!' : ''
    }
  }

  toggleCoords()        { this.showCoords = !this.showCoords; this.render() }
  setStalemateMode(m)   { this.stalemateMode = m }
  setEnPassantEnabled(e){ this.enPassantEnabled = e; if (!e) this.enPassant = null; if (this.selected) this._selectCell(this.selected) }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    this._drawBoard()
    this._drawHighlights()
    this._drawPieces()
    this._drawCheckIndicators()
    if (this.showCoords) this._drawCoords()
    if (this.gameOver)   this._drawEndOverlay()
  }

  _drawBoard() {
    const { ctx, S, ox, oy, sqSize } = this
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, S, S)

    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        const x = ox + col * sqSize, y = oy + (7 - row) * sqSize
        ctx.fillStyle = (col + row) % 2 === 0 ? DARK_SQ : LIGHT_SQ
        ctx.fillRect(x, y, sqSize, sqSize)
        ctx.strokeStyle = BORDER; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, sqSize, sqSize)
      }
    }

    // Rank / file labels
    const fs = Math.max(9, Math.round(sqSize * 0.18))
    ctx.font = `bold ${fs}px monospace`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = col % 2 === 0 ? LIGHT_SQ : DARK_SQ
      ctx.fillText(String.fromCharCode(97 + col), ox + col * sqSize + 3, oy + 8 * sqSize - fs - 2)
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    for (let row = 0; row < 8; row++) {
      ctx.fillStyle = row % 2 === 0 ? DARK_SQ : LIGHT_SQ
      ctx.fillText(row + 1, ox + sqSize - 3, oy + (7 - row) * sqSize + 3)
    }

    // Territory labels outside board
    const lfs = Math.max(10, Math.round(sqSize * 0.22))
    ctx.font = `bold ${lfs}px system-ui`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f0f0f0'
    ctx.fillText('P1', ox + sqSize * 4, oy + 8 * sqSize + (S - oy - 8 * sqSize) / 2)
    ctx.fillStyle = '#888'
    ctx.fillText('P2', ox + sqSize * 4, oy / 2)
  }

  _drawHighlights() {
    const { ctx, sqSize } = this
    const pr = sqSize * 0.15

    if (this.selected) {
      const [x, y] = this._cellToXY(this.selected)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.44, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,210,0,.45)'; ctx.fill()
    }
    this.validMoves.forEach(id => {
      const [x, y] = this._cellToXY(id)
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(60,200,60,.75)'; ctx.fill()
    })
    this.validCaptures.forEach(id => {
      const [x, y] = this._cellToXY(id)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.42, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(220,40,40,.9)'; ctx.lineWidth = 2.5; ctx.stroke()
    })
    if (this.validEpCapture) {
      const [x, y] = this._cellToXY(this.validEpCapture.to)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.28, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(180,80,255,.9)'; ctx.lineWidth = 1.8; ctx.stroke()
    }
    ;(this.validCastles || []).forEach(c => {
      const [x, y] = this._cellToXY(c.kingDest)
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(120,160,255,.75)'; ctx.fill()
    })
  }

  _drawCheckIndicators() {
    const { ctx, sqSize } = this
    if (!this.checkAttackers || this.checkAttackers.length === 0) return
    const seen = new Set()
    for (const entry of this.checkAttackers) {
      for (const attackerId of entry.by) {
        if (seen.has(attackerId)) continue; seen.add(attackerId)
        const [x, y] = this._cellToXY(attackerId)
        ctx.beginPath(); ctx.arc(x, y, sqSize * 0.43, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2.2
        ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0
      }
      if (entry.king) {
        const [kx, ky] = this._cellToXY(entry.king)
        ctx.beginPath(); ctx.arc(kx, ky, sqSize * 0.46, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,45,45,0.55)'; ctx.lineWidth = 1.6; ctx.stroke()
      }
    }
  }

  _drawPieces() {
    const { ctx, sqSize } = this
    const pr = sqSize * 0.38
    const fs = Math.round(sqSize * 0.52)
    const SYMS = {K:{l:'♔',d:'♚'},Q:{l:'♕',d:'♛'},R:{l:'♖',d:'♜'},B:{l:'♗',d:'♝'},N:{l:'♘',d:'♞'},P:{l:'♙',d:'♟'}}
    const PCOLORS = { white:'#f0e8d0', black:'#222' }
    const PTXT    = { white:'#111',    black:'#eee' }

    this.board.forEach((piece, id) => {
      const [x, y] = this._cellToXY(id)
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2)
      ctx.fillStyle = PCOLORS[piece.player]; ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.font = `${fs}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = PTXT[piece.player]
      const sym = SYMS[piece.type]?.[piece.player === 'white' ? 'l' : 'd'] ?? '?'
      ctx.fillText(sym, x, y + 1)
    })
  }

  _drawCoords() {
    const { ctx, sqSize } = this
    const fs = Math.max(9, Math.round(sqSize * 0.18))
    ctx.font = `${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    this.board.forEach((_, id) => {
      const [x, y] = this._cellToXY(id)
      const ly = y - sqSize * 0.32
      const label = sqLabel(sq2col(id), sq2row(id))
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath(); ctx.roundRect(x - tw/2 - 2, ly - fs/2 - 1, tw + 4, fs + 2, 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillText(label, x, ly)
    })
  }

  _drawEndOverlay() {
    const { ctx, S, winner, gameOverReason } = this
    const PCOLORS = { white:'#f0e8d0', black:'#333' }
    const PNAMES  = { white:'P1', black:'P2' }

    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, S, S)

    const bw = S * 0.58, bh = S * 0.14
    const bx = (S - bw) / 2, by = (S - bh) / 2
    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill()

    const isDraw = gameOverReason === 'stalemate' && winner === null
    ctx.strokeStyle = isDraw ? '#888' : (winner === 'white' ? '#f0e8d0' : '#888')
    ctx.lineWidth = 2; ctx.stroke()

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.round(S * 0.042)}px system-ui`

    if (isDraw) {
      ctx.fillStyle = '#ccc'
      ctx.fillText('Stalemate: Draw', S/2, by + bh * 0.38)
    } else {
      ctx.fillStyle = winner === 'white' ? '#f0e8d0' : '#aaa'
      const headline = gameOverReason === 'checkmate' ? `${PNAMES[winner]} wins! Checkmate 👑`
                     : `${PNAMES[winner]} wins! 👑`
      ctx.fillText(headline, S/2, by + bh * 0.38)
    }

    ctx.font = `${Math.round(S * 0.021)}px system-ui`
    ctx.fillStyle = '#aaa'
    const sub = gameOverReason === 'checkmate' ? 'King in check'
              : 'No legal moves'
    ctx.fillText(`${sub} · Press Reset to play again`, S/2, by + bh * 0.72)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOUR-PLAYER CHESS GAME ENGINE  (14×14 cut-corners board)
// ═══════════════════════════════════════════════════════════════════════════════

// ── 14×14 coordinate helpers ─────────────────────────────────────────────────
// Square IDs: "0:col:row"  col 0–13, row 0–13  (cut corners at c<3&&r<3 etc.)
const SQ4_SIZE = 14, SQ4_CUT = 3

function sq4id(col, row) { return `0:${col}:${row}` }
function sq4col(id) { return parseInt(id.split(':')[1]) }
function sq4row(id) { return parseInt(id.split(':')[2]) }
function sq4valid(col, row) {
  if (col < 0 || col >= SQ4_SIZE || row < 0 || row >= SQ4_SIZE) return false
  if (col < SQ4_CUT && row < SQ4_CUT) return false
  if (col < SQ4_CUT && row >= SQ4_SIZE - SQ4_CUT) return false
  if (col >= SQ4_SIZE - SQ4_CUT && row < SQ4_CUT) return false
  if (col >= SQ4_SIZE - SQ4_CUT && row >= SQ4_SIZE - SQ4_CUT) return false
  return true
}

function sq4rookMoves(id, occ) {
  const col = sq4col(id), row = sq4row(id), r = new Set()
  for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
    let c = col+dc, rw = row+dr
    while (sq4valid(c,rw)) { r.add(sq4id(c,rw)); if(occ(sq4id(c,rw)))break; c+=dc; rw+=dr }
  }
  return r
}
function sq4bishopMoves(id, occ) {
  const col = sq4col(id), row = sq4row(id), r = new Set()
  for (const [dc, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
    let c = col+dc, rw = row+dr
    while (sq4valid(c,rw)) { r.add(sq4id(c,rw)); if(occ(sq4id(c,rw)))break; c+=dc; rw+=dr }
  }
  return r
}
function sq4queenMoves(id, occ) { return new Set([...sq4rookMoves(id,occ),...sq4bishopMoves(id,occ)]) }
function sq4kingMoves(id) {
  const col = sq4col(id), row = sq4row(id), r = new Set()
  for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    if (sq4valid(col+dc, row+dr)) r.add(sq4id(col+dc, row+dr))
  }
  return r
}
function sq4knightMoves(id) {
  const col = sq4col(id), row = sq4row(id), r = new Set()
  for (const [dc, dr] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
    if (sq4valid(col+dc, row+dr)) r.add(sq4id(col+dc, row+dr))
  }
  return r
}

// ── 4P Pawn movement ─────────────────────────────────────────────────────────
// Each player's pawns march toward the opposite side:
//   red    (bottom, row 0):  moves north (+row), promotes at row 13
//   blue   (left, col 0):    moves east  (+col), promotes at col 13
//   yellow (top, row 13):    moves south (-row), promotes at row 0
//   green  (right, col 13):  moves west  (-col), promotes at col 0
//
// Starting rows/cols: red row 3, blue col 3, yellow row 10, green col 10

function sq4pawnDirection(player) {
  return { red:[0,1], blue:[1,0], yellow:[0,-1], green:[-1,0] }[player]
}

function sq4pawnMoves(id, player, board, enPassant) {
  const col = sq4col(id), row = sq4row(id)
  const [dc, dr] = sq4pawnDirection(player)
  const moves = [], captures = []
  let epCapture = null

  // Starting rank/file — must match actual pawn placement in reset()
  const isStart =
    (player === 'red'    && row === 1)             ||
    (player === 'blue'   && col === 1)             ||
    (player === 'yellow' && row === SQ4_SIZE - 2)  ||
    (player === 'green'  && col === SQ4_SIZE - 2)

  const fwd1id = sq4valid(col+dc, row+dr) ? sq4id(col+dc, row+dr) : null
  if (fwd1id && !board.has(fwd1id)) {
    moves.push(fwd1id)
    if (isStart) {
      const fwd2id = sq4valid(col+dc*2, row+dr*2) ? sq4id(col+dc*2, row+dr*2) : null
      if (fwd2id && !board.has(fwd2id)) moves.push(fwd2id)
    }
  }

  // Diagonal captures (perpendicular to march direction)
  // dc=0,dr=1 → diagonals at (±1, 1)
  // dc=1,dr=0 → diagonals at (1, ±1)
  const diagonals = dr === 0
    ? [[dc,  1], [dc, -1]]   // horizontal march: capture forward-up and forward-down
    : [[1,  dr], [-1, dr]]   // vertical march: capture forward-left and forward-right

  for (const [ddc, ddr] of diagonals) {
    const nc = col+ddc, nr = row+ddr
    if (!sq4valid(nc, nr)) continue
    const tgt = sq4id(nc, nr)
    const occ = board.get(tgt)
    if (occ && occ.player !== player) captures.push(tgt)
  }

  // En passant — only between opposite players (red↔yellow, blue↔green).
  const OPPOSITE = { red:'yellow', yellow:'red', blue:'green', green:'blue' }
  if (enPassant && enPassant.player === OPPOSITE[player]) {
    const { pawnCell, skippedCell } = enPassant
    const pc = sq4col(pawnCell), pr = sq4row(pawnCell)
    // "Beside" means adjacent along the axis perpendicular to the capturer's march.
    // Vertical marchers (red/yellow, dr≠0): beside = same row, adjacent col.
    // Horizontal marchers (blue/green, dc≠0): beside = same col, adjacent row.
    const beside = dr === 0
      ? (col === pc && Math.abs(row - pr) === 1)
      : (row === pr && Math.abs(col - pc) === 1)
    if (beside && !board.has(skippedCell)) {
      captures.push(skippedCell)
      epCapture = { to: skippedCell, capturedCell: pawnCell }
    }
  }

  return { moves, captures, epCapture }
}

function sq4isPromotion(id, player) {
  const col = sq4col(id), row = sq4row(id)
  const [dc, dr] = sq4pawnDirection(player)
  // A pawn promotes when it can no longer advance: the next square forward is invalid.
  return !sq4valid(col + dc, row + dr)
}

class FourPlayerGame {
  constructor(canvas, hudEl, opts = {}) {
    this.canvas = canvas
    this.ctx    = canvas.getContext('2d')
    this.hudEl  = hudEl
    this.showCoords      = false
    this.stalemateMode   = opts.stalemateMode ?? 'loss'
    this.enPassantEnabled = opts.enPassant ?? true
    this.p3Colour = opts.p3Colour ?? '#3498db'
    this.p4Colour = opts.p4Colour ?? '#f39c12'

    this._onResize = () => { this._sized(); this.render() }
    this._onClick  = e => {
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height)
      this._handleClick(this._nearestCell(px, py))
    }
    window.addEventListener('resize', this._onResize)
    canvas.addEventListener('click', this._onClick)

    this._sized()
    this.reset()
  }

  destroy() {
    window.removeEventListener('resize', this._onResize)
    this.canvas.removeEventListener('click', this._onClick)
  }

  setP3Colour(hex) { this.p3Colour = hex; this.render() }
  setP4Colour(hex) { this.p4Colour = hex; this.render() }

  _sized() {
    const wrap = this.canvas.parentElement
    const rect = wrap ? wrap.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight }
    const S = Math.max(200, Math.min(rect.width, rect.height) - 8)
    this.canvas.width = this.canvas.height = S
    this.S  = S
    this.sqSize = Math.floor(S * 0.88 / SQ4_SIZE)
    this.ox = Math.floor((S - this.sqSize * SQ4_SIZE) / 2)
    this.oy = Math.floor((S - this.sqSize * SQ4_SIZE) / 2)
  }

  _cellToXY(id) {
    const col = sq4col(id), row = sq4row(id)
    return [
      this.ox + col * this.sqSize + this.sqSize / 2,
      this.oy + (SQ4_SIZE - 1 - row) * this.sqSize + this.sqSize / 2,
    ]
  }

  _nearestCell(px, py) {
    const col = Math.floor((px - this.ox) / this.sqSize)
    const row = (SQ4_SIZE - 1) - Math.floor((py - this.oy) / this.sqSize)
    if (!sq4valid(col, row)) return null
    return sq4id(col, row)
  }

  reset() {
    this.board           = new Map()
    this.selected        = null
    this.validMoves      = []
    this.validCaptures   = []
    this.validCastles    = []
    this.validEpCapture  = null
    this.players         = ['red','blue','yellow','green']
    this.currentIdx      = 0
    this.currentPlayer   = 'red'
    this.kingAlive       = { red:true, blue:true, yellow:true, green:true }
    this.eliminated      = { red:false, blue:false, yellow:false, green:false }
    this.winner          = null
    this.gameOver        = false
    this.gameOverReason  = null
    this.checkAttackers  = []
    this.pendingPromotion = null
    this.enPassant       = null

    // ── Red (bottom, row 0–1) — marches north ───────────────────────────────
    // Back rank at row 0, pawns at row 1 — but cut corners mean cols 3–10
    // Back rank piece order (left to right, red perspective): R N B Q K B N R
    const redBack = ['R','N','B','Q','K','B','N','R']
    for (let i = 0; i < 8; i++) {
      const col = SQ4_CUT + i
      this.board.set(sq4id(col, 0), { player:'red', type:redBack[i], hasMoved:false })
      this.board.set(sq4id(col, 1), { player:'red', type:'P', hasMoved:false })
    }

    // ── Blue (left, col 0) — marches east ───────────────────────────────────
    const blueBack = ['R','N','B','K','Q','B','N','R']
    for (let i = 0; i < 8; i++) {
      const row = SQ4_CUT + i
      this.board.set(sq4id(0, row), { player:'blue', type:blueBack[i], hasMoved:false })
      this.board.set(sq4id(1, row), { player:'blue', type:'P', hasMoved:false })
    }

    // ── Yellow (top, row 13) — marches south ────────────────────────────────
    const yellowBack = ['R','N','B','K','Q','B','N','R']
    for (let i = 0; i < 8; i++) {
      const col = SQ4_CUT + i
      this.board.set(sq4id(col, SQ4_SIZE-1), { player:'yellow', type:yellowBack[7-i], hasMoved:false })
      this.board.set(sq4id(col, SQ4_SIZE-2), { player:'yellow', type:'P', hasMoved:false })
    }

    // ── Green (right, col 13) — marches west ────────────────────────────────
    const greenBack = ['R','N','B','Q','K','B','N','R']
    for (let i = 0; i < 8; i++) {
      const row = SQ4_CUT + i
      this.board.set(sq4id(SQ4_SIZE-1, row), { player:'green', type:greenBack[7-i], hasMoved:false })
      this.board.set(sq4id(SQ4_SIZE-2, row), { player:'green', type:'P', hasMoved:false })
    }

    this._updateCheckStatus()
    this._updateHUD()
    this.render()
  }

  // ── Player colours ───────────────────────────────────────────────────────────
  _pColor(player) {
    return { red:'#f0e8d0', blue: this.p3Colour, yellow: this.p4Colour, green:'#222222' }[player]
  }
  _pTxt(player) {
    return { red:'#111', blue: this._textFor(this.p3Colour), yellow: this._textFor(this.p4Colour), green:'#ffffff' }[player]
  }
  _pName(player) {
    return { red:'P1', blue:'P2', yellow:'P3', green:'P4' }[player]
  }
  _textFor(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
    return (r + g + b) < 300 ? '#fff' : '#000'
  }

  // ── Attack / check helpers ───────────────────────────────────────────────────
  _attackersOf(targetCell, byPlayer, board) {
    if (this.eliminated[byPlayer]) return []
    const occ = id => board.has(id)
    const attackers = []
    for (const [id, piece] of board) {
      if (piece.player !== byPlayer) continue
      let attacks = new Set()
      if (piece.type === 'K') attacks = sq4kingMoves(id)
      else if (piece.type === 'N') attacks = sq4knightMoves(id)
      else if (piece.type === 'R') attacks = sq4rookMoves(id, occ)
      else if (piece.type === 'B') attacks = sq4bishopMoves(id, occ)
      else if (piece.type === 'Q') attacks = sq4queenMoves(id, occ)
      else if (piece.type === 'P') {
        const fakeBoard = new Map(board)
        if (!fakeBoard.has(targetCell)) fakeBoard.set(targetCell, { player:'__dummy__', type:'P' })
        const pm = sq4pawnMoves(id, piece.player, fakeBoard, null)
        pm.captures.forEach(c => attacks.add(c))
      }
      if (attacks.has(targetCell)) attackers.push(id)
    }
    return attackers
  }

  _isInCheck(player, board) {
    let kingCell = null
    for (const [id, piece] of board) {
      if (piece.player === player && piece.type === 'K') { kingCell = id; break }
    }
    if (!kingCell) return false
    const others = this.players.filter(p => p !== player)
    for (const opp of others) {
      if (this._attackersOf(kingCell, opp, board).length > 0) return true
    }
    return false
  }

  _updateCheckStatus() {
    this.checkAttackers = []
    for (const [id, piece] of this.board) {
      if (piece.type !== 'K') continue
      const player  = piece.player
      const others  = this.players.filter(p => p !== player)
      let attackers = []
      for (const opp of others) attackers = attackers.concat(this._attackersOf(id, opp, this.board))
      if (attackers.length > 0) this.checkAttackers.push({ king: id, by: attackers })
    }
  }

  // ── Move generation ───────────────────────────────────────────────────────────
  _getRawMoves(cellId, board) {
    const piece = board.get(cellId)
    if (!piece) return { moves:[], captures:[], epCapture:null }
    const occ = id => board.has(id)
    let moves = [], captures = [], epCapture = null

    if (piece.type === 'P') {
      const ep = this.enPassantEnabled ? this.enPassant : null
      const r = sq4pawnMoves(cellId, piece.player, board, ep)
      moves = r.moves; captures = r.captures; epCapture = r.epCapture
    } else {
      let raw = new Set()
      if (piece.type === 'K') raw = sq4kingMoves(cellId)
      else if (piece.type === 'R') raw = sq4rookMoves(cellId, occ)
      else if (piece.type === 'B') raw = sq4bishopMoves(cellId, occ)
      else if (piece.type === 'Q') raw = sq4queenMoves(cellId, occ)
      else if (piece.type === 'N') raw = sq4knightMoves(cellId)
      raw.forEach(id => {
        const o = board.get(id)
        if (!o) moves.push(id)
        else if (o.player !== piece.player) captures.push(id)
      })
    }
    return { moves, captures, epCapture }
  }

  _getLegalMoves(cellId) {
    const piece = board_alias => this.board.get(cellId)
    const p = this.board.get(cellId)
    if (!p) return { moves:[], captures:[], castles:[], epCapture:null }

    const raw = this._getRawMoves(cellId, this.board)
    // Castling only valid when exactly 2 kings remain (same logic as 3P)
    const aliveKings = this.players.filter(pl => this.kingAlive[pl])
    const twoKings   = aliveKings.length === 2

    const simulateMove = to => {
      const sim = new Map(this.board)
      sim.delete(cellId)
      if (raw.epCapture && raw.epCapture.to === to) sim.delete(raw.epCapture.capturedCell)
      sim.set(to, { ...p, hasMoved:true })
      return sim
    }

    const filterArr = twoKings
      ? arr => arr.filter(to => !this._isInCheck(p.player, simulateMove(to)))
      : arr => arr

    const filteredCaptures = filterArr(raw.captures)
    const epCapture = (raw.epCapture && filteredCaptures.includes(raw.epCapture.to)) ? raw.epCapture : null

    return { moves: filterArr(raw.moves), captures: filteredCaptures, castles: [], epCapture }
  }

  _hasAnyLegalMove(player) {
    for (const [id, piece] of this.board) {
      if (piece.player !== player) continue
      const { moves, captures } = this._getLegalMoves(id)
      if (moves.length > 0 || captures.length > 0) return true
    }
    return false
  }

  // ── Click / select / execute ─────────────────────────────────────────────────
  _handleClick(cellId) {
    if (this.gameOver || this.pendingPromotion) return
    if (!cellId) { this._deselect(); return }

    if (this.selected) {
      if (this.validMoves.includes(cellId) || this.validCaptures.includes(cellId)) {
        this._executeMove(this.selected, cellId); return
      }
      const p = this.board.get(cellId)
      if (p && p.player === this.currentPlayer) { this._selectCell(cellId); return }
      this._deselect(); return
    }

    const p = this.board.get(cellId)
    if (p && p.player === this.currentPlayer) this._selectCell(cellId)
  }

  _deselect() {
    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.render()
  }

  _selectCell(cellId) {
    this.selected = cellId
    const r = this._getLegalMoves(cellId)
    this.validMoves = r.moves; this.validCaptures = r.captures; this.validCastles = r.castles || []
    this.validEpCapture = r.epCapture || null
    this.render()
  }

  _executeMove(from, to) {
    const piece = this.board.get(from)
    const isEP  = !!(this.validEpCapture && this.validEpCapture.to === to)
    const captured = isEP ? this.board.get(this.validEpCapture.capturedCell) : this.board.get(to)

    if (piece.type === 'P') {
      const [dc, dr] = sq4pawnDirection(piece.player)
      if (sq4col(to) === sq4col(from) + dc*2 && sq4row(to) === sq4row(from) + dr*2) {
        this.enPassant = this.enPassantEnabled ? {
          pawnCell:    to,
          skippedCell: sq4id(sq4col(from)+dc, sq4row(from)+dr),
          player:      piece.player,
        } : null
      }
    }

    this.board.delete(from)
    if (isEP) { this.board.delete(this.validEpCapture.capturedCell); this.enPassant = null }
    this.board.set(to, { ...piece, hasMoved:true })

    if (captured && captured.type === 'K') {
      this.kingAlive[captured.player]  = false
      this.eliminated[captured.player] = true
    }

    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null

    const aliveKings = this.players.filter(p => this.kingAlive[p])
    if (aliveKings.length === 1) {
      this.winner         = aliveKings[0]
      this.gameOver       = true
      this.gameOverReason = 'capture'
      this._updateCheckStatus(); this._updateHUD(); this.render()
      return
    }

    if (piece.type === 'P' && sq4isPromotion(to, piece.player)) {
      this.pendingPromotion = { from, to, player: piece.player }
      this._updateCheckStatus(); this._updateHUD(); this.render()
      this._showPromotionPicker(to, piece.player)
      return
    }

    this._finishTurn()
  }

  choosePromotion(type) {
    if (!this.pendingPromotion) return
    const { to, player } = this.pendingPromotion
    this.board.set(to, { player, type, hasMoved:true })
    this.pendingPromotion = null
    this._hidePromotionPicker()
    this._finishTurn()
  }

  _finishTurn() {
    const aliveKings = this.players.filter(p => this.kingAlive[p])
    const twoKings   = aliveKings.length === 2

    let tries = 0, next
    do {
      this.currentIdx = (this.currentIdx + 1) % this.players.length
      next = this.players[this.currentIdx]
      tries++
    } while (this.eliminated[next] && tries < this.players.length)
    this.currentPlayer = next

    // En passant window expires when the player who double-stepped takes their next turn.
    if (this.enPassant?.player === next) this.enPassant = null

    this._updateCheckStatus()

    if (twoKings) {
      const inCheck = this.checkAttackers.some(c => {
        const kp = this.board.get(c.king); return kp && kp.player === next
      })
      const hasMove = this._hasAnyLegalMove(next)

      if (!hasMove) {
        this.gameOver = true
        if (inCheck) {
          this.winner         = aliveKings.find(p => p !== next)
          this.gameOverReason = 'checkmate'
        } else {
          this.gameOverReason = 'stalemate'
          this.winner = this.stalemateMode === 'loss' ? aliveKings.find(p => p !== next) : null
        }
      }
    }

    this._updateHUD()
    this.render()
  }

  _showPromotionPicker(cell, player) {
    this.canvas.dispatchEvent(new CustomEvent('promotion', { detail:{ cell, player }, bubbles:true }))
  }
  _hidePromotionPicker() {
    this.canvas.dispatchEvent(new CustomEvent('promotionDone', { bubbles:true }))
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  _updateHUD() {
    if (!this.hudEl) return

    if (this.gameOver) {
      if (this.gameOverReason === 'stalemate' && this.winner === null) {
        this.hudEl.badge.textContent = 'Draw'
        this.hudEl.badge.style.background = '#555'
        this.hudEl.badge.style.color = '#fff'
        this.hudEl.status.textContent = 'Stalemate (no legal moves)'
      } else if (this.winner) {
        const reason = this.gameOverReason === 'checkmate' ? 'Checkmate'
                     : this.gameOverReason === 'stalemate' ? 'Stalemate'
                     : 'King captured'
        this.hudEl.badge.textContent = `${this._pName(this.winner)} wins! 👑`
        this.hudEl.badge.style.background = this._pColor(this.winner)
        this.hudEl.badge.style.color = this._pTxt(this.winner)
        this.hudEl.status.textContent = reason
      }
    } else if (this.pendingPromotion) {
      const p = this.pendingPromotion.player
      this.hudEl.badge.textContent = this._pName(p)
      this.hudEl.badge.style.background = this._pColor(p)
      this.hudEl.badge.style.color = this._pTxt(p)
      this.hudEl.status.textContent = 'Choose promotion piece'
    } else {
      const elim = this.players.filter(p => this.eliminated[p]).map(p => this._pName(p))
      const inCheckNow = this.checkAttackers.some(c => {
        const kp = this.board.get(c.king); return kp && kp.player === this.currentPlayer
      })
      this.hudEl.badge.textContent = this._pName(this.currentPlayer)
      this.hudEl.badge.style.background = this._pColor(this.currentPlayer)
      this.hudEl.badge.style.color = this._pTxt(this.currentPlayer)
      const checkNote = inCheckNow ? ' · Check!' : ''
      this.hudEl.status.textContent = elim.length
        ? `${elim.join(', ')} eliminated${checkNote}`
        : checkNote.trim()
    }
  }

  toggleCoords()        { this.showCoords = !this.showCoords; this.render() }
  setStalemateMode(m)   { this.stalemateMode = m }
  setEnPassantEnabled(e){ this.enPassantEnabled = e; if (!e) this.enPassant = null; if (this.selected) this._selectCell(this.selected) }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    this._drawBoard()
    this._drawHighlights()
    this._drawPieces()
    this._drawCheckIndicators()
    if (this.showCoords) this._drawCoords()
    if (this.gameOver)   this._drawEndOverlay()
  }

  _drawBoard() {
    const { ctx, S, ox, oy, sqSize } = this
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, S, S)

    for (let col = 0; col < SQ4_SIZE; col++) {
      for (let row = 0; row < SQ4_SIZE; row++) {
        if (!sq4valid(col, row)) continue
        const x = ox + col * sqSize, y = oy + (SQ4_SIZE - 1 - row) * sqSize
        ctx.fillStyle = (col + row) % 2 === 0 ? DARK_SQ : LIGHT_SQ
        ctx.fillRect(x, y, sqSize, sqSize)
        ctx.strokeStyle = BORDER; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, sqSize, sqSize)
      }
    }

    // Territory shading strips
    const tint = 'rgba(0,0,0,0.06)'
    const playerStrips = [
      // red: rows 0-2
      { cols:[SQ4_CUT,SQ4_SIZE-SQ4_CUT-1], rows:[0,SQ4_CUT-1], player:'red' },
      // blue: cols 0-2
      { cols:[0,SQ4_CUT-1], rows:[SQ4_CUT,SQ4_SIZE-SQ4_CUT-1], player:'blue' },
      // yellow: rows 11-13
      { cols:[SQ4_CUT,SQ4_SIZE-SQ4_CUT-1], rows:[SQ4_SIZE-SQ4_CUT,SQ4_SIZE-1], player:'yellow' },
      // green: cols 11-13
      { cols:[SQ4_SIZE-SQ4_CUT,SQ4_SIZE-1], rows:[SQ4_CUT,SQ4_SIZE-SQ4_CUT-1], player:'green' },
    ]
    for (const strip of playerStrips) {
      const [c0,c1] = strip.cols, [r0,r1] = strip.rows
      ctx.fillStyle = this._pColor(strip.player) + '22'
      for (let col = c0; col <= c1; col++) for (let row = r0; row <= r1; row++) {
        if (!sq4valid(col, row)) continue
        const x = ox + col * sqSize, y = oy + (SQ4_SIZE - 1 - row) * sqSize
        ctx.fillRect(x, y, sqSize, sqSize)
      }
    }

    // Player labels outside board
    const lfs = Math.max(9, Math.round(sqSize * 0.7))
    ctx.font = `bold ${lfs}px system-ui`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const mid = ox + sqSize * SQ4_SIZE / 2
    ctx.fillStyle = this._pColor('red');    ctx.fillText('P1', mid, oy + SQ4_SIZE * sqSize + (S - oy - SQ4_SIZE*sqSize)/2)
    ctx.fillStyle = this._pColor('yellow'); ctx.fillText('P3', mid, oy / 2)
    ctx.fillStyle = this._pColor('blue');   ctx.fillText('P2', ox / 2, oy + SQ4_SIZE * sqSize / 2)
    ctx.fillStyle = this._pColor('green');  ctx.fillText('P4', ox + SQ4_SIZE * sqSize + (S - ox - SQ4_SIZE*sqSize)/2, oy + SQ4_SIZE * sqSize / 2)
  }

  _drawHighlights() {
    const { ctx, sqSize } = this
    const pr = sqSize * 0.15

    if (this.selected) {
      const [x, y] = this._cellToXY(this.selected)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.44, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,210,0,.45)'; ctx.fill()
    }
    this.validMoves.forEach(id => {
      const [x, y] = this._cellToXY(id)
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(60,200,60,.75)'; ctx.fill()
    })
    this.validCaptures.forEach(id => {
      const [x, y] = this._cellToXY(id)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.42, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(220,40,40,.9)'; ctx.lineWidth = 2.5; ctx.stroke()
    })
    if (this.validEpCapture) {
      const [x, y] = this._cellToXY(this.validEpCapture.to)
      ctx.beginPath(); ctx.arc(x, y, sqSize * 0.28, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(180,80,255,.9)'; ctx.lineWidth = 1.8; ctx.stroke()
    }
  }

  _drawCheckIndicators() {
    const { ctx, sqSize } = this
    if (!this.checkAttackers || this.checkAttackers.length === 0) return
    const seen = new Set()
    for (const entry of this.checkAttackers) {
      for (const attackerId of entry.by) {
        if (seen.has(attackerId)) continue; seen.add(attackerId)
        const [x, y] = this._cellToXY(attackerId)
        ctx.beginPath(); ctx.arc(x, y, sqSize * 0.43, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2.2
        ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0
      }
      if (entry.king) {
        const [kx, ky] = this._cellToXY(entry.king)
        ctx.beginPath(); ctx.arc(kx, ky, sqSize * 0.46, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,45,45,0.55)'; ctx.lineWidth = 1.6; ctx.stroke()
      }
    }
  }

  _drawPieces() {
    const { ctx, sqSize } = this
    const pr = sqSize * 0.38
    const fs = Math.round(sqSize * 0.52)
    const SYMS = {K:{l:'♔',d:'♚'},Q:{l:'♕',d:'♛'},R:{l:'♖',d:'♜'},B:{l:'♗',d:'♝'},N:{l:'♘',d:'♞'},P:{l:'♙',d:'♟'}}

    this.board.forEach((piece, id) => {
      const [x, y] = this._cellToXY(id)
      ctx.globalAlpha = this.eliminated[piece.player] ? 0.38 : 1.0
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2)
      ctx.fillStyle = this._pColor(piece.player); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.font = `${fs}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = this._pTxt(piece.player)
      const variant = ['red','yellow'].includes(piece.player) ? 'l' : 'd'
      const sym = SYMS[piece.type]?.[variant] ?? '?'
      ctx.fillText(sym, x, y + 1)
      ctx.globalAlpha = 1.0
    })
  }

  _drawCoords() {
    const { ctx, sqSize } = this
    const fs = Math.max(7, Math.round(sqSize * 0.18))
    ctx.font = `${fs}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    this.board.forEach((_, id) => {
      const [x, y] = this._cellToXY(id)
      const ly = y - sqSize * 0.3
      const label = sqLabel(sq4col(id), sq4row(id))
      const tw = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath(); ctx.roundRect(x - tw/2 - 2, ly - fs/2 - 1, tw + 4, fs + 2, 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.fillText(label, x, ly)
    })
  }

  _drawEndOverlay() {
    const { ctx, S, winner, gameOverReason } = this
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, S, S)

    const bw = S * 0.58, bh = S * 0.14
    const bx = (S - bw) / 2, by = (S - bh) / 2
    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill()

    const isDraw = gameOverReason === 'stalemate' && winner === null
    ctx.strokeStyle = isDraw ? '#888' : this._pColor(winner)
    ctx.lineWidth = 2; ctx.stroke()

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.round(S * 0.042)}px system-ui`

    if (isDraw) {
      ctx.fillStyle = '#ccc'; ctx.fillText('Stalemate: Draw', S/2, by + bh * 0.38)
    } else {
      ctx.fillStyle = this._pColor(winner)
      const headline = gameOverReason === 'checkmate' ? `${this._pName(winner)} wins! Checkmate 👑`
                     : gameOverReason === 'stalemate' ? `${this._pName(winner)} wins! Stalemate 👑`
                     : `${this._pName(winner)} wins! 👑`
      ctx.fillText(headline, S/2, by + bh * 0.38)
    }

    ctx.font = `${Math.round(S * 0.021)}px system-ui`
    ctx.fillStyle = '#aaa'
    const sub = gameOverReason === 'checkmate' ? 'King in check'
              : gameOverReason === 'stalemate' ? 'No legal moves'
              : 'King captured'
    ctx.fillText(`${sub} · Press Reset to play again`, S/2, by + bh * 0.72)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREE-PLAYER CHESS GAME ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Coordinate system ────────────────────────────────────────────────────────
// Cell IDs are letter+number strings like "A1", "E9", "L12"
// The board uses three overlapping row/col sets to handle the hexagonal geometry

const ORIG = {"A1":[267,769],"A2":[245,720],"A3":[222,673],"A4":[201,625],"A5":[175,578],"A6":[143,536],"A7":[110,490],"A8":[81,451],"B1":[320,764],"B2":[305,706],"B3":[289,647],"B4":[272,587],"B5":[242,536],"B6":[199,495],"B7":[155,451],"B8":[112,407],"C1":[372,760],"C2":[362,690],"C3":[353,619],"C4":[344,551],"C5":[310,492],"C6":[254,450],"C7":[196,405],"C8":[142,366],"D1":[425,756],"D2":[422,675],"D3":[419,594],"D4":[415,510],"D5":[377,451],"D6":[310,407],"D7":[240,365],"D8":[173,320],"E1":[478,757],"E2":[480,675],"E3":[482,594],"E4":[488,513],"E9":[522,451],"E10":[591,408],"E11":[657,365],"E12":[727,322],"F1":[530,760],"F2":[538,690],"F3":[547,618],"F4":[558,551],"F9":[593,492],"F10":[648,450],"F11":[703,407],"F12":[757,365],"G1":[584,765],"G2":[598,708],"G3":[614,647],"G4":[627,587],"G9":[658,536],"G10":[703,494],"G11":[747,451],"G12":[788,405],"H1":[633,771],"H2":[655,722],"H3":[678,675],"H4":[701,629],"H9":[727,582],"H10":[757,537],"H11":[789,498],"H12":[819,452],"I5":[414,392],"I6":[341,352],"I7":[270,315],"I8":[200,277],"I9":[489,388],"I10":[559,349],"I11":[630,312],"I12":[699,276],"J5":[417,307],"J6":[351,281],"J7":[286,253],"J8":[220,228],"J9":[485,307],"J10":[552,280],"J11":[614,254],"J12":[679,228],"K5":[422,228],"K6":[360,212],"K7":[303,198],"K8":[242,180],"K9":[480,226],"K10":[540,210],"K11":[598,194],"K12":[656,178],"L5":[425,145],"L6":[371,142],"L7":[319,136],"L8":[265,133],"L9":[476,145],"L10":[531,142],"L11":[582,138],"L12":[636,132]}

const ORIG_CX=450, ORIG_CY=451, ORIG_R=369

const rowSets=[[1,2,3,4,5,6,7,8],[1,2,3,4,9,10,11,12],[8,7,6,5,9,10,11,12]]
const colSets=[['A','B','C','D','E','F','G','H'],['A','B','C','D','I','J','K','L'],['H','G','F','E','I','J','K','L']]

const activeCells=new Set()
for(let c=0;c<=3;c++) for(let r=1;r<=8;r++) activeCells.add(String.fromCharCode(65+c)+r)
for(let c=4;c<=7;c++){for(let r=1;r<=4;r++) activeCells.add(String.fromCharCode(65+c)+r);for(let r=9;r<=12;r++) activeCells.add(String.fromCharCode(65+c)+r)}
for(let c=8;c<=11;c++) for(let r=5;r<=12;r++) activeCells.add(String.fromCharCode(65+c)+r)

function gCol(id){return id[0]}
function gRow(id){return parseInt(id.slice(1))}

function findSharedSets(a,b){
  const ac=gCol(a),ar=gRow(a),bc=gCol(b),br=gRow(b),res=[]
  for(let ri=0;ri<3;ri++){
    const rs=rowSets[ri],rA=rs.indexOf(ar),rB=rs.indexOf(br);if(rA<0||rB<0)continue
    for(let ci=0;ci<3;ci++){
      const cs=colSets[ci],cA=cs.indexOf(ac),cB=cs.indexOf(bc);if(cA<0||cB<0)continue
      res.push({ri,ci,rs,cs,rIdxA:rA,rIdxB:rB,cIdxA:cA,cIdxB:cB,dr:Math.abs(rA-rB),dc:Math.abs(cA-cB)})
    }
  }
  return res
}



const darkC=new Set(['D4','I5','E9']), lightC=new Set(['D5','I9','E4'])

function getKingMoves(id){
  const r=new Set()
  activeCells.forEach(nb=>{
    if(nb===id)return
    for(const s of findSharedSets(id,nb)){
      if(s.dr<=1&&s.dc<=1&&s.dr+s.dc>0){
        if(s.dr===1&&s.dc===1&&((darkC.has(id)&&lightC.has(nb))||(lightC.has(id)&&darkC.has(nb))))return
        r.add(nb);return
      }
    }
  })
  return r
}

function expandSeg(a,b){
  const C='ABCDEFGHIJKL'.split(''),ac=C.indexOf(a[0]),ar=parseInt(a.slice(1)),bc=C.indexOf(b[0]),br=parseInt(b.slice(1))
  const dc=Math.sign(bc-ac),dr=Math.sign(br-ar),cells=[a];let c=ac,r=ar
  while(c!==bc||r!==br){c+=dc;r+=dr;cells.push(C[c]+r)}
  return cells
}

function rfu(rank){return[...expandSeg('H'+rank,'E'+rank),...expandSeg('I'+rank,'L'+rank)]}

const rookLines=[
  expandSeg('A1','A8'),expandSeg('B1','B8'),expandSeg('C1','C8'),expandSeg('D1','D8'),
  expandSeg('A1','H1'),expandSeg('A2','H2'),expandSeg('A3','H3'),expandSeg('A4','H4'),
  [...expandSeg('A5','D5'),...expandSeg('I5','L5')],[...expandSeg('A6','D6'),...expandSeg('I6','L6')],
  [...expandSeg('A7','D7'),...expandSeg('I7','L7')],[...expandSeg('A8','D8'),...expandSeg('I8','L8')],
  rfu(9),rfu(10),rfu(11),rfu(12),
  [...expandSeg('E1','E4'),...expandSeg('E9','E12')],[...expandSeg('F1','F4'),...expandSeg('F9','F12')],
  [...expandSeg('G1','G4'),...expandSeg('G9','G12')],[...expandSeg('H1','H4'),...expandSeg('H9','H12')],
  [...expandSeg('I8','I5'),...expandSeg('I9','I12')],[...expandSeg('J8','J5'),...expandSeg('J9','J12')],
  [...expandSeg('K8','K5'),...expandSeg('K9','K12')],[...expandSeg('L8','L5'),...expandSeg('L9','L12')],
  expandSeg('I5','L5'),expandSeg('I6','L6'),expandSeg('I7','L7'),expandSeg('I8','L8'),
]

const cellRL={}
activeCells.forEach(id=>{cellRL[id]=[]})
rookLines.forEach(line=>line.forEach(cell=>{if(activeCells.has(cell))cellRL[cell].push(line)}))

function getRookMoves(id,occ){
  const r=new Set()
  ;(cellRL[id]||[]).forEach(line=>{
    const idx=line.indexOf(id)
    for(let i=idx-1;i>=0;i--){if(!activeCells.has(line[i]))break;r.add(line[i]);if(occ&&occ(line[i]))break}
    for(let i=idx+1;i<line.length;i++){if(!activeCells.has(line[i]))break;r.add(line[i]);if(occ&&occ(line[i]))break}
  })
  r.delete(id);return r
}

const dGW=new Set(['A1','B2','C3','D4','L8','K7','J6','I5','E9','F10','G11','H12'])
const lGW=new Set(['A8','B7','C6','D5','I9','J10','K11','L12','E4','F3','G2','H1'])

function getBishopMoves(id,occ){
  const r=new Set(),ac=gCol(id),ar=gRow(id),isL=lGW.has(id),isD=dGW.has(id)
  for(let ri=0;ri<3;ri++){
    const rs=rowSets[ri],rIdx=rs.indexOf(ar);if(rIdx<0)continue
    for(let ci=0;ci<3;ci++){
      const cs=colSets[ci],cIdx=cs.indexOf(ac);if(cIdx<0)continue
      for(const[dr,dc]of[[1,1],[1,-1],[-1,1],[-1,-1]]){
        let rv=rIdx+dr,cv=cIdx+dc
        while(rv>=0&&rv<rs.length&&cv>=0&&cv<cs.length){
          const nb=cs[cv]+rs[rv];if(!activeCells.has(nb))break
          if(isL&&dGW.has(nb))break;if(isD&&lGW.has(nb))break
          r.add(nb);if(occ&&occ(nb))break;rv+=dr;cv+=dc
        }
      }
    }
  }
  r.delete(id);return r
}

function getQueenMoves(id,occ){return new Set([...getRookMoves(id,occ),...getBishopMoves(id,occ)])}

function getKnightMoves(id){
  const r=new Set()
  activeCells.forEach(nb=>{
    if(nb===id)return
    for(const s of findSharedSets(id,nb)){if((s.dr===2&&s.dc===1)||(s.dr===1&&s.dc===2)){r.add(nb);return}}
  })
  return r
}

// ── Pawn movement ──────────────────────────────────────────────────────────
// Primary lanes: each player's pawns start in their own home wedge and follow
// a fixed sequence through it. Once a pawn (via capture) ends up on a column
// outside its primary lane, it continues marching within whichever 4-row band
// its current row belongs to, toward that band's fixed promotion endpoint:
//   rows 1-4  → endpoint row 1   (red's back rank)
//   rows 5-8  → endpoint row 8   (white's back rank)
//   rows 9-12 → endpoint row 12  (black's back rank)
// This generalizes cleanly across every column (A-L) with no per-column cases.

function pawnPrimarySeq(file, player) {
  const f = file
  if (player === 'red') {
    if ('ABCD'.includes(f)) return [1,2,3,4,5,6,7,8].map(r=>f+r)
    if ('EFGH'.includes(f)) return [1,2,3,4,9,10,11,12].map(r=>f+r)
  }
  if (player === 'white') {
    if ('ABCD'.includes(f)) return [8,7,6,5,4,3,2,1].map(r=>f+r)
    if ('IJKL'.includes(f)) return [8,7,6,5,9,10,11,12].map(r=>f+r)
  }
  if (player === 'black') {
    if ('EFGH'.includes(f)) return [12,11,10,9,4,3,2,1].map(r=>f+r)
    if ('IJKL'.includes(f)) return [12,11,10,9,5,6,7,8].map(r=>f+r)
  }
  return []
}

// Band-based secondary sequence: from current row, march to that band's endpoint.
function pawnBandSeq(file, row) {
  let rows
  if (row >= 1 && row <= 4)       rows = [4,3,2,1]        // marches toward row 1
  else if (row >= 5 && row <= 8)  rows = [5,6,7,8]         // marches toward row 8
  else if (row >= 9 && row <= 12) rows = [9,10,11,12]      // marches toward row 12
  else return []
  const startIdx = rows.indexOf(row)
  if (startIdx < 0) return []
  return rows.slice(startIdx).map(r => file + r).filter(c => activeCells.has(c))
}

// Full sequence for a pawn at a given cell: primary lane if the cell is in the
// player's home columns, otherwise the generalized band sequence.
function pawnSeq(file, player, cellId) {
  const primary = pawnPrimarySeq(file, player)
  if (cellId && primary.includes(cellId)) return primary
  if (!cellId) return primary  // used by isPromotion-style lookups without a specific cell
  return pawnBandSeq(file, gRow(cellId))
}

// ── Central-tile opposite-capture restriction ────────────────────────────────
// The six central cells form three diametrically-opposite pairs across the hex
// centre. A pawn standing on one cannot capture onto its direct opposite.
const OPPOSITE_CENTRAL = new Map([
  ['D4','I9'], ['I9','D4'],
  ['D5','E9'], ['E9','D5'],
  ['I5','E4'], ['E4','I5'],
])

function getPawnMoves(cellId, player, board, enPassant) {
  const seq = pawnSeq(cellId[0], player, cellId)
  const idx = seq.indexOf(cellId)
  if (idx < 0 || idx >= seq.length - 1) return { moves:[], captures:[], epCapture:null }
  const moves = [], captures = []
  let epCapture = null

  const fwd1 = seq[idx+1]
  if (fwd1 && activeCells.has(fwd1) && !board.has(fwd1)) {
    moves.push(fwd1)
    const isHomeRank = (
      (player==='red'   && gRow(cellId)===2) ||
      (player==='white' && gRow(cellId)===7) ||
      (player==='black' && gRow(cellId)===11)
    )
    if (isHomeRank) {
      const fwd2 = seq[idx+2]
      if (fwd2 && activeCells.has(fwd2) && !board.has(fwd2)) moves.push(fwd2)
    }
  }

  const blockedOpposite = OPPOSITE_CENTRAL.get(cellId)

  if (fwd1) {
    activeCells.forEach(nb=>{
      if(nb===cellId||nb===fwd1)return
      if(nb===blockedOpposite)return   // central-tile opposite-capture restriction
      const occ=board.get(nb)
      if(!occ||occ.player===player)return
      const s1=findSharedSets(cellId,nb)
      if(!s1.some(s=>s.dr===1&&s.dc===1))return
      const s2=findSharedSets(fwd1,nb)
      if(!s2.some(s=>s.dr<=1&&s.dc===1))return
      captures.push(nb)
    })
  }

  // ── En passant ────────────────────────────────────────────────────────────
  // If an enemy pawn double-stepped last turn and sits file-adjacent to this pawn
  // on the same row, this pawn may capture it by moving onto the square it skipped.
  if (enPassant && enPassant.player !== player && fwd1) {
    const { pawnCell, skippedCell } = enPassant
    const sAdj = findSharedSets(cellId, pawnCell)
    const isFileAdjacentSameRow = sAdj.some(s => s.dr===0 && s.dc===1)
    if (isFileAdjacentSameRow && !board.has(skippedCell)) {
      const sDiag = findSharedSets(cellId, skippedCell)
      if (sDiag.some(s => s.dr===1 && s.dc===1) && skippedCell !== blockedOpposite) {
        captures.push(skippedCell)
        epCapture = { to: skippedCell, capturedCell: pawnCell }
      }
    }
  }

  return { moves, captures, epCapture }
}

function isPromotion(cellId, player) {
  const seq = pawnSeq(cellId[0], player, cellId)
  return seq.length > 0 && seq[seq.length-1] === cellId
}

// ── Castling data ─────────────────────────────────────────────────────────────
// Each player has a king and two rooks. Castling moves the king two squares
// toward a rook along their shared back-rank rook-line, and the rook lands on
// the square the king crossed — provided neither piece has moved, the squares
// between are empty, and the king is not in/through/landing-in check.
const CASTLE_CONFIG = {
  red:   { king:'E1',  rooks: [ {sq:'A1',  side:'queenside'}, {sq:'H1',  side:'kingside'} ] },
  white: { king:'D8',  rooks: [ {sq:'A8',  side:'queenside'}, {sq:'L8',  side:'kingside'} ] },
  black: { king:'I12', rooks: [ {sq:'H12', side:'queenside'}, {sq:'L12', side:'kingside'} ] },
}

function findRookLine(a, b) {
  return rookLines.find(l => l.includes(a) && l.includes(b))
}

// Returns ordered cells from king (exclusive) to rook (inclusive) along their line.
function castlePath(king, rook) {
  const line = findRookLine(king, rook)
  if (!line) return null
  const ik = line.indexOf(king), ir = line.indexOf(rook)
  if (ik < 0 || ir < 0) return null
  return ik < ir ? line.slice(ik+1, ir+1) : line.slice(ir, ik).reverse()
}

// Computes the {kingDest, rookDest, between} for a castle move, or null if the
// king/rook geometry doesn't support it (shouldn't happen for the 6 configured pairs).
function castleMoveInfo(king, rook) {
  const path = castlePath(king, rook)
  if (!path || path.length < 2) return null
  return {
    rookDest:  path[0],
    kingDest:  path[1],
    crossed:   path.slice(0, 2),          // squares the king passes through (for check-along-the-way test)
    between:   path.slice(0, path.length-1), // all squares between king and rook (must be empty)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ThreePlayerGame — exported class
// ═══════════════════════════════════════════════════════════════════════════════
class ThreePlayerGame {
  /**
   * @param canvas   HTMLCanvasElement
   * @param hudEl    { hud, badge, status } DOM refs
   * @param opts     { stalemateMode: 'loss'|'draw', enPassant: boolean }  defaults: 'loss', true
   */
  constructor(canvas, hudEl, opts = {}) {
    this.canvas  = canvas
    this.ctx     = canvas.getContext('2d')
    this.hudEl   = hudEl
    this.showCoords      = false
    this.stalemateMode   = opts.stalemateMode ?? 'loss'
    this.enPassantEnabled = opts.enPassant ?? true
    this.p3Colour = opts.p3Colour ?? '#3498db'

    this._sized()
    window.addEventListener('resize', () => { this._sized(); this.render() })

    this._onResize = () => { this._sized(); this.render() }
    this._onClick  = e => {
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (canvas.width / rect.width)
      const py = (e.clientY - rect.top)  * (canvas.height / rect.height)
      this._handleClick(this._nearestCell(px, py))
    }
    window.addEventListener('resize', this._onResize)
    canvas.addEventListener('click', this._onClick)

    this.reset()
    this._loadPieceImages()
  }

  destroy() {
    window.removeEventListener('resize', this._onResize)
    this.canvas.removeEventListener('click', this._onClick)
  }
  
  setP3Colour(hex) {
    this.p3Colour = hex
    this.render()
  }

  // ── Sizing ──────────────────────────────────────────────────────────────────
  _sized() {
    // Use the wrap container's actual laid-out box so the board fills whatever
    // space is available after HUD and flex layout have settled.
    const wrap = this.canvas.parentElement
    const rect  = wrap ? wrap.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight }
    const S     = Math.max(200, Math.min(rect.width, rect.height) - 8)
    this.canvas.width = this.canvas.height = S
    this.S  = S
    this.cx = this.cy = S / 2
    // Scale R to 88% of half the canvas, then pull 5% inward so pieces don't
    // sit right on the hex border.
    this.R  = S / 2 * 0.88
    this.sc = this.R / ORIG_R
  }

  // ── SVG piece image loading ───────────────────────────────────────────────────
  // Tries to load public/assets/chess/{type}.svg for each piece type.
  // Falls back silently to the Unicode marker rendering if any file is missing.
  _loadPieceImages() {
    const TYPES = ['K','Q','R','B','N','P']
    this._pieceImgs = {}   // type -> HTMLImageElement (only set when loaded OK)
    for (const type of TYPES) {
      const img  = new Image()
      const name = { K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn' }[type]
      img.onload  = () => { this._pieceImgs[type] = img; this.render() }
      img.onerror = () => { /* leave undefined → marker fallback */ }
      img.src = `public/assets/chess/${name}.svg`
    }
  }

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  _sc2(id) {
    const [ox, oy] = ORIG[id]
    return [(ox - ORIG_CX) * this.sc * 0.95 + this.cx, (oy - ORIG_CY) * this.sc * 0.95 + this.cy]
  }
  _v(i) {
    i = ((i % 6) + 6) % 6
    const a = Math.PI / 3 * i
    return [this.cx + this.R * Math.cos(a), this.cy + this.R * Math.sin(a)]
  }
  _mp(i) {
    const [x0,y0] = this._v(i), [x1,y1] = this._v((i+1)%6)
    return [(x0+x1)/2, (y0+y1)/2]
  }
  _lp(a, b, t) { return [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])] }

  // ── Reset / init ─────────────────────────────────────────────────────────────
  reset() {
    this.board            = new Map()
    this.selected         = null
    this.validMoves       = []
    this.validCaptures    = []
    this.validCastles     = []
    this.validEpCapture   = null
    this.currentPlayer    = 'red'
    this.kingAlive        = { red: true, white: true, black: true }
    this.eliminated       = { red: false, white: false, black: false }
    this.winner            = null
    this.gameOver          = false
    this.gameOverReason    = null
    this.checkAttackers    = []
    this.pendingPromotion  = null
    this.enPassant         = null   // { pawnCell, skippedCell, player } — lives for exactly one ply

    'RNBQKBNR'.split('').forEach((t, i) => {
      const f = String.fromCharCode(65 + i)
      this.board.set(f+'1', { player:'red',   type:t,   hasMoved:false })
      this.board.set(f+'2', { player:'red',   type:'P', hasMoved:false })
    })
    const wAD=['R','N','B','K'], wIL=['Q','B','N','R']
    'ABCD'.split('').forEach((f,i) => {
      this.board.set(f+'8', { player:'white', type:wAD[i], hasMoved:false })
      this.board.set(f+'7', { player:'white', type:'P',    hasMoved:false })
    })
    'IJKL'.split('').forEach((f,i) => {
      this.board.set(f+'8', { player:'white', type:wIL[i], hasMoved:false })
      this.board.set(f+'7', { player:'white', type:'P',    hasMoved:false })
    })
    const bHE=['R','N','B','Q'], bIL=['K','B','N','R']
    'HGFE'.split('').forEach((f,i) => {
      this.board.set(f+'12', { player:'black', type:bHE[i], hasMoved:false })
      this.board.set(f+'11', { player:'black', type:'P',    hasMoved:false })
    })
    'IJKL'.split('').forEach((f,i) => {
      this.board.set(f+'12', { player:'black', type:bIL[i], hasMoved:false })
      this.board.set(f+'11', { player:'black', type:'P',    hasMoved:false })
    })

    this._updateCheckStatus()
    this._updateHUD()
    this.render()
  }

  // ── Attack map: who attacks `targetCell`, returns array of attacker cellIds ──
  _attackersOf(targetCell, byPlayer, board) {
    if (this.eliminated[byPlayer]) return []   // dead players' pieces threaten nothing
    const occ = id => board.has(id)
    const attackers = []
    for (const [id, piece] of board) {
      if (piece.player !== byPlayer) continue
      let attacks = new Set()
      if (piece.type === 'K') attacks = getKingMoves(id)
      else if (piece.type === 'N') attacks = getKnightMoves(id)
      else if (piece.type === 'R') attacks = getRookMoves(id, occ)
      else if (piece.type === 'B') attacks = getBishopMoves(id, occ)
      else if (piece.type === 'Q') attacks = getQueenMoves(id, occ)
      else if (piece.type === 'P') {
        const fakeBoard = new Map(board)
        if (!fakeBoard.has(targetCell)) fakeBoard.set(targetCell, { player:'__dummy__', type:'P' })
        const pm = getPawnMoves(id, piece.player, fakeBoard, null)
        pm.captures.forEach(c => attacks.add(c))
      }
      if (attacks.has(targetCell)) attackers.push(id)
    }
    return attackers
  }

  _isInCheck(player, board) {
    let kingCell = null
    for (const [id, piece] of board) {
      if (piece.player === player && piece.type === 'K') { kingCell = id; break }
    }
    if (!kingCell) return false
    const others = ['red','white','black'].filter(p => p !== player)
    for (const opp of others) {
      if (this._attackersOf(kingCell, opp, board).length > 0) return true
    }
    return false
  }

  // Recompute checkAttackers for ALL kings on the board — generalizes cleanly to
  // future variants with more than 3 kings.
  _updateCheckStatus() {
    this.checkAttackers = []
    for (const [id, piece] of this.board) {
      if (piece.type !== 'K') continue
      const player = piece.player
      const others = ['red','white','black'].filter(p => p !== player)
      let attackers = []
      for (const opp of others) attackers = attackers.concat(this._attackersOf(id, opp, this.board))
      if (attackers.length > 0) this.checkAttackers.push({ king: id, by: attackers })
    }
  }

  // ── Raw pseudo-legal moves (no check filtering) ──────────────────────────────
  _getRawMoves(cellId, board) {
    const piece = board.get(cellId)
    if (!piece) return { moves:[], captures:[], epCapture:null }
    const occ = id => board.has(id)
    let moves = [], captures = [], epCapture = null

    if (piece.type === 'P') {
      const ep = this.enPassantEnabled ? this.enPassant : null
      const r = getPawnMoves(cellId, piece.player, board, ep)
      moves = r.moves; captures = r.captures; epCapture = r.epCapture
    } else {
      let raw = new Set()
      if (piece.type === 'K') raw = getKingMoves(cellId)
      else if (piece.type === 'R') raw = getRookMoves(cellId, occ)
      else if (piece.type === 'B') raw = getBishopMoves(cellId, occ)
      else if (piece.type === 'Q') raw = getQueenMoves(cellId, occ)
      else if (piece.type === 'N') raw = getKnightMoves(cellId)
      raw.forEach(id => {
        const o = board.get(id)
        if (!o) moves.push(id)
        else if (o.player !== piece.player) captures.push(id)
      })
    }
    return { moves, captures, epCapture }
  }

  // ── Castling moves available for a king at `cellId` right now ────────────────
  _getCastleMoves(cellId) {
    const piece = this.board.get(cellId)
    if (!piece || piece.type !== 'K' || piece.hasMoved) return []
    const cfg = CASTLE_CONFIG[piece.player]
    if (!cfg || cfg.king !== cellId) return []

    const aliveKings = ['red','white','black'].filter(p => this.kingAlive[p])
    const twoKings   = aliveKings.length === 2

    const out = []
    for (const rookInfo of cfg.rooks) {
      const rook = this.board.get(rookInfo.sq)
      if (!rook || rook.type !== 'R' || rook.player !== piece.player || rook.hasMoved) continue

      const info = castleMoveInfo(cfg.king, rookInfo.sq)
      if (!info) continue

      const mustBeEmpty = info.between.filter(c => c !== rookInfo.sq)
      if (mustBeEmpty.some(c => this.board.has(c))) continue

      if (twoKings) {
        const squaresToCheck = [cellId, ...info.crossed]
        let passesThroughCheck = false
        for (const sq of squaresToCheck) {
          const sim = new Map(this.board)
          sim.delete(cellId)
          sim.set(sq, { ...piece, hasMoved: true })
          if (this._isInCheck(piece.player, sim)) { passesThroughCheck = true; break }
        }
        if (passesThroughCheck) continue
      }

      out.push({ kingDest: info.kingDest, rookFrom: rookInfo.sq, rookDest: info.rookDest, side: rookInfo.side })
    }
    return out
  }

  // ── Legal moves with check filtering (only active when exactly 2 kings remain) ─
  _getLegalMoves(cellId) {
    const piece = this.board.get(cellId)
    if (!piece) return { moves:[], captures:[], castles:[], epCapture:null }

    const raw = this._getRawMoves(cellId, this.board)
    const castles = piece.type === 'K' ? this._getCastleMoves(cellId) : []

    const aliveKings = ['red','white','black'].filter(p => this.kingAlive[p])
    const twoKings   = aliveKings.length === 2

    if (!twoKings) return { moves: raw.moves, captures: raw.captures, castles, epCapture: raw.epCapture }

    // Simulate a move; en passant also removes the passed pawn (not on `to`).
    const simulateMove = to => {
      const sim = new Map(this.board)
      sim.delete(cellId)
      if (raw.epCapture && raw.epCapture.to === to) sim.delete(raw.epCapture.capturedCell)
      sim.set(to, { ...piece, hasMoved: true })
      return sim
    }

    const filterArr = arr => arr.filter(to => !this._isInCheck(piece.player, simulateMove(to)))

    const filteredCaptures = filterArr(raw.captures)
    // If the en passant destination got filtered out (would leave own king in check), drop epCapture too.
    const epCapture = (raw.epCapture && filteredCaptures.includes(raw.epCapture.to)) ? raw.epCapture : null

    return { moves: filterArr(raw.moves), captures: filteredCaptures, castles, epCapture }
  }

  _hasAnyLegalMove(player) {
    for (const [id, piece] of this.board) {
      if (piece.player !== player) continue
      const { moves, captures, castles } = this._getLegalMoves(id)
      if (moves.length > 0 || captures.length > 0 || castles.length > 0) return true
    }
    return false
  }

  // ── Click handler ────────────────────────────────────────────────────────────
  _handleClick(cellId) {
    if (this.gameOver || this.pendingPromotion) return
    if (!cellId) { this._deselect(); return }

    if (this.selected) {
      if (this.validMoves.includes(cellId) || this.validCaptures.includes(cellId)) {
        this._executeMove(this.selected, cellId)
        return
      }
      const castle = this.validCastles?.find(c => c.kingDest === cellId)
      if (castle) { this._executeCastle(this.selected, castle); return }

      const p = this.board.get(cellId)
      if (p && p.player === this.currentPlayer) { this._selectCell(cellId); return }
      this._deselect(); return
    }

    const p = this.board.get(cellId)
    if (p && p.player === this.currentPlayer) this._selectCell(cellId)
  }

  _deselect() {
    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.render()
  }

  _selectCell(cellId) {
    this.selected = cellId
    const r = this._getLegalMoves(cellId)
    this.validMoves = r.moves; this.validCaptures = r.captures; this.validCastles = r.castles || []
    this.validEpCapture = r.epCapture || null
    this.render()
  }

  // ── Execute a castle move ─────────────────────────────────────────────────────
  _executeCastle(kingFrom, castle) {
    const king = this.board.get(kingFrom)
    const rook = this.board.get(castle.rookFrom)
    this.board.delete(kingFrom)
    this.board.delete(castle.rookFrom)
    this.board.set(castle.kingDest, { ...king, hasMoved: true })
    this.board.set(castle.rookDest, { ...rook, hasMoved: true })
    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.enPassant = null
    this._finishTurn()
  }

  // ── Execute a normal move/capture (including en passant) ─────────────────────
  _executeMove(from, to) {
    const piece    = this.board.get(from)
    const isEnPassantCapture = !!(this.validEpCapture && this.validEpCapture.to === to)
    const captured = isEnPassantCapture
      ? this.board.get(this.validEpCapture.capturedCell)
      : this.board.get(to)

    // Detect a fresh double-step BEFORE mutating the board, to seed next ply's en passant window.
    let nextEnPassant = null
    if (piece.type === 'P') {
      const seq = pawnSeq(from[0], piece.player, from)
      const idx = seq.indexOf(from)
      if (idx >= 0 && seq[idx+2] === to) {
        nextEnPassant = { pawnCell: to, skippedCell: seq[idx+1], player: piece.player }
      }
    }

    this.board.delete(from)
    if (isEnPassantCapture) this.board.delete(this.validEpCapture.capturedCell)
    this.board.set(to, { ...piece, hasMoved: true })

    if (captured && captured.type === 'K') {
      this.kingAlive[captured.player]  = false
      this.eliminated[captured.player] = true
    }

    this.selected = null; this.validMoves = []; this.validCaptures = []; this.validCastles = []; this.validEpCapture = null
    this.enPassant = this.enPassantEnabled ? nextEnPassant : null

    const aliveKings = ['red','white','black'].filter(p => this.kingAlive[p])
    if (aliveKings.length === 1) {
      this.winner         = aliveKings[0]
      this.gameOver       = true
      this.gameOverReason = 'capture'
      this._updateCheckStatus()
      this._updateHUD(); this.render()
      return
    }

    if (piece.type === 'P' && isPromotion(to, piece.player)) {
      this.pendingPromotion = { from, to, player: piece.player }
      this._updateCheckStatus()
      this._updateHUD(); this.render()
      this._showPromotionPicker(to, piece.player)
      return
    }

    this._finishTurn()
  }

  // Called externally (index.html) when the player picks a promotion piece.
  choosePromotion(type) {
    if (!this.pendingPromotion) return
    const { to, player } = this.pendingPromotion
    this.board.set(to, { player, type, hasMoved: true })
    this.pendingPromotion = null
    this._hidePromotionPicker()
    this._finishTurn()
  }

  // ── Post-move bookkeeping: advance turn, check / checkmate / stalemate ──────
  _finishTurn() {
    const aliveKings = ['red','white','black'].filter(p => this.kingAlive[p])
    const twoKings   = aliveKings.length === 2

    const order = ['red','white','black']
    let next = order[(order.indexOf(this.currentPlayer) + 1) % 3]
    let tries = 0
    while (this.eliminated[next] && tries < 3) {
      next = order[(order.indexOf(next) + 1) % 3]
      tries++
    }
    this.currentPlayer = next

    // En passant window expires when the player who double-stepped takes their next turn.
    if (this.enPassant?.player === next) this.enPassant = null

    this._updateCheckStatus()

    if (twoKings) {
      const inCheck = this.checkAttackers.some(c => {
        const kp = this.board.get(c.king)
        return kp && kp.player === next
      })
      const hasMove = this._hasAnyLegalMove(next)

      if (!hasMove) {
        if (inCheck) {
          const opponent = aliveKings.find(p => p !== next)
          this.winner         = opponent
          this.gameOver       = true
          this.gameOverReason = 'checkmate'
        } else {
          this.gameOver       = true
          this.gameOverReason = 'stalemate'
          this.winner = this.stalemateMode === 'loss'
            ? aliveKings.find(p => p !== next)
            : null
        }
      }
    }

    this._updateHUD()
    this.render()
  }

  // ── Promotion picker UI hooks (DOM overlay lives in index.html) ─────────────
  _showPromotionPicker(cell, player) {
    this.canvas.dispatchEvent(new CustomEvent('promotion', { detail:{ cell, player }, bubbles:true }))
  }
  _hidePromotionPicker() {
    this.canvas.dispatchEvent(new CustomEvent('promotionDone', { bubbles:true }))
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  _updateHUD() {
    if (!this.hudEl) return
    const PCOLORS = { red:'#ffffff', white: this.p3Colour, black:'#000000' }
    const PTXT    = { red:'#000000', white: this._textFor(this.p3Colour), black:'#ffffff' }
    const PNAMES  = { red:'P1', white:'P2', black:'P3' }

    if (this.gameOver) {
      if (this.gameOverReason === 'stalemate' && this.winner === null) {
        this.hudEl.badge.textContent = 'Draw'
        this.hudEl.badge.style.background = '#555'
        this.hudEl.badge.style.color = '#fff'
        this.hudEl.status.textContent = 'Stalemate'
      } else if (this.winner) {
        const reason = this.gameOverReason === 'checkmate' ? 'Checkmate'
                    : this.gameOverReason === 'stalemate' ? 'Stalemate'
                    : 'King captured'
        this.hudEl.badge.textContent = `${PNAMES[this.winner]} wins! 👑`
        this.hudEl.badge.style.background = PCOLORS[this.winner]
        this.hudEl.badge.style.color = PTXT[this.winner]
        this.hudEl.status.textContent = reason
      }
    } else if (this.pendingPromotion) {
      const p = this.pendingPromotion.player
      this.hudEl.badge.textContent = PNAMES[p]
      this.hudEl.badge.style.background = PCOLORS[p]
      this.hudEl.badge.style.color = PTXT[p]
      this.hudEl.status.textContent = 'Choose promotion piece'
    } else {
      const elim = ['red','white','black'].filter(p => this.eliminated[p]).map(p => PNAMES[p])
      this.hudEl.badge.textContent = PNAMES[this.currentPlayer]
      this.hudEl.badge.style.background = PCOLORS[this.currentPlayer]
      this.hudEl.badge.style.color = PTXT[this.currentPlayer]
      const inCheckNow = this.checkAttackers.some(c => {
        const kp = this.board.get(c.king); return kp && kp.player === this.currentPlayer
      })
      const checkNote = inCheckNow ? ' · Check!' : ''
      this.hudEl.status.textContent = elim.length
        ? `${elim.join(', ')} eliminated (pieces remain)${checkNote}`
        : checkNote.trim()
    }
  }

  toggleCoords() { this.showCoords = !this.showCoords; this.render() }
  setStalemateMode(mode) { this.stalemateMode = mode }
  setEnPassantEnabled(enabled) {
    this.enPassantEnabled = enabled
    if (!enabled) this.enPassant = null
    // Refresh current selection highlights in case en passant was being shown
    if (this.selected) this._selectCell(this.selected)
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  render() {
    this._drawBoard()
    this._drawHighlights()
    this._drawPieces()
    this._drawCheckIndicators()
    if (this.showCoords) this._drawCoords()
    if (this.gameOver)   this._drawEndOverlay()
  }

  _drawBoard() {
    const {ctx, S, sc} = this
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, S, S)

    ctx.beginPath()
    for (let i=0;i<6;i++){const[x,y]=this._v(i);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}
    ctx.closePath(); ctx.fillStyle = '#ddd5c0'; ctx.fill()

    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 0.7 * sc
    for (let i=1;i<7;i++){
      const a=this._lp(this._v(i-1),this._v(i),.625), b=this._lp(this._v(i-1),this._v(i),.75)
      const c2=this._lp(this._v(i-1),this._v(i),.875), g=this._lp(this._v(i-1),this._v(i),.125)
      const h=this._lp(this._v(i-1),this._v(i),.25),   k=this._lp(this._v(i-1),this._v(i),.375)
      const d=this._lp(this._lp(this._v(i),this._v(i+1),.5),this._lp(this._v(i+3),this._v(i+4),.5),.125)
      const e=this._lp(this._lp(this._v(i),this._v(i+1),.5),this._lp(this._v(i+3),this._v(i+4),.5),.25)
      const f=this._lp(this._lp(this._v(i),this._v(i+1),.5),this._lp(this._v(i+3),this._v(i+4),.5),.375)
      const j=this._lp(this._lp(this._v(i+1),this._v(i+2),.5),this._lp(this._v(i+4),this._v(i+5),.5),.625)
      const l2=this._lp(this._lp(this._v(i+1),this._v(i+2),.5),this._lp(this._v(i+4),this._v(i+5),.5),.75)
      const m=this._lp(this._lp(this._v(i+1),this._v(i+2),.5),this._lp(this._v(i+4),this._v(i+5),.5),.875)
      this._ln(a,f);this._ln(b,e);this._ln(c2,d);this._ln(g,m);this._ln(h,l2);this._ln(k,j)
    }
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1 * sc
    for (let i=0;i<3;i++) this._ln(this._mp(i), this._mp(i+3))

    ctx.strokeStyle = '#1a0f08'; ctx.lineWidth = 2.5 * sc
    ctx.beginPath()
    for (let i=0;i<6;i++){const[x,y]=this._v(i);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)}
    ctx.closePath(); ctx.stroke()

    this._drawTerritoryLabels()
  }

  _drawTerritoryLabels() {
    const {ctx, sc, cx, cy, R} = this
    const PCOLORS = { red:'#ecf0f1', white:this.p3Colour, black:'#000000' }
    const PNAMES  = { red:'P1',     white:'P2',   black:'P3'   }

    ctx.save()
    ctx.font = `bold ${Math.round(15*sc)}px system-ui`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4

    // Place each label directly beyond the midpoint of its player's hex edge,
    // pushed outward 14% past the hex radius so it sits clearly in the margin.
    // Hex midpoints: Red=bottom(90°), White=lower-left(210°), Black=upper-right(330°)
    // Red radius is slightly tighter so the label clears the bottom of typical viewports
    const labelAngles = { red: Math.PI/2, white: Math.PI/2 + 2*Math.PI/3, black: Math.PI/2 - 2*Math.PI/3 }
    const labelRadii  = { red: R * 1.085, white: R * 1.14, black: R * 1.14 }

    for (const [player, angle] of Object.entries(labelAngles)) {
      const lx = cx + labelRadii[player] * Math.cos(angle)
      const ly = cy + labelRadii[player] * Math.sin(angle)
      ctx.fillStyle = this.eliminated[player] ? '#555' : '#fff'
      ctx.fillText(this.eliminated[player] ? `${PNAMES[player]} ✕` : PNAMES[player], lx, ly)
    }

    ctx.restore()
  }

  _ln(p, q) {
    this.ctx.beginPath(); this.ctx.moveTo(p[0],p[1]); this.ctx.lineTo(q[0],q[1]); this.ctx.stroke()
  }

  _drawHighlights() {
    const {ctx, sc} = this
    const pr = 15 * sc

    if (this.selected && ORIG[this.selected]) {
      const [x,y] = this._sc2(this.selected)
      ctx.beginPath(); ctx.arc(x,y,pr*1.5,0,Math.PI*2)
      ctx.fillStyle = 'rgba(255,210,0,.5)'; ctx.fill()
    }
    this.validMoves.forEach(id => {
      if (!ORIG[id]) return
      const [x,y] = this._sc2(id)
      ctx.beginPath(); ctx.arc(x,y,pr*.5,0,Math.PI*2)
      ctx.fillStyle = 'rgba(60,200,60,.75)'; ctx.fill()
    })
    this.validCaptures.forEach(id => {
      if (!ORIG[id]) return
      const [x,y] = this._sc2(id)
      ctx.beginPath(); ctx.arc(x,y,pr*1.3,0,Math.PI*2)
      ctx.strokeStyle = 'rgba(220,40,40,.9)'; ctx.lineWidth = 2.5*sc; ctx.stroke()
    })
    // En passant gets an extra inner ring to mark it as special
    if (this.validEpCapture && ORIG[this.validEpCapture.to]) {
      const [x,y] = this._sc2(this.validEpCapture.to)
      ctx.beginPath(); ctx.arc(x,y,pr*0.85,0,Math.PI*2)
      ctx.strokeStyle = 'rgba(180,80,255,.9)'; ctx.lineWidth = 1.8*sc; ctx.stroke()
    }
    ;(this.validCastles || []).forEach(c => {
      if (!ORIG[c.kingDest]) return
      const [x,y] = this._sc2(c.kingDest)
      ctx.beginPath(); ctx.arc(x,y,pr*.6,0,Math.PI*2)
      ctx.fillStyle = 'rgba(120,160,255,.75)'; ctx.fill()
    })
  }

  // Small red highlight ring around every piece currently giving check, for every
  // king on the board — generalizes cleanly to variants with more kings later.
  _drawCheckIndicators() {
    const {ctx, sc} = this
    if (!this.checkAttackers || this.checkAttackers.length === 0) return
    const ringR = 13 * sc
    const seen = new Set()
    for (const entry of this.checkAttackers) {
      for (const attackerId of entry.by) {
        if (seen.has(attackerId) || !ORIG[attackerId]) continue
        seen.add(attackerId)
        const [x, y] = this._sc2(attackerId)
        ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI*2)
        ctx.strokeStyle = '#ff2d2d'; ctx.lineWidth = 2.2 * sc
        ctx.shadowColor = '#ff2d2d'; ctx.shadowBlur = 6 * sc
        ctx.stroke()
        ctx.shadowBlur = 0
      }
      if (ORIG[entry.king]) {
        const [kx, ky] = this._sc2(entry.king)
        ctx.beginPath(); ctx.arc(kx, ky, ringR*1.15, 0, Math.PI*2)
        ctx.strokeStyle = 'rgba(255,45,45,0.55)'; ctx.lineWidth = 1.6*sc
        ctx.stroke()
      }
    }
  }

  _drawPieces() {
    const {ctx, sc} = this
    const pr = 13 * sc
    const fs = Math.round(16 * sc)
    const SYMS = {K:{l:'♔',d:'♚'},Q:{l:'♕',d:'♛'},R:{l:'♖',d:'♜'},B:{l:'♗',d:'♝'},N:{l:'♘',d:'♞'},P:{l:'♙',d:'♟'}}
    const sym  = (type, player) => SYMS[type]?.[player==='white'?'l':'d'] ?? '?'
    const PCOLORS = { red:'#f0e8d0', white:this.p3Colour, black:'#000000' }
    const PTXT    = { red:'#000000',    white:this._textFor(this.p3Colour),     black:'#fff'    }

    this.board.forEach((piece, id) => {
      if (!ORIG[id]) return
      const [x, y] = this._sc2(id)
      ctx.globalAlpha = this.eliminated[piece.player] ? 0.38 : 1.0

      const img = this._pieceImgs?.[piece.type]
      if (img) {
        // SVG loaded: draw coloured backing circle + image on top
        ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI*2)
        ctx.fillStyle = PCOLORS[piece.player]; ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1*sc; ctx.stroke()
        // Draw SVG centred, slightly smaller than the circle
        const d = pr * 1.55
        ctx.drawImage(img, x - d/2, y - d/2, d, d)
      } else {
        // Fallback: coloured circle + Unicode symbol
        ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI*2)
        ctx.fillStyle = PCOLORS[piece.player]; ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1*sc; ctx.stroke()
        ctx.font = `${fs}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = PTXT[piece.player]
        ctx.fillText(sym(piece.type, piece.player), x, y + 0.5)
      }

      ctx.globalAlpha = 1.0
    })
  }

  _drawCoords() {
    const {ctx, sc} = this
    const fs = Math.max(9, Math.round(10 * sc))
    ctx.font = `${fs}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const id of Object.keys(ORIG)) {
      const [x, y] = this._sc2(id)
      const ly = y - 16 * sc   // sit above the piece circle
      const tw = ctx.measureText(id).width
      // Dark pill background
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      ctx.roundRect(x - tw/2 - 2, ly - fs/2 - 1, tw + 4, fs + 2, 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(id, x, ly)
    }
  }

  _drawEndOverlay() {
    const {ctx, S, winner, gameOverReason} = this
    const PCOLORS = { red:'#ecf0f1', white:this.p3Colour, black:'#000000' }
    const PNAMES  = { red:'P1',     white:'P2',   black:'P3'   }

    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, S, S)

    const bw = S * 0.58, bh = S * 0.14
    const bx = (S - bw) / 2, by = (S - bh) / 2
    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill()

    const isDraw = gameOverReason === 'stalemate' && winner === null
    const borderCol = isDraw ? '#888' : PCOLORS[winner]
    ctx.strokeStyle = borderCol; ctx.lineWidth = 2; ctx.stroke()

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = `bold ${Math.round(S * 0.042)}px system-ui`

    if (isDraw) {
      ctx.fillStyle = '#ccc'
      ctx.fillText('Stalemate, Draw', S/2, by + bh * 0.38)
    } else {
      ctx.fillStyle = PCOLORS[winner]
      const headline = gameOverReason === 'checkmate' ? `${PNAMES[winner]} wins! Checkmate 👑`
                     : gameOverReason === 'stalemate' ? `${PNAMES[winner]} wins! Stalemate 👑`
                     : `${PNAMES[winner]} wins! 👑`
      ctx.fillText(headline, S/2, by + bh * 0.38)
    }

    ctx.font = `${Math.round(S * 0.021)}px system-ui`
    ctx.fillStyle = '#aaa'
    const sub = gameOverReason === 'checkmate' ? 'No legal moves (king is in check)'
              : gameOverReason === 'stalemate' ? 'No legal moves (king not in check)'
              : 'King captured'
    ctx.fillText(`${sub} · Press Reset to play again`, S/2, by + bh * 0.72)
  }

  _nearestCell(px, py) {
    const thresh = 20 * this.sc; let best = null, bd = Infinity
    for (const id of Object.keys(ORIG)) {
      const [x,y] = this._sc2(id), d = Math.hypot(px-x, py-y)
      if (d < thresh && d < bd) { bd = d; best = id }
    }
    return best
  }

  _textFor(hex) {
    const r = parseInt(hex.slice(1,3),16)
    const g = parseInt(hex.slice(3,5),16)
    const b = parseInt(hex.slice(5,7),16)
    return (r + g + b) < 300 ? '#fff' : '#000'
  }
}

window.buildBoard = buildBoard
window.renderBoard = renderBoard
window.TwoPlayerGame = TwoPlayerGame
window.ThreePlayerGame = ThreePlayerGame
window.FourPlayerGame = FourPlayerGame