// 走马灯 — a hand-spun zoetrope of statues frozen out of a Lux3D animation.
// Lux3D made the character, its skeleton and its motion clips (assets/manifest.json lists the task IDs).
// This file samples each clip into N static poses, places them on a wheel and simulates light:
//   steady light  -> exposure blur (temporal accumulation of jittered sub-frame samples)
//   shutter/strobe -> the wheel is only "seen" at flash instants (sample-and-hold, no flicker)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture');            // frames are stepped from outside via window.__frame(dt)
const DIRECTOR = Q.has('director');          // scripted showreel
const QUALITY = Q.get('q') || (CAPTURE ? 'high' : 'auto');

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261111);

const CLIP_LABEL = {
  Jog_Fwd_Loop: '奔', Sprint_Loop: '疾', Walk_Loop: '行', Dance_Loop: '舞', Walk_Carry_Loop: '担',
  Idle_Lantern_Loop: '提灯', Swim_Fwd_Loop: '游', Zombie_Walk_Fwd_Loop: '梦游',
};
const RING_R = 2.8;          // statue ring radius (scene units)
const FOOTPRINT = 0.80;      // arc length one statue of height 1 needs
const SHUTTER_HZ = 24;       // motor speed is chosen so the synced shutter fires at this rate
const N_MIN = 12, N_MAX = 24;

// ---------------------------------------------------------------- renderer + post chain
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
renderer.autoClear = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let pixelRatio = QUALITY === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.5);
let useShadows = QUALITY !== 'low';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060302);
scene.fog = new THREE.Fog(0x060302, 12, 30);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

const fsGeo = new THREE.BufferGeometry();
fsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const fsCam = new THREE.Camera();
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,0.,1.); }';
const accumMat = new THREE.ShaderMaterial({
  uniforms: { tPrev: { value: null }, tNew: { value: null }, uAlpha: { value: 1 } },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false,
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tPrev,tNew; uniform float uAlpha; void main(){ gl_FragColor = mix(texture2D(tPrev,vUv), texture2D(tNew,vUv), uAlpha); }',
});
const outMat = new THREE.ShaderMaterial({
  uniforms: { tAcc: { value: null }, uExposure: { value: 1 }, uFlash: { value: 0 }, uCool: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
  vertexShader: FS_VERT, depthTest: false, depthWrite: false,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tAcc; uniform float uExposure,uFlash,uCool,uTime,uFade;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime)*43758.5453); }
    void main(){
      vec3 c = texture2D(tAcc,vUv).rgb * uExposure * (1.0 + uFlash*0.9);
      c = mix(c, c*vec3(0.93,1.0,1.09), uCool);
      vec2 d = vUv-0.5; float v = smoothstep(0.92,0.25,length(d*vec2(1.0,1.15)));
      c *= mix(0.25,1.0,v);
      c = aces(c);
      c = pow(c, vec3(1.0/2.2));
      c += (hash(gl_FragCoord.xy)-0.5)*0.018;
      gl_FragColor = vec4(c*uFade,1.0);
    }`,
});
const fsQuad = new THREE.Mesh(fsGeo, accumMat);
fsQuad.frustumCulled = false;
const fsScene = new THREE.Scene(); fsScene.add(fsQuad);
let rtScene, rtA, rtB, needClear = true;
function makeTargets() {
  const w = Math.max(2, Math.floor(canvas.clientWidth * pixelRatio)), h = Math.max(2, Math.floor(canvas.clientHeight * pixelRatio));
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  for (const t of [rtScene, rtA, rtB]) t && t.dispose();
  const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  rtScene = new THREE.WebGLRenderTarget(w, h, { ...o, depthBuffer: true, samples: QUALITY === 'low' ? 0 : 4 });
  rtA = new THREE.WebGLRenderTarget(w, h, o); rtB = new THREE.WebGLRenderTarget(w, h, o);
  camera.aspect = w / h; camera.updateProjectionMatrix(); needClear = true;
}

// ---------------------------------------------------------------- set: floor, wheel, lantern, lights
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshStandardMaterial({
  color: 0x0e0605, roughness: 0.85, metalness: 0,
  map: canvasTex(512, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, '#8a5a3c'); r.addColorStop(0.22, '#3d2318'); r.addColorStop(1, '#000'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
}));
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.36; floor.receiveShadow = true; scene.add(floor);

const wheel = new THREE.Group(); scene.add(wheel);
const PLAT_R = RING_R + 0.62;
const platTop = new THREE.Mesh(new THREE.CircleGeometry(PLAT_R, 128), new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.0 }));
platTop.rotation.x = -Math.PI / 2; platTop.receiveShadow = true; wheel.add(platTop);
const platSide = new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R, PLAT_R - 0.05, 0.16, 128, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
platSide.position.y = -0.08; wheel.add(platSide);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8963a, roughness: 0.32, metalness: 0.9 });
const rim = new THREE.Mesh(new THREE.TorusGeometry(PLAT_R, 0.028, 10, 160), goldMat); rim.rotation.x = Math.PI / 2; wheel.add(rim);
const rim2 = rim.clone(); rim2.position.y = -0.16; rim2.scale.setScalar((PLAT_R - 0.05) / PLAT_R); wheel.add(rim2);
function paintPlatform(N) {
  // the pattern has period 2*pi/N: it smears under steady light and stands still under the synced shutter
  const top = canvasTex(2048, (g, s) => {
    const c = s / 2, px = c / PLAT_R;
    g.fillStyle = '#2a0907'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < N; i++) {
      const a0 = (i - 0.5) / N * TAU - Math.PI / 2, a1 = (i + 0.5) / N * TAU - Math.PI / 2;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, c, a0, a1); g.closePath();
      g.fillStyle = i % 2 ? '#330b09' : '#280807'; g.fill();
    }
    g.strokeStyle = '#c8963a'; g.lineCap = 'round';
    for (const [r, w] of [[RING_R - 0.42, 3], [RING_R + 0.42, 3], [0.95, 5], [PLAT_R - 0.07, 6]]) { g.lineWidth = w; g.beginPath(); g.arc(c, c, r * px, 0, TAU); g.stroke(); }
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * TAU - Math.PI / 2;
      g.lineWidth = 4; g.beginPath(); g.moveTo(c + Math.cos(a) * (RING_R - 0.42) * px, c + Math.sin(a) * (RING_R - 0.42) * px); g.lineTo(c + Math.cos(a) * (RING_R - 0.25) * px, c + Math.sin(a) * (RING_R - 0.25) * px); g.stroke();
      g.beginPath(); g.arc(c + Math.cos(a) * (RING_R + 0.52) * px, c + Math.sin(a) * (RING_R + 0.52) * px, 7, 0, TAU); g.fillStyle = '#c8963a'; g.fill();
    }
    const rg = g.createRadialGradient(c, c, 0, c, c, c); rg.addColorStop(0, 'rgba(255,170,80,.30)'); rg.addColorStop(0.5, 'rgba(255,170,80,0)'); g.fillStyle = rg; g.fillRect(0, 0, s, s);
  });
  platTop.material.map?.dispose(); platTop.material.map = top; platTop.material.needsUpdate = true;
  const side = canvasTex(1024, (g, s) => {
    g.fillStyle = '#2a0907'; g.fillRect(0, 0, s, s);
    const reps = 4; // texture repeats N/reps... we just draw 4 periods and repeat
    for (let i = 0; i < reps; i++) { const x = (i + 0.5) / reps * s; g.fillStyle = '#c8963a'; g.fillRect(x - 46, s * 0.3, 92, s * 0.4); g.fillStyle = '#2a0907'; g.fillRect(x - 32, s * 0.4, 64, s * 0.2); }
  });
  side.wrapS = THREE.RepeatWrapping; side.repeat.set(N / 4, 1);
  platSide.material.map?.dispose(); platSide.material.map = side; platSide.material.needsUpdate = true;
}

// static lantern in the middle
const lantern = new THREE.Group(); scene.add(lantern);
const paperTex = canvasTex(1024, (g, s) => {
  const lg = g.createLinearGradient(0, 0, 0, s); lg.addColorStop(0, '#ffcf8a'); lg.addColorStop(0.5, '#ffe9bf'); lg.addColorStop(1, '#ff9d4a'); g.fillStyle = lg; g.fillRect(0, 0, s, s);
  const cols = 6, w = s / cols; g.strokeStyle = '#3a0d0a'; g.lineWidth = 10;
  for (let i = 0; i < cols; i++) {
    const x = i * w; g.strokeRect(x + 5, 5, w - 10, s - 10);
    g.lineWidth = 5; const m = 30; g.strokeRect(x + m, m, w - 2 * m, s - 2 * m);
    g.beginPath(); for (const fy of [0.2, 0.8]) { g.moveTo(x + m, s * fy); g.lineTo(x + w - m, s * fy); } g.stroke();
    g.lineWidth = 4; g.beginPath(); for (const fx of [0.36, 0.64]) { g.moveTo(x + w * fx, s * 0.2); g.lineTo(x + w * fx, s * 0.8); } g.stroke();
    g.save(); g.translate(x + w / 2, s / 2); g.scale(1, 3.2); g.rotate(Math.PI / 4); g.fillStyle = '#b3261e'; g.fillRect(-13, -13, 26, 26); g.restore(); g.lineWidth = 10;
  }
});
const paperMat = new THREE.MeshBasicMaterial({ map: paperTex, color: 0xffffff });
const placeholder = new THREE.Group(); lantern.add(placeholder);   // code-drawn stand-in, replaced by the Lux3D lantern when it loads
const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.15, 6, 1, true), paperMat); shade.position.y = 1.95; placeholder.add(shade);
const woodMat = new THREE.MeshStandardMaterial({ color: 0x1c0a07, roughness: 0.5 });
for (const [y, r0, r1, h] of [[2.56, 0.2, 0.56, 0.1], [1.34, 0.52, 0.3, 0.1]]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 6), woodMat); m.position.y = y; placeholder.add(m); }
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.3, 12), woodMat); pole.position.y = 0.65; lantern.add(pole);
const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), goldMat); finial.position.y = 2.66; placeholder.add(finial);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: canvasTex(256, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,190,110,.55)'); r.addColorStop(0.35, 'rgba(255,140,50,.16)'); r.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
  blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
}));
glow.position.y = 1.95; glow.scale.setScalar(5.2); lantern.add(glow);

const hemi = new THREE.HemisphereLight(0x6b4630, 0x0a0503, 0.6); scene.add(hemi);
const candle = new THREE.PointLight(0xff9440, 60, 16, 1.8); candle.position.set(0, 1.9, 0); scene.add(candle);
const warmFill = new THREE.DirectionalLight(0xffb98a, 0.9); warmFill.position.set(-3, 4, 9); scene.add(warmFill);
const key = new THREE.SpotLight(0xe6f1ff, 0, 40, 0.42, 0.55, 1.2);
key.position.set(4.5, 9, 9.5); key.target.position.set(0, 0.3, 0); scene.add(key, key.target);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 6; key.shadow.camera.far = 22; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
const handLight = new THREE.SpotLight(0xfff0dc, 0, 14, 0.36, 0.7, 1.4);
handLight.position.set(2.2, 5.2, RING_R + 7); handLight.target.position.set(-0.5, 2.3, RING_R + 2.6); scene.add(handLight, handLight.target);
const rimLight = new THREE.DirectionalLight(0x9fc4ff, 0); rimLight.position.set(-6, 5, -7); scene.add(rimLight);

// ---------------------------------------------------------------- character: load, bake poses
const lanternMats = [];
let gltfRoot, mixer, clips = [], parts = [], normScale = 1, OPTIONS = {};
const statues = [];           // {holder, meshes:[], pose}
let ring = { N: 0, delta: 1, clip: null, scale: 1, poseGeos: [] };
const ringGroup = new THREE.Group(); wheel.add(ringGroup);

const _m = new THREE.Matrix4(), _bm = new THREE.Matrix4();
function skinnedGeometry(mesh, xf) {
  // CPU skinning of one (Skinned)Mesh at the current pose, expressed in root space then transformed by xf.
  const src = mesh.geometry, P = src.attributes.position, Nn = src.attributes.normal;
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const e = new Float32Array(16);
  if (mesh.isSkinnedMesh) {
    const SI = src.attributes.skinIndex, SW = src.attributes.skinWeight, bones = mesh.skeleton.boneMatrices;
    const bind = mesh.bindMatrix.elements;
    for (let i = 0; i < n; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const bx = bind[0] * x + bind[4] * y + bind[8] * z + bind[12], by = bind[1] * x + bind[5] * y + bind[9] * z + bind[13], bz = bind[2] * x + bind[6] * y + bind[10] * z + bind[14];
      e.fill(0); let ws = 0;
      for (let k = 0; k < 4; k++) {
        const w = SW.getComponent(i, k); if (!w) continue; ws += w;
        const o = SI.getComponent(i, k) * 16; for (let j = 0; j < 16; j++) e[j] += bones[o + j] * w;
      }
      if (ws > 0 && Math.abs(ws - 1) > 1e-4) for (let j = 0; j < 16; j++) e[j] /= ws;
      pos[i * 3] = e[0] * bx + e[4] * by + e[8] * bz + e[12];
      pos[i * 3 + 1] = e[1] * bx + e[5] * by + e[9] * bz + e[13];
      pos[i * 3 + 2] = e[2] * bx + e[6] * by + e[10] * bz + e[14];
      if (Nn) {
        x = Nn.getX(i); y = Nn.getY(i); z = Nn.getZ(i);
        const nx0 = bind[0] * x + bind[4] * y + bind[8] * z, ny0 = bind[1] * x + bind[5] * y + bind[9] * z, nz0 = bind[2] * x + bind[6] * y + bind[10] * z;
        nor[i * 3] = e[0] * nx0 + e[4] * ny0 + e[8] * nz0; nor[i * 3 + 1] = e[1] * nx0 + e[5] * ny0 + e[9] * nz0; nor[i * 3 + 2] = e[2] * nx0 + e[6] * ny0 + e[10] * nz0;
      }
    }
  } else {
    const w = mesh.matrixWorld.elements;
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos[i * 3] = w[0] * x + w[4] * y + w[8] * z + w[12]; pos[i * 3 + 1] = w[1] * x + w[5] * y + w[9] * z + w[13]; pos[i * 3 + 2] = w[2] * x + w[6] * y + w[10] * z + w[14];
      if (Nn) { const a = Nn.getX(i), b = Nn.getY(i), c = Nn.getZ(i); nor[i * 3] = w[0] * a + w[4] * b + w[8] * c; nor[i * 3 + 1] = w[1] * a + w[5] * b + w[9] * c; nor[i * 3 + 2] = w[2] * a + w[6] * b + w[10] * c; }
    }
  }
  if (xf) {
    const t = xf.elements;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      pos[i * 3] = t[0] * x + t[4] * y + t[8] * z + t[12]; pos[i * 3 + 1] = t[1] * x + t[5] * y + t[9] * z + t[13]; pos[i * 3 + 2] = t[2] * x + t[6] * y + t[10] * z + t[14];
    }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1; nor[i * 3] /= l; nor[i * 3 + 1] /= l; nor[i * 3 + 2] /= l; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
  if (src.index) g.setIndex(src.index);
  for (const grp of src.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  return g;
}
function poseAt(clip, t) {
  mixer.stopAllAction(); const a = mixer.clipAction(clip); a.reset(); a.play(); mixer.setTime(t);
  gltfRoot.updateMatrixWorld(true);
  for (const p of parts) if (p.isSkinnedMesh) p.skeleton.update();
}
function yRange(geos) { let lo = Infinity, hi = -Infinity; for (const g of geos) { const p = g.attributes.position.array; for (let i = 1; i < p.length; i += 3) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; } } return [lo, hi]; }

const tick = () => new Promise((r) => (CAPTURE ? r() : setTimeout(r, 0)));
let baking = false;
async function buildRing(clip) {
  if (baking) return; baking = true;
  const N = clamp(Math.round(clip.duration * SHUTTER_HZ), N_MIN, N_MAX), delta = TAU / N;
  const xf = new THREE.Matrix4().makeScale(normScale, normScale, normScale);
  const poses = [];
  for (let p = 0; p < N; p++) {
    poseAt(clip, clip.duration * p / N);
    poses.push(parts.map((m) => skinnedGeometry(m, xf)));
    if (p % 4 === 3) await tick();
  }
  // a statue needs as much arc as its longest stride (model +Z runs along the tangent)
  let lo = Infinity, ext = 0;
  const opt = OPTIONS[clip.name] || {}, yawOff = opt.face === 'in' ? Math.PI / 2 : 0, ax = yawOff ? 0 : 2;   // 'in': swim towards the lantern
  for (const gs of poses) { lo = Math.min(lo, yRange(gs)[0]); let z0 = Infinity, z1 = -Infinity; for (const g of gs) { const a = g.attributes.position.array; for (let i = ax; i < a.length; i += 3) { if (a[i] < z0) z0 = a[i]; if (a[i] > z1) z1 = a[i]; } } ext = Math.max(ext, z1 - z0); }
  const scale = (RING_R * delta) / Math.max(FOOTPRINT, ext * 1.15), lift = opt.lift || 0;
  for (const gs of poses) for (const g of gs) { g.translate(0, -lo + lift, 0); g.scale(scale, scale, scale); g.computeBoundingSphere(); g.computeBoundingBox(); }
  // swap
  S.inspect = -1; S.liftIdx = -1; $('inspect').hidden = true;
  for (const s of statues) ringGroup.remove(s.holder);
  for (const gs of ring.poseGeos) for (const g of gs) g.dispose();
  statues.length = 0;
  for (let i = 0; i < N; i++) {
    const pose = (N - i) % N, a = i * delta;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R); holder.rotation.y = a + Math.PI / 2 + yawOff;
    const meshes = poses[pose].map((g, k) => { const m = new THREE.Mesh(g, parts[k].material); m.castShadow = true; m.receiveShadow = false; return m; });
    holder.add(...meshes); ringGroup.add(holder);
    statues.push({ holder, meshes, pose, angle: a, baseRot: a + Math.PI / 2 + yawOff, base: holder.position.clone() });
  }
  ring = { N, delta, clip, scale, poseGeos: poses, lift: lift * scale };
  paintPlatform(N);
  $('s-n').textContent = N;
  for (const b of $('clips').children) b.classList.toggle('on', b.dataset.clip === clip.name);
  needClear = true; baking = false;
}

// ---------------------------------------------------------------- wheel dynamics + shutter
const S = {
  theta: 0, omega: 0, dir: 1, motor: true, dragging: false,
  strobe: false, mix: 0, detune: 0, phase: 0, thetaFlash: 0, hz: 0, shown: 0,
  prevTheta: 0, flash: 0, fade: 0, time: 0, inspect: -1, liftIdx: -1, inspectSpin: 0, camT: 0,
};
const motorOmega = () => SHUTTER_HZ * ring.delta;
function stepWheel(dt) {
  const th0 = S.prevTheta;   // includes whatever a drag did to theta since the last frame
  if (!S.dragging) {
    const target = S.motor ? S.dir * motorOmega() : 0;
    S.omega += (target - S.omega) * (1 - Math.exp(-dt * 0.9));
    S.theta += S.omega * dt;
  }
  if (Math.abs(S.omega) > 0.3) S.dir = Math.sign(S.omega);
  // shutter phase: one flash each time the wheel advances by one statue (+ optional detune in Hz)
  const dphi = (S.theta - th0) / ring.delta + S.detune * dt * S.dir, p0 = S.phase, p1 = p0 + dphi;
  if (Math.floor(p1) !== Math.floor(p0) && dphi !== 0) {
    const b = dphi > 0 ? Math.floor(p1) : Math.floor(p0);
    S.thetaFlash = th0 + (S.theta - th0) * clamp((b - p0) / dphi, 0, 1);
  }
  S.phase = p1; S.prevTheta = S.theta;
  S.hz = dt > 0 ? Math.abs(dphi) / dt : 0;
}
function nearestAngle(a, ref) { return a + Math.round((ref - a) / TAU) * TAU; }

// ---------------------------------------------------------------- camera + the statue held in the hand
const HAND = new THREE.Vector3(-0.5, 1.55, RING_R + 2.6), HELD = 1.55;   // held statue is shown larger   // world spot a picked statue is lifted to
const _hl = new THREE.Vector3();
function statueHeight() { const b = ring.poseGeos[0]?.[0]?.boundingBox; return b ? b.max.y : 1; }
function applyLift(theta) {
  if (S.liftIdx < 0) return; const s = statues[S.liftIdx], e = smooth(0, 1, S.camT);
  // HAND expressed in the rotating wheel's frame, so the statue stays put while the wheel turns under it
  const c = Math.cos(-theta), sn = Math.sin(-theta); _hl.set(HAND.x * c + HAND.z * sn, HAND.y, -HAND.x * sn + HAND.z * c);
  s.holder.position.lerpVectors(s.base, _hl, e); s.holder.scale.setScalar(1 + (HELD - 1) * e);
  s.holder.rotation.y = s.baseRot + e * (S.inspectSpin - theta - s.baseRot + 0.6);
}
const CAM = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0, zoom: 1, tzoom: 1 };
const _v = new THREE.Vector3(), _look = new THREE.Vector3();
function placeCamera(dt) {
  const k = 1 - Math.exp(-dt * 4);
  CAM.yaw += (CAM.tyaw - CAM.yaw) * k; CAM.pitch += (CAM.tpitch - CAM.pitch) * k; CAM.zoom += (CAM.tzoom - CAM.zoom) * k;
  S.camT += ((S.inspect >= 0 ? 1 : 0) - S.camT) * (1 - Math.exp(-dt * 3));
  const portrait = clamp(1.5 / camera.aspect, 1, 2.4);
  const dist = 12.3 * portrait * CAM.zoom, el = 0.27 + CAM.pitch;
  const wide = _v.set(Math.sin(CAM.yaw) * Math.cos(el) * dist, Math.sin(el) * dist + 0.6, Math.cos(CAM.yaw) * Math.cos(el) * dist);
  const e = smooth(0, 1, S.camT), hh = statueHeight() * 0.5 * HELD, d = (2.1 + statueHeight() * HELD * 1.7) * portrait;
  camera.position.set(wide.x + (HAND.x + 0.62 - wide.x) * e, wide.y + (HAND.y + hh + 0.1 - wide.y) * e, wide.z + (HAND.z + d - wide.z) * e);
  _look.set(0, 0.95, 0).lerp(_v.set(HAND.x + 0.62, HAND.y + hh, HAND.z), e);
  camera.lookAt(_look);
}

// ---------------------------------------------------------------- frame
let alphaBoost = 0, lastCam = new THREE.Vector3();
function renderScene(theta) { wheel.rotation.y = theta; applyLift(theta); renderer.setRenderTarget(rtScene); renderer.render(scene, camera); }
function accumulate(alpha) {
  fsQuad.material = accumMat; accumMat.uniforms.tPrev.value = rtA.texture; accumMat.uniforms.tNew.value = rtScene.texture; accumMat.uniforms.uAlpha.value = alpha;
  renderer.setRenderTarget(rtB); renderer.render(fsScene, fsCam);
  const t = rtA; rtA = rtB; rtB = t;
}
function frame(dt) {
  dt = Math.min(dt, 0.1); S.time += dt;
  if (DIRECTOR) director(S.time);
  const th0 = S.prevTheta;
  stepWheel(dt);
  S.mix += ((S.strobe ? 1 : 0) - S.mix) * (1 - Math.exp(-dt * 14));
  S.flash *= Math.exp(-dt * 7);
  const m = S.mix;
  // lights
  candle.intensity = 60 * (1 - 0.72 * m) * (0.96 + 0.04 * Math.sin(S.time * 9.1) * Math.sin(S.time * 3.7));
  warmFill.intensity = 0.9 * (1 - 0.8 * m); hemi.intensity = 0.6 - 0.25 * m;
  key.intensity = 900 * m; rimLight.intensity = 0.5 * m; key.castShadow = useShadows && m > 0.02;
  glow.material.opacity = 1 - 0.45 * m; for (const lm of lanternMats) lm.emissiveIntensity = 1.5 - 1.0 * m;
  placeCamera(dt);
  const eI = smooth(0, 1, S.camT);
  if (S.inspect >= 0) S.inspectSpin += dt * 0.6 * eI;
  else if (S.liftIdx >= 0 && S.camT < 0.004) { const s = statues[S.liftIdx]; s.holder.position.copy(s.base); s.holder.rotation.y = s.baseRot; s.holder.scale.setScalar(1); S.liftIdx = -1; }
  key.intensity *= 1 - 0.8 * eI; candle.intensity *= 1 - 0.35 * eI; handLight.intensity = 260 * eI;
  const camMove = camera.position.distanceTo(lastCam) / Math.max(dt, 1e-4); lastCam.copy(camera.position);
  alphaBoost += ((camMove > 2.5 ? 1 : 0) - alphaBoost) * (1 - Math.exp(-dt * 10));

  // what the eye receives this frame
  const live = 1 - smooth(4, 9, S.hz);                       // too slow to fuse: just show the wheel
  const tauBlur = 0.085, tauHold = 0.004;
  const tau = THREE.MathUtils.lerp(THREE.MathUtils.lerp(tauBlur, tauHold, m), 0.006, Math.max(alphaBoost, 0));
  const aFrame = needClear ? 1 : 1 - Math.exp(-dt / tau);
  if (m > 0.5) {
    S.shown = S.thetaFlash + (S.theta - S.thetaFlash) * live;
    renderScene(S.shown); accumulate(aFrame);
  } else {
    const K = needClear ? 1 : subSamples, aSub = 1 - Math.pow(1 - aFrame, 1 / K);
    for (let j = 0; j < K; j++) { S.shown = th0 + (S.theta - th0) * ((j + rand()) / K); renderScene(S.shown); accumulate(needClear ? 1 : aSub); }
  }
  needClear = false;
  fsQuad.material = outMat; outMat.uniforms.tAcc.value = rtA.texture; outMat.uniforms.uFlash.value = S.flash; outMat.uniforms.uCool.value = m; outMat.uniforms.uTime.value = S.time % 10; outMat.uniforms.uFade.value = S.fade;
  renderer.setRenderTarget(null); renderer.render(fsScene, fsCam);
  if (capNow !== capTarget) { capNow += (capTarget - capNow) * (1 - Math.exp(-dt * 7)); if (Math.abs(capNow - capTarget) < 0.01) capNow = capTarget; $('caption').style.opacity = capNow; }
  hud(dt);
}
let subSamples = QUALITY === 'high' ? 4 : QUALITY === 'low' ? 1 : 2;

let hudT = 0;
function hud(dt) {
  hudT += dt; if (hudT < 0.12) return; hudT = 0;
  $('s-rev').textContent = (Math.abs(S.omega) / TAU).toFixed(2);
  $('s-hz').textContent = S.strobe ? Math.round(S.hz) : '—';
}

// ---------------------------------------------------------------- input
function setStrobe(on) {
  if (S.strobe === on) return; S.strobe = on; if (on) S.flash = 1;
  $('mode').setAttribute('aria-pressed', on); $('detune-wrap').classList.toggle('live', on); $('hint').classList.add('gone');
}
let drag = null;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickStatue(ev) {
  const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); wheel.rotation.y = S.shown; wheel.updateMatrixWorld(true);
  const hits = ray.intersectObjects(statues.flatMap((s) => s.meshes), false);
  if (!hits.length) return -1;
  return statues.findIndex((s) => s.meshes.includes(hits[0].object));
}
canvas.addEventListener('pointerdown', (ev) => {
  if (DIRECTOR) return;
  canvas.setPointerCapture(ev.pointerId); canvas.classList.add('dragging');
  drag = { x: ev.clientX, y: ev.clientY, x0: ev.clientX, y0: ev.clientY, t: performance.now(), moved: 0, orbit: ev.button === 2 || ev.shiftKey, v: 0 };
  if (!drag.orbit && S.inspect < 0) { S.dragging = true; S.omega = 0; }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.t = now; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.orbit) { CAM.tyaw = clamp(CAM.tyaw - dx * 0.004, -0.9, 0.9); CAM.tpitch = clamp(CAM.tpitch + dy * 0.003, -0.2, 0.5); return; }
  if (S.inspect >= 0 && !drag.spin) { S.inspectSpin += dx * 0.01; return; }
  const dth = dx * (5.2 / canvas.clientWidth);
  S.theta += dth; drag.v = drag.v * 0.6 + (dth / dt) * 0.4; S.omega = drag.v;
  if (drag.moved > 30) $('hint').classList.add('gone');
});
function endDrag(ev) {
  if (!drag) return; canvas.classList.remove('dragging');
  const click = drag.moved < 6, idle = performance.now() - drag.t > 120;
  if (S.dragging) { S.dragging = false; S.omega = idle ? 0 : clamp(drag.v, -3.2 * motorOmega(), 3.2 * motorOmega()); if (Math.abs(S.omega) > 0.3) S.dir = Math.sign(S.omega); }
  if (click && !drag.orbit) { if (S.inspect >= 0) closeInspect(); else { const i = pickStatue(ev); if (i >= 0) openInspect(i); } }
  drag = null;
}
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); CAM.tzoom = clamp(CAM.tzoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.5); }, { passive: false });
let spaceHeld = false, spaceT = 0, spacePrev = false;
addEventListener('keydown', (e) => {
  if (DIRECTOR) return;
  if (e.code === 'Space') { e.preventDefault(); if (!spaceHeld) { spaceHeld = true; spaceT = performance.now(); spacePrev = S.strobe; setStrobe(!spacePrev); } }
  if (e.code === 'Escape') { closeInspect(); $('backstage').hidden = true; }
});
addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !spaceHeld) return; spaceHeld = false;
  if (performance.now() - spaceT > 350) setStrobe(spacePrev);   // long press = momentary, tap = toggle
});
$('mode').addEventListener('click', () => setStrobe(!S.strobe));
$('detune').addEventListener('input', (e) => { S.detune = +e.target.value; });
$('detune').addEventListener('dblclick', (e) => { e.target.value = 0; S.detune = 0; });

function openInspect(i) {
  if (S.liftIdx >= 0 && S.liftIdx !== i) { const o = statues[S.liftIdx]; o.holder.position.copy(o.base); o.holder.rotation.y = o.baseRot; o.holder.scale.setScalar(1); }
  S.inspect = i; S.liftIdx = i; S.inspectSpin = 0; $('inspect').hidden = false; $('backstage').hidden = true;
  $('i-idx').textContent = statues[i].pose + 1; $('i-n').textContent = ring.N; $('hint').classList.add('gone');
}
function closeInspect() {
  if (S.inspect < 0) return; S.inspect = -1; $('inspect').hidden = true;
}
$('inspect-close').addEventListener('click', closeInspect);
$('backstage-btn').addEventListener('click', () => { closeInspect(); $('backstage').hidden = !$('backstage').hidden; });
$('backstage-close').addEventListener('click', () => { $('backstage').hidden = true; });

// ---------------------------------------------------------------- STL export (millimetres, Z up)
function printable(geos, matrix) {
  const out = [];
  for (const g of geos) {
    const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position.clone()); c.setAttribute('normal', g.attributes.normal.clone()); if (g.index) c.setIndex(g.index.clone());
    c.applyMatrix4(matrix); out.push(c.index ? c.toNonIndexed() : c);
  }
  return out;
}
function saveSTL(geos, name) {
  const merged = mergeGeometries(geos, false), zUp = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  merged.applyMatrix4(zUp);
  const data = new STLExporter().parse(new THREE.Mesh(merged), { binary: true });
  const tris = merged.attributes.position.count / 3;
  if (!CAPTURE) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'model/stl' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  merged.dispose(); for (const g of geos) g.dispose();
  const res = { bytes: data.byteLength, tris, name };
  if (window.__keepSTL) { const u = new Uint8Array(data.buffer || data); let b = ''; for (let i = 0; i < u.length; i += 32768) b += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); res.b64 = btoa(b); }
  return res;
}
function exportOne(pose, heightMM = 80) {
  const [lo, hi] = yRange(ring.poseGeos[pose]); const k = heightMM / (hi - lo);
  return saveSTL(printable(ring.poseGeos[pose], new THREE.Matrix4().makeScale(k, k, k)), `zoumadeng_${ring.clip.name}_pose${String(pose + 1).padStart(2, '0')}_${heightMM}mm.stl`);
}
function exportRing(diameterMM = 180) {
  const k = diameterMM / (2 * PLAT_R), geos = [];
  for (const s of statues) {
    const mtx = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(s.holder.position.x, 0, s.holder.position.z)).multiply(new THREE.Matrix4().makeRotationY(s.baseRot));
    geos.push(...printable(ring.poseGeos[s.pose], mtx));
  }
  const base = new THREE.CylinderGeometry(PLAT_R, PLAT_R, 0.06, 96).translate(0, -0.03 + 0.004, 0).toNonIndexed(); base.deleteAttribute('uv'); base.applyMatrix4(new THREE.Matrix4().makeScale(k, k, k)); geos.push(base);
  return saveSTL(geos, `zoumadeng_${ring.clip.name}_ring${ring.N}_${diameterMM}mm.stl`);
}
$('stl-one').addEventListener('click', () => { const r = exportOne(statues[S.inspect].pose); $('stl-note').textContent = `已导出 · ${r.tris.toLocaleString()} 三角面 · ${(r.bytes / 1048576).toFixed(1)} MB`; });
$('stl-ring').addEventListener('click', () => { const r = exportRing(); $('stl-note').textContent = `整圈已导出 · 直径 180 mm · ${(r.bytes / 1048576).toFixed(1)} MB`; });

// ---------------------------------------------------------------- scripted showreel (?director / ?capture)
let SHOTS = [], shotDone = new Set();
let capTarget = 0, capNow = 0;   // caption fade is driven by simulation time so recordings match live playback
function caption(zh, en) { const c = $('caption'); if (!zh) { capTarget = 0; return; } c.innerHTML = zh + (en ? `<small>${en}</small>` : ''); capTarget = 1; }
function director(t) {
  for (const s of SHOTS) if (t >= s.t && !shotDone.has(s)) { shotDone.add(s); s.do?.(); }
  for (const s of SHOTS) if (s.during && t >= s.t && t < s.until) s.during((t - s.t) / (s.until - s.t), t - s.t);
}

// ---------------------------------------------------------------- boot
async function boot() {
  makeTargets();
  const manifest = await (await fetch('./assets/manifest.json')).json();
  const gltf = await new GLTFLoader().loadAsync('./assets/' + manifest.model);
  gltfRoot = gltf.scene; gltfRoot.updateMatrixWorld(true);
  gltfRoot.traverse((o) => { if (o.isMesh) parts.push(o); });
  for (const p of parts) for (const mat of [].concat(p.material)) { if (!mat.metalnessMap) mat.metalness = Math.min(mat.metalness, 0.1); mat.roughness = Math.max(mat.roughness, 0.45); if (mat.map) mat.map.anisotropy = 8; mat.side = THREE.FrontSide; }
  if (manifest.lantern) {
    try {
      const lg = (await new GLTFLoader().loadAsync('./assets/' + manifest.lantern)).scene, box = new THREE.Box3().setFromObject(lg), size = box.getSize(new THREE.Vector3()), k = 1.75 / size.y;
      lg.scale.setScalar(k); lg.position.set(-(box.min.x + size.x / 2) * k, 1.22 - box.min.y * k, -(box.min.z + size.z / 2) * k);
      lg.traverse((o) => { if (o.isMesh) for (const mat of [].concat(o.material)) { mat.emissive = new THREE.Color(0xffa550); mat.emissiveMap = mat.map; mat.emissiveIntensity = 1.5; mat.metalness = 0; lanternMats.push(mat); } });
      lantern.add(lg); placeholder.visible = false; glow.position.y = 1.22 + 0.8; candle.position.y = 2.0;
    } catch (e) { console.warn('lantern model missing, using placeholder', e); }
  }
  mixer = new THREE.AnimationMixer(gltfRoot);
  for (const c of gltf.animations) if (manifest.rename?.[c.name]) c.name = manifest.rename[c.name];
  OPTIONS = manifest.options || {};
  const order = manifest.clips || Object.keys(CLIP_LABEL);
  clips = order.map((n) => gltf.animations.find((c) => c.name === n)).filter(Boolean);
  if (!clips.length) clips = gltf.animations;
  // normalise: character height = 1 in its first frame
  poseAt(clips[0], 0);
  const [lo, hi] = yRange(parts.map((m) => skinnedGeometry(m, null))); normScale = 1 / (hi - lo);
  for (const c of clips) { const b = document.createElement('button'); b.textContent = CLIP_LABEL[c.name] || c.name; b.dataset.clip = c.name; b.title = c.name; b.addEventListener('click', () => { closeInspect(); buildRing(c); }); $('clips').appendChild(b); }
  const pl = $('pipeline'); for (const step of manifest.pipeline || []) { const li = document.createElement('li'); li.innerHTML = `<b>${step.title}</b><br>${step.text}<br><code>${step.task || ''}</code>` + (step.image ? `<img src="./assets/${step.image}" alt="">` : ''); pl.appendChild(li); }
  await buildRing(clips.find((c) => c.name === (Q.get('clip') || manifest.start)) || clips[0]);
  S.omega = motorOmega() * 0.25;
  window.zmd = { S, CAM, motorOmega, ring: () => ring, statues, clips, buildRing, setStrobe, openInspect, closeInspect, exportOne, exportRing, caption, renderer, setShots: (s) => { SHOTS = s; shotDone = new Set(); } };
  if (DIRECTOR) { document.body.classList.add('director'); const mod = await import('./director.js'); mod.install(window.zmd); }
  addEventListener('resize', makeTargets);
  $('loading').classList.add('done');
  if (CAPTURE) { S.fade = DIRECTOR ? 0 : 1; window.__frame = (dt) => frame(dt); window.__ready = true; return; }
  let last = performance.now(), slow = 0, fast = 0;
  const loop = (now) => {
    const dt = (now - last) / 1000; last = now;
    if (!DIRECTOR) S.fade = Math.min(1, S.fade + dt * 1.2);
    frame(dt);
    if (QUALITY === 'auto' && !baking) {                       // adaptive: protect the frame rate on weak GPUs
      slow = dt > 0.034 ? slow + dt : Math.max(0, slow - dt * 2);
      if (slow > 2.5) { slow = 0; if (subSamples > 1) subSamples = 1; else if (useShadows) useShadows = false; else if (pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); makeTargets(); } }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot().catch((e) => { console.error(e); $('loadmsg').textContent = '加载失败：' + e.message; });
