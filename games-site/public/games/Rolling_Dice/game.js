// Canvas
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const W = canvas.width  = 480;
const H = canvas.height = 400;

// Constants
const RESTITUTION      = 0.38;  // more speed lost on wall bounce
const BASE_FRICTION    = 0.994; // less general drag between bounces
const WALL_FRICTION    = 0.70;  // more speed lost on wall contact
const SETTLE_SPEED     = 0.5;
const TRAY_PAD         = 14;
const GRAVITY          = 0.045;
const V_RESTITUT       = 0.50;
const FLOOR_FRIC       = 0.74;  // more speed lost on floor bounce
const DRAG_THRESH      = 0.12;
const DRAG_MAX         = 0.72;
const SLERP_FRAMES     = 28;
// Rolling contact: omega applied per frame when sliding on floor
// omega = spd * ROLL_COEFF — tuned so a fast slide looks like a convincing roll
const ROLL_COEFF       = 0.06;
// Bounce-recoil: on floor contact when nearly stopped, kick adds spin
const RECOIL_H_THRESH  = 0.35;
const ROT_COEFF        = 0.95;
const AUTO_SKIP_COUNT  = 100;

// 3D Math
function mulMV(m, v) {
  return [
    m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
    m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
    m[6]*v[0]+m[7]*v[1]+m[8]*v[2],
  ];
}
function mulMM(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ];
}
function proj(p) { return [p[0], -p[1]]; }

function normV(v) {
  const l = Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);
  return l < 1e-12 ? [0,1,0] : [v[0]/l, v[1]/l, v[2]/l];
}

function rotateFromTo(from, to) {
  const cx = from[1]*to[2]-from[2]*to[1];
  const cy = from[2]*to[0]-from[0]*to[2];
  const cz = from[0]*to[1]-from[1]*to[0];
  const sinA = Math.sqrt(cx*cx+cy*cy+cz*cz);
  const cosA = from[0]*to[0]+from[1]*to[1]+from[2]*to[2];
  if (sinA < 1e-9) {
    if (cosA > 0) return [1,0,0, 0,1,0, 0,0,1];
    const px = Math.abs(from[0]) < 0.9 ? 1 : 0;
    const py = Math.abs(from[0]) < 0.9 ? 0 : 1;
    const qx = from[1]*0-from[2]*py, qy = from[2]*px-from[0]*0, qz = from[0]*py-from[1]*px;
    const ql = Math.sqrt(qx*qx+qy*qy+qz*qz);
    const k = [qx/ql, qy/ql, qz/ql];
    return [2*k[0]*k[0]-1, 2*k[0]*k[1], 2*k[0]*k[2],
            2*k[1]*k[0], 2*k[1]*k[1]-1, 2*k[1]*k[2],
            2*k[2]*k[0], 2*k[2]*k[1], 2*k[2]*k[2]-1];
  }
  const k = [cx/sinA, cy/sinA, cz/sinA];
  const t = 1-cosA, s = sinA;
  return [
    t*k[0]*k[0]+cosA,   t*k[0]*k[1]-s*k[2], t*k[0]*k[2]+s*k[1],
    t*k[1]*k[0]+s*k[2], t*k[1]*k[1]+cosA,   t*k[1]*k[2]-s*k[0],
    t*k[2]*k[0]-s*k[1], t*k[2]*k[1]+s*k[0], t*k[2]*k[2]+cosA,
  ];
}

function rotAxis(ax, ay, az, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), t = 1-c;
  return [
    t*ax*ax+c,    t*ax*ay-s*az, t*ax*az+s*ay,
    t*ay*ax+s*az, t*ay*ay+c,    t*ay*az-s*ax,
    t*az*ax-s*ay, t*az*ay+s*ax, t*az*az+c,
  ];
}

function Rz(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return [c,-s,0, s,c,0, 0,0,1];
}

function slerpM(A, B, t) {
  const AT = [A[0],A[3],A[6], A[1],A[4],A[7], A[2],A[5],A[8]];
  const R  = mulMM(B, AT);
  const cosA = Math.max(-1, Math.min(1, (R[0]+R[4]+R[8]-1)/2));
  const angle = Math.acos(cosA);
  if (angle < 1e-6) return A;
  const s = 1/(2*Math.sin(angle));
  const ax = (R[7]-R[5])*s, ay = (R[2]-R[6])*s, az = (R[3]-R[1])*s;
  return mulMM(rotAxis(ax, ay, az, angle * t), A);
}

// How far current matrix is from snapM (0=identical, 1=180deg apart)
// Used to scale the recoil coefficient
function rotDist(M, snapM) {
  const AT = [snapM[0],snapM[3],snapM[6], snapM[1],snapM[4],snapM[7], snapM[2],snapM[5],snapM[8]];
  const R  = mulMM(M, AT);
  const cosA = Math.max(-1, Math.min(1, (R[0]+R[4]+R[8]-1)/2));
  return Math.acos(cosA) / Math.PI; // 0..1
}

// D6 geometry
const CUBE_VERTS = [
  [-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],
  [-0.5,-0.5,0.5], [0.5,-0.5,0.5], [0.5,0.5,0.5], [-0.5,0.5,0.5],
];
const CUBE_FACES = [
  {verts:[3,2,1,0], normal:[0,0,-1], val:1},
  {verts:[4,5,6,7], normal:[0,0, 1], val:6},
  {verts:[0,1,5,4], normal:[0,-1,0], val:2},
  {verts:[7,6,2,3], normal:[0, 1,0], val:5},
  {verts:[0,4,7,3], normal:[-1,0,0], val:3},
  {verts:[1,2,6,5], normal:[ 1,0,0], val:4},
];

// D4 geometry
const _r = 0.6;
const D4V = [
  [ Math.sqrt(8/9)*_r, -1/3*_r,  0                 ],
  [-Math.sqrt(2/9)*_r, -1/3*_r,  Math.sqrt(2/3)*_r ],
  [-Math.sqrt(2/9)*_r, -1/3*_r, -Math.sqrt(2/3)*_r ],
  [ 0,                  _r,       0                 ],
];
const D4_FACES = [
  {verts:[0,2,1], val:1},
  {verts:[0,1,3], val:2},
  {verts:[1,2,3], val:3},
  {verts:[2,0,3], val:4},
];
const D4_CORNER_VALS = D4_FACES.map(face =>
  face.verts.map(vi => D4_FACES.find(f => !f.verts.includes(vi)).val)
);

// D8 geometry - regular octahedron, scaled to r=0.7
const _r8 = 0.7;
const D8V = [[_r8,0,0],[-_r8,0,0],[0,_r8,0],[0,-_r8,0],[0,0,_r8],[0,0,-_r8]];
const D8_FACES = [
  {verts:[0,2,4],val:1},{verts:[2,1,4],val:2},{verts:[1,3,4],val:3},{verts:[3,0,4],val:4},
  {verts:[2,0,5],val:5},{verts:[1,2,5],val:6},{verts:[3,1,5],val:7},{verts:[0,3,5],val:8},
];

// D10 geometry - pentagonal trapezohedron
const D10V = [];
for(let i=0;i<5;i++){const a=(i/5)*2*Math.PI; D10V.push([Math.cos(a),0.4,Math.sin(a)]);}
for(let i=0;i<5;i++){const a=(i/5)*2*Math.PI+Math.PI/5; D10V.push([Math.cos(a),-0.4,Math.sin(a)]);}
D10V.push([0,1.2,0]);  // 10 = top pole
D10V.push([0,-1.2,0]); // 11 = bottom pole
// Scale to unit sphere approx
const _d10scale = 0.6/Math.sqrt(1+0.16);
D10V.forEach((v,i)=>{ D10V[i]=[v[0]*_d10scale,v[1]*_d10scale,v[2]*_d10scale]; });
D10V[10]=[0, 1.2*_d10scale, 0]; D10V[11]=[0,-1.2*_d10scale,0];
const D10_FACES = [
  {verts:[10,1,5,0],val:1},{verts:[11,5,1,6],val:2},
  {verts:[10,2,6,1],val:3},{verts:[11,6,2,7],val:4},
  {verts:[10,3,7,2],val:5},{verts:[11,7,3,8],val:6},
  {verts:[10,4,8,3],val:7},{verts:[11,8,4,9],val:8},
  {verts:[10,0,9,4],val:9},{verts:[11,9,0,5],val:10},
];

