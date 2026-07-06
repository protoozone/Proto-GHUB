// ─── Canvas ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const W = canvas.width  = 540;
const H = canvas.height = 400;
// ─── Constants ───────────────────────────────────────────────────────────────
const RESTITUTION    = 0.46;
const BASE_FRICTION  = 0.989;
const WALL_FRICTION  = 0.80;
const SETTLE_SPEED   = 0.4;
const TRAY_PAD       = 14;
const GRAVITY        = 0.045;
const V_RESTITUT     = 0.50;
const FLOOR_FRIC     = 0.84;
const DRAG_THRESH    = 0.12;
const DRAG_MAX       = 0.72;
const PLAYBACK_SPD   = 5.5;
// ─── 3D Math ─────────────────────────────────────────────────────────────────
function rotMat(rx, ry) {
  const cx=Math.cos(rx), sx=Math.sin(rx), cy=Math.cos(ry), sy=Math.sin(ry);
  return [cy, sy*sx, sy*cx,  0, cx, -sx,  -sy, cy*sx, cy*cx];
}
function mulMV(m, v) {
  return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],
          m[3]*v[0]+m[4]*v[1]+m[5]*v[2],
          m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
}
function mulMM(a, b) {
  return [
    a[0]*b[0]+a[1]*b[3]+a[2]*b[6], a[0]*b[1]+a[1]*b[4]+a[2]*b[7], a[0]*b[2]+a[1]*b[5]+a[2]*b[8],
    a[3]*b[0]+a[4]*b[3]+a[5]*b[6], a[3]*b[1]+a[4]*b[4]+a[5]*b[7], a[3]*b[2]+a[4]*b[5]+a[5]*b[8],
    a[6]*b[0]+a[7]*b[3]+a[8]*b[6], a[6]*b[1]+a[7]*b[4]+a[8]*b[7], a[6]*b[2]+a[7]*b[5]+a[8]*b[8],
  ];
}
function proj(p) { return [p[0], -p[1]]; }
// Rodrigues rotation: rotate vector 'from' onto vector 'to', return 3x3 matrix
function rotateFromTo(from, to) {
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function norm(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return[v[0]/l,v[1]/l,v[2]/l];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  const c=cross(from,to), sinA=Math.sqrt(c[0]*c[0]+c[1]*c[1]+c[2]*c[2]), cosA=dot(from,to);
  if (sinA < 1e-9) {
    if (cosA > 0) return [1,0,0, 0,1,0, 0,0,1];
    // 180-degree rotation around a perpendicular axis
    const ax = Math.abs(from[0]) < 0.9 ? norm(cross(from,[1,0,0])) : norm(cross(from,[0,1,0]));
    const t=2;
    return [t*ax[0]*ax[0]-1,t*ax[0]*ax[1],t*ax[0]*ax[2],
            t*ax[1]*ax[0],t*ax[1]*ax[1]-1,t*ax[1]*ax[2],
            t*ax[2]*ax[0],t*ax[2]*ax[1],t*ax[2]*ax[2]-1];
  }
  const k=norm(c), t=1-cosA, s=sinA;
  return [t*k[0]*k[0]+cosA,   t*k[0]*k[1]-s*k[2], t*k[0]*k[2]+s*k[1],
          t*k[1]*k[0]+s*k[2], t*k[1]*k[1]+cosA,   t*k[1]*k[2]-s*k[0],
          t*k[2]*k[0]-s*k[1], t*k[2]*k[1]+s*k[0], t*k[2]*k[2]+cosA];
}
// Rotation around Z axis
function Rz(a) {
  const c=Math.cos(a), s=Math.sin(a);
  return [c,-s,0, s,c,0, 0,0,1];
}
// ─── D6 geometry ─────────────────────────────────────────────────────────────
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
// ─── D4 geometry ─────────────────────────────────────────────────────────────
const _r = 0.6;
const D4V = [
  [ Math.sqrt(8/9)*_r,  -1/3*_r,  0                  ],
  [-Math.sqrt(2/9)*_r,  -1/3*_r,  Math.sqrt(2/3)*_r  ],
  [-Math.sqrt(2/9)*_r,  -1/3*_r, -Math.sqrt(2/3)*_r  ],
  [ 0,                   _r,       0                  ],
];
const D4_FACES = [
  {verts:[0,2,1], val:1},
  {verts:[0,1,3], val:2},
  {verts:[1,2,3], val:3},
  {verts:[2,0,3], val:4},
];
const D4_CORNER_VALS = (() => {
  return D4_FACES.map(face =>
    face.verts.map(vi => {
      const opp = D4_FACES.find(f => !f.verts.includes(vi));
      return opp.val;
    })
  );
})();
// ─── Face canvas pre-rendering ───────────────────────────────────────────────
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
  const pos=[{x:tx[0],y:ty[0]+20,rot:0},{x:tx[1]-18,y:ty[1]-18,rot:-Math.PI*2/3},{x:tx[2]+18,y:ty[2]-18,rot:Math.PI*2/3}];
  c.fillStyle='#ffffff'; c.font=`bold ${FS*0.22}px monospace`;
  c.textAlign='center'; c.textBaseline='middle';
  pos.forEach(({x,y,rot},i)=>{ c.save(); c.translate(x,y); c.rotate(rot); c.fillText(String(cornerVals[i]),0,0); c.restore(); });
  return fc;
}
const D6C={};
for (const f of CUBE_FACES) D6C[f.val]=makeD6Canvas(f.val);
const D4C=D4_FACES.map((f,i)=>makeD4Canvas(D4_CORNER_VALS[i]));
// ─── Affine pattern mapping ───────────────────────────────────────────────────
function setPatTrans(pat,p0,p1,p3) {
  const a=(p1[0]-p0[0])/FS, b=(p1[1]-p0[1])/FS;
  const cc=(p3[0]-p0[0])/FS, d=(p3[1]-p0[1])/FS;
  pat.setTransform(new DOMMatrix([a,b,cc,d,p0[0],p0[1]]));
}
function drawQuad(fc,pts,sc,cx,cy) {
  const T=p=>[p[0]*sc+cx,p[1]*sc+cy];
  const [p0,p1,p2,p3]=pts.map(T);
  const pat=ctx.createPattern(fc,'no-repeat');
  setPatTrans(pat,p0,p1,p3);
  ctx.fillStyle=pat;
  ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]);
  ctx.lineTo(p2[0],p2[1]); ctx.lineTo(p3[0],p3[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();
}
function drawTri(fc,pts,sc,cx,cy) {
  const T=p=>[p[0]*sc+cx,p[1]*sc+cy];
  const [p0,p1,p2]=pts.map(T);
  const pat=ctx.createPattern(fc,'no-repeat');
  setPatTrans(pat,p0,p1,p2);
  ctx.fillStyle=pat;
  ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.5; ctx.stroke();
}
// ─── Animation pipeline ───────────────────────────────────────────────────────
function simForward(rx0,ry0,rvx0,rvy0) {
  const GRAV   = GRAVITY;
  const VRES   = V_RESTITUT;
  const RDECAY = 0.88;  // was 0.72 — higher = less rotational decay per bounce
  const path = [];
  let rx=rx0, ry=ry0;
  let rvx=rvx0*0.003, rvy=rvy0*0.003;
  const bounces=[];
  let vUp = 0.08 + Math.random()*0.12;
  while (vUp < 1.4 + Math.random()*0.4) {
    bounces.push(vUp);
    vUp /= VRES;
  }
  for (const v of bounces) {
    const airFrames = Math.ceil(2*v/GRAV);
    for (let f=0; f<airFrames; f++) {
      path.push([rx,ry]);
      rx+=rvy; ry+=rvx;
    }
    rvx *= 1/RDECAY;
    rvy *= 1/RDECAY;
    const kick=(Math.random()-0.5)*Math.abs(rvx)*0.18;
    rvx+=kick; rvy-=kick;
  }
  path.push([rx,ry]);
  return path;
}
// ─── Settle poses (matrix-based, no Euler decomposition) ─────────────────────
// Returns { rx, ry } for the animation end-point, AND snapM (3x3) for final snap draw.
// snapM is the authoritative final orientation — rx/ry are only used by simForward.
// This avoids all gimbal-lock and atan2 sign issues.

function settlePoseD6(outcome) {
  const face = CUBE_FACES.find(f => f.val === outcome);
  // Rotate face normal to +Z (facing camera) using Rodrigues
  const Rbase = rotateFromTo(face.normal, [0,0,1]);
  // Random 90° spin around Z — purely cosmetic orientation variety
  const k = Math.floor(Math.random()*4);
  const snapM = mulMM(Rz(k * Math.PI/2), Rbase);
  // Extract rx,ry from snapM for simForward start point
  // rotMat layout: m[4]=cx, m[5]=-sx, m[6]=-sy, m[0]=cy
  const rx = Math.atan2(-snapM[5], snapM[4]);
  const ry = Math.atan2(-snapM[6], snapM[0]);
  return { rx, ry, snapM };
}

function settlePoseD4(outcome) {
  const face = D4_FACES.find(f => f.val === outcome);
  const [i0,i1,i2] = face.verts;
  const v0=D4V[i0], v1=D4V[i1], v2=D4V[i2];
  // Outward normal via cross product
  function cross3(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function norm3(v){const l=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return[v[0]/l,v[1]/l,v[2]/l];}
  function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
  let n = norm3(cross3(sub3(v1,v0), sub3(v2,v0)));
  // Ensure it points outward (away from opposite vertex)
  const oppVi = [0,1,2,3].find(vi => !face.verts.includes(vi));
  const opp   = D4V[oppVi];
  const fc    = [(v0[0]+v1[0]+v2[0])/3, (v0[1]+v1[1]+v2[1])/3, (v0[2]+v1[2]+v2[2])/3];
  if (dot3(sub3(opp,fc), n) > 0) n = [-n[0],-n[1],-n[2]];
  // Rotate floor-face outward normal to -Z (pointing away from camera = floor)
  // This makes the 3 non-floor faces visible to the camera
  const Rbase = rotateFromTo(n, [0,0,-1]);
  // Random 120° spin around Z for orientation variety
  const k = Math.floor(Math.random()*3);
  const snapM = mulMM(Rz(k * Math.PI * 2/3), Rbase);
  // Extract rx,ry for simForward
  const rx = Math.atan2(-snapM[5], snapM[4]);
  const ry = Math.atan2(-snapM[6], snapM[0]);
  return { rx, ry, snapM };
}
// ─── Die creation ─────────────────────────────────────────────────────────────
function createDie(type, outcome) {
  const dir    = Math.random()*Math.PI*2;
  const hspeed = 9+Math.random()*9;
  const settle = type==='d6' ? settlePoseD6(outcome) : settlePoseD4(outcome);
  const rvx0   = (Math.random()<0.5?1:-1)*(2.2+Math.random()*1.0);
  const rvy0   = (Math.random()<0.5?1:-1)*(2.2+Math.random()*1.0);
  const fwdPath  = simForward(settle.rx, settle.ry, rvx0, rvy0);
  const animPath = fwdPath.slice().reverse();
  return {
    type, outcome,
    x:    W/2+(Math.random()-0.5)*100,
    y2d:  H/2+(Math.random()-0.5)*80,
    vx:   Math.cos(dir)*hspeed,
    vy2d: Math.sin(dir)*hspeed,
    h:    1.2+Math.random()*0.8,
    vz:   1.6+Math.random()*0.7,
    apex: 0,
    rx:   animPath[0][0],
    ry:   animPath[0][1],
    snapM: settle.snapM,  // authoritative final orientation matrix
    phase: 'roll',
    animPath,
    animFrame: 0,
    rotDone: false,
    radius: type==='d6'?30:26,
    scale:  type==='d6'?58:50,
  };
}
// ─── Collision rotation ───────────────────────────────────────────────────────
function applyCollisionRotation(die, imp) {
  const shift=Math.floor(imp*0.7);
  die.animFrame=Math.max(0, Math.min(die.animPath.length-1, die.animFrame+shift));
}
// ─── Physics ─────────────────────────────────────────────────────────────────
function stepPhysics() {
  const walls={left:TRAY_PAD, right:W-TRAY_PAD, top:TRAY_PAD, bottom:H-TRAY_PAD};
  dice.forEach(die=>{
    if (die.phase!=='roll') return;
    die.vz -= GRAVITY;
    die.h  += die.vz;
    if (die.h <= 0) {
      die.h  = 0;
      die.vz = Math.abs(die.vz)*V_RESTITUT;
      die.apex = (die.vz*die.vz)/(2*GRAVITY);
      die.vx   *= FLOOR_FRIC;
      die.vy2d *= FLOOR_FRIC;
      applyCollisionRotation(die, Math.abs(die.vx)+Math.abs(die.vy2d));
    }
    if (die.vz > 0) die.apex = die.h+(die.vz*die.vz)/(2*GRAVITY);
    const t = Math.max(0, 1-die.apex/DRAG_THRESH);
    const friction = BASE_FRICTION-t*(BASE_FRICTION-DRAG_MAX);
    die.vx   *= friction;
    die.vy2d *= friction;
    die.x   += die.vx;
    die.y2d += die.vy2d;
    const r=die.radius;
    const wallDecay=0.70+Math.random()*0.10;
    if (die.x-r < walls.left) {
      die.x=walls.left+r; die.vx=Math.abs(die.vx)*RESTITUTION*wallDecay;
      die.vy2d*=WALL_FRICTION; applyCollisionRotation(die, Math.abs(die.vx));
    } else if (die.x+r > walls.right) {
      die.x=walls.right-r; die.vx=-Math.abs(die.vx)*RESTITUTION*wallDecay;
      die.vy2d*=WALL_FRICTION; applyCollisionRotation(die, Math.abs(die.vx));
    }
    if (die.y2d-r < walls.top) {
      die.y2d=walls.top+r; die.vy2d=Math.abs(die.vy2d)*RESTITUTION*wallDecay;
      die.vx*=WALL_FRICTION; applyCollisionRotation(die, Math.abs(die.vy2d));
    } else if (die.y2d+r > walls.bottom) {
      die.y2d=walls.bottom-r; die.vy2d=-Math.abs(die.vy2d)*RESTITUTION*wallDecay;
      die.vx*=WALL_FRICTION; applyCollisionRotation(die, Math.abs(die.vy2d));
    }
    const spd=Math.sqrt(die.vx*die.vx+die.vy2d*die.vy2d);
    if (spd < SETTLE_SPEED && die.h < 0.06 && die.apex < 0.05) {
      die.vx=die.vy2d=die.vz=0; die.phase='spin';
    }
  });
  for (let i=0;i<dice.length;i++) for (let j=i+1;j<dice.length;j++) {
    const a=dice[i], b=dice[j];
    const dx=b.x-a.x, dy=b.y2d-a.y2d;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const minD=a.radius+b.radius-2;
    if (dist<minD&&dist>0.001) {
      const nx=dx/dist, ny=dy/dist, ov=(minD-dist)/2;
      if (a.phase!=='done'){a.x-=nx*ov; a.y2d-=ny*ov;}
      if (b.phase!=='done'){b.x+=nx*ov; b.y2d+=ny*ov;}
      const relV=(b.vx-a.vx)*nx+(b.vy2d-a.vy2d)*ny;
      if (relV<0) {
        const imp=-(1+RESTITUTION)*relV/2;
        const ix=imp*nx, iy=imp*ny;
        if (a.phase==='roll'){a.vx-=ix; a.vy2d-=iy; applyCollisionRotation(a,Math.abs(imp));}
        if (b.phase==='roll'){b.vx+=ix; b.vy2d+=iy; applyCollisionRotation(b,Math.abs(imp));}
      }
    }
  }
}
// ─── Spin-down animation ──────────────────────────────────────────────────────
function stepAnimations() {
  dice.forEach(die=>{
    if (die.phase==='done') return;
    die.animFrame=Math.min(die.animFrame+PLAYBACK_SPD, die.animPath.length-1);
    const f=die.animPath[Math.floor(die.animFrame)];
    die.rx=f[0]; die.ry=f[1];
    if (!die.rotDone && die.animFrame>=die.animPath.length-1) {
      die.rotDone=true;
      if (die.phase==='roll') die.phase='spin';
    }
    if (die.phase==='spin' && die.animFrame>=die.animPath.length-1) {
      die.phase='done';
    }
  });
}
// ─── Rendering ───────────────────────────────────────────────────────────────
function drawTray() {
  const g=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.72);
  g.addColorStop(0,'#c0a8e0'); g.addColorStop(0.5,'#7c4daa'); g.addColorStop(1,'#3a1a5c');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
}
function drawD6(die) {
  // When done, use snapM directly — bypasses all rx/ry Euler issues
  const m = die.phase==='done' ? die.snapM : rotMat(die.rx, die.ry);
  const tv = CUBE_VERTS.map(v=>mulMV(m,v));
  const pv = tv.map(proj);
  CUBE_FACES.map(f=>{
    const avgZ = f.verts.reduce((s,i)=>s+tv[i][2],0)/4;
    const rn   = mulMV(m, f.normal);
    return {...f, avgZ, visible: rn[2]>0};
  }).sort((a,b)=>a.avgZ-b.avgZ).forEach(f=>{
    if (!f.visible) return;
    drawQuad(D6C[f.val], f.verts.map(i=>pv[i]), die.scale, die.x, die.y2d);
  });
}
function drawD4(die) {
  // When done, use snapM directly
  const m  = die.phase==='done' ? die.snapM : rotMat(die.rx, die.ry);
  const tv = D4V.map(v=>mulMV(m,v));
  const sc = die.scale, cx=die.x, cy=die.y2d;
  const pv = tv.map(v=>[v[0]*sc+cx, -v[1]*sc+cy]);
  const faces = D4_FACES.map((f,fi)=>{
    const [i0,i1,i2]=f.verts;
    const avgZ=(tv[i0][2]+tv[i1][2]+tv[i2][2])/3;
    const ax=pv[i1][0]-pv[i0][0], ay=pv[i1][1]-pv[i0][1];
    const bx=pv[i2][0]-pv[i0][0], by=pv[i2][1]-pv[i0][1];
    const cz=ax*by-ay*bx;
    // proj() negates Y, so CCW winding in screen space → cz > 0 = facing camera
    return {f, fi, avgZ, visible: cz>0};
  }).sort((a,b)=>a.avgZ-b.avgZ);
  faces.forEach(({f,fi,visible})=>{
    if (!visible) return;
    const [i0,i1,i2]=f.verts;
    const [p0,p1,p2]=[pv[i0],pv[i1],pv[i2]];
    ctx.fillStyle='#00b8c8';
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    const shade=Math.max(0,Math.min(0.35,0.35-tv[f.verts[0]][2]*0.3));
    ctx.fillStyle=`rgba(0,0,0,${shade})`;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,40,50,0.6)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.closePath(); ctx.stroke();
    const pts=[p0,p1,p2], cvs=D4_CORNER_VALS[fi];
    const fcx=(p0[0]+p1[0]+p2[0])/3, fcy=(p0[1]+p1[1]+p2[1])/3;
    ctx.fillStyle='#ffffff'; ctx.font=`bold ${sc*0.22}px monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    pts.forEach((p,k)=>{
      const tx=fcx+(p[0]-fcx)*0.40, ty=fcy+(p[1]-fcy)*0.40;
      const angle=Math.atan2(p[1]-fcy,p[0]-fcx)+Math.PI/2;
      ctx.save(); ctx.translate(tx,ty); ctx.rotate(angle); ctx.fillText(String(cvs[k]),0,0); ctx.restore();
    });
  });
}
function render() {
  ctx.clearRect(0,0,W,H);
  drawTray();
  dice.forEach(d=>d.type==='d6'?drawD6(d):drawD4(d));
}
// ─── Main loop ────────────────────────────────────────────────────────────────
let dice=[], rolling=false;
function loop() {
  stepPhysics();
  stepAnimations();
  render();
  if (dice.length>0 && dice.every(d=>d.phase==='done') && rolling) {
    rolling=false; showResult();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// ─── UI ──────────────────────────────────────────────────────────────────────
const resultDisplay=document.getElementById('result-display');
const modInput=document.getElementById('mod-input');
let diceQueue=[];
document.querySelectorAll('.die-btn').forEach(btn=>{
  btn.addEventListener('click', e=>{
    e.preventDefault();
    diceQueue.push(btn.dataset.die);
    updateQueueDisplay();
  });
  btn.addEventListener('contextmenu', e=>{
    e.preventDefault();
    const idx=diceQueue.lastIndexOf(btn.dataset.die);
    if (idx!==-1) diceQueue.splice(idx,1);
    updateQueueDisplay();
  });
});
function updateQueueDisplay() {
  const el=document.getElementById('queue-display');
  if (!el) return;
  if (!diceQueue.length){ el.textContent=''; }
  else {
    const c={};
    diceQueue.forEach(t=>c[t]=(c[t]||0)+1);
    el.textContent=Object.entries(c).map(([t,n])=>`${n}×${t.toUpperCase()}`).join('  +  ');
  }
  document.querySelectorAll('.die-btn').forEach(btn=>{
    const t=btn.dataset.die;
    const badge=document.getElementById(`badge-${t}`);
    const count=diceQueue.filter(x=>x===t).length;
    if (badge){ badge.textContent=count; btn.classList.toggle('has-count',count>0); }
  });
}
function roll() {
  const queue=diceQueue.length ? [...diceQueue] : ['d6'];
  const n=queue.length;
  dice=queue.map((type,i)=>{
    const angle=(i/n)*Math.PI*2, off=n>1?60:0;
    const sides=type==='d6'?6:4;
    const d=createDie(type, 1+Math.floor(Math.random()*sides));
    d.x  =W/2+Math.cos(angle)*off+(Math.random()-0.5)*30;
    d.y2d=H/2+Math.sin(angle)*off+(Math.random()-0.5)*30;
    return d;
  });
  rolling=true;
  resultDisplay.textContent='...';
  updateQueueDisplay();
}
function showResult() {
  const sum=dice.reduce((s,d)=>s+d.outcome,0);
  const mod=parseInt(modInput.value)||0;
  const total=sum+mod;
  const groups={};
  dice.forEach(d=>{ if(!groups[d.type]) groups[d.type]=[]; groups[d.type].push(d.outcome); });
  const lines=Object.entries(groups).map(([type,vals])=>{
    const gs=vals.reduce((s,v)=>s+v,0);
    return `${type.toUpperCase()}  ${vals.join('  ')}  = ${gs}`;
  });
  if (mod!==0) lines.push(`MOD  ${mod>=0?'+':''}${mod}`);
  if (lines.length>1||mod!==0) lines.push(`TOTAL  ${total}`);
  resultDisplay.innerHTML=lines.map((l,i)=>
    `<div style="opacity:${i===lines.length-1?1:0.7};font-weight:${i===lines.length-1?700:400}">${l}</div>`
  ).join('');
}
document.getElementById('roll-btn').addEventListener('click', roll);
document.getElementById('clear-btn').addEventListener('click', ()=>{
  dice=[]; rolling=false; diceQueue=[];
  resultDisplay.textContent='';
  updateQueueDisplay();
});
canvas.addEventListener('contextmenu', e=>{
  e.preventDefault();
  if (diceQueue.length){ diceQueue.pop(); updateQueueDisplay(); }
});