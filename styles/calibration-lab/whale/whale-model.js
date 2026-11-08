// Mechanical Cetacean V6 (Balaenoptera AQ-12 · Field Simulator)
// 6-Tier Full Component-Level Exploded Disassembly (~184 Independent Parts) + Clean Functional Interior:
//   1. Closed state preserves V5's clean, non-cluttered engineering interior (zero fake wire-soup or contrived shell-lift jacks).
//   2. Exploded state separates EVERY component across 6 radial/axial/transverse tiers:
//      - Tier 1 & 2: Every outer ceramic fairing plate + inner machined titanium backing truss (52% sandwich layer)
//      - Tier 3: 22-part pectoral hydrofoil wing disassembly (3-part spline coupling + 5 chordwise fairing/truss segments + central spar)
//      - Tier 4: All 10 coaxial bearing & optic hubs exploded into 6–7 axial layers (housing, 8-bolt ring, seal, race, stator, cap, pin/lens)
//      - Tier 5: All 4 internal modules disassembled in place (6-part Sonar Pod, 9-part Gearbox, 13-part MHD Stator & 6 Copper Rings, Bellows/Bulkheads)
//      - Tier 6: Lateral hydraulic actuators step into service lane and axially extract chrome piston rods from gunmetal barrels.

import { THREE, governMaterialRole, resolveMechProfile } from '/styles/calibration-lab/kernel.js';
import {
  loadGLB,
  partsOf,
  applyMaterials,
  createMaterials,
  governMaterial,
  cutWindow,
  wearMaps,
  windowRim,
  flangedRing,
  swept,
} from '/styles/calibration-lab/sample/kit-compat.js';
import { P } from './palette.js';
import { G, BULKHEAD_STATIONS } from './kin.js';
import { buildOpenGearboxCradle, buildWhaleLinkages } from './whale-linkages.js';

const hullGlb = new URL('./hull.glb', import.meta.url).href;
const V3 = THREE.Vector3;