// D12 geometry - regular dodecahedron
const _phi = (1+Math.sqrt(5))/2;
const _D12raw = [
  [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],
  [-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
  [0,1/_phi,_phi],[0,-1/_phi,_phi],[0,1/_phi,-_phi],[0,-1/_phi,-_phi],
  [1/_phi,_phi,0],[-1/_phi,_phi,0],[1/_phi,-_phi,0],[-1/_phi,-_phi,0],
  [_phi,0,1/_phi],[_phi,0,-1/_phi],[-_phi,0,1/_phi],[-_phi,0,-1/_phi],
];
const D12V = _D12raw.map(v=>{const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return[v[0]/l*0.65,v[1]/l*0.65,v[2]/l*0.65];});
const D12_FACES = [
  {verts:[0,12,13,4,8],val:1},{verts:[0,8,9,2,16],val:2},{verts:[0,16,17,1,12],val:3},
  {verts:[1,10,5,13,12],val:4},{verts:[1,17,3,11,10],val:5},{verts:[2,9,6,15,14],val:6},
  {verts:[2,14,3,17,16],val:7},{verts:[3,14,15,7,11],val:8},{verts:[4,18,6,9,8],val:9},
  {verts:[4,13,5,19,18],val:10},{verts:[5,10,11,7,19],val:11},{verts:[6,18,19,7,15],val:12},
];

// D20 geometry - regular icosahedron
const _D20raw = [
  [0,1,_phi],[0,-1,_phi],[0,1,-_phi],[0,-1,-_phi],
  [1,_phi,0],[-1,_phi,0],[1,-_phi,0],[-1,-_phi,0],
  [_phi,0,1],[_phi,0,-1],[-_phi,0,1],[-_phi,0,-1],
];
const D20V = _D20raw.map(v=>{const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return[v[0]/l*0.65,v[1]/l*0.65,v[2]/l*0.65];});
const D20_FACES = [
  {verts:[0,1,8]},{verts:[0,10,1]},{verts:[0,4,5]},{verts:[0,8,4]},{verts:[0,5,10]},
  {verts:[1,7,6]},{verts:[1,6,8]},{verts:[1,10,7]},{verts:[2,9,3]},{verts:[2,3,11]},
  {verts:[2,5,4]},{verts:[2,4,9]},{verts:[2,11,5]},{verts:[3,6,7]},{verts:[3,9,6]},
  {verts:[3,7,11]},{verts:[4,8,9]},{verts:[5,11,10]},{verts:[6,9,8]},{verts:[7,10,11]},
].map((f,i)=>({...f, val:i+1}));

// Face canvas pre-rendering
const FS = 128;

function makeD6Canvas(val) {
  const fc=document.createElement('canvas'); fc.width=fc.height=FS;
  const c=fc.getContext('2d');
  c.fillStyle='#d42040';
  c.beginPath(); c.roundRect(3,3,FS-6,FS-6,10); c.fill();
  c.fillStyle='#ffffff';
  c.font=`bold ${FS*0.52}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(String(val), FS/2, FS/2);
  return fc;
}
function makeD4Canvas(cornerVals) {
  const fc=document.createElement('canvas'); fc.width=fc.height=FS;
  const c=fc.getContext('2d');
  const tx=[FS/2,FS-8,8], ty=[8,FS-8,FS-8];
  c.fillStyle='#00b8c8';
  c.beginPath(); c.moveTo(tx[0],ty[0]); c.lineTo(tx[1],ty[1]); c.lineTo(tx[2],ty[2]); c.closePath(); c.fill();
  c.strokeStyle='rgba(0,60,70,0.5)'; c.lineWidth=2; c.stroke();
  const pos=[
    {x:tx[0],y:ty[0]+20,rot:0},
    {x:tx[1]-18,y:ty[1]-18,rot:-Math.PI*2/3},
    {x:tx[2]+18,y:ty[2]-18,rot:Math.PI*2/3},
  ];
  c.fillStyle='#ffffff'; c.font=`bold ${FS*0.22}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  pos.forEach(({x,y,rot},i)=>{ c.save(); c.translate(x,y); c.rotate(rot); c.fillText(String(cornerVals[i]),0,0); c.restore(); });
  return fc;
}
// Generic triangle face canvas (D8, D20)
function makeTriCanvas(val, color) {
  const fc=document.createElement('canvas'); fc.width=fc.height=FS;
  const c=fc.getContext('2d');
  c.fillStyle=color;
  c.beginPath(); c.moveTo(FS/2,6); c.lineTo(FS-6,FS-6); c.lineTo(6,FS-6); c.closePath(); c.fill();
  c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=2; c.stroke();
  c.fillStyle='#ffffff';
  c.font=`bold ${FS*0.38}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(String(val), FS/2, FS*0.62);
  return fc;
}
// Generic quad face canvas (D10 kite faces)
function makeQuadCanvas(val, color) {
  const fc=document.createElement('canvas'); fc.width=fc.height=FS;
  const c=fc.getContext('2d');
  c.fillStyle=color;
  c.beginPath(); c.moveTo(FS/2,6); c.lineTo(FS-6,FS/2); c.lineTo(FS/2,FS-6); c.lineTo(6,FS/2); c.closePath(); c.fill();
  c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=2; c.stroke();
  c.fillStyle='#ffffff';
  c.font=`bold ${FS*0.38}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(String(val), FS/2, FS/2);
  return fc;
}
// Generic pentagon face canvas (D12)
function makePentCanvas(val, color) {
  const fc=document.createElement('canvas'); fc.width=fc.height=FS;
  const c=fc.getContext('2d');
  c.fillStyle=color;
  c.beginPath();
  for(let i=0;i<5;i++){
    const a=(i/5)*Math.PI*2 - Math.PI/2;
    const x=FS/2+Math.cos(a)*(FS/2-8), y=FS/2+Math.sin(a)*(FS/2-8);
    i===0?c.moveTo(x,y):c.lineTo(x,y);
  }
  c.closePath(); c.fill();
  c.strokeStyle='rgba(0,0,0,0.3)'; c.lineWidth=2; c.stroke();
  c.fillStyle='#ffffff';
  c.font=`bold ${FS*0.36}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  c.fillText(String(val), FS/2, FS/2+4);
  return fc;
}

const D6C = {};
for (const f of CUBE_FACES) D6C[f.val] = makeD6Canvas(f.val);
const D4C = D4_FACES.map((f,i) => makeD4Canvas(D4_CORNER_VALS[i]));
const D8C  = {}; for(const f of D8_FACES)  D8C[f.val]  = makeTriCanvas(f.val,  '#2a7a3a');
const D10C = {}; for(const f of D10_FACES) D10C[f.val] = makeQuadCanvas(f.val, '#7a7a8a');
const D12C = {}; for(const f of D12_FACES) D12C[f.val] = makePentCanvas(f.val, '#6a2a9a');
const D20C = {}; for(const f of D20_FACES) D20C[f.val] = makeTriCanvas(f.val,  '#b89000');

// Affine pattern mapping
function setPatTrans(pat, p0, p1, p3) {
  const a=(p1[0]-p0[0])/FS, b=(p1[1]-p0[1])/FS;
  const cc=(p3[0]-p0[0])/FS, d=(p3[1]-p0[1])/FS;
  pat.setTransform(new DOMMatrix([a,b,cc,d,p0[0],p0[1]]));
}
function drawQuad(fc, pts, sc, cx, cy) {
  const T = p => [p[0]*sc+cx, p[1]*sc+cy];
  const [p0,p1,p2,p3] = pts.map(T);
  const pat = ctx.createPattern(fc,'no-repeat');
  setPatTrans(pat, p0, p1, p3);
  ctx.fillStyle = pat;
  ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]);
  ctx.lineTo(p2[0],p2[1]); ctx.lineTo(p3[0],p3[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();
}

// Generic settle pose: rotate the face normal to face the camera (+Z)
// Works for any convex die where faces have clear outward normals.
function settlePoseGeneric(faceNormal, symmetry) {
  const Rbase = rotateFromTo(faceNormal, [0,0,1]);
  const k     = Math.floor(Math.random()*symmetry);
  return mulMM(Rz(k * Math.PI*2/symmetry), Rbase);
}
// Compute outward face normal from vertex indices + vertex array
function faceNormal(verts, vArr) {
  const [a,b,c] = verts.slice(0,3).map(i=>vArr[i]);
  const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2];
  const bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
  return normV([ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx]);
}

// Generic triangle face draw (D8, D20)
function drawTriFaces(die, vArr, faces, faceCanvases) {
  const m  = die.curM;
  const tv = vArr.map(v => mulMV(m,v));
  const sc = die.scale, cx=die.x, cy=die.y2d;
  const pv = tv.map(v => [v[0]*sc+cx, -v[1]*sc+cy]);
  faces.map((f,fi) => {
    const [i0,i1,i2] = f.verts;
    const avgZ = (tv[i0][2]+tv[i1][2]+tv[i2][2])/3;
    const ax=pv[i1][0]-pv[i0][0], ay=pv[i1][1]-pv[i0][1];
    const bx=pv[i2][0]-pv[i0][0], by=pv[i2][1]-pv[i0][1];
    return {f, fi, avgZ, visible: ax*by-ay*bx > 0};
  }).sort((a,b)=>a.avgZ-b.avgZ).forEach(({f,fi,visible})=>{
    if (!visible) return;
    const [i0,i1,i2]=f.verts, [p0,p1,p2]=[pv[i0],pv[i1],pv[i2]];
    const fc = faceCanvases[f.val];
    if (fc) {
      const pat=ctx.createPattern(fc,'no-repeat');
      setPatTrans(pat,p0,p1,p2);
      ctx.fillStyle=pat;
    } else {
      ctx.fillStyle='#888';
    }
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    const shade=Math.max(0,Math.min(0.3,0.3-tv[i0][2]*0.25));
    ctx.fillStyle=`rgba(0,0,0,${shade})`;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.stroke();
  });
}

// Generic polygon face draw (D10 quads, D12 pentagons)
function drawPolyFaces(die, vArr, faces, faceCanvases) {
  const m  = die.curM;
  const tv = vArr.map(v => mulMV(m,v));
  const sc = die.scale, cx=die.x, cy=die.y2d;
  const pv = tv.map(v => [v[0]*sc+cx, -v[1]*sc+cy]);
  faces.map(f => {
    const avgZ = f.verts.reduce((s,i)=>s+tv[i][2],0)/f.verts.length;
    const n    = faceNormal(f.verts, tv);
    // visibility: face normal z > 0 means facing camera
    // recompute normal in screen projected space via cross product of first 3 pts
    const [i0,i1,i2]=f.verts;
    const ax=pv[i1][0]-pv[i0][0], ay=pv[i1][1]-pv[i0][1];
    const bx=pv[i2][0]-pv[i0][0], by=pv[i2][1]-pv[i0][1];
    return {f, avgZ, visible: ax*by-ay*bx > 0};
  }).sort((a,b)=>a.avgZ-b.avgZ).forEach(({f,visible})=>{
    if (!visible) return;
    const pts = f.verts.map(i=>pv[i]);
    const fc = faceCanvases[f.val];
    if (fc) {
      const pat=ctx.createPattern(fc,'no-repeat');
      setPatTrans(pat,pts[0],pts[1],pts[pts.length-1]);
      ctx.fillStyle=pat;
    } else {
      ctx.fillStyle='#888';
    }
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.closePath(); ctx.fill();
    const shade=Math.max(0,Math.min(0.3,0.3-tv[f.verts[0]][2]*0.25));
    ctx.fillStyle=`rgba(0,0,0,${shade})`;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
    ctx.closePath(); ctx.stroke();
  });
}
function settlePoseD6(outcome) {
  const face  = CUBE_FACES.find(f => f.val === outcome);
  const Rbase = rotateFromTo(face.normal, [0,0,1]);
  const k     = Math.floor(Math.random()*4);
  return mulMM(Rz(k * Math.PI/2), Rbase);
}
function settlePoseD4(outcome) {
  const face = D4_FACES.find(f => f.val === outcome);
  const [i0,i1,i2] = face.verts;
  const v0=D4V[i0], v1=D4V[i1], v2=D4V[i2];
  const e1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
  const e2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
  let n = normV([e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]);
  const oppVi = [0,1,2,3].find(vi => !face.verts.includes(vi));
  const opp   = D4V[oppVi];
  const fc    = [(v0[0]+v1[0]+v2[0])/3, (v0[1]+v1[1]+v2[1])/3, (v0[2]+v1[2]+v2[2])/3];
  if ((opp[0]-fc[0])*n[0]+(opp[1]-fc[1])*n[1]+(opp[2]-fc[2])*n[2] > 0) n = [-n[0],-n[1],-n[2]];
  const Rbase = rotateFromTo(n, [0,0,-1]);
  const k     = Math.floor(Math.random()*3);
  return mulMM(Rz(k * Math.PI * 2/3), Rbase);
}
function settlePoseD8(outcome)  { return settlePoseGeneric(faceNormal(D8_FACES.find(f=>f.val===outcome).verts, D8V),  3); }
function settlePoseD10(outcome) { return settlePoseGeneric(faceNormal(D10_FACES.find(f=>f.val===outcome).verts, D10V), 2); }
function settlePoseD12(outcome) { return settlePoseGeneric(faceNormal(D12_FACES.find(f=>f.val===outcome).verts, D12V), 5); }
function settlePoseD20(outcome) { return settlePoseGeneric(faceNormal(D20_FACES.find(f=>f.val===outcome).verts, D20V), 3); }

// Build anim path driven by the same initVz as physics, so arc frame counts
// match the physics bounce durations exactly -- no gate freeze.
// Forward: index 0 = snapM, index last = chaotic peak.
// Reversed for playback: animFrame 0 = chaotic, animFrame last = snapM.
function buildAnimPath(snapM, initVz) {
  const RDECAY = 0.78;

  // Bounce sequence: smallest bounce first (forward), largest last
  const bounceVels = [];
  let vUp = initVz;
  while (vUp > 0.06) { bounceVels.push(vUp); vUp *= V_RESTITUT; }
  bounceVels.reverse(); // smallest first

  const nBounces = bounceVels.length;
  // omega at smallest bounce (forward start, playback end = last settle wobble)
  // Must be visibly non-zero so the wobble is perceptible
  const omegaSettle = 0.025 + Math.random()*0.015;
  // omega at largest bounce = omegaSettle / RDECAY^n (grows each step)
  // This means in playback: large omega first, decays by RDECAY each bounce
  const omegaStart = omegaSettle * Math.pow(1/RDECAY, nBounces - 1);

  let omega = omegaStart / Math.pow(1/RDECAY, nBounces - 1); // = omegaSettle
  let axis  = normV([(Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)]);

  const fwdPath     = [snapM];
  const fwdSegments = [];
  let M = snapM;

  for (let bi = 0; bi < bounceVels.length; bi++) {
    const v         = bounceVels[bi];
    const segStart  = fwdPath.length;
    const airFrames = Math.ceil(2 * v / GRAVITY);
    for (let f = 0; f < airFrames; f++) {
      M = mulMM(rotAxis(axis[0], axis[1], axis[2], omega), M);
      fwdPath.push(M);
    }
    fwdSegments.push({ start: segStart, end: fwdPath.length - 1 });
    omega /= RDECAY; // grows toward chaotic end (decays in playback on each bounce)
    // Fresh random axis at each bounce -- sharp direction change on impact
    axis = normV([(Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)]);
  }

  const totalLen = fwdPath.length - 1;
  fwdPath.reverse(); // now index 0 = chaotic, index last = snapM

  // Remap segment indices into reversed array and reverse their order
  // so segments[0] = first playback arc (largest bounce)
  const segments = [...fwdSegments].reverse().map(({start, end}) => ({
    start: totalLen - end,
    end:   totalLen - start,
  }));

  return { path: fwdPath, segments };
}

// Die creation
const DIE_SIDES = {d4:4, d6:6, d8:8, d10:10, d12:12, d20:20};
function getSnapM(type, outcome) {
  switch(type) {
    case 'd4':  return settlePoseD4(outcome);
    case 'd6':  return settlePoseD6(outcome);
    case 'd8':  return settlePoseD8(outcome);
    case 'd10': return settlePoseD10(outcome);
    case 'd12': return settlePoseD12(outcome);
    case 'd20': return settlePoseD20(outcome);
  }
}
function createDie(type, outcome, skipAnim) {
  const dir    = Math.random()*Math.PI*2;
  const snapM  = getSnapM(type, outcome);
  const initVz = 1.6 + Math.random()*0.7;
  const { path: animPath, segments } = buildAnimPath(snapM, initVz);
  return {
    type, outcome,
    x:    W/2 + (Math.random()-0.5)*100,
    y2d:  H/2 + (Math.random()-0.5)*80,
    vx:   Math.cos(dir)*(13.5+Math.random()*13.5),
    vy2d: Math.sin(dir)*(13.5+Math.random()*13.5),
    h:    1.2 + Math.random()*0.8,
    vz:   initVz,
    apex: 0,
    snapM,
    animPath,
    segments,
    segIdx:     0,
    arcVzStart: initVz,
    animFrame:  0,
    curM:       animPath[0],
    settling:   false,
    settleT:    0,
    settleFrom: null,
    phase: skipAnim ? 'done' : 'roll',
    radius: 28,
    scale:  52,
  };
}

// Physics
function stepPhysics() {
  const walls = {left:TRAY_PAD, right:W-TRAY_PAD, top:TRAY_PAD, bottom:H-TRAY_PAD};
  dice.forEach(die => {
    if (die.phase === 'done') return;

    const prevH = die.h;
    die.vz -= GRAVITY;
    die.h  += die.vz;

    const justLanded = prevH > 0.001 && die.h <= 0;

    if (die.h <= 0) {
      die.h  = 0;
      die.vz = Math.abs(die.vz) * V_RESTITUT;
      die.apex = (die.vz*die.vz) / (2*GRAVITY);
      die.vx   *= FLOOR_FRIC;
      die.vy2d *= FLOOR_FRIC;

      if (justLanded) {
        // Advance to next anim segment on every real floor contact
        const nextSeg = die.segIdx + 1;
        if (nextSeg < die.segments.length) {
          die.segIdx     = nextSeg;
          die.arcVzStart = die.vz;
        }
        // Reset apex when bounce is negligible so settle condition can trigger
        if (die.vz < 0.08) die.apex = 0;
        // Small directional deflection
        const spd = Math.sqrt(die.vx*die.vx + die.vy2d*die.vy2d);
        if (spd > 0.5) {
          const a = Math.atan2(die.vy2d, die.vx) + (Math.random()-0.5)*(Math.PI/3);
          die.vx   = Math.cos(a)*spd;
          die.vy2d = Math.sin(a)*spd;
        }
      }
    }

    if (die.vz > 0) die.apex = die.h + (die.vz*die.vz)/(2*GRAVITY);

    const t = Math.max(0, 1 - die.apex/DRAG_THRESH);
    const fr = BASE_FRICTION - t*(BASE_FRICTION-DRAG_MAX);
    die.vx   *= fr;
    die.vy2d *= fr;

    die.x   += die.vx;
    die.y2d += die.vy2d;

    const r = die.radius, wd = 0.70+Math.random()*0.10;
    if (die.x-r < walls.left)          { die.x=walls.left+r;    die.vx= Math.abs(die.vx)*RESTITUTION*wd; die.vy2d*=WALL_FRICTION; }
    else if (die.x+r > walls.right)    { die.x=walls.right-r;   die.vx=-Math.abs(die.vx)*RESTITUTION*wd; die.vy2d*=WALL_FRICTION; }
    if (die.y2d-r < walls.top)         { die.y2d=walls.top+r;   die.vy2d= Math.abs(die.vy2d)*RESTITUTION*wd; die.vx*=WALL_FRICTION; }
    else if (die.y2d+r > walls.bottom) { die.y2d=walls.bottom-r; die.vy2d=-Math.abs(die.vy2d)*RESTITUTION*wd; die.vx*=WALL_FRICTION; }
  });

  // Dice-to-dice collisions
  for (let i=0; i<dice.length; i++) for (let j=i+1; j<dice.length; j++) {
    const a=dice[i], b=dice[j];
    if (a.phase==='done' && b.phase==='done') continue;
    const dx=b.x-a.x, dy=b.y2d-a.y2d;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const minD=a.radius+b.radius-2;
    if (dist < minD && dist > 0.001) {
      const nx=dx/dist, ny=dy/dist, ov=(minD-dist)/2;
      if (a.phase!=='done'){a.x-=nx*ov; a.y2d-=ny*ov;}
      if (b.phase!=='done'){b.x+=nx*ov; b.y2d+=ny*ov;}
      const relV=(b.vx-a.vx)*nx+(b.vy2d-a.vy2d)*ny;
      if (relV < 0) {
        const imp=-(1+RESTITUTION)*relV/2;
        if (a.phase==='roll'){a.vx-=imp*nx; a.vy2d-=imp*ny;}
        if (b.phase==='roll'){b.vx+=imp*nx; b.vy2d+=imp*ny;}
      }
    }
  }
}

// Animation: play path at 1 frame per game frame, gated at segment boundaries.
// The path was built with one matrix per physics frame per arc, so this is
// a 1:1 replay. Segment gates hold animFrame at each boundary until physics
// fires the corresponding floor contact, then open the next arc.
// Result: rotation speed matches the bounce sequence exactly in reverse --
// slow wobble at start (last tiny bounces), building to fast tumble, then settle.
function stepAnimations() {
  dice.forEach(die => {
    if (die.phase === 'done') return;

    const spd = Math.sqrt(die.vx*die.vx + die.vy2d*die.vy2d);
    const physicsActive = spd > 0.05 || die.h > 0.02 || Math.abs(die.vz) > 0.02;

    if (die.settling) {
      die.settleT += 1/SLERP_FRAMES;
      if (die.settleT >= 1) {
        die.curM  = die.snapM;
        die.phase = 'done';
      } else {
        die.curM = slerpM(die.settleFrom, die.snapM, Math.sqrt(die.settleT));
      }
      return;
    }

    const maxFrame = die.animPath.length - 1;

    // Gate: don't advance past the end of the current segment until
    // physics fires that bounce (segIdx will have advanced by then).
    const currentSeg    = die.segments[die.segIdx] ?? { start: 0, end: maxFrame };
    const gateFrame     = die.segIdx < die.segments.length - 1
      ? currentSeg.end
      : maxFrame;

    // Advance 1 frame per game frame to stay in sync with physics arc durations
    die.animFrame = Math.min(die.animFrame + 1, gateFrame);
    die.curM = die.animPath[Math.floor(die.animFrame)];

    if (spd < 0.12 && die.h < 0.01 && die.apex < 0.02 && Math.abs(die.vz) < 0.04) {
      die.settling   = true;
      die.settleT    = 0;
      die.settleFrom = die.curM;
      die.vx = die.vy2d = die.vz = 0;
    }
  });
}

// Rendering
function drawTray() {
  const g = ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.72);
  g.addColorStop(0,'#c0a8e0'); g.addColorStop(0.5,'#7c4daa'); g.addColorStop(1,'#3a1a5c');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}

function drawD6(die) {
  const m  = die.curM;
  const tv = CUBE_VERTS.map(v => mulMV(m,v));
  const pv = tv.map(proj);
  CUBE_FACES.map(f => {
    const avgZ = f.verts.reduce((s,i) => s+tv[i][2], 0)/4;
    const rn   = mulMV(m, f.normal);
    return {...f, avgZ, visible: rn[2] > 0};
  }).sort((a,b) => a.avgZ-b.avgZ).forEach(f => {
    if (!f.visible) return;
    drawQuad(D6C[f.val], f.verts.map(i => pv[i]), die.scale, die.x, die.y2d);
  });
}

function drawD4(die) {
  const m  = die.curM;
  const tv = D4V.map(v => mulMV(m,v));
  const sc = die.scale, cx=die.x, cy=die.y2d;
  const pv = tv.map(v => [v[0]*sc+cx, -v[1]*sc+cy]);
  D4_FACES.map((f,fi) => {
    const [i0,i1,i2] = f.verts;
    const avgZ = (tv[i0][2]+tv[i1][2]+tv[i2][2])/3;
    const ax=pv[i1][0]-pv[i0][0], ay=pv[i1][1]-pv[i0][1];
    const bx=pv[i2][0]-pv[i0][0], by=pv[i2][1]-pv[i0][1];
    return {f, fi, avgZ, visible: ax*by-ay*bx > 0};
  }).sort((a,b) => a.avgZ-b.avgZ).forEach(({f,fi,visible}) => {
    if (!visible) return;
    const [i0,i1,i2] = f.verts;
    const [p0,p1,p2] = [pv[i0],pv[i1],pv[i2]];
    ctx.fillStyle = '#00b8c8';
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    const shade = Math.max(0, Math.min(0.35, 0.35 - tv[f.verts[0]][2]*0.3));
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,40,50,0.6)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.stroke();
    const pts=[p0,p1,p2], cvs=D4_CORNER_VALS[fi];
    const fcx=(p0[0]+p1[0]+p2[0])/3, fcy=(p0[1]+p1[1]+p2[1])/3;
    ctx.fillStyle='#ffffff'; ctx.font=`bold ${sc*0.22}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    pts.forEach((p,k) => {
      const tx=fcx+(p[0]-fcx)*0.40, ty=fcy+(p[1]-fcy)*0.40;
      const angle=Math.atan2(p[1]-fcy, p[0]-fcx)+Math.PI/2;
      ctx.save(); ctx.translate(tx,ty); ctx.rotate(angle); ctx.fillText(String(cvs[k]),0,0); ctx.restore();
    });
  });
}

function render() {
  ctx.clearRect(0,0,W,H);
  drawTray();
  dice.forEach(d => {
    switch(d.type) {
      case 'd6':  drawD6(d); break;
      case 'd4':  drawD4(d); break;
      case 'd8':  drawTriFaces(d, D8V,  D8_FACES,  D8C);  break;
      case 'd10': drawPolyFaces(d, D10V, D10_FACES, D10C); break;
      case 'd12': drawPolyFaces(d, D12V, D12_FACES, D12C); break;
      case 'd20': drawTriFaces(d, D20V, D20_FACES, D20C); break;
    }
  });
}

// Stats table — per-roll, not cumulative. History list below.
const rollHistory = []; // array of { n, groups: {type -> {face->count}} }
let rollNumber = 0;

function buildRollGroups(rolledDice) {
  const groups = {};
  rolledDice.forEach(d => {
    if (!groups[d.type]) groups[d.type] = {};
    groups[d.type][d.outcome] = (groups[d.type][d.outcome] || 0) + 1;
  });
  return groups;
}

function renderStatsSection(type, faceCounts) {
  const sides = DIE_SIDES[type] || 6;
  const faces = Array.from({length:sides},(_,i)=>sides-i);
  const total    = faces.reduce((s,f) => s + (faceCounts[f]||0), 0);
  const maxCount = Math.max(...faces.map(f => faceCounts[f]||0), 1);

  const section = document.createElement('div');
  section.className = 'stats-section';

  const heading = document.createElement('div');
  heading.className = 'stats-heading';
  const sum = faces.reduce((s,f) => s + f*(faceCounts[f]||0), 0);
  heading.textContent = `${type.toUpperCase()}  x${total}  =  ${sum}`;
  section.appendChild(heading);

  faces.forEach(face => {
    const count = faceCounts[face] || 0;
    if (count === 0) return; // hide faces that didn't come up this roll
    const row = document.createElement('div');
    row.className = 'stats-row';
    row.innerHTML =
      `<span class="stats-face">${face}</span>` +
      `<div class="stats-bar-track"><div class="stats-bar-fill" style="width:${(count/maxCount*100).toFixed(1)}%"></div></div>` +
      `<span class="stats-count">${count}</span>`;
    section.appendChild(row);
  });

  return section;
}