function machinedRingGeo(rOuter, rInner, thick, bevel = 0.015, segs = 48) {
  const hz = thick * 0.5;
  const b = Math.min(bevel, (rOuter - rInner) * 0.35, hz * 0.65);
  const profile = [
    [rInner, -hz + b],
    [rInner + b, -hz],
    [rOuter - b, -hz],
    [rOuter, -hz + b],
    [rOuter, hz - b],
    [rOuter - b, hz],
    [rInner + b, hz],
    [rInner, hz - b],
  ];
  const nP = profile.length;
  const verts = [];
  const norms = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const ang = u * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    for (let j = 0; j < nP; j++) {
      const [r0, z0] = profile[j];
      const [r1, z1] = profile[(j + 1) % nP];
      const dr = r1 - r0;
      const dz = z1 - z0;
      const len = Math.hypot(dr, dz) || 1;
      const nr = dz / len;
      const nz = -dr / len;

      for (const [r, z, vOff] of [
        [r0, z0, j / nP],
        [r1, z1, (j + 1) / nP],
      ]) {
        verts.push(r * ca, r * sa, z);
        norms.push(nr * ca, nr * sa, nz);
        uvs.push(u, vOff);
      }
    }
  }

  const stride = nP * 2;
  for (let i = 0; i < segs; i++) {
    const row0 = i * stride;
    const row1 = (i + 1) * stride;
    for (let j = 0; j < nP; j++) {
      const a = row0 + j * 2;
      const b = row0 + j * 2 + 1;
      const c = row1 + j * 2 + 1;
      const d = row1 + j * 2;
      indices.push(a, d, c, a, c, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function makeWhaleArmorTexture(mode = 'plain', overlay = null) {
  const W = 1024;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  const isCeramic = mode === 'ceramic' || mode === '04';
  const gr = g.createLinearGradient(0, 32, 0, H);
  const stops = isCeramic ? P.shell.ceramic : P.shell.plain;
  [0, 0.4, 0.8, 1].forEach((t, i) => gr.addColorStop(t, stops[i]));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);

  const chamfer = (x, y, w, h, horizontal) => {
    g.fillStyle = P.shell.chamferDark;
    g.fillRect(x, y, w, h);
    g.fillStyle = P.shell.chamferLight;
    if (horizontal) g.fillRect(x, y + (y === 0 ? h : -3), w, 3);
    else g.fillRect(x + (x === 0 ? w : -3), y, 3, h);
  };
  chamfer(0, 0, 10, H, false);
  chamfer(W - 10, 0, 10, H, false);
  chamfer(0, 0, W, 8, true);
  chamfer(0, H - 8, W, 8, true);

  const drawDoglegGroove = (yLeft, yRight, xStep) => {
    const dy = yRight - yLeft;
    const x1 = xStep - Math.abs(dy) * 0.5;
    const x2 = xStep + Math.abs(dy) * 0.5;
    g.lineWidth = 1.5;
    g.strokeStyle = P.shell.panelLine;
    g.beginPath();
    g.moveTo(18, yLeft);
    g.lineTo(x1, yLeft);
    g.lineTo(x2, yRight);
    g.lineTo(W - 18, yRight);
    g.stroke();

    g.lineWidth = 1.0;
    g.strokeStyle = P.shell.panelHi;
    g.beginPath();
    g.moveTo(18, yLeft + 2);
    g.lineTo(x1, yLeft + 2);
    g.lineTo(x2, yRight + 2);
    g.lineTo(W - 18, yRight + 2);
    g.stroke();
  };

  if (mode !== 'pleat') {
    drawDoglegGroove(Math.round(H * 0.35), Math.round(H * 0.44), Math.round(W * 0.46));
    drawDoglegGroove(Math.round(H * 0.72), Math.round(H * 0.64), Math.round(W * 0.60));
  }

  // Clean, restrained flush maintenance hatches (no repetitive orange edge-paint speckles!)
  const drawHatch = (x, y, w, h) => {
    g.strokeStyle = P.shell.hatchLine;
    g.lineWidth = 1.4;
    g.strokeRect(x, y, w, h);
    g.strokeStyle = P.shell.hatchHi;
    g.lineWidth = 1.0;
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = P.shell.hatchDot;
    for (const [sx, sy] of [
      [x + 10, y + 10],
      [x + w - 10, y + 10],
      [x + 10, y + h - 10],
      [x + w - 10, y + h - 10],
    ]) {
      g.beginPath();
      g.arc(sx, sy, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  };

  if (mode !== 'pleat') {
    drawHatch(isCeramic ? W * 0.54 : W * 0.18, H * 0.18, 152, 82);
  } else {
    for (const xFlute of [W * 0.25, W * 0.50, W * 0.75]) {
      g.fillStyle = 'rgba(92, 98, 108, 0.16)';
      g.fillRect(xFlute - 4, 14, 8, H - 28);
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      g.fillRect(xFlute + 4, 14, 2, H - 28);
    }
  }

  const pinholeCoords = [
    [32, 36],
    [32, H - 36],
    [W - 32, 36],
    [W - 32, H - 36],
  ];
  for (const [px, py] of pinholeCoords) {
    g.fillStyle = P.shell.hatchDot;
    g.beginPath();
    g.arc(px, py, 3.0, 0, Math.PI * 2);
    g.fill();
  }

  if (overlay) g.drawImage(overlay, 0, 0, W, H);

  if (mode === '12' || mode === '04' || mode === '08') {
    g.save();
    g.translate(W * 0.50, H * 0.52);
    g.scale(1.0, 0.52);
    g.fillStyle = P.glow.stencilBar;
    g.fillRect(-96, -152, 192, 22);
    g.font = '700 220px "JetBrains Mono", "Courier New", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = P.shell.stencil;
    g.fillText(mode, 0, 0);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

// Builds a clean 3D CAD polar circle / degree-tick LineSegments helper
function buildPolarReticle({ radius = 1.0, segs = 72, startAng = 0, endAng = Math.PI * 2, tickEvery = 6, tickLen = 0.08, plane = 'xy', color = '#22262E', opacity = 0.28 }) {
  const pts = [];
  const put = (a, r) => {
    const ca = Math.cos(a) * r;
    const sa = Math.sin(a) * r;
    if (plane === 'xz') return [ca, 0, sa];
    if (plane === 'yz') return [0, ca, sa];
    return [ca, sa, 0];
  };
  for (let i = 0; i < segs; i++) {
    const a0 = startAng + ((endAng - startAng) * i) / segs;
    const a1 = startAng + ((endAng - startAng) * (i + 1)) / segs;
    pts.push(...put(a0, radius), ...put(a1, radius));
    if (tickEvery > 0 && i % tickEvery === 0) {
      const major = i % (tickEvery * 3) === 0 ? 1.7 : 1.0;
      pts.push(...put(a0, radius), ...put(a0, radius + tickLen * major));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.userData.skipContactShadow = true;
  lines.userData.auditIgnore = true;
  lines.frustumCulled = false;
  return { lines, mat };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const stagger = (k, order = 0.5, span = 0.58) => {
  if (k <= 0.0001) return 0;
  if (k >= 0.9999) return 1;
  const start = order * (1 - span);
  return smooth01((k - start) / span);
};

export async function buildWhale({ clipPlane, studio, mechProfile } = {}) {
  const activeMech = resolveMechProfile(mechProfile ?? studio?.mechProfile ?? 'kinetic');
  const useIris = !!(activeMech?.enabled && activeMech?.syncIrises);
  const usePlanetary = !!(activeMech?.enabled && activeMech?.planetaryDrives);
  const M = createMaterials(
    {
      white: P.mech.white,
      ceramic: P.mech.ceramic,
      alu: P.mech.alu,
      aluDark: P.mech.aluDark,
      titanium: P.mech.titanium,
      steel: P.mech.steel,
      chrome: P.mech.chrome,
      structure: P.mech.structure,
      liner: P.mech.liner,
      hose: P.mech.hose,
      brass: P.mech.brass,
      bronze: P.mech.bronze,
      accent: P.glow.accent,
    },
    { normalScale: 0.38 },
  );

  const cavityMat = governMaterial(
    new THREE.MeshStandardMaterial({
      color: P.mech.cavity,
      metalness: 0.28,
      roughness: 0.58,
    }),
    'precision',
  );
  cavityMat.userData.role = 'liner';

  M.liner.metalness = 0.22;
  M.liner.roughness = 0.64;
  M.liner.userData.role = 'liner';

  M.structure.metalness = 0.86;
  M.structure.roughness = 0.36;
  M.structure.clearcoat = 0.0;
  M.structure.envMapIntensity = 1.12;

  M.aluDark.metalness = 0.86;
  M.aluDark.roughness = 0.36;
  M.aluDark.envMapIntensity = 1.15;

  M.darkGunmetal = M.aluDark.clone();
  M.darkGunmetal.color.set('#444B56');
  M.darkGunmetal.metalness = 0.88;
  M.darkGunmetal.roughness = 0.26;
  M.darkGunmetal.envMapIntensity = 1.38;

  for (const k of ['steel', 'chrome', 'titanium', 'alu', 'aluDark', 'structure', 'darkGunmetal', 'brass', 'bronze']) {
    governMaterialRole(M[k], 'metal');
  }
  M.steel.metalness = 0.94;
  M.steel.roughness = 0.20;
  M.steel.envMapIntensity = 1.35;
  M.titanium.metalness = 0.88;
  M.titanium.roughness = 0.28;
  M.titanium.envMapIntensity = 1.30;
  M.alu.metalness = 0.88;
  M.alu.roughness = 0.32;
  M.brass.metalness = 0.92;
  M.brass.roughness = 0.24;
  M.bronze.metalness = 0.92;
  M.bronze.roughness = 0.26;

  M.copper = governMaterial(
    new THREE.MeshStandardMaterial({
      color: P.seam.copper,
      metalness: 0.92,
      roughness: 0.20,
      envMapIntensity: 1.25,
    }),
    'precision',
  );
  governMaterialRole(M.copper, 'metal');

  M.orangeRing = governMaterial(
    new THREE.MeshStandardMaterial({
      color: P.glow.accent,
      emissive: P.glow.accent,
      emissiveIntensity: 0.08,
      metalness: 0.58,
      roughness: 0.26,
      envMapIntensity: 1.12,
    }),
    'precision',
  );
  M.orangeRing.userData.role = 'other';

  const { bumpMap, roughnessMap, overlay } = wearMaps({
    seed: 12,
    grain: 0.16,
    edges: 0.18,
    chips: 0.06,
    panels: 0.04,
    cracks: 0.0,
    rivets: 0.14,
    lineScale: 1.1,
    ink: P.shell.wearInk,
  });

  const makeShellMat = (mode) =>
    governMaterial(
      new THREE.MeshPhysicalMaterial({
        map: makeWhaleArmorTexture(mode, overlay),
        bumpMap,
        bumpScale: 0.012,
        roughnessMap,
        roughness: 0.42,
        metalness: 0.04,
        clearcoat: 0.72,
        clearcoatRoughness: 0.10,
      }),
      'shell',
    );

  const shellMatWhite = makeShellMat('plain');
  const shellMatCeramic = makeShellMat('ceramic');
  const shellMatPleat = makeShellMat('pleat');
  const shellMat12 = makeShellMat('12');
  const shellMat04 = makeShellMat('04');
  const shellMat08 = makeShellMat('08');

  const ghostMat = new THREE.MeshPhysicalMaterial({
    color: P.shell.ghost,
    roughness: 0.45,
    metalness: 0.05,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const eyeGlowMat = new THREE.MeshStandardMaterial({
    color: P.glow.eyeBase,
    emissive: P.glow.eyeEmissive,
    emissiveIntensity: 0.95,
    roughness: 0.28,
    metalness: 0.0,
  });
  governMaterialRole(eyeGlowMat, 'emissive');

  const eyeLensMat = new THREE.MeshPhysicalMaterial({
    color: '#121820',
    roughness: 0.05,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
  });

  const root = new THREE.Group();
  root.name = 'WhaleAssembly';

  // ------------------------------------------------------------------ 0. Hierarchical Skeletal Bone Chain
  const BONE_WORLD_REST = {
    thoracic: new V3(0, 0, 0),
    cranial: new V3(-4.938, 1.117, 0),
    jaw: new V3(-0.740, -0.950, 0),
    flipper_L: new V3(G.shoulderHub[0], G.shoulderHub[1], G.shoulderHub[2]),
    flipper_R: new V3(G.shoulderHub[0], G.shoulderHub[1], -G.shoulderHub[2]),
    flipper_dist_L: new V3(G.flipperDistHub[0], G.flipperDistHub[1], G.flipperDistHub[2]),
    flipper_dist_R: new V3(G.flipperDistHub[0], G.flipperDistHub[1], -G.flipperDistHub[2]),
    spine_0: new V3(1.95, 0.56, 0),
    lumbar: new V3(G.midHub[0], 0.43, 0),
    lumbar_2: new V3(5.98, 0.58, 0),
    peduncle: new V3(G.aftHub[0], 0.83, 0),
    peduncle_2: new V3(8.25, 1.18, 0),
    peduncle_3: new V3(9.12, 1.62, 0),
    fluke: new V3(G.flukeHub[0], G.flukeHub[1], 0),
  };

  const thoracicBone = new THREE.Group();
  thoracicBone.name = 'bone_thoracic';
  root.add(thoracicBone);

  const cranialBone = new THREE.Group();
  cranialBone.name = 'bone_cranial';
  cranialBone.position.copy(BONE_WORLD_REST.cranial);
  thoracicBone.add(cranialBone);

  const jawBone = new THREE.Group();
  jawBone.name = 'bone_jaw';
  jawBone.position.copy(BONE_WORLD_REST.jaw);
  thoracicBone.add(jawBone);

  const flipperBoneL = new THREE.Group();
  flipperBoneL.name = 'bone_flipper_L';
  flipperBoneL.position.copy(BONE_WORLD_REST.flipper_L);
  thoracicBone.add(flipperBoneL);

  const flipperDistBoneL = new THREE.Group();
  flipperDistBoneL.name = 'bone_flipper_dist_L';
  flipperDistBoneL.position.copy(BONE_WORLD_REST.flipper_dist_L).sub(BONE_WORLD_REST.flipper_L);
  flipperBoneL.add(flipperDistBoneL);

  const flipperBoneR = new THREE.Group();
  flipperBoneR.name = 'bone_flipper_R';
  flipperBoneR.position.copy(BONE_WORLD_REST.flipper_R);
  thoracicBone.add(flipperBoneR);

  const flipperDistBoneR = new THREE.Group();
  flipperDistBoneR.name = 'bone_flipper_dist_R';
  flipperDistBoneR.position.copy(BONE_WORLD_REST.flipper_dist_R).sub(BONE_WORLD_REST.flipper_R);
  flipperBoneR.add(flipperDistBoneR);

  const spine0Bone = new THREE.Group();
  spine0Bone.name = 'bone_spine_0';
  spine0Bone.position.copy(BONE_WORLD_REST.spine_0);
  thoracicBone.add(spine0Bone);

  const lumbarBone = new THREE.Group();
  lumbarBone.name = 'bone_lumbar';
  lumbarBone.position.copy(BONE_WORLD_REST.lumbar).sub(BONE_WORLD_REST.spine_0);
  spine0Bone.add(lumbarBone);

  const lumbar2Bone = new THREE.Group();
  lumbar2Bone.name = 'bone_lumbar_2';
  lumbar2Bone.position.copy(BONE_WORLD_REST.lumbar_2).sub(BONE_WORLD_REST.lumbar);
  lumbarBone.add(lumbar2Bone);

  const peduncleBone = new THREE.Group();
  peduncleBone.name = 'bone_peduncle';
  peduncleBone.position.copy(BONE_WORLD_REST.peduncle).sub(BONE_WORLD_REST.lumbar_2);
  lumbar2Bone.add(peduncleBone);

  const peduncle2Bone = new THREE.Group();
  peduncle2Bone.name = 'bone_peduncle_2';
  peduncle2Bone.position.copy(BONE_WORLD_REST.peduncle_2).sub(BONE_WORLD_REST.peduncle);
  peduncleBone.add(peduncle2Bone);

  const peduncle3Bone = new THREE.Group();
  peduncle3Bone.name = 'bone_peduncle_3';
  peduncle3Bone.position.copy(BONE_WORLD_REST.peduncle_3).sub(BONE_WORLD_REST.peduncle_2);
  peduncle2Bone.add(peduncle3Bone);

  const flukeBone = new THREE.Group();
  flukeBone.name = 'bone_fluke';
  flukeBone.position.copy(BONE_WORLD_REST.fluke).sub(BONE_WORLD_REST.peduncle_3);
  peduncle3Bone.add(flukeBone);

  const BONES = {
    thoracic: thoracicBone,
    cranial: cranialBone,
    jaw: jawBone,
    flipper_L: flipperBoneL,
    flipper_R: flipperBoneR,
    flipper_dist_L: flipperDistBoneL,
    flipper_dist_R: flipperDistBoneR,
    spine_0: spine0Bone,
    lumbar: lumbarBone,
    lumbar_2: lumbar2Bone,
    peduncle: peduncleBone,
    peduncle_2: peduncle2Bone,
    peduncle_3: peduncle3Bone,
    fluke: flukeBone,
  };

  function bindToBone(obj, boneKey) {
    const bGroup = BONES[boneKey] || thoracicBone;
    const bRest = BONE_WORLD_REST[boneKey] || BONE_WORLD_REST.thoracic;
    obj.position.sub(bRest);
    bGroup.add(obj);
  }

  function makeBoneSocket(worldCoord, boneKey) {
    const s = new THREE.Object3D();
    const bGroup = BONES[boneKey] || thoracicBone;
    const bRest = BONE_WORLD_REST[boneKey] || BONE_WORLD_REST.thoracic;
    s.position.set(worldCoord[0] - bRest.x, worldCoord[1] - bRest.y, worldCoord[2] - bRest.z);
    bGroup.add(s);
    return { socket: s, basePos: s.position.clone() };
  }

  // Callout tracking sockets (exposed to world.js so 3D-to-2D HUD leaders follow moving/detaching modules!)
  const sockets = {};
  const addCalloutSocket = (key, parent, localPos) => {
    const o = new THREE.Object3D();
    o.position.set(localPos[0], localPos[1], localPos[2]);
    parent.add(o);
    sockets[key] = o;
    return o;
  };

  // Machined Titanium Spline Shaft Stubs on both Pectoral Hydrofoil roots (explodes coaxially into 3 parts!)
  const splineStubGeo = new THREE.CylinderGeometry(0.19, 0.21, 0.56, 24).rotateX(Math.PI / 2);
  const splineCollarGeo = machinedRingGeo(0.28, 0.18, 0.08, 0.012, 32);
  const wingSplineParts = [];
  for (const [fBone, zSgn] of [
    [flipperBoneL, 1],
    [flipperBoneR, -1],
  ]) {
    const stubGroup = new THREE.Group();
    const stub = new THREE.Mesh(splineStubGeo, M.titanium);
    stub.position.z = -zSgn * 0.22;
    const bronzeSpline = new THREE.Mesh(splineCollarGeo, M.bronze);
    bronzeSpline.position.z = -zSgn * 0.42;
    const lockCollar = new THREE.Mesh(splineCollarGeo, M.steel);
    lockCollar.position.z = -zSgn * 0.04;
    stubGroup.add(stub, bronzeSpline, lockCollar);
    fBone.add(stubGroup);
    wingSplineParts.push({ stub, bronzeSpline, lockCollar, zSgn, isPort: zSgn > 0 });
  }
  addCalloutSocket('wingRoot', flipperBoneL, [0.0, 0.0, -0.36]);

  // ------------------------------------------------------------------ 1. Load 3-View Sculpted Hull (hull.glb) & Harmonize Modular Fairing Groups
  const hullRoot = await loadGLB(hullGlb, { studio });
  applyMaterials(hullRoot, M);

  const WIN_CX = -0.35;
  const WIN_CY = 1.38;
  const WIN_RX = 1.65;
  const WIN_RY = 0.62;
  const windowKeepWorld = (x, y, z) => {
    if (z < 0.25) return 1.0;
    const dx = (x - WIN_CX) / WIN_RX;
    const dy = (y - WIN_CY) / WIN_RY;
    return Math.hypot(dx, dy) - 1.0;
  };
  const inWindow = (nm) => /^dorsal__(flank_0[23]|ridge_0[12])_L$/.test(nm);

  const rimJobs = [];
  const shellMeshes = [];

  hullRoot.traverse((m) => {
    if (!m.isMesh) return;
    const nm = m.name;
    if (inWindow(nm)) {
      const px = m.position.x;
      const py = m.position.y;
      const pz = m.position.z;
      const { geometry, edges } = cutWindow(m.geometry, (x, y, z) => windowKeepWorld(x + px, y + py, z + pz));
      m.geometry.dispose();
      m.geometry = geometry;
      rimJobs.push({ mesh: m, edges });
    }
    if (nm.startsWith('trench__')) {
      m.material = cavityMat;
      return;
    }
    if (nm.includes('accent')) {
      m.material = M.orangeRing;
      return;
    }
    if (nm.includes('collar')) {
      m.material = M.titanium;
      return;
    }
    if (nm.includes('gimbal')) {
      m.material = M.steel;
      return;
    }
    if (nm.startsWith('truss__') || nm.includes('spar') || nm.includes('flipper_root_') || nm.includes('tail_cone_')) {
      m.material = M.titanium;
      return;
    }
    if (nm.includes('throat_liner_')) {
      m.material = shellMatCeramic;
      shellMeshes.push({ mesh: m, baseMat: m.material, wasGhost: false });
      return;
    }

    if (nm === 'dorsal__ridge_01_L' || nm === 'dorsal__flank_02_L') m.material = shellMat12;
    else if (nm === 'dorsal__flank_04_L' || nm === 'pectoral__flipper_L_02') m.material = shellMat04;
    else if (nm === 'cranial__maxilla_cowl_L' || nm === 'caudal__peduncle_top_01_L') m.material = shellMat08;
    else if (nm.startsWith('pectoral__pleat_')) m.material = shellMatPleat;
    else if (
      (nm.includes('_01_') && nm.includes('ridge_')) ||
      nm.includes('_03_') ||
      nm.includes('_05_') ||
      nm.includes('maxilla_cowl')
    ) {
      m.material = shellMatCeramic;
    } else {
      m.material = shellMatWhite;
    }

    shellMeshes.push({ mesh: m, baseMat: m.material, wasGhost: false });
  });

  for (const { mesh, edges } of rimJobs) {
    for (const e of edges) {
      mesh.add(windowRim(e, { depth: 0.14, lip: 0.040, wallMat: cavityMat, lipMat: M.copper, minLength: 0.35 }));
    }
  }

  const hullParts = partsOf(hullRoot);
  const hullCustomExplode = [];
  const flipSegsL = [];
  const flipSegsR = [];
  const itemByName = new Map();

  for (const o of [...hullParts.all]) {
    const nm = o.name;
    const boneKey = o.userData.bone || 'thoracic';
    const worldPivot = o.position.clone();
    bindToBone(o, boneKey);

    const basePos = o.position.clone();
    const baseRot = o.rotation.clone();

    const isTrench = nm.startsWith('trench__');
    const isTruss = nm.startsWith('truss__');
    const coreNm = isTruss ? nm.slice(7) : nm;
    const zSign = coreNm.endsWith('_R') || coreNm.includes('_R_') ? -1 : 1;
    const num = Number((/_0(\d)/.exec(coreNm) || [])[1] ?? 1);

    const exArr = o.userData.explode || [0, 1.2, 0.5];
    let fullVec = new V3(exArr[0], exArr[1], exArr[2]);
    let focusKey = 'none';
    let focusVec = new V3(0, 0, 0);
    let order = 0.20;
    let rotVec = new V3(0, 0, 0);
    let focusRotVec = new V3(0, 0, 0);

    // V6 Six-Tier Part-by-Part Exploded Vectors:
    //   - Every individual plate fans out longitudinally (X), vertically (Y), AND splits L/R laterally (±Z)
    //   - Every `truss__*` inner titanium frame separates at 52% of its outer ceramic plate (2-layer sandwich!)
    if (isTrench) {
      focusKey = 'none';
      order = 0.32;
      fullVec.set((num - 2.5) * 0.22, -0.14, zSign * 0.68);
    } else if (coreNm.startsWith('cranial__')) {
      focusKey = 'cranial';
      if (coreNm.includes('rostrum')) {
        order = 0.10;
        fullVec.set(-3.45, 0.52, zSign * 0.98);
        focusVec.set(-1.25, 0.34, zSign * 0.38);
        rotVec.set(0, -zSign * 0.08, -0.05);
        focusRotVec.set(0, -zSign * 0.14, -0.12);
      } else if (coreNm.includes('brow_hood')) {
        order = 0.08;
        fullVec.set(-1.55, 2.85, zSign * 0.76);
        focusVec.set(-0.48, 0.96, zSign * 0.28);
        rotVec.set(-zSign * 0.08, 0, 0.06);
        focusRotVec.set(-zSign * 0.18, 0, 0.16);
      } else {
        // maxilla_cowl_L/R
        order = 0.14;
        fullVec.set(-1.95, 0.68, zSign * 2.15);
        focusVec.set(-0.58, 0.28, zSign * 0.74);
        rotVec.set(-zSign * 0.06, -zSign * 0.07, 0);
        focusRotVec.set(-zSign * 0.16, -zSign * 0.18, 0.08);
      }
    } else if (coreNm.startsWith('dorsal__')) {
      if (coreNm.includes('fin_')) {
        focusKey = 'dorsal';
        order = 0.06;
        fullVec.set(0.85, 4.15, zSign * 0.74);
        focusVec.set(0.22, 1.28, zSign * 0.26);
        rotVec.set(-zSign * 0.09, 0, -0.06);
        focusRotVec.set(-zSign * 0.18, 0, -0.10);
      } else if (coreNm.includes('ridge_')) {
        // Each dorsal plate fans out in X AND splits L/R along ±Z so all 10 dorsal roof plates float individually!
        focusKey = num <= 4 ? 'dorsal' : 'none';
        order = 0.08 + 0.024 * num;
        fullVec.set((num - 2.6) * 0.68, 3.35 - 0.14 * num, zSign * (0.82 + 0.14 * num));
        focusVec.set((num - 2.2) * 0.24, 1.14 - 0.04 * num, zSign * 0.38);
        rotVec.set(-zSign * 0.11, 0, (num - 3) * 0.03);
        focusRotVec.set(-zSign * 0.22, 0, (num - 3) * 0.05);
      } else {
        // Lateral Flank Carapaces (`flank_01..05_L/R`): staggered longitudinally & vertically so zero plates obscure internal modules!
        focusKey = num === 2 || num === 3 ? 'dorsal' : 'none';
        order = 0.14 + 0.024 * num;
        const yStagger = num <= 2 ? 1.15 - 0.32 * num : -(0.72 + 0.32 * (num - 2));
        fullVec.set((num - 2.6) * 0.88, yStagger, zSign * (2.95 + 0.25 * (num % 2)));
        if (focusKey === 'dorsal') {
          focusVec.set((num - 2.5) * 0.24, -0.22, zSign * 0.86);
          focusRotVec.set(zSign * 0.20, zSign * (num - 3) * 0.06, 0);
        }
        rotVec.set(zSign * 0.08, zSign * (num - 3) * 0.04, 0);
      }
    } else if (coreNm.startsWith('pectoral__')) {
      if (coreNm.includes('pleat_')) {
        // 14 Ventral Throat Pleats fan into a dramatic radial rib-cascade with individual X/Y/Z spacing!
        const pIdx = Number((/pleat_0(\d)/.exec(coreNm) || [])[1] ?? 4);
        focusKey = pIdx <= 3 ? 'cranial' : 'none';
        order = 0.12 + 0.026 * pIdx;
        fullVec.set(-0.96 + (pIdx - 4) * 0.38, -(1.62 + 0.34 * pIdx), zSign * (0.72 + 0.28 * pIdx));
        if (focusKey === 'cranial') {
          focusVec.set(-0.28, -(0.36 + 0.14 * pIdx), zSign * (0.22 + 0.10 * pIdx));
          focusRotVec.set(zSign * 0.14, 0, 0.12);
        }
        rotVec.set(zSign * (0.06 + 0.015 * pIdx), 0, 0.05);
      } else if (coreNm.includes('throat_liner_')) {
        // Inner throat liner steps cleanly downward & laterally to expose lower jaw ribs and gearbox ventral casing
        focusKey = 'cranial';
        order = 0.14;
        fullVec.set(-0.98, -1.72, zSign * 1.48);
        focusVec.set(-0.26, -0.42, zSign * 0.32);
        rotVec.set(zSign * 0.11, 0, 0.06);
        focusRotVec.set(zSign * 0.20, 0, 0.14);
      } else if (coreNm.includes('belly_')) {
        focusKey = 'none';
        order = 0.16 + 0.025 * num;
        fullVec.set(0.45 + (num - 2) * 0.58, -(2.15 + 0.28 * num), zSign * (0.92 + 0.18 * num));
        rotVec.set(zSign * 0.08, 0, -0.04);
      } else if (coreNm.includes('flipper_L_') || coreNm.includes('accent_L') || coreNm.includes('collar_L')) {
        // Full 22-part Hydrofoil Wing Disassembly: 5 wing segments fan along span + peel off internal titanium spar!
        focusKey = 'pectoral';
        const raw = new V3(exArr[0], exArr[1], exArr[2]);
        if (coreNm.includes('accent')) {
          order = 0.08;
          fullVec
            .copy(raw)
            .multiplyScalar(0.72)
            .add(new V3(0.42, 0.26, zSign * 0.82));
          focusVec.copy(fullVec).multiplyScalar(0.82);
          rotVec.set(zSign * 0.07, 0, 0.04);
          focusRotVec.copy(rotVec).multiplyScalar(0.78);
        } else if (coreNm.includes('collar')) {
          order = 0.10;
          fullVec.set(-0.28, 0.42, zSign * 0.54);
          focusVec.copy(fullVec).multiplyScalar(0.82);
        } else {
          order = 0.10 + 0.035 * num;
          const liftSign = num % 2 === 1 ? 1 : -0.75;
          fullVec
            .copy(raw)
            .multiplyScalar(0.72)
            .add(new V3(0.24 + 0.32 * num, 0.44 * liftSign - 0.24 * num, zSign * (0.28 + 0.42 * num)));
          focusVec.copy(fullVec).multiplyScalar(0.82);
          rotVec.set(zSign * 0.07 * liftSign, 0, 0.04 * num);
          focusRotVec.copy(rotVec).multiplyScalar(0.78);
        }
        if (!isTruss && coreNm.includes('flipper_L_')) flipSegsL.push({ obj: o, num, worldPivot });
      } else if (coreNm.includes('flipper_R_') || coreNm.includes('accent_R') || coreNm.includes('collar_R')) {
        focusKey = 'none';
        const raw = new V3(exArr[0], exArr[1], exArr[2]);
        if (coreNm.includes('accent')) {
          order = 0.08;
          fullVec
            .copy(raw)
            .multiplyScalar(0.72)
            .add(new V3(0.42, 0.26, zSign * 0.82));
          rotVec.set(zSign * 0.07, 0, 0.04);
        } else if (coreNm.includes('collar')) {
          order = 0.10;
          fullVec.set(-0.28, 0.42, zSign * 0.54);
        } else {
          order = 0.10 + 0.035 * num;
          const liftSign = num % 2 === 1 ? 1 : -0.75;
          fullVec
            .copy(raw)
            .multiplyScalar(0.72)
            .add(new V3(0.24 + 0.32 * num, 0.44 * liftSign - 0.24 * num, zSign * (0.28 + 0.42 * num)));
          rotVec.set(zSign * 0.07 * liftSign, 0, 0.04 * num);
        }
        if (!isTruss && coreNm.includes('flipper_R_')) flipSegsR.push({ obj: o, num, worldPivot });
      } else if (coreNm.includes('flipper_root_') || coreNm.includes('gimbal')) {
        // Root housing & gimbal collar separate off the central titanium spar
        focusKey = zSign > 0 ? 'pectoral' : 'none';
        order = 0.14;
        fullVec.set(-0.32, 0.44, zSign * 0.38);
        if (zSign > 0) focusVec.set(-0.22, 0.32, 0.28);
      } else if (coreNm.includes('spar')) {
        // Central continuous titanium main spar remains the true wing spine!
        focusKey = 'none';
        fullVec.set(0, 0, 0);
      } else {
        // cheek_hull_L/R
        focusKey = 'cranial';
        order = 0.16;
        fullVec.set(-0.88, 0.24, zSign * 2.48);
        focusVec.set(-0.28, 0.10, zSign * 0.62);
        focusRotVec.set(zSign * 0.16, -zSign * 0.14, 0);
      }
    } else if (coreNm.startsWith('caudal__')) {
      focusKey = 'caudal';
      if (coreNm.includes('tail_cone')) {
        order = 0.18;
        fullVec.set(1.35, 0.28, zSign * 0.52);
        focusVec.set(0.75, 0.16, zSign * 0.28);
      } else if (coreNm.includes('spar')) {
        // Structural hydrofoil spar steps slightly out so fluke shells peel cleanly above & below it!
        order = 0.26;
        fullVec.set(0.38, 0.14, zSign * 0.34);
        focusVec.set(0.16, 0.06, zSign * 0.16);
      } else if (coreNm.includes('fluke_')) {
        // 6 Composite Hydrofoil Blades fan wide in span, chord, and vertical lift
        order = 0.08 + 0.045 * num;
        const fanStep = num; // 1 = root, 2 = mid, 3 = tip
        focusVec.set(0.38 * fanStep, 0.36 * (fanStep - 1.2), zSign * (0.48 * fanStep));
        fullVec.set(0.78 * fanStep, 0.62 * (fanStep - 1.1), zSign * (0.88 * fanStep));
        focusRotVec.set(zSign * 0.09 * fanStep, -zSign * 0.15 * (fanStep - 1), 0.12 * (fanStep - 1.4));
        rotVec.copy(focusRotVec).multiplyScalar(1.28);
      } else if (coreNm.includes('peduncle_top_')) {
        order = 0.12 + 0.03 * num;
        focusVec.set((num - 1.5) * 0.22, 0.72 + 0.08 * num, zSign * 0.32);
        fullVec.set((num - 1.5) * 0.58, 2.25 + 0.18 * num, zSign * 0.84);
        rotVec.set(-zSign * 0.08, 0, -0.05);
        focusRotVec.set(-zSign * 0.18, 0, -0.12);
      } else if (coreNm.includes('peduncle_bot_')) {
        order = 0.12 + 0.03 * num;
        focusVec.set((num - 1.5) * 0.22, -(0.70 + 0.08 * num), zSign * 0.32);
        fullVec.set((num - 1.5) * 0.58, -(2.08 + 0.18 * num), zSign * 0.84);
        rotVec.set(zSign * 0.08, 0, 0.05);
        focusRotVec.set(zSign * 0.18, 0, 0.12);
      }
    }

    // TIER 2: Separate every inner titanium backing truss (`truss__*`) as an intermediate floating structural layer!
    if (isTruss && !coreNm.includes('spar')) {
      fullVec.multiplyScalar(0.52);
      focusVec.multiplyScalar(0.52);
      rotVec.multiplyScalar(0.52);
      focusRotVec.multiplyScalar(0.52);
      order = Math.max(0.04, order - 0.04);
    }

    if (isTruss) order += 0.001;

    const entry = {
      obj: o,
      name: nm,
      boneKey,
      worldPivot,
      basePos,
      baseRot,
      fullVec,
      focusKey,
      focusVec,
      rotVec,
      focusRotVec,
      order: Math.min(0.90, order),
      isPleat: coreNm.includes('pleat_'),
      pleatIdx: coreNm.includes('pleat_') ? Number((/pleat_0(\d)/.exec(coreNm) || [])[1] ?? 4) : 0,
      isPeduncleTop: coreNm.includes('peduncle_top_'),
      isPeduncleBot: coreNm.includes('peduncle_bot_'),
      isLumbarTop:
        coreNm.includes('ridge_03') ||
        coreNm.includes('ridge_04') ||
        coreNm.includes('ridge_05') ||
        coreNm.includes('flank_03') ||
        coreNm.includes('flank_04') ||
        coreNm.includes('flank_05'),
      isLumbarBot: coreNm.includes('belly_02') || coreNm.includes('belly_03') || coreNm.includes('belly_04'),
      zSign,
      kActive: 0,
    };
    hullCustomExplode.push(entry);
    itemByName.set(nm, entry);
  }

  flipSegsL.sort((a, b) => a.num - b.num);
  flipSegsR.sort((a, b) => a.num - b.num);

  if (itemByName.has('pectoral__flipper_spar_L')) {
    addCalloutSocket('wingSpar', itemByName.get('pectoral__flipper_spar_L').obj, [0, 0.05, 0]);
  } else {
    addCalloutSocket('wingSpar', flipperBoneL, [1.2, -0.8, 1.4]);
  }
  if (itemByName.has('caudal__fluke_02_L')) {
    addCalloutSocket('flukeFan', itemByName.get('caudal__fluke_02_L').obj, [0, 0.08, 0]);
  } else {
    addCalloutSocket('flukeFan', flukeBone, [1.1, 1.0, 2.0]);
  }

  // ------------------------------------------------------------------ 2. Bearing Hubs + 5-Element Coaxial Hydro-Optic Turret (`OPTICS OPEN`)
  const sharedWellGeo = new THREE.CylinderGeometry(0.96, 0.98, 0.20, 44).rotateX(Math.PI / 2);
  const sharedOuterHousingGeo = machinedRingGeo(1.02, 0.77, 0.16, 0.024, 48);
  const sharedOrangeSealGeo = machinedRingGeo(0.75, 0.63, 0.13, 0.015, 48);
  const sharedMidRaceGeo = machinedRingGeo(0.61, 0.43, 0.16, 0.018, 44);
  const sharedInnerStatorGeo = machinedRingGeo(0.41, 0.24, 0.18, 0.016, 36);
  const sharedTorqueCapGeo = new THREE.CylinderGeometry(0.16, 0.17, 0.18, 28).rotateX(Math.PI / 2);
  const sharedBoltGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.04, 12).rotateX(Math.PI / 2);
  const sharedOpticBarrelGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.34, 36, 1, true).rotateX(Math.PI / 2);
  const sharedSensorPlateGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32).rotateX(Math.PI / 2);
  const sharedIrisGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.09, 32).rotateX(Math.PI / 2);
  const sharedLensGeo = new THREE.SphereGeometry(0.25, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.50).rotateX(Math.PI / 2);
  const sharedLensBezelGeo = machinedRingGeo(0.36, 0.23, 0.10, 0.014, 36);

  const hubAssemblies = [];
  const eyeHubHooks = [];
  const shoulderHubHooks = [];

  function buildBearingHub({
    name,
    pos,
    scaleR = 1.0,
    zSign = 1.0,
    yaw = 0.0,
    pitch = 0.0,
    focusKey = 'pectoral',
    boneKey = 'thoracic',
    kind = 'pivot',
  }) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(pos[0], pos[1], pos[2]);
    g.scale.setScalar(scaleR);
    g.rotation.order = 'YXZ';
    g.rotation.y = (zSign < 0 ? Math.PI : 0) + yaw * zSign;
    g.rotation.x = pitch * zSign;

    const wellDisc = new THREE.Mesh(sharedWellGeo, cavityMat);
    wellDisc.position.z = -0.06;
    g.add(wellDisc);

    const outerGroup = new THREE.Group();
    outerGroup.add(new THREE.Mesh(sharedOuterHousingGeo, M.darkGunmetal));
    outerGroup.position.z = 0.01;
    g.add(outerGroup);

    // Separate 8-bolt perimeter fastener ring so every hex bolt extracts coaxially ahead of the housing flange!
    const boltRingGroup = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const bolt = new THREE.Mesh(sharedBoltGeo, M.steel);
      bolt.position.set(Math.cos(a) * 0.89, Math.sin(a) * 0.89, 0.075);
      boltRingGroup.add(bolt);
    }
    boltRingGroup.position.z = 0.01;
    g.add(boltRingGroup);

    const ringMeshes = [];
    let opticDatumLine = null;
    let gimbalGroup = null;

    if (kind === 'eye') {
      // Genuine 6-Layer Coaxial Hydro-Optic Telescope (`OPTICS OPEN` & `TEARDOWN` slides out to +2.35 local Z!)
      // Inner stages + bore-axis laser datum sit on a 2-axis servo gimbal pivot inside the skull-bolted outer housing
      gimbalGroup = new THREE.Group();
      g.add(gimbalGroup);

      const cmosMount = new THREE.Group();
      cmosMount.add(new THREE.Mesh(sharedSensorPlateGeo, M.steel));
      const busRing = new THREE.Mesh(machinedRingGeo(0.56, 0.43, 0.07, 0.01, 32), M.bronze);
      cmosMount.add(busRing);
      const cmosBaseZ = useIris ? 0.012 : 0.02;
      cmosMount.position.z = cmosBaseZ;
      gimbalGroup.add(cmosMount);

      const barrelStage = new THREE.Group();
      const barrelCyl = new THREE.Mesh(sharedOpticBarrelGeo, M.darkGunmetal);
      const knurlRing = new THREE.Mesh(machinedRingGeo(0.57, 0.49, 0.08, 0.012, 36), M.titanium);
      knurlRing.position.z = 0.06;
      barrelStage.add(barrelCyl, knurlRing);
      barrelStage.position.z = 0.04;
      gimbalGroup.add(barrelStage);

      const irisStage = new THREE.Group();
      const orangeSeal = new THREE.Mesh(sharedOrangeSealGeo, M.orangeRing);
      const iris = new THREE.Mesh(sharedIrisGeo, eyeGlowMat);
      if (useIris) {
        // Move glowing amber sensor disc onto `cmosMount` so `irisStage` is a true see-through 10-blade aperture!
        iris.scale.set(1, 1, 0.40);
        iris.position.z = 0.028;
        cmosMount.add(iris);
        irisStage.add(orangeSeal);
        eyeHubHooks.push({ name, zSign, irisStage, orangeSeal });
      } else {
        iris.position.z = 0.03;
        irisStage.add(orangeSeal, iris);
      }
      const irisBaseZ = useIris ? 0.072 : 0.06;
      irisStage.position.z = irisBaseZ;
      gimbalGroup.add(irisStage);

      const meniscusStage = new THREE.Group();
      const bezel = new THREE.Mesh(sharedLensBezelGeo, M.titanium);
      const lens = new THREE.Mesh(sharedLensGeo, eyeLensMat);
      lens.position.z = 0.02;
      meniscusStage.add(bezel, lens);
      const meniscusBaseZ = useIris ? 0.148 : 0.09;
      meniscusStage.position.z = meniscusBaseZ;
      gimbalGroup.add(meniscusStage);

      ringMeshes.push(
        { mesh: outerGroup, baseZ: 0.01, extractZ: 0.16, spin: 0.0 },
        { mesh: boltRingGroup, baseZ: 0.01, extractZ: 0.52, spin: 0.0 },
        { mesh: cmosMount, baseZ: cmosBaseZ, extractZ: 0.88, spin: -0.25 },
        { mesh: barrelStage, baseZ: 0.04, extractZ: 1.36, spin: 0.45 },
        { mesh: irisStage, baseZ: irisBaseZ, extractZ: 1.86, spin: useIris ? 0.0 : -0.95 },
        { mesh: meniscusStage, baseZ: meniscusBaseZ, extractZ: useIris ? 2.48 : 2.38, spin: 0.0 },
      );

      const dashPts = [];
      for (let d = 0; d < 20; d++) {
        dashPts.push(0, 0, d * 0.13, 0, 0, d * 0.13 + 0.075);
      }
      const dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPts, 3));
      const dMat = new THREE.LineBasicMaterial({
        color: P.glow.accent,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const dLine = new THREE.LineSegments(dGeo, dMat);
      dLine.userData.skipContactShadow = true;
      dLine.userData.auditIgnore = true;
      gimbalGroup.add(dLine);

      const ret = buildPolarReticle({ radius: 0.68, segs: 48, tickEvery: 6, tickLen: 0.07, plane: 'xy', color: '#22262E', opacity: 0 });
      meniscusStage.add(ret.lines);
      opticDatumLine = { dLine, dMat, retMat: ret.mat, retLines: ret.lines };

      if (zSign > 0) {
        addCalloutSocket('opticsLens', meniscusStage, [0, 0.15, 0.12]);
        addCalloutSocket('opticsBarrel', barrelStage, [0, 0.36, 0]);
      }
    } else {
      const orangeSeal = new THREE.Mesh(
        sharedOrangeSealGeo,
        kind === 'shoulder' || name.includes('hub_mid') ? M.orangeRing : M.bronze,
      );
      orangeSeal.position.z = 0.03;
      g.add(orangeSeal);

      const midRace = new THREE.Mesh(sharedMidRaceGeo, M.titanium);
      midRace.position.z = 0.05;
      g.add(midRace);

      const innerStator = new THREE.Mesh(sharedInnerStatorGeo, kind === 'shoulder' ? M.steel : M.darkGunmetal);
      innerStator.position.z = 0.07;
      g.add(innerStator);

      const cap = new THREE.Mesh(sharedTorqueCapGeo, M.darkGunmetal);
      cap.position.z = 0.09;
      g.add(cap);

      const centerPin = new THREE.Mesh(sharedBoltGeo, M.bronze);
      centerPin.scale.set(2.2, 2.2, 1.5);
      centerPin.position.z = 0.17;
      g.add(centerPin);

      // Full 7-layer coaxial bearing explosion (outer housing -> 8 bolts -> seal ring -> mid race -> inner stator -> torque cap -> bronze pin!)
      ringMeshes.push(
        { mesh: outerGroup, baseZ: 0.01, extractZ: 0.16, spin: 0.0 },
        { mesh: boltRingGroup, baseZ: 0.01, extractZ: 0.50, spin: 0.0 },
        { mesh: orangeSeal, baseZ: 0.03, extractZ: 0.84, spin: 0.25 },
        { mesh: midRace, baseZ: 0.05, extractZ: 1.24, spin: 0.85 },
        { mesh: innerStator, baseZ: 0.07, extractZ: 1.64, spin: -0.45 },
        { mesh: cap, baseZ: 0.09, extractZ: 2.02, spin: 0.65 },
        { mesh: centerPin, baseZ: 0.17, extractZ: 2.38, spin: 0.65 },
      );

      if (kind === 'shoulder') {
        const planetaryStage = new THREE.Group();
        planetaryStage.position.z = 0.07;
        g.add(planetaryStage);
        ringMeshes.push({ mesh: planetaryStage, baseZ: 0.07, extractZ: 1.58, spin: 0.0 });
        shoulderHubHooks.push({
          name,
          zSign,
          group: g,
          planetaryStage,
          midRace,
          innerStator,
          cap,
          centerPin,
        });
        if (zSign > 0) {
          addCalloutSocket('shoulderGearbox', planetaryStage, [0, 0.44, 0.08]);
        }
      }

      const dashPts = [];
      for (let d = 0; d < 20; d++) {
        dashPts.push(0, 0, d * 0.13, 0, 0, d * 0.13 + 0.075);
      }
      const dGeo = new THREE.BufferGeometry();
      dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dashPts, 3));
      const dMat = new THREE.LineBasicMaterial({
        color: kind === 'shoulder' ? P.glow.accent : '#222730',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const dLine = new THREE.LineSegments(dGeo, dMat);
      dLine.userData.skipContactShadow = true;
      dLine.userData.auditIgnore = true;
      g.add(dLine);
      opticDatumLine = { dLine, dMat, retMat: null, retLines: null };
    }

    bindToBone(g, boneKey);
    hubAssemblies.push({
      name,
      group: g,
      gimbalGroup,
      basePos: g.position.clone(),
      ringMeshes,
      opticDatumLine,
      scaleR,
      zSign,
      focusKey,
      kind,
    });
  }

  for (const zSign of [1, -1]) {
    const side = zSign > 0 ? 'L' : 'R';
    buildBearingHub({
      name: `hub_eye_${side}`,
      pos: [G.eyeHub[0], G.eyeHub[1], zSign * G.eyeHub[2]],
      scaleR: 0.62,
      zSign,
      yaw: 0.18,
      pitch: 0.06,
      focusKey: 'cranial',
      boneKey: 'cranial',
      kind: 'eye',
    });
    buildBearingHub({
      name: `hub_shoulder_${side}`,
      pos: [G.shoulderHub[0], G.shoulderHub[1], zSign * G.shoulderHub[2]],
      scaleR: 1.04,
      zSign,
      yaw: 0.04,
      pitch: -0.04,
      focusKey: 'pectoral',
      boneKey: 'thoracic',
      kind: 'shoulder',
    });
    buildBearingHub({
      name: `hub_mid_${side}`,
      pos: [G.midHub[0], G.midHub[1], zSign * G.midHub[2]],
      scaleR: 0.62,
      zSign,
      yaw: -0.14,
      pitch: -0.05,
      focusKey: 'dorsal',
      boneKey: 'lumbar',
      kind: 'pivot',
    });
    buildBearingHub({
      name: `hub_aft_${side}`,
      pos: [G.aftHub[0], G.aftHub[1], zSign * G.aftHub[2]],
      scaleR: 0.48,
      zSign,
      yaw: -0.20,
      pitch: -0.04,
      focusKey: 'caudal',
      boneKey: 'peduncle',
      kind: 'pivot',
    });
    buildBearingHub({
      name: `hub_fluke_${side}`,
      pos: [G.flukeHub[0], G.flukeHub[1], zSign * G.flukeHub[2]],
      scaleR: 0.35,
      zSign,
      yaw: -0.22,
      pitch: 0.06,
      focusKey: 'caudal',
      boneKey: 'fluke',
      kind: 'pivot',
    });
  }

  // ------------------------------------------------------------------ 3. Clean Space-Frame Keel + 4 Core Modules (Each Sub-Part Individually Explodable!)
  // 3A. 5 primary structural ring bulkheads (separate vertically during full TEARDOWN)
  const canonicalBulkhead = flangedRing({
    rOuter: 100,
    rInner: 68,
    thickness: 15,
    webThickness: 6,
    flangeRim: 8,
    lighteningHoles: 8,
    boltCount: 8,
    bevel: 1.2,
    mat: M.titanium,
    boltMat: M.bronze,
    uvScale: 0.015,
  });

  const KEY_BULKHEAD_INDICES = [1, 3, 6, 8, 10];
  const bulkheadItems = [];
  KEY_BULKHEAD_INDICES.forEach((idx, bOrder) => {
    const st = BULKHEAD_STATIONS[idx];
    const bhGroup = new THREE.Group();
    bhGroup.position.set(st.x, st.y, 0);
    const ringClone = canonicalBulkhead.group.clone();
    ringClone.rotation.y = Math.PI / 2;
    ringClone.scale.set(0.01 * st.rZ * 0.82, 0.01 * st.rY * 0.82, 0.01);
    bhGroup.add(ringClone);
    const boneKey =
      idx === 1 ? 'cranial' : idx === 3 ? 'thoracic' : idx === 6 ? 'spine_0' : idx === 8 ? 'lumbar' : 'peduncle';
    bindToBone(bhGroup, boneKey);
    bulkheadItems.push({ group: bhGroup, basePos: bhGroup.position.clone(), bOrder });
  });

  // Central Segmented Torque-Spine Column + 2 Clean Lateral Chine Box-Rails
  const spinePts = BULKHEAD_STATIONS.map((st) => new V3(st.x, st.y + 0.10, 0));
  const spineSegments = [
    { boneKey: 'cranial', indices: [0, 1, 2, 3], u0: 0 / 11, u1: 3 / 11 },
    { boneKey: 'thoracic', indices: [2, 3, 4, 5, 6], u0: 2 / 11, u1: 6 / 11 },
    { boneKey: 'spine_0', indices: [5, 6, 7], u0: 5 / 11, u1: 7 / 11 },
    { boneKey: 'lumbar', indices: [6, 7, 8], u0: 6 / 11, u1: 8 / 11 },
    { boneKey: 'lumbar_2', indices: [7, 8, 9], u0: 7 / 11, u1: 9 / 11 },
    { boneKey: 'peduncle', indices: [8, 9, 10], u0: 8 / 11, u1: 10 / 11 },
    { boneKey: 'peduncle_2', indices: [9, 10, 11], u0: 9 / 11, u1: 11 / 11 },
  ];
  const chineMeshes = [];
  for (const seg of spineSegments) {
    const pts = seg.indices.map((idx) => spinePts[idx]);
    const segGeo = swept({
      points: pts,
      radiusAt: (uLocal) => {
        const u = seg.u0 + (seg.u1 - seg.u0) * uLocal;
        return 0.29 - 0.13 * u;
      },
      tubularSeg: 16,
      radialSeg: 14,
    });
    bindToBone(new THREE.Mesh(segGeo, M.darkGunmetal), seg.boneKey);

    for (const sz of [1, -1]) {
      const chinePts = seg.indices.map((idx) => {
        const st = BULKHEAD_STATIONS[idx];
        return new V3(st.x, st.y - st.rY * 0.18, sz * st.rZ * 0.62);
      });
      const chineGeo = swept({
        points: chinePts,
        radiusAt: (uLocal) => {
          const u = seg.u0 + (seg.u1 - seg.u0) * uLocal;
          return 0.052 * (1 - 0.35 * u);
        },
        tubularSeg: 10,
        radialSeg: 8,
      });
      const cm = new THREE.Mesh(chineGeo, M.titanium);
      bindToBone(cm, seg.boneKey);
      chineMeshes.push({ mesh: cm, basePos: cm.position.clone(), sz });
    }
  }

  // 3B. MODULE 01 · Encapsulated Cranial Phased-Array Sonar Pod (explodes into 6 axial sub-parts!)
  const sonarPodGroup = new THREE.Group();
  sonarPodGroup.position.set(-7.15, 1.50, 0);
  const podBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.60, 1.75, 32).rotateZ(Math.PI / 2),
    M.darkGunmetal,
  );
  const podNose = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52).rotateZ(Math.PI / 2),
    M.alu,
  );
  podNose.position.x = -0.87;
  const podAftFlange = new THREE.Mesh(
    machinedRingGeo(0.66, 0.26, 0.14, 0.018, 36).rotateY(Math.PI / 2),
    M.titanium,
  );
  podAftFlange.position.x = 0.88;
  const podBronzeBandA = new THREE.Mesh(
    machinedRingGeo(0.47, 0.40, 0.09, 0.012, 32).rotateY(Math.PI / 2),
    M.bronze,
  );
  podBronzeBandA.position.x = -0.34;
  const podBronzeBandB = new THREE.Mesh(
    machinedRingGeo(0.57, 0.49, 0.09, 0.012, 32).rotateY(Math.PI / 2),
    M.bronze,
  );
  podBronzeBandB.position.x = 0.28;
  const podGuideShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 1.45, 20).rotateZ(Math.PI / 2),
    M.chrome,
  );
  podGuideShaft.position.x = 1.25;
  sonarPodGroup.add(podBody, podNose, podAftFlange, podBronzeBandA, podBronzeBandB, podGuideShaft);
  bindToBone(sonarPodGroup, 'cranial');
  const sonarBasePos = sonarPodGroup.position.clone();
  addCalloutSocket('sonarPod', podNose, [0.0, 0.28, 0.18]);

  // Clean 3-Beam Mandible Keel Arch on `jawBone` (fans downward during explode)
  const jawRibItems = [];
  [1, 3, 5].forEach((idx, rOrder) => {
    const st = BULKHEAD_STATIONS[idx];
    const rArc = Math.min(st.rY, st.rZ) * 0.62;
    const ribArc = new THREE.Mesh(
      new THREE.TorusGeometry(rArc, 0.058, 10, 24, Math.PI * 0.76),
      M.titanium,
    );
    ribArc.position.set(st.x, st.y + 0.14, 0);
    ribArc.rotation.y = Math.PI / 2;
    ribArc.rotation.z = -Math.PI * 0.88;
    bindToBone(ribArc, 'jaw');
    jawRibItems.push({ mesh: ribArc, basePos: ribArc.position.clone(), rOrder });
  });

  // 3C. MODULE 02 · Pectoral Twin-Drive Planetary Gearbox (explodes into 9 transverse & vertical parts!)
  const gearboxGroup = new THREE.Group();
  gearboxGroup.position.set(G.shoulderHub[0], G.shoulderHub[1], 0);
  const gbTopPlateBaseY = usePlanetary ? 0.68 : 0.74;
  if (usePlanetary) {
    const openCradle = buildOpenGearboxCradle({ M, machinedRingGeo, clipPlane });
    gearboxGroup.add(openCradle.group);
  } else {
    const gbCasing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.76, 2.86, 16).rotateX(Math.PI / 2),
      M.darkGunmetal,
    );
    gearboxGroup.add(gbCasing);
  }
  const gbRibMeshes = [];
  for (const zRib of [-0.96, 0.0, 0.96]) {
    const rib = new THREE.Mesh(machinedRingGeo(0.84, 0.72, 0.11, 0.016, 32), M.alu);
    rib.position.z = zRib;
    gearboxGroup.add(rib);
    gbRibMeshes.push({ mesh: rib, zRib });
  }
  const gbTopPlate = new THREE.Mesh(
    usePlanetary ? new THREE.BoxGeometry(1.06, 0.14, 2.74) : new THREE.BoxGeometry(0.92, 0.14, 1.72),
    M.titanium,
  );
  gbTopPlate.position.set(0, gbTopPlateBaseY, 0);
  gearboxGroup.add(gbTopPlate);

  // Port & Starboard Splined Output Sockets where `flipperBoneL/R` plug in!
  const gbSocketMeshes = [];
  for (const zSgn of [1, -1]) {
    const sockCollar = new THREE.Mesh(machinedRingGeo(0.56, 0.26, 0.18, 0.018, 36), M.steel);
    sockCollar.position.z = zSgn * 1.48;
    const splineBore = new THREE.Mesh(machinedRingGeo(0.27, 0.18, 0.22, 0.01, 24), M.bronze);
    splineBore.position.z = zSgn * 1.52;
    gearboxGroup.add(sockCollar, splineBore);
    gbSocketMeshes.push({ sockCollar, splineBore, zSgn });
  }
  bindToBone(gearboxGroup, 'thoracic');
  addCalloutSocket('gearbox', gbTopPlate, [0, 0.10, 0.45]);

  // 3D. MODULE 03 · Semi-Encapsulated MHD Hydro-Thruster Core (explodes into 13 distinct stator/end-bell/shroud parts!)
  const reactorGroup = new THREE.Group();
  reactorGroup.position.set(-0.18, 0.86, 0);

  // Fore & Aft Machined Titanium End-Bells + Steel Flanges
  const reactorEndBells = [];
  for (const xEnd of [-1.48, 1.48]) {
    const bell = new THREE.Mesh(
      useIris
        ? machinedRingGeo(0.80, 0.48, 0.34, 0.022, 36).rotateY(Math.PI / 2)
        : new THREE.CylinderGeometry(0.80, 0.80, 0.34, 36).rotateZ(Math.PI / 2),
      M.titanium,
    );
    bell.position.x = xEnd;
    const flange = new THREE.Mesh(
      machinedRingGeo(0.88, 0.52, 0.10, 0.016, 36).rotateY(Math.PI / 2),
      M.steel,
    );
    flange.position.x = xEnd + Math.sign(xEnd) * 0.18;
    reactorGroup.add(bell, flange);
    reactorEndBells.push({ bell, flange, xEnd });
  }

  // Dorsal (+Y) & Ventral (-Y) Dark-Gunmetal Stator Shroud Shells (split wide up & down during STATOR OPEN / TEARDOWN!)
  const reactorShrouds = [];
  [
    { thetaStart: -Math.PI * 0.28, dirY: 1.0 },
    { thetaStart: Math.PI * 0.72, dirY: -1.0 },
  ].forEach(({ thetaStart, dirY }) => {
    const shroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 2.64, 36, 1, true, thetaStart, Math.PI * 0.56).rotateZ(Math.PI / 2),
      M.darkGunmetal,
    );
    shroud.material = M.darkGunmetal.clone();
    shroud.material.side = THREE.DoubleSide;
    governMaterialRole(shroud.material, 'metal');
    reactorGroup.add(shroud);
    reactorShrouds.push({ mesh: shroud, dirY });
  });

  // 6 Precision-Machined Solid Copper Induction Stator Rings (fan out axially around the spinning fluted rotor!)
  const reactorCopperRings = [];
  for (let i = 0; i < 6; i++) {
    const sx = -1.05 + (i / 5) * 2.10;
    const statorRing = new THREE.Mesh(
      machinedRingGeo(0.75, 0.52, 0.16, 0.018, 40).rotateY(Math.PI / 2),
      M.copper,
    );
    statorRing.position.x = sx;
    reactorGroup.add(statorRing);
    reactorCopperRings.push({ mesh: statorRing, sx, idx: i });
  }

  // Central Spinning Brushed-Steel Fluted Rotor Drum
  const mhdRotorGroup = new THREE.Group();
  const rotorCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 3.10, 28).rotateZ(Math.PI / 2),
    M.steel,
  );
  mhdRotorGroup.add(rotorCore);
  const mhdFlutes = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    const flute = new THREE.Mesh(new THREE.BoxGeometry(2.50, 0.045, 0.055), M.chrome);
    flute.position.set(0, Math.cos(ang) * 0.43, Math.sin(ang) * 0.43);
    flute.rotation.x = ang;
    mhdRotorGroup.add(flute);
    mhdFlutes.push({ mesh: flute, ang });
  }
  reactorGroup.add(mhdRotorGroup);
  thoracicBone.add(reactorGroup);
  addCalloutSocket('mhdCore', reactorCopperRings[3].mesh, [0.0, 0.62, 0.45]);

  // 3E. MODULE 04 · 3-Stage Caudal Spherical Gimbal Vertebrae (`tailJointBellows`)
  const tailJointBellows = [];
  const bellowSpecs = [
    { boneKey: 'lumbar', x: 4.28, y: 0.50, rY: 0.96, rZ: 0.88 },
    { boneKey: 'peduncle', x: 7.24, y: 0.84, rY: 0.64, rZ: 0.56 },
    { boneKey: 'fluke', x: 8.95, y: 1.54, rY: 0.42, rZ: 0.35 },
  ];
  const jointDrumGeo = new THREE.SphereGeometry(1.0, 28, 20);
  for (const sp of bellowSpecs) {
    const jGroup = new THREE.Group();
    jGroup.position.set(sp.x, sp.y, 0);
    const drum = new THREE.Mesh(jointDrumGeo, M.darkGunmetal);
    drum.scale.set(0.54, sp.rY, sp.rZ);
    jGroup.add(drum);

    const collars = [];
    for (const [rx, mat] of [
      [-0.18, M.titanium],
      [0.0, M.bronze],
      [0.18, M.titanium],
    ]) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.065, 12, 32), mat);
      collar.rotation.y = Math.PI / 2;
      collar.position.x = rx;
      collar.scale.set(sp.rZ * 0.96, sp.rY * 0.96, 1.0);
      jGroup.add(collar);
      collars.push({ mesh: collar, rx });
    }
    bindToBone(jGroup, sp.boneKey);
    tailJointBellows.push({ group: jGroup, drum, boneKey: sp.boneKey, collars });
    if (sp.boneKey === 'peduncle') addCalloutSocket('tailSpine', jGroup, [0, 0.35, 0.35]);
  }

  // ------------------------------------------------------------------ 4. Clean Brushed-Titanium & Chrome Joint Actuators (Explodes Piston-from-Barrel in TEARDOWN!)
  const hydraulicsGroup = new THREE.Group();
  hydraulicsGroup.name = 'jointHydraulics';
  root.add(hydraulicsGroup);

  const unitBarrelCylGeo = new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2);
  const unitRodCylGeo = new THREE.CylinderGeometry(0.60, 0.60, 1, 16).rotateX(Math.PI / 2);
  const unitCollarGeo = new THREE.CylinderGeometry(1.20, 1.20, 0.08, 16).rotateX(Math.PI / 2);
  const unitClevisGeo = new THREE.BoxGeometry(1.45, 1.65, 0.13);

  const telescopingSpans = [];

  function addCleanActuator(pA, boneA, pB, boneB, radius = 0.10, tiers = 1, zSign = 1) {
    const va = new V3(...pA);
    const vb = new V3(...pB);
    const baseLen = va.distanceTo(vb);
    const sockA = makeBoneSocket(pA, boneA);
    const sockB = makeBoneSocket(pB, boneB);

    const barrelRoot = new THREE.Group();
    const rodRoot = new THREE.Group();
    hydraulicsGroup.add(barrelRoot, rodRoot);

    const yOffsets = tiers === 2 ? [-radius * 1.18, radius * 1.18] : [0.0];
    const bLen = baseLen * 0.58;
    const rLen = baseLen * 0.60;

    for (const dy of yOffsets) {
      const barrel = new THREE.Mesh(unitBarrelCylGeo, M.darkGunmetal);
      barrel.scale.set(radius, radius, bLen);
      barrel.position.set(0, dy, bLen * 0.5);

      const gland = new THREE.Mesh(unitCollarGeo, M.titanium);
      gland.scale.set(radius, radius, baseLen);
      gland.position.set(0, dy, bLen);

      const endCap = new THREE.Mesh(unitCollarGeo, M.steel);
      endCap.scale.set(radius * 0.96, radius * 0.96, baseLen * 0.7);
      endCap.position.set(0, dy, bLen * 0.12);

      barrelRoot.add(barrel, gland, endCap);

      const rod = new THREE.Mesh(unitRodCylGeo, M.chrome);
      rod.scale.set(radius, radius, rLen);
      rod.position.set(0, dy, rLen * 0.5);
      rodRoot.add(rod);
    }

    const clevisA = new THREE.Mesh(unitClevisGeo, M.titanium);
    clevisA.scale.set(radius, radius, baseLen);
    clevisA.position.set(0, 0, baseLen * 0.03);
    barrelRoot.add(clevisA);

    const clevisB = new THREE.Mesh(unitClevisGeo, M.bronze);
    clevisB.scale.set(radius * 0.92, radius * 0.92, baseLen);
    clevisB.position.set(0, 0, baseLen * 0.03);
    rodRoot.add(clevisB);

    telescopingSpans.push({ barrelRoot, rodRoot, sockA, sockB, baseLen, zSign });
  }

  for (const zSign of [1, -1]) {
    addCleanActuator([-8.85, 1.88, zSign * 0.68], 'cranial', [-6.15, 1.44, zSign * 1.62], 'cranial', 0.112, 1, zSign);
    addCleanActuator([G.eyeHub[0] + 0.64, G.eyeHub[1] - 0.10, zSign * 1.86], 'cranial', [G.shoulderHub[0] - 1.08, G.shoulderHub[1] + 0.04, zSign * 1.86], 'thoracic', 0.148, 2, zSign);
    addCleanActuator([G.shoulderHub[0] + 1.14, G.shoulderHub[1] + 0.02, zSign * 1.84], 'thoracic', [G.midHub[0] - 0.68, G.midHub[1] + 0.04, zSign * 1.14], 'lumbar', 0.156, 2, zSign);
    addCleanActuator([G.midHub[0] + 0.66, G.midHub[1] + 0.06, zSign * 1.08], 'lumbar', [G.aftHub[0] - 0.54, G.aftHub[1] - 0.02, zSign * 0.68], 'peduncle', 0.136, 2, zSign);
    addCleanActuator([G.aftHub[0] + 0.46, G.aftHub[1] + 0.26, zSign * 0.64], 'peduncle', [G.flukeHub[0] - 0.34, G.flukeHub[1] - 0.20, zSign * 0.36], 'fluke', 0.116, 1, zSign);
    addCleanActuator([-5.25, 1.15, zSign * 0.98], 'cranial', [-5.80, 0.44, zSign * 0.92], 'jaw', 0.098, 1, zSign);
  }

  // Clean Pectoral Wing Internal Hinge Actuators (moves 1:1 inside `flipperBoneL/R` when wing detaches!)
  const flipperLinkRigs = [];
  const pinGeo = new THREE.CylinderGeometry(0.096, 0.096, 0.26, 16).rotateX(Math.PI / 2);

  function addFlipperSocketLink(parentA, worldPivotA, worldAnchorA, parentB, worldPivotB, worldAnchorB, radius = 0.092, tiers = 1) {
    const pA0 = new V3(...worldAnchorA);
    const pB0 = new V3(...worldAnchorB);
    const baseLen = Math.max(0.32, pA0.distanceTo(pB0));
    const bLen = baseLen * 0.62;
    const rLen = baseLen * 0.62;

    const socketA = new THREE.Object3D();
    socketA.position.set(worldAnchorA[0] - worldPivotA.x, worldAnchorA[1] - worldPivotA.y, worldAnchorA[2] - worldPivotA.z);
    parentA.add(socketA);

    const socketB = new THREE.Object3D();
    socketB.position.set(worldAnchorB[0] - worldPivotB.x, worldAnchorB[1] - worldPivotB.y, worldAnchorB[2] - worldPivotB.z);
    parentB.add(socketB);

    const barrelRoot = new THREE.Group();
    const rodRoot = new THREE.Group();
    const pinGroup = new THREE.Group();
    hydraulicsGroup.add(barrelRoot, rodRoot, pinGroup);

    const yOffsets = tiers === 2 ? [-radius * 1.15, radius * 1.15] : [0.0];
    for (const dy of yOffsets) {
      const barrel = new THREE.Mesh(unitBarrelCylGeo, M.darkGunmetal);
      barrel.scale.set(radius, radius, bLen);
      barrel.position.set(0, dy, bLen * 0.5);
      const collar = new THREE.Mesh(unitCollarGeo, M.titanium);
      collar.scale.set(radius * 1.08, radius * 1.08, baseLen * 0.8);
      collar.position.set(0, dy, bLen * 0.88);
      barrelRoot.add(barrel, collar);

      const rod = new THREE.Mesh(unitRodCylGeo, M.chrome);
      rod.scale.set(radius, radius, rLen);
      rod.position.set(0, dy, rLen * 0.5);
      rodRoot.add(rod);
    }

    pinGroup.add(new THREE.Mesh(pinGeo, M.bronze));
    flipperLinkRigs.push({ barrelRoot, rodRoot, pinGroup, socketA, socketB, baseLen });
  }

  for (const [segs, boneObj, restVec, zSgn] of [
    [flipSegsL, flipperBoneL, BONE_WORLD_REST.flipper_L, 1],
    [flipSegsR, flipperBoneR, BONE_WORLD_REST.flipper_R, -1],
  ]) {
    if (segs.length >= 5) {
      const p0Prox = segs[0].obj.userData.proxAnchor || [-2.68, 0.22, zSgn * 2.52];
      addFlipperSocketLink(boneObj, restVec, [G.shoulderHub[0], G.shoulderHub[1], zSgn * G.shoulderHub[2]], segs[0].obj, segs[0].worldPivot, p0Prox, 0.115, 2);
      if (segs[0].obj.userData.distAnchor && segs[1].obj.userData.proxAnchor) {
        addFlipperSocketLink(segs[0].obj, segs[0].worldPivot, segs[0].obj.userData.distAnchor, segs[1].obj, segs[1].worldPivot, segs[1].obj.userData.proxAnchor, 0.104, 2);
      }
      if (segs[1].obj.userData.distAnchor && segs[2].obj.userData.proxAnchor) {
        addFlipperSocketLink(segs[1].obj, segs[1].worldPivot, segs[1].obj.userData.distAnchor, segs[2].obj, segs[2].worldPivot, segs[2].obj.userData.proxAnchor, 0.084, 1);
      }
      if (segs[3].obj.userData.distAnchor && segs[4].obj.userData.proxAnchor) {
        addFlipperSocketLink(segs[3].obj, segs[3].worldPivot, segs[3].obj.userData.distAnchor, segs[4].obj, segs[4].worldPivot, segs[4].obj.userData.proxAnchor, 0.092, 1);
      }
    }
  }

  // ------------------------------------------------------------------ 5. 3D CAD Explode-Trajectory Hairlines & Polar Calibration Rings
  const cadGroup = new THREE.Group();
  cadGroup.name = 'cadDatumOverlay';
  root.add(cadGroup);

  // Dynamic world-space dashed line buffers: crisp constant-length dashes (zero stretch distortion!)
  const MAX_DASH_VERTS = 4096;
  const cadGreyArr = new Float32Array(MAX_DASH_VERTS * 3);
  const cadGreyGeo = new THREE.BufferGeometry();
  cadGreyGeo.setAttribute('position', new THREE.BufferAttribute(cadGreyArr, 3));
  cadGreyGeo.setDrawRange(0, 0);
  const cadGreyMat = new THREE.LineBasicMaterial({
    color: '#222730',
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    toneMapped: false,
  });
  const cadGreyLines = new THREE.LineSegments(cadGreyGeo, cadGreyMat);
  cadGreyLines.userData.skipContactShadow = true;
  cadGreyLines.userData.auditIgnore = true;
  cadGreyLines.frustumCulled = false;

  const cadAccentArr = new Float32Array(1024 * 3);
  const cadAccentGeo = new THREE.BufferGeometry();
  cadAccentGeo.setAttribute('position', new THREE.BufferAttribute(cadAccentArr, 3));
  cadAccentGeo.setDrawRange(0, 0);
  const cadAccentMat = new THREE.LineBasicMaterial({
    color: P.glow.accent,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    toneMapped: false,
  });
  const cadAccentLines = new THREE.LineSegments(cadAccentGeo, cadAccentMat);
  cadAccentLines.userData.skipContactShadow = true;
  cadAccentLines.userData.auditIgnore = true;
  cadAccentLines.frustumCulled = false;
  cadGroup.add(cadGreyLines, cadAccentLines);

  // Curated Module-to-Chassis Datum Axes (18 clean engineering assembly trajectories, NOT 70 cluttered sticks!)
  const datumLinks = [];
  const registerDatumLink = (parentA, localA, parentB, localB, isAccent = false) => {
    const sockA = new THREE.Object3D();
    sockA.position.set(localA[0], localA[1], localA[2]);
    parentA.add(sockA);
    const sockB = new THREE.Object3D();
    sockB.position.set(localB[0], localB[1], localB[2]);
    parentB.add(sockB);
    datumLinks.push({ sockA, sockB, isAccent });
  };

  // 1. Port & Starboard Pectoral Wing Spline Extraction Axis (Accent on Port for HYDROFOIL OFF!)
  registerDatumLink(thoracicBone, [G.shoulderHub[0], G.shoulderHub[1], G.shoulderHub[2]], flipperBoneL, [0, 0, -0.36], true);
  registerDatumLink(thoracicBone, [G.shoulderHub[0], G.shoulderHub[1], -G.shoulderHub[2]], flipperBoneR, [0, 0, 0.36], false);

  // 2. Multi-Tier Module & Fairing CAD Datum Axes
  for (const [nm, boneK, anchorW, accent] of [
    ['cranial__rostrum_shield_L', 'cranial', [-7.65, 1.68, 0.25], true],
    ['cranial__rostrum_shield_R', 'cranial', [-7.65, 1.68, -0.25], false],
    ['cranial__brow_hood_L', 'cranial', [-6.05, 1.65, 0.15], false],
    ['cranial__maxilla_cowl_L', 'cranial', [-6.15, 1.32, 0.85], false],
    ['cranial__maxilla_cowl_R', 'cranial', [-6.15, 1.32, -0.85], false],
    ['dorsal__ridge_01_L', 'thoracic', [-2.55, 1.55, 0.22], false],
    ['dorsal__ridge_02_L', 'thoracic', [0.55, 1.45, 0.22], true],
    ['dorsal__ridge_03_L', 'lumbar', [2.65, 1.25, 0.20], false],
    ['dorsal__fin_blade_L', 'spine_0', [2.45, 1.65, 0.12], false],
    ['dorsal__ridge_04_L', 'lumbar', [4.55, 1.05, 0.18], false],
    ['dorsal__flank_02_L', 'thoracic', [-0.45, 0.65, 0.95], false],
    ['dorsal__flank_02_R', 'thoracic', [-0.45, 0.65, -0.95], false],
    ['dorsal__flank_04_L', 'lumbar', [4.35, 0.45, 0.72], false],
    ['pectoral__pleat_02_L', 'jaw', [-5.85, -0.15, 0.55], false],
    ['pectoral__pleat_05_L', 'jaw', [-3.95, -0.45, 0.65], false],
    ['pectoral__pleat_05_R', 'jaw', [-3.95, -0.45, -0.65], false],
    ['caudal__peduncle_top_02_L', 'peduncle', [7.65, 1.05, 0.16], false],
    ['caudal__peduncle_bot_02_L', 'peduncle', [7.65, 0.65, 0.16], false],
    ['caudal__fluke_03_L', 'fluke', [9.85, 2.05, 1.15], true],
    ['caudal__fluke_03_R', 'fluke', [9.85, 2.05, -1.15], false],
  ]) {
    const it = itemByName.get(nm);
    if (it) {
      const bRest = BONE_WORLD_REST[boneK] || BONE_WORLD_REST.thoracic;
      registerDatumLink(
        BONES[boneK] || thoracicBone,
        [anchorW[0] - bRest.x, anchorW[1] - bRest.y, anchorW[2] - bRest.z],
        it.obj,
        [0, 0, 0],
        accent,
      );
    }
  }
  // Core Module internal exploded centerlines (Sonar Pod -X axis, MHD Stator ±Y/±X axes, Gearbox ±Z spline axis)
  registerDatumLink(sonarPodGroup, [1.85, 0, 0], podNose, [-0.35, 0, 0], true);
  registerDatumLink(reactorGroup, [-2.85, 0, 0], reactorGroup, [2.85, 0, 0], true);
  registerDatumLink(reactorGroup, [0, 0, 0], reactorShrouds[0].mesh, [0, 0.80, 0], false);
  registerDatumLink(reactorGroup, [0, 0, 0], reactorShrouds[1].mesh, [0, -0.80, 0], false);
  registerDatumLink(gearboxGroup, [0, 0, 0], gbTopPlate, [0, 0, 0], false);

  // 3D Polar Calibration Rings:
  //   a) Shoulder Gearbox Socket Reticle (visible during HYDROFOIL OFF & TEARDOWN)
  const wingSocketReticle = buildPolarReticle({
    radius: 1.28,
    segs: 56,
    tickEvery: 7,
    tickLen: 0.10,
    plane: 'xy',
    color: P.glow.accent,
    opacity: 0,
  });
  wingSocketReticle.lines.position.set(G.shoulderHub[0], G.shoulderHub[1], G.shoulderHub[2] + 0.08);
  thoracicBone.add(wingSocketReticle.lines);

  //   b) Caudal Fan Polar Pitch Arc (visible during TAIL FANNED & TEARDOWN)
  const tailFanReticle = buildPolarReticle({
    radius: 2.52,
    segs: 48,
    startAng: -Math.PI * 0.15,
    endAng: Math.PI * 0.62,
    tickEvery: 4,
    tickLen: 0.12,
    plane: 'yz',
    color: P.glow.accent,
    opacity: 0,
  });
  tailFanReticle.lines.position.set(0.55, 0.15, 0);
  flukeBone.add(tailFanReticle.lines);

  //   c) Horizontal Turntable Compass Ring (visible during TEARDOWN + TURNTABLE)
  const turntableCompass = buildPolarReticle({
    radius: 15.6,
    segs: 96,
    tickEvery: 4,
    tickLen: 0.38,
    plane: 'xz',
    color: '#262B34',
    opacity: 0,
  });
  turntableCompass.lines.position.set(0.6, -5.45, 0);
  root.add(turntableCompass.lines);

  const whaleLinkages = activeMech?.enabled
    ? buildWhaleLinkages({
        mechProfile: activeMech,
        M,
        BONES,
        BONE_WORLD_REST,
        itemByName,
        hullCustomExplode,
        hubAssemblies,
        eyeHubHooks,
        shoulderHubHooks,
        sonarPodGroup,
        gearboxGroup,
        reactorGroup,
        reactorShrouds,
        reactorEndBells,
        reactorCopperRings,
        tailJointBellows,
        clipPlane,
      })
    : null;

  let wasSection = false;
  const tmpA = new V3();
  const tmpB = new V3();
  const tmpMid = new V3();
  const tmpLocalA = new V3();
  const tmpLocalB = new V3();
  const tmpLocalMid = new V3();

  // ------------------------------------------------------------------ 6. Deterministic Frame Update
  function update(st) {
    const m = st.mech;
    const ex = st.explode ?? 0;
    const focus = st.focusExplode || {};
    const xray = st.xray ?? 0;
    const section = !!st.section;
    const turntableAmt = st.turntable ?? 0;

    // Whole-body 3D flight trajectory & attitude (`BANKING` -> `CRUISE` -> `TEARDOWN` -> `DEPARTING`)
    const fOff = m.flightOffset || { x: 0, y: 0, z: 0 };
    const settleFactor = 1.0 - 0.85 * ex;
    root.position.set(fOff.x * settleFactor, fOff.y * settleFactor + 0.85 * ex, fOff.z * settleFactor);
    root.rotation.order = 'YXZ';
    root.rotation.y = (m.bodyYaw ?? 0) * settleFactor;

    // During full TEARDOWN, motion softens to a poised 32% slow-motion breath so CAD datum geometry reads crisply!
    const motionScale = 1.0 - 0.68 * ex;

    thoracicBone.position.y = (m.bodyHeave ?? 0) * motionScale;
    thoracicBone.rotation.order = 'ZYX';
    thoracicBone.rotation.z = (m.bodyPitch ?? 0) * motionScale;
    thoracicBone.rotation.x = (m.bodyRoll ?? 0) * motionScale;

    cranialBone.rotation.z = (m.cranialPitch ?? 0) * motionScale;
    jawBone.rotation.z = (m.jawOpen ?? 0) * motionScale;

    // Whole-Wing Axial Extraction (`HYDROFOIL OFF · 50% APART` on Port Wing, symmetric in `TEARDOWN`!)
    // Notice: during `focus.pectoral`, `motionScale` is 1.0 so the detached hydrofoil wing continues flapping smoothly!
    const kWingFocusL = smooth01(focus.pectoral ?? 0) * (1 - ex * 0.7);
    const kWingFull = stagger(ex, 0.22);
    const kWingL = Math.min(1.15, kWingFull + kWingFocusL);
    const kWingR = kWingFull;

    flipperBoneL.position.set(
      BONE_WORLD_REST.flipper_L.x - 0.62 * kWingL,
      BONE_WORLD_REST.flipper_L.y - 0.92 * kWingL,
      BONE_WORLD_REST.flipper_L.z + 2.65 * kWingL,
    );
    flipperBoneR.position.set(
      BONE_WORLD_REST.flipper_R.x - 0.62 * kWingR,
      BONE_WORLD_REST.flipper_R.y - 0.92 * kWingR,
      BONE_WORLD_REST.flipper_R.z - 2.65 * kWingR,
    );

    // Coaxially separate the 3 root spline parts (`bronzeSpline`, `stub`, `lockCollar`) on each wing!
    for (const wsp of wingSplineParts) {
      const kW = wsp.isPort ? kWingL : kWingR;
      wsp.bronzeSpline.position.z = -wsp.zSgn * (0.42 + 0.64 * kW);
      wsp.stub.position.z = -wsp.zSgn * (0.22 + 0.24 * kW);
      wsp.lockCollar.position.z = -wsp.zSgn * (0.04 - 0.26 * kW);
    }

    const flap = (m.flipperFlap ?? m.flipperPitch ?? 0) * motionScale;
    const sweep = (m.flipperSweep ?? 0) * motionScale;
    const yaw = (m.flipperYaw ?? 0) * motionScale;
    const distFlap = (m.flipperDistFlap ?? 0) * motionScale;
    const distSweep = (m.flipperDistSweep ?? 0) * motionScale;
    const bankR = st.isOrthoCheck ? 0.0 : -0.28 * motionScale;
    const flapR = st.isOrthoCheck ? -flap : -flap + 0.08 * motionScale;
    flipperBoneL.rotation.set(flap, yaw, sweep);
    flipperBoneR.rotation.set(flapR, -yaw, sweep + bankR);
    flipperDistBoneL.rotation.set(distFlap, 0, distSweep);
    flipperDistBoneR.rotation.set(-distFlap, 0, distSweep);

    const lumAng = (m.lumbarPitch ?? 0) * motionScale;
    const pedAng = (m.pedunclePitch ?? 0) * motionScale;
    const flkAng = (m.flukePitch ?? 0) * motionScale;
    const subLum = lumAng * 0.34;
    const subPed = pedAng * 0.34;
    spine0Bone.rotation.z = subLum;
    lumbarBone.rotation.z = subLum;
    lumbar2Bone.rotation.z = subLum;
    peduncleBone.rotation.z = subPed;
    peduncle2Bone.rotation.z = subPed;
    peduncle3Bone.rotation.z = subPed;
    flukeBone.rotation.z = flkAng * 0.72;

    // Update Modular Fairing Groups + Peristaltic Breathing + Active Tail Curvature Sliding
    const bPhase = m.breathPhase ?? 0;
    const pSurge = m.pleatSurge ?? 0.65;
    for (const item of hullCustomExplode) {
      const fAmt = item.focusKey !== 'none' ? (focus[item.focusKey] ?? 0) : 0;
      const kFull = stagger(ex, item.order);
      const kFoc = stagger(fAmt, item.order) * (1 - ex * 0.75);
      item.kActive = kFull + kFoc;

      item.obj.position.copy(item.basePos);
      item.obj.rotation.copy(item.baseRot);

      if (item.isPleat) {
        const pFactor = Math.sin((item.pleatIdx / 7.5) * Math.PI);
        const pleatWave = (0.5 + 0.5 * Math.sin(bPhase - item.pleatIdx * 0.26)) * motionScale * pSurge;
        item.obj.position.y -= pleatWave * (0.022 + 0.075 * pFactor);
        item.obj.position.z += item.zSign * pleatWave * (0.016 + 0.048 * pFactor);
      }

      if (item.isPeduncleTop) {
        item.obj.position.x += subPed * 0.26;
        item.obj.rotation.z -= subPed * 0.12;
      } else if (item.isPeduncleBot) {
        item.obj.position.x -= subPed * 0.22;
        item.obj.rotation.z -= subPed * 0.10;
      } else if (item.isLumbarTop) {
        item.obj.position.x += subLum * 0.34;
        item.obj.rotation.z -= subLum * 0.12;
      } else if (item.isLumbarBot) {
        item.obj.position.x -= subLum * 0.28;
        item.obj.rotation.z -= subLum * 0.10;
      }

      if (kFull > 0.0005) {
        item.obj.position.addScaledVector(item.fullVec, kFull);
        item.obj.rotation.x += item.rotVec.x * kFull;
        item.obj.rotation.y += item.rotVec.y * kFull;
        item.obj.rotation.z += item.rotVec.z * kFull;
      }
      if (kFoc > 0.0005) {
        item.obj.position.addScaledVector(item.focusVec, kFoc);
        item.obj.rotation.x += item.focusRotVec.x * kFoc;
        item.obj.rotation.y += item.focusRotVec.y * kFoc;
        item.obj.rotation.z += item.focusRotVec.z * kFoc;
      }
    }

    const useGhost = xray > 0.15;
    for (const item of shellMeshes) {
      if (item.wasGhost !== useGhost) {
        item.mesh.material = useGhost ? ghostMat : item.baseMat;
        item.wasGhost = useGhost;
      }
    }
    if (useGhost) ghostMat.opacity = Math.max(0.12, 1 - xray * 0.82);

    if (section !== wasSection) {
      wasSection = section;
      const planes = section && clipPlane ? [clipPlane] : [];
      root.traverse((o) => {
        if (o.isMesh && o.material) {
          if (Array.isArray(o.material)) o.material.forEach((mat) => (mat.clippingPlanes = planes));
          else o.material.clippingPlanes = planes;
        }
      });
    }

    // Bearing Hubs: Full 6-to-7 Layer Coaxial Ring & Fastener Explosion across ALL 10 Hubs!
    const spin = (st.time ?? 0) * 1.4 + m.stroke * 1.6;
    for (const h of hubAssemblies) {
      const fAmt = h.focusKey !== 'none' ? (focus[h.focusKey] ?? 0) : 0;
      const kFull = stagger(ex, 0.16);
      const kFoc = stagger(fAmt, 0.14) * (1 - ex * 0.75);
      const kH = Math.min(1.12, kFull + kFoc);

      let jointAngle = 0;
      if (h.kind === 'shoulder') jointAngle = (sweep * 2.2 + flap * 1.4) * h.zSign;
      else if (h.name.startsWith('hub_mid')) jointAngle = lumAng * 2.4 * h.zSign;
      else if (h.name.startsWith('hub_aft')) jointAngle = pedAng * 2.4 * h.zSign;
      else if (h.name.startsWith('hub_fluke')) jointAngle = flkAng * 2.2 * h.zSign;
      else jointAngle = (m.eyeScan ?? 0) * 1.35 * motionScale;

      if (h.gimbalGroup) {
        h.gimbalGroup.rotation.set(
          (m.eyeGimbalPitch ?? 0) * motionScale,
          (m.eyeGimbalYaw ?? 0) * h.zSign * motionScale,
          0,
        );
      }

      for (const rm of h.ringMeshes) {
        if (rm.spin !== 0) rm.mesh.rotation.z = jointAngle * rm.spin;
        rm.mesh.position.z = rm.baseZ + rm.extractZ * kH;
      }
      h.group.position.copy(h.basePos);
      if (h.kind !== 'eye') {
        h.group.position.z += h.zSign * kH * 0.42 * h.scaleR;
      }
      if (h.opticDatumLine) {
        const opVis = clamp01(kH * 1.6);
        h.opticDatumLine.dMat.opacity = 0.76 * opVis;
        h.opticDatumLine.dLine.scale.set(1, 1, Math.max(0.01, kH));
        h.opticDatumLine.dLine.visible = opVis > 0.02;
        if (h.opticDatumLine.retMat) h.opticDatumLine.retMat.opacity = 0.44 * opVis;
        if (h.opticDatumLine.retLines) h.opticDatumLine.retLines.visible = opVis > 0.02;
      }
    }

    // TIER 5: Part-by-Part Disassembly of All 4 Core Modules + Bulkheads + Chine Rails + Jaw Ribs!
    // 5a. Structural Ring Bulkheads, Lateral Chine Rails & Mandible Keel Ribs
    const kFrameEx = stagger(ex, 0.24);
    for (const bh of bulkheadItems) {
      const yStep = (bh.bOrder % 2 === 0 ? 0.36 : -0.28) * kFrameEx;
      bh.group.position.set(bh.basePos.x + (bh.bOrder - 2) * 0.22 * kFrameEx, bh.basePos.y + yStep, bh.basePos.z);
    }
    for (const cm of chineMeshes) {
      cm.mesh.position.set(cm.basePos.x, cm.basePos.y - 0.18 * kFrameEx, cm.basePos.z + cm.sz * 0.58 * kFrameEx);
    }
    const kJawEx = Math.min(1.0, stagger(ex, 0.22) + stagger(focus.cranial ?? 0, 0.22) * 0.55);
    for (const jr of jawRibItems) {
      jr.mesh.position.set(
        jr.basePos.x - (1.2 - jr.rOrder * 0.4) * 0.32 * kJawEx,
        jr.basePos.y - (0.35 + 0.24 * jr.rOrder) * kJawEx,
        jr.basePos.z,
      );
    }

    // 5b. MODULE 01 · Sonar Nose Pod 6-Part Axial Explosion
    const kSonar = Math.min(1.0, stagger(ex, 0.16) + stagger(focus.cranial ?? 0, 0.16) * 0.92);
    sonarPodGroup.position.set(sonarBasePos.x - 0.95 * kSonar, sonarBasePos.y + 0.12 * kSonar, sonarBasePos.z);
    podNose.position.x = -0.87 - 1.18 * kSonar;
    podBronzeBandA.position.x = -0.34 - 0.72 * kSonar;
    podBody.position.x = -0.18 * kSonar;
    podBronzeBandB.position.x = 0.28 + 0.32 * kSonar;
    podAftFlange.position.x = 0.88 + 0.68 * kSonar;
    podGuideShaft.position.x = 1.25 + 1.05 * kSonar;

    // 5c. MODULE 02 · Pectoral Twin-Drive Gearbox 9-Part Transverse & Vertical Explosion
    const kGear = Math.min(1.0, stagger(ex, 0.18) + stagger(focus.pectoral ?? 0, 0.18) * 0.88);
    const kGearTop = Math.min(1.0, stagger(ex, 0.18) + stagger(focus.dorsal ?? 0, 0.18) * 0.72);
    gbTopPlate.position.set(0, gbTopPlateBaseY + 1.25 * kGearTop, 0);
    for (const rb of gbRibMeshes) {
      rb.mesh.position.z = rb.zRib * (1.0 + 0.58 * kGear);
    }
    for (const gs of gbSocketMeshes) {
      const kSide = gs.zSgn > 0 ? kGear : stagger(ex, 0.18);
      gs.sockCollar.position.z = gs.zSgn * (1.48 + 0.78 * kSide);
      gs.splineBore.position.z = gs.zSgn * (1.52 + 1.36 * kSide);
    }

    // 5d. MODULE 03 · MHD Stator Core 13-Part Axial & Radial Explosion
    mhdRotorGroup.rotation.x = spin * 2.6;
    const kReact = Math.min(1.0, stagger(ex, 0.18) + stagger(focus.dorsal ?? 0, 0.16) * 0.95);
    reactorGroup.position.set(-0.18, 0.86 + 0.72 * kReact, 0);
    for (const sh of reactorShrouds) {
      sh.mesh.position.y = sh.dirY * (sh.dirY > 0 ? 1.38 : 1.12) * kReact;
    }
    for (const eb of reactorEndBells) {
      const sgn = Math.sign(eb.xEnd);
      eb.bell.position.x = eb.xEnd + sgn * 0.78 * kReact;
      eb.flange.position.x = eb.xEnd + sgn * (0.18 + 1.28 * kReact);
    }
    for (const cr of reactorCopperRings) {
      cr.mesh.position.x = cr.sx * (1.0 + 0.64 * kReact);
      cr.mesh.position.y = (cr.idx % 2 === 0 ? 0.14 : -0.14) * stagger(ex, 0.24);
    }
    for (const fl of mhdFlutes) {
      const rFlute = 0.43 + 0.13 * stagger(ex, 0.26);
      fl.mesh.position.set(0, Math.cos(fl.ang) * rFlute, Math.sin(fl.ang) * rFlute);
    }

    // 5e. MODULE 04 · Caudal Spherical Gimbal Retaining Collars Axial Explosion
    const kTailMod = Math.min(1.0, stagger(ex, 0.20) + stagger(focus.caudal ?? 0, 0.18) * 0.88);
    for (const jb of tailJointBellows) {
      for (const col of jb.collars) {
        col.mesh.position.x = col.rx * (1.0 + 2.35 * kTailMod);
      }
    }

    // Propagate world matrices before aiming joint actuators & building 3D CAD datum dash buffers!
    root.updateMatrixWorld(true);

    if (whaleLinkages) {
      whaleLinkages.update({
        time: st.time ?? 0,
        mech: m,
        ex,
        focus,
        motionScale,
        camDist: st.camDist ?? 16,
        kSonar,
        kGear,
        kWingL,
        kWingR,
        kReact,
        subPed,
        flkRotZ: flkAng * 0.72,
      });
    }

    // TIER 6: Lateral Trench Hydraulic Actuators step into exploded service lane & separate piston rod from barrel!
    const kActEx = stagger(ex, 0.18);
    for (const ts of telescopingSpans) {
      ts.sockA.socket.getWorldPosition(tmpA);
      ts.sockB.socket.getWorldPosition(tmpB);
      hydraulicsGroup.worldToLocal(tmpLocalA.copy(tmpA));
      hydraulicsGroup.worldToLocal(tmpLocalB.copy(tmpB));
      tmpLocalA.z += ts.zSign * 1.28 * kActEx;
      tmpLocalB.z += ts.zSign * 1.28 * kActEx;
      tmpLocalA.y += 0.18 * kActEx;
      tmpLocalB.y += 0.18 * kActEx;
      const spanDist = tmpLocalA.distanceTo(tmpLocalB);
      const coupledStretch = Math.max(1.0, spanDist / (ts.baseLen * 1.12));
      const exPullBack = 1.0 - 0.34 * kActEx;
      const finalScale = (coupledStretch * (1.0 - kActEx) + 0.72 * kActEx) * exPullBack;
      hydraulicsGroup.localToWorld(tmpA.copy(tmpLocalA));
      hydraulicsGroup.localToWorld(tmpB.copy(tmpLocalB));
      ts.barrelRoot.position.copy(tmpLocalA);
      ts.barrelRoot.lookAt(tmpB);
      ts.barrelRoot.scale.set(1, 1, finalScale);
      ts.rodRoot.position.copy(tmpLocalB);
      ts.rodRoot.lookAt(tmpA);
      ts.rodRoot.scale.set(1, 1, finalScale);
    }

    for (const fl of flipperLinkRigs) {
      fl.socketA.getWorldPosition(tmpA);
      fl.socketB.getWorldPosition(tmpB);
      const stretch = Math.max(1.0, tmpA.distanceTo(tmpB) / (fl.baseLen * 1.15)) * (1.0 - 0.35 * kActEx);
      tmpMid.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      hydraulicsGroup.worldToLocal(tmpLocalA.copy(tmpA));
      hydraulicsGroup.worldToLocal(tmpLocalB.copy(tmpB));
      hydraulicsGroup.worldToLocal(tmpLocalMid.copy(tmpMid));
      fl.barrelRoot.position.copy(tmpLocalA);
      fl.barrelRoot.lookAt(tmpB);
      fl.barrelRoot.scale.set(1, 1, stretch);
      fl.rodRoot.position.copy(tmpLocalB);
      fl.rodRoot.lookAt(tmpA);
      fl.rodRoot.scale.set(1, 1, stretch);
      fl.pinGroup.position.copy(tmpLocalMid);
    }

    // Update 3D CAD Dashed Explode-Trajectory Lines & Polar Calibration Rings
    let gCount = 0;
    let aCount = 0;
    const dashLen = 0.16;
    const gapLen = 0.11;
    const stepLen = dashLen + gapLen;

    for (const dl of datumLinks) {
      dl.sockA.getWorldPosition(tmpA);
      dl.sockB.getWorldPosition(tmpB);
      cadGroup.worldToLocal(tmpLocalA.copy(tmpA));
      cadGroup.worldToLocal(tmpLocalB.copy(tmpB));
      const dist = tmpLocalA.distanceTo(tmpLocalB);
      if (dist < 0.22) continue;

      const dir = tmpMid.copy(tmpLocalB).sub(tmpLocalA).divideScalar(dist);
      const targetArr = dl.isAccent ? cadAccentArr : cadGreyArr;
      const maxVerts = dl.isAccent ? 1020 : MAX_DASH_VERTS - 4;
      for (let s = 0.06; s < dist - 0.04; s += stepLen) {
        const sEnd = Math.min(dist - 0.02, s + dashLen);
        const idx = dl.isAccent ? aCount : gCount;
        if (idx + 2 >= maxVerts) break;
        const base = idx * 3;
        targetArr[base] = tmpLocalA.x + dir.x * s;
        targetArr[base + 1] = tmpLocalA.y + dir.y * s;
        targetArr[base + 2] = tmpLocalA.z + dir.z * s;
        targetArr[base + 3] = tmpLocalA.x + dir.x * sEnd;
        targetArr[base + 4] = tmpLocalA.y + dir.y * sEnd;
        targetArr[base + 5] = tmpLocalA.z + dir.z * sEnd;
        if (dl.isAccent) aCount += 2;
        else gCount += 2;
      }
    }

    cadGreyGeo.setDrawRange(0, gCount);
    cadGreyGeo.attributes.position.needsUpdate = true;
    cadAccentGeo.setDrawRange(0, aCount);
    cadAccentGeo.attributes.position.needsUpdate = true;

    const wingVis = clamp01(kWingL * 1.4);
    wingSocketReticle.mat.opacity = 0.52 * wingVis;
    wingSocketReticle.lines.visible = wingVis > 0.02;

    const tailVis = clamp01(Math.max(focus.caudal ?? 0, ex) * 1.4);
    tailFanReticle.mat.opacity = 0.50 * tailVis;
    tailFanReticle.lines.visible = tailVis > 0.02;

    const ttVis = clamp01(Math.max(ex, turntableAmt) * 1.2);
    turntableCompass.mat.opacity = 0.24 * ttVis;
    turntableCompass.lines.visible = ttVis > 0.02;
    turntableCompass.lines.rotation.y = (st.time ?? 0) * 0.06;
  }

  return { root, update, sockets };
}