function updateStatsTable(rolledDice) {
  rollNumber++;
  const groups = buildRollGroups(rolledDice);
  rollHistory.unshift({ n: rollNumber, groups }); // newest first
  if (rollHistory.length > 100) rollHistory.length = 100;

  const panel = document.getElementById('stats-panel');
  if (!panel) return;
  panel.innerHTML = '';

  // Current roll
  const currentWrap = document.createElement('div');
  currentWrap.className = 'stats-current';
  const currentLabel = document.createElement('div');
  currentLabel.className = 'stats-roll-label';
  currentLabel.textContent = `ROLL #${rollNumber}`;
  currentWrap.appendChild(currentLabel);
  Object.entries(groups).forEach(([type, faceCounts]) => {
    currentWrap.appendChild(renderStatsSection(type, faceCounts));
  });
  panel.appendChild(currentWrap);

  // History (rolls 2+)
  if (rollHistory.length > 1) {
    const histWrap = document.createElement('div');
    histWrap.className = 'stats-history';
    const histLabel = document.createElement('div');
    histLabel.className = 'stats-history-label';
    histLabel.textContent = 'HISTORY';
    histWrap.appendChild(histLabel);

    rollHistory.slice(1).forEach(entry => {
      const item = document.createElement('div');
      item.className = 'stats-history-item';
      // One line per type: "ROLL #N  D6: 4 3 1  D4: 2"
      const parts = Object.entries(entry.groups).map(([type, fc]) => {
        const faces = type === 'd6' ? [6,5,4,3,2,1] : [4,3,2,1];
        const vals  = faces.flatMap(f => Array(fc[f]||0).fill(f));
        return `${type.toUpperCase()}: ${vals.join(' ')}`;
      });
      item.innerHTML =
        `<span class="hist-n">#${entry.n}</span>` +
        `<span class="hist-vals">${parts.join('  |  ')}</span>`;
      histWrap.appendChild(item);
    });

    panel.appendChild(histWrap);
  }
}

// Main loop
let dice=[], rolling=false, skipAnim=false;

function loop() {
  stepPhysics(skipAnim);
  stepAnimations();
  render();
  if (dice.length > 0 && dice.every(d => d.phase==='done') && rolling) {
    rolling = false;
    updateStatsTable(dice);
    updateResultDisplay();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Result display — just "Total: X" or "Total: X + MOD +Y = Z"
function updateResultDisplay() {
  const el = document.getElementById('result-display');
  if (!el) return;
  const mod   = parseInt(document.getElementById('mod-input').value) || 0;
  const sum   = dice.reduce((s,d) => s+d.outcome, 0);
  const total = sum + mod;
  el.textContent = mod !== 0
    ? `Total: ${sum}  +  ${mod >= 0 ? '+' : ''}${mod}  =  ${total}`
    : `Total: ${total}`;
}

// UI
const modInput = document.getElementById('mod-input');

// Build diceQueue from numeric inputs
function buildQueueFromInputs() {
  const queue = [];
  document.querySelectorAll('.die-btn').forEach(btn => {
    const type  = btn.dataset.die;
    const input = document.getElementById(`count-${type}`);
    const n     = input ? Math.max(0, parseInt(input.value) || 0) : 0;
    for (let i=0; i<n; i++) queue.push(type);
  });
  return queue;
}

function getTotalDiceCount() {
  let n = 0;
  document.querySelectorAll('.die-count-input').forEach(inp => {
    n += Math.max(0, parseInt(inp.value) || 0);
  });
  return n;
}

function updateQueueDisplay() {
  const el = document.getElementById('queue-display');
  if (!el) return;
  const queue = buildQueueFromInputs();
  const c = {};
  queue.forEach(t => c[t]=(c[t]||0)+1);
  el.textContent = Object.entries(c).map(([t,n]) => `${n}x${t.toUpperCase()}`).join('  +  ');
}

function roll() {
  const queue = buildQueueFromInputs();
  if (!queue.length) return;
  const total    = getTotalDiceCount();
  const doSkip   = skipAnim || total >= AUTO_SKIP_COUNT;
  const n = queue.length;
  dice = queue.map((type,i) => {
    const angle = (i/n)*Math.PI*2, off = n>1 ? Math.min(60, 20+n*3) : 0;
    const sides = DIE_SIDES[type] || 6;
    const d = createDie(type, 1+Math.floor(Math.random()*sides), doSkip);
    d.x   = W/2 + Math.cos(angle)*off + (Math.random()-0.5)*30;
    d.y2d = H/2 + Math.sin(angle)*off + (Math.random()-0.5)*30;
    if (doSkip) { d.curM = d.snapM; d.phase = 'done'; }
    return d;
  });
  rolling = true;
  const el = document.getElementById('result-display');
  if (el) el.textContent = '...';
  updateQueueDisplay();

  if (doSkip) {
    rolling = false;
    updateStatsTable(dice);
    updateResultDisplay();
  }
}

document.getElementById('roll-btn').addEventListener('click', roll);

document.getElementById('clear-btn').addEventListener('click', () => {
  dice = []; rolling = false;
  document.querySelectorAll('.die-count-input').forEach(inp => {
    inp.value = 0;
    inp.dispatchEvent(new Event('input'));
  });
  const el = document.getElementById('result-display');
  if (el) el.textContent = '';
});

// Skip anim toggle
const skipToggle = document.getElementById('skip-toggle');
if (skipToggle) {
  skipToggle.addEventListener('click', () => {
    skipAnim = !skipAnim;
    skipToggle.classList.toggle('on', skipAnim);
  });
}

// Input change listeners for queue display
document.querySelectorAll('.die-count-input').forEach(inp => {
  inp.addEventListener('input', updateQueueDisplay);
});