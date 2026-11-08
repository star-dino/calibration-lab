// V10 Heavy-Industrial Three-Tier Mechanical, Rib-Cage & Mid-Tier Structural Factory
// for Balaenoptera AQ-12 (`calibration-lab/whale`).
// Implements:
//   - Heavy-Duty Scaled Tier 1.5 / Tier 2 / Tier 3 Primitives (2.0x-2.5x screen-space cross-sections, zero sub-pixel wires):
//     `createLatchPinPair`, `createGussetBracket`, `decoratePanelUndersides`, `createSlewingBearingRing`,
//     `createLinearGuideRail`, `createRackAndPinionActuator`, `createWormGearActuator`, `createGasStrut`,
//     `createRadiatorFinStack`, `decorateLinkageWithMicroHardware`, `createRoutedPlumbingBay`
//   - 4 Heavy Mid-Tier (0.4m-1.5m) Structural & Biomechanical Sub-Assemblies:
//     1. `createHullRibCage`       : 24-station CNC perforated I-beam Titanium/Aluminum submarine rib-cage + box stringers + equipment trays
//     2. `createBaleenLouverArray` : 28-vane (2 x 14) mechanical baleen hydro-filter louver array with bronze actuator bus-bars
//     3. `createAerofoilWingRibs`  : 7 chordwise CNC aerofoil wing ribs with bronze lightening-bore rings + twin-cylinder hydraulic valve island
//     4. `createRibbedArmorCasing` : 6 external circumferential arch ribs + dorsal box-beams + 4 solid copper busbars + 2x6 HV pulse capacitor banks

import {
  THREE,
  poseActuator,
  poseCompressedSpring,
  helixGeometry,
  gearGeometry,
  governMaterialRole,
} from '/styles/calibration-lab/kernel.js';

void poseCompressedSpring;
void governMaterialRole;

const V3 = THREE.Vector3;
const UP_Y = new V3(0, 1, 0);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

// Shared geometry builder for chamfered annular rings, bushings, races, and circlips
function buildChamferRingGeo(rOuter, rInner, thick, bevel = 0.004, segs = 28, arcSpan = Math.PI * 2) {
  const hz = thick * 0.5;
  const b = Math.min(bevel, (rOuter - rInner) * 0.32, hz * 0.55);
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
  const aStart = (Math.PI * 2 - arcSpan) * 0.5;

  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const ang = aStart + u * arcSpan;
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

// ----------------------------------------------------------------------------
// 1. Clipping & Shadow Helper
// ----------------------------------------------------------------------------
export function applyClip(obj, clipPlane) {
  if (!obj) return obj;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        mat.clipShadows = true;
        if (clipPlane && mat.clippingPlanes && mat.clippingPlanes.length > 0) {
          mat.clippingPlanes = [clipPlane];
        }
      }
    }
  });
  return obj;
}

// ----------------------------------------------------------------------------
// 2. Hull & Local Socket Helpers
// ----------------------------------------------------------------------------
export function makeHullSocket(entry, worldRest) {
  const s = new THREE.Object3D();
  s.position.set(
    worldRest[0] - entry.worldPivot.x,
    worldRest[1] - entry.worldPivot.y,
    worldRest[2] - entry.worldPivot.z,
  );
  entry.obj.add(s);
  return s;
}

export function makeLocalSocket(parent, localCoords) {
  const s = new THREE.Object3D();
  s.position.set(localCoords[0], localCoords[1], localCoords[2]);
  parent.add(s);
  return s;
}

// ----------------------------------------------------------------------------
// 3. Heavy-Duty Machined Latch & Spring-Detent Striker Pin Pair (Tier 1.5, 1.85x)
// ----------------------------------------------------------------------------
export function createLatchPinPair({ scale = 1.0, M, clipPlane } = {}) {
  // Multiply internal geometry dimensions by 1.85 so default scale = 1.0 produces a bold ~0.133m latch assembly
  const s = Math.max(0.25, scale) * 1.85;
  const group = new THREE.Group();
  group.name = 'latchPinPair';

  // Base mounting pad (`M.titanium`)
  const basePad = new THREE.Mesh(
    new THREE.BoxGeometry(0.072 * s, 0.032 * s, 0.008 * s),
    M.titanium,
  );
  basePad.position.set(0, 0, 0.004 * s);

  // Machined C-hook latch bracket (`M.titanium`)
  const hookSpine = new THREE.Mesh(
    new THREE.BoxGeometry(0.032 * s, 0.020 * s, 0.024 * s),
    M.titanium,
  );
  hookSpine.position.set(-0.014 * s, 0, 0.016 * s);

  const hookJawTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.018 * s, 0.020 * s, 0.008 * s),
    M.titanium,
  );
  hookJawTop.position.set(-0.001 * s, 0, 0.026 * s);

  const hookBeak = new THREE.Mesh(
    new THREE.BoxGeometry(0.007 * s, 0.020 * s, 0.012 * s),
    M.titanium,
  );
  hookBeak.position.set(0.005 * s, 0, 0.022 * s);

  // Slotted keeper plate (`M.titanium`)
  const keeperEarGeo = new THREE.BoxGeometry(0.024 * s, 0.006 * s, 0.022 * s);
  const keeperEarPos = new THREE.Mesh(keeperEarGeo, M.titanium);
  keeperEarPos.position.set(0.018 * s, 0.010 * s, 0.015 * s);
  const keeperEarNeg = new THREE.Mesh(keeperEarGeo, M.titanium);
  keeperEarNeg.position.set(0.018 * s, -0.010 * s, 0.015 * s);
  const keeperBridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.012 * s, 0.026 * s, 0.007 * s),
    M.steel,
  );
  keeperBridge.position.set(0.022 * s, 0, 0.024 * s);

  // Spring-detent striker pin (`pinMesh`, `M.bronze`)
  const pinGeo = new THREE.CylinderGeometry(0.0055 * s, 0.0055 * s, 0.054 * s, 14).rotateZ(Math.PI / 2);
  const pinMesh = new THREE.Mesh(pinGeo, M.bronze);
  pinMesh.position.set(0, 0, 0.016 * s);

  const pinCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0092 * s, 0.0092 * s, 0.009 * s, 14).rotateZ(Math.PI / 2),
    M.bronze,
  );
  pinCollar.position.set(0.024 * s, 0, 0);
  const detentSpringSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0076 * s, 0.0076 * s, 0.014 * s, 12).rotateZ(Math.PI / 2),
    M.steel,
  );
  detentSpringSleeve.position.set(0.012 * s, 0, 0);
  pinMesh.add(pinCollar, detentSpringSleeve);

  // 4 Chrome hex mounting bolts (`M.chrome`)
  const boltGeo = new THREE.CylinderGeometry(0.0038 * s, 0.0038 * s, 0.007 * s, 6).rotateX(Math.PI / 2);
  for (const [bx, by] of [
    [-0.028 * s, 0.011 * s],
    [-0.028 * s, -0.011 * s],
    [0.029 * s, 0.011 * s],
    [0.029 * s, -0.011 * s],
  ]) {
    const bolt = new THREE.Mesh(boltGeo, M.chrome);
    bolt.position.set(bx, by, 0.009 * s);
    group.add(bolt);
  }

  group.add(basePad, hookSpine, hookJawTop, hookBeak, keeperEarPos, keeperEarNeg, keeperBridge, pinMesh);
  applyClip(group, clipPlane);

  function update(unlatch01 = 0) {
    pinMesh.position.x = 0.022 * s * unlatch01;
  }

  return { group, pinMesh, update };
}

// ----------------------------------------------------------------------------
// 4. Heavy Machined L/U Structural Gusset Bracket with Lightening Hole (Tier 1.5 / 2)
// ----------------------------------------------------------------------------
export function createGussetBracket({
  width = 0.18,
  height = 0.16,
  depth = 0.12,
  M,
  clipPlane,
} = {}) {
  const group = new THREE.Group();
  group.name = 'gussetBracket';

  // Thicken baseThick, wallThick, webThick by 1.6x
  const baseThick = Math.max(0.014, height * 0.14) * 1.6;
  const wallThick = Math.max(0.014, depth * 0.18) * 1.6;
  const webThick = Math.max(0.012, width * 0.09) * 1.6;

  // Base flange plate & vertical back wall (`M.titanium`)
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(width, baseThick, depth),
    M.titanium,
  );
  basePlate.position.set(0, -height * 0.5 + baseThick * 0.5, 0);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.92, Math.max(0.04, height - baseThick), wallThick),
    M.titanium,
  );
  backWall.position.set(0, baseThick * 0.5, -depth * 0.5 + wallThick * 0.5);
  group.add(basePlate, backWall);

  // Twin triangular gusset webs with cylindrical lightening holes (`M.titanium`)
  const z0 = -depth * 0.5 + wallThick * 0.85;
  const z1 = depth * 0.46;
  const y0 = -height * 0.5 + baseThick * 0.85;
  const y1 = height * 0.44;

  const gussetShape = new THREE.Shape();
  gussetShape.moveTo(z0, y0);
  gussetShape.lineTo(z1, y0);
  gussetShape.lineTo(z0 + (z1 - z0) * 0.18, y1);
  gussetShape.lineTo(z0, y1);
  gussetShape.closePath();

  const holeZ = z0 + (z1 - z0) * 0.34;
  const holeY = y0 + (y1 - y0) * 0.36;
  const holeR = Math.min(Math.max(0.02, z1 - z0), Math.max(0.02, y1 - y0)) * 0.19;
  if (holeR > 0.006) {
    const holePath = new THREE.Path();
    holePath.absarc(holeZ, holeY, holeR, 0, Math.PI * 2, true);
    gussetShape.holes.push(holePath);
  }

  const gussetGeo = new THREE.ExtrudeGeometry(gussetShape, {
    depth: webThick,
    bevelEnabled: true,
    bevelThickness: Math.min(0.004, webThick * 0.18),
    bevelSize: Math.min(0.004, webThick * 0.18),
    bevelSegments: 1,
    curveSegments: 18,
  });
  gussetGeo.rotateY(Math.PI / 2);
  gussetGeo.translate(-webThick * 0.5, 0, 0);
  gussetGeo.computeVertexNormals();

  const xWeb = width * 0.34;
  for (const xSgn of [-1, 1]) {
    const webMesh = new THREE.Mesh(gussetGeo, M.titanium);
    webMesh.position.x = xSgn * xWeb;
    group.add(webMesh);
  }

  // Journal bushing collar (`M.bronze`, 1.8x larger) + pivot sleeve (`M.steel`)
  const rBush = Math.min(height, depth) * 0.18 * 1.8;
  const journalBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(rBush * 1.24, rBush * 1.24, width * 0.74, 20).rotateZ(Math.PI / 2),
    M.titanium,
  );
  journalBoss.position.set(0, height * 0.14, -depth * 0.14);

  const bronzeBushing = new THREE.Mesh(
    new THREE.CylinderGeometry(rBush, rBush, width * 0.88, 20).rotateZ(Math.PI / 2),
    M.bronze,
  );
  bronzeBushing.position.copy(journalBoss.position);

  const journalPin = new THREE.Mesh(
    new THREE.CylinderGeometry(rBush * 0.62, rBush * 0.62, width * 0.96, 16).rotateZ(Math.PI / 2),
    M.steel,
  );
  journalPin.position.copy(journalBoss.position);
  group.add(journalBoss, bronzeBushing, journalPin);

  // 4 Chrome hex flange mounting bolts (`M.chrome`, 1.8x larger)
  const rBolt = Math.min(width, depth) * 0.055 * 1.8;
  const boltGeo = new THREE.CylinderGeometry(rBolt, rBolt, baseThick * 0.92, 6);
  const washerGeo = new THREE.CylinderGeometry(rBolt * 1.48, rBolt * 1.48, baseThick * 0.26, 14);
  const yBolt = -height * 0.5 + baseThick * 1.05;
  for (const [bx, bz] of [
    [-width * 0.42, -depth * 0.28],
    [width * 0.42, -depth * 0.28],
    [-width * 0.42, depth * 0.30],
    [width * 0.42, depth * 0.30],
  ]) {
    const bolt = new THREE.Mesh(boltGeo, M.chrome);
    bolt.position.set(bx, yBolt, bz);
    const washer = new THREE.Mesh(washerGeo, M.chrome);
    washer.position.set(bx, yBolt - baseThick * 0.32, bz);
    group.add(bolt, washer);
  }

  applyClip(group, clipPlane);
  return { group };
}

// ----------------------------------------------------------------------------
// 5. Heavy Panel Underside Waffle Grid, Louvered Heat-Sink Grille & Latch Decorator
// ----------------------------------------------------------------------------
const UNDERSIDE_PREFIXES = [
  'cranial__',
  'dorsal__ridge_',
  'dorsal__flank_',
  'dorsal__fin_',
  'pectoral__flipper_L_0',
  'pectoral__flipper_R_0',
  'pectoral__throat_liner_',
  'pectoral__cheek_hull_',
  'caudal__peduncle_',
  'caudal__fluke_0',
];

export function decoratePanelUndersides({ hullCustomExplode = [], M, clipPlane } = {}) {
  const items = [];
  if (!Array.isArray(hullCustomExplode) || hullCustomExplode.length === 0) {
    return { items, update() {} };
  }

  // Heavy hex-socket cap screw (`r = 0.018`) + chamfered bronze bore ring (`r = 0.048`)
  const screwHeadGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6).rotateX(Math.PI / 2);
  const boreRingGeo = buildChamferRingGeo(0.048, 0.028, 0.024, 0.0035, 20);

  const dummy = new THREE.Object3D();
  const basisMat = new THREE.Matrix4();

  for (const entry of hullCustomExplode) {
    const nm = entry?.name || '';
    if (!entry?.obj?.isMesh || nm.startsWith('truss__') || nm.startsWith('trench__')) continue;
    if (!UNDERSIDE_PREFIXES.some((p) => nm.startsWith(p))) continue;

    const geo = entry.obj.geometry;
    if (!geo) continue;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) continue;

    const cLocal = new V3();
    const szLocal = new V3();
    bb.getCenter(cLocal);
    bb.getSize(szLocal);

    const cWorld = cLocal.clone().add(entry.worldPivot);
    const isAppendage = nm.includes('flipper_') || nm.includes('fluke_');
    const spineTarget = isAppendage
      ? new V3(cWorld.x, cWorld.y - Math.sign(cWorld.y || 1) * 0.25, cWorld.z * 0.72)
      : new V3(cWorld.x, 0.55, 0);

    const nIn = spineTarget.sub(cWorld);
    if (nIn.lengthSq() < 1e-6) nIn.set(0, -1, 0);
    else nIn.normalize();

    // Find the exact inner-wall surface vertex closest to `cLocal` so hardware mounts 100% flush on curved shells
    const posAttr = geo.attributes?.position;
    const normAttr = geo.attributes?.normal;
    if (!posAttr || posAttr.count < 12) continue;

    const pSurf = new V3();
    const nSurf = new V3();
    const tmpP = new V3();
    const tmpN = new V3();
    let bestDistSq = Infinity;
    let foundInner = false;

    const stride = Math.max(1, Math.floor(posAttr.count / 400));
    for (let i = 0; i < posAttr.count; i += stride) {
      tmpP.fromBufferAttribute(posAttr, i);
      if (normAttr) {
        tmpN.fromBufferAttribute(normAttr, i);
        if (tmpN.dot(nIn) < 0.18) continue;
      }
      const dSq = tmpP.distanceToSquared(cLocal);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        pSurf.copy(tmpP);
        if (normAttr) nSurf.copy(tmpN).normalize();
        else nSurf.copy(nIn);
        foundInner = true;
      }
    }
    if (!foundInner) continue;

    const axes = [
      { len: szLocal.x, vec: new V3(1, 0, 0) },
      { len: szLocal.y, vec: new V3(0, 1, 0) },
      { len: szLocal.z, vec: new V3(0, 0, 1) },
    ].sort((a, b) => b.len - a.len);

    // Bold heavy-duty underside module (`spanU <= 0.58m`, `spanV <= 0.38m`)
    const spanU = Math.min(0.58, Math.max(0.28, axes[0].len * 0.42));
    const spanV = Math.min(0.38, Math.max(0.20, axes[1].len * 0.38));

    const uAxis = axes[0].vec.clone().addScaledVector(nSurf, -axes[0].vec.dot(nSurf));
    if (uAxis.lengthSq() < 1e-4) {
      if (Math.abs(nSurf.x) < 0.9) uAxis.set(1, 0, 0);
      else uAxis.set(0, 1, 0);
      uAxis.addScaledVector(nSurf, -uAxis.dot(nSurf));
    }
    uAxis.normalize();
    const vAxis = new V3().crossVectors(nSurf, uAxis).normalize();
    basisMat.makeBasis(uAxis, vAxis, nSurf);

    const undersideGroup = new THREE.Group();
    undersideGroup.name = `underside__${nm}`;
    undersideGroup.position.copy(pSurf).addScaledVector(nSurf, 0.008);
    undersideGroup.quaternion.setFromRotationMatrix(basisMat);
    undersideGroup.visible = false;

    const ribThick = 0.022;
    const ribDepth = 0.026;

    // a) Heavy Machined Waffle Stiffening Grid (`Rib / Gusset`): 2 longitudinal + 3 transverse ribs + bronze lightening-bore rings
    const longRibGeo = new THREE.BoxGeometry(spanU * 0.94, ribThick, ribDepth);
    for (const yOff of [-0.27 * spanV, 0.27 * spanV]) {
      const lRib = new THREE.Mesh(longRibGeo, M.titanium);
      lRib.position.set(0, yOff, 0);
      undersideGroup.add(lRib);
    }

    const transRibGeo = new THREE.BoxGeometry(ribThick, spanV * 0.90, ribDepth);
    for (const [idx, xOff] of [
      [0, -0.34 * spanU],
      [1, 0],
      [2, 0.34 * spanU],
    ]) {
      const tRib = new THREE.Mesh(transRibGeo, idx === 1 ? M.titanium : M.alu);
      tRib.position.set(xOff, 0, 0);
      undersideGroup.add(tRib);
    }

    for (const xBore of [-0.17 * spanU, 0.17 * spanU]) {
      const boreRing = new THREE.Mesh(boreRingGeo, M.bronze);
      boreRing.position.set(xBore, 0, ribDepth * 0.34);
      undersideGroup.add(boreRing);
    }

    // b) Heavy Louvered Heat-Sink Grille (`Vent grille / Heat fin`): M.steel bezel + 6 angled M.alu blades (28 deg) + M.bronze divider
    const gW = Math.min(0.46, spanU * 0.44);
    const gH = Math.min(0.30, spanV * 0.48);
    const bezelThick = 0.018;
    const grilleGroup = new THREE.Group();
    grilleGroup.position.set(0, 0, ribDepth * 0.44);

    const hRailGeo = new THREE.BoxGeometry(gW, bezelThick, 0.024);
    const vRailGeo = new THREE.BoxGeometry(bezelThick, gH, 0.024);
    const topRail = new THREE.Mesh(hRailGeo, M.steel);
    topRail.position.y = gH * 0.5;
    const botRail = new THREE.Mesh(hRailGeo, M.steel);
    botRail.position.y = -gH * 0.5;
    const leftRail = new THREE.Mesh(vRailGeo, M.steel);
    leftRail.position.x = -gW * 0.5;
    const rightRail = new THREE.Mesh(vRailGeo, M.steel);
    rightRail.position.x = gW * 0.5;
    const dividerBar = new THREE.Mesh(new THREE.BoxGeometry(bezelThick * 0.90, gH * 0.94, 0.026), M.bronze);
    grilleGroup.add(topRail, botRail, leftRail, rightRail, dividerBar);

    const bladeGeo = new THREE.BoxGeometry(gW * 0.92, 0.0085, 0.026);
    const pitchRad = (28 * Math.PI) / 180;
    for (let b = 0; b < 6; b++) {
      const u = (b + 0.5) / 6 - 0.5;
      const blade = new THREE.Mesh(bladeGeo, M.alu);
      blade.position.set(0, u * gH * 0.82, 0.003);
      blade.rotation.x = pitchRad;
      grilleGroup.add(blade);
    }
    undersideGroup.add(grilleGroup);

    // c) Perimeter Latch Hooks & Striker Pins (`Latch / Locking pin`): 2 createLatchPinPair units at +-0.36 * spanU
    const latchScale = Math.min(1.10, Math.max(0.65, spanU * 0.85));
    const latchA = createLatchPinPair({ scale: latchScale, M, clipPlane });
    latchA.group.position.set(-0.36 * spanU, 0.30 * spanV, ribDepth * 0.25);
    const latchB = createLatchPinPair({ scale: latchScale, M, clipPlane });
    latchB.group.position.set(0.36 * spanU, 0.30 * spanV, ribDepth * 0.25);
    undersideGroup.add(latchA.group, latchB.group);

    // d) Countersunk Hex-Socket Bolt Strip: InstancedMesh of 8 M.chrome hex-socket cap screws around waffle perimeter
    const boltStrip = new THREE.InstancedMesh(screwHeadGeo, M.chrome, 8);
    const boltCoords = [
      [-0.42 * spanU, -0.32 * spanV],
      [0, -0.32 * spanV],
      [0.42 * spanU, -0.32 * spanV],
      [-0.42 * spanU, 0],
      [0.42 * spanU, 0],
      [-0.42 * spanU, 0.32 * spanV],
      [0, 0.32 * spanV],
      [0.42 * spanU, 0.32 * spanV],
    ];
    for (let i = 0; i < 8; i++) {
      dummy.position.set(boltCoords[i][0], boltCoords[i][1], ribDepth * 0.45);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      boltStrip.setMatrixAt(i, dummy.matrix);
    }
    boltStrip.instanceMatrix.needsUpdate = true;
    undersideGroup.add(boltStrip);

    applyClip(undersideGroup, clipPlane);
    entry.obj.add(undersideGroup);

    items.push({
      entry,
      group: undersideGroup,
      latchA,
      latchB,
    });
  }

  function update() {
    for (let i = 0; i < items.length; i++) {
      const u = items[i];
      const kAct = u.entry.kActive ?? 0;
      const vis = kAct > 0.012;
      u.group.visible = vis;
      if (vis) {
        const unlatch = clamp01(kAct * 2.4);
        u.latchA.update(unlatch);
        u.latchB.update(unlatch);
      }
    }
  }

  return { items, update };
}

// ----------------------------------------------------------------------------
// 6. Slewing Bearing Ring with Instanced Chrome Balls & Circlip (Tier 2)
// ----------------------------------------------------------------------------
export function createSlewingBearingRing(opts = {}) {
  const {
    rOuter = 0.54,
    rInner = 0.36,
    ballCount = 20,
    M,
    clipPlane,
  } = opts;
  const axialThick = Math.max(0.085, opts.axialThick || 0.085);

  const group = new THREE.Group();
  group.name = 'slewingBearingRing';

  const rPitch = 0.5 * (rOuter + rInner);
  const radialSpan = Math.max(0.06, rOuter - rInner);
  const rBall = Math.max(0.026, Math.min(radialSpan * 0.32, axialThick * 0.42));

  // 1. Counterbored Outer Race (`M.titanium`) + chrome flange bolts
  const outerRace = new THREE.Group();
  const outerRaceRing = new THREE.Mesh(
    buildChamferRingGeo(rOuter, rPitch + radialSpan * 0.07, axialThick, axialThick * 0.08, 36),
    M.titanium,
  );
  const outerLipRing = new THREE.Mesh(
    buildChamferRingGeo(rOuter * 1.04, rOuter * 0.91, axialThick * 0.40, axialThick * 0.04, 36),
    M.titanium,
  );
  outerLipRing.position.z = -axialThick * 0.28;
  outerRace.add(outerRaceRing, outerLipRing);

  const outerBoltCount = Math.max(8, Math.round(ballCount * 0.6));
  const rOuterBolt = 0.5 * (rOuter + rPitch + radialSpan * 0.08);
  const boltGeo = new THREE.CylinderGeometry(radialSpan * 0.075, radialSpan * 0.075, axialThick * 0.26, 6).rotateX(
    Math.PI / 2,
  );
  const outerBolts = new THREE.InstancedMesh(boltGeo, M.chrome, outerBoltCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < outerBoltCount; i++) {
    const a = (i * Math.PI * 2) / outerBoltCount;
    dummy.position.set(Math.cos(a) * rOuterBolt, Math.sin(a) * rOuterBolt, axialThick * 0.52);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    outerBolts.setMatrixAt(i, dummy.matrix);
  }
  outerBolts.instanceMatrix.needsUpdate = true;
  outerRace.add(outerBolts);

  // 2. Lipped Inner Race (`M.steel`)
  const innerRace = new THREE.Group();
  const innerRaceRing = new THREE.Mesh(
    buildChamferRingGeo(rPitch - radialSpan * 0.07, rInner, axialThick * 0.94, axialThick * 0.08, 36),
    M.steel,
  );
  const innerLipRing = new THREE.Mesh(
    buildChamferRingGeo(rPitch - radialSpan * 0.02, rInner * 0.98, axialThick * 0.36, axialThick * 0.04, 36),
    M.steel,
  );
  innerLipRing.position.z = axialThick * 0.28;
  innerRace.add(innerRaceRing, innerLipRing);

  // 3. Slotted Annular Roller Cage (`M.bronze`) + InstancedMesh of Mirror-Chrome Balls (`M.chrome`)
  const cageGroup = new THREE.Group();
  const cageRing = new THREE.Mesh(
    buildChamferRingGeo(rPitch + rBall * 0.58, rPitch - rBall * 0.58, axialThick * 0.54, axialThick * 0.04, 36),
    M.bronze,
  );
  const ballGeo = new THREE.SphereGeometry(rBall, 14, 10);
  const ballsMesh = new THREE.InstancedMesh(ballGeo, M.chrome, ballCount);
  for (let i = 0; i < ballCount; i++) {
    const a = (i * Math.PI * 2) / ballCount;
    dummy.position.set(Math.cos(a) * rPitch, Math.sin(a) * rPitch, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    ballsMesh.setMatrixAt(i, dummy.matrix);
  }
  ballsMesh.instanceMatrix.needsUpdate = true;
  cageGroup.add(cageRing, ballsMesh);

  // 4. Notched Retaining Circlip (`M.steel`) in XY plane
  const circlip = new THREE.Group();
  const circlipArc = new THREE.Mesh(
    buildChamferRingGeo(
      rPitch + radialSpan * 0.18,
      rPitch - radialSpan * 0.14,
      axialThick * 0.14,
      axialThick * 0.02,
      32,
      Math.PI * 1.84,
    ),
    M.steel,
  );
  const lugEarGeo = new THREE.BoxGeometry(radialSpan * 0.24, radialSpan * 0.18, axialThick * 0.16);
  for (const sgn of [-1, 1]) {
    const aLug = sgn * Math.PI * 0.91;
    const lug = new THREE.Mesh(lugEarGeo, M.steel);
    lug.position.set(Math.cos(aLug) * rPitch, Math.sin(aLug) * rPitch, 0);
    lug.rotation.z = aLug;
    circlip.add(lug);
  }
  circlip.add(circlipArc);
  circlip.position.z = axialThick * 0.54;

  group.add(outerRace, innerRace, cageGroup, circlip);
  applyClip(group, clipPlane);

  function update(angle = 0, explode = 0) {
    innerRace.rotation.z = angle;
    cageGroup.rotation.z = angle * 0.5;
    const zSep = 0.16 * rOuter * explode;
    outerRace.position.z = -zSep * 0.5;
    innerRace.position.z = zSep * 0.45;
    cageGroup.position.z = zSep * 0.95;
    circlip.position.z = axialThick * 0.54 + zSep * 1.45;
  }

  return { group, outerRace, innerRace, cageGroup, circlip, update };
}

// ----------------------------------------------------------------------------
// 7. Heavy Profiled T-Slotted Linear Guide Rail & Recirculating Ball Carriages (Tier 2)
// ----------------------------------------------------------------------------
export function createLinearGuideRail(opts = {}) {
  const {
    length = 1.4,
    carriageCount = 2,
    M,
    clipPlane,
  } = opts;
  const width = Math.max(0.095, opts.width || 0.095);
  const height = Math.max(0.072, opts.height || 0.072);
  const carriageLen = Math.max(0.22, opts.carriageLen || 0.22);

  const group = new THREE.Group();
  group.name = 'linearGuideRail';

  // Profiled T-slotted steel guideway rail along local X (`x in [-length/2, +length/2]`)
  const railGroup = new THREE.Group();
  const baseFlange = new THREE.Mesh(
    new THREE.BoxGeometry(length, height * 0.28, width * 1.12),
    M.titanium,
  );
  baseFlange.position.y = -height * 0.36;

  const waistWeb = new THREE.Mesh(
    new THREE.BoxGeometry(length, height * 0.36, width * 0.68),
    M.steel,
  );
  waistWeb.position.y = -height * 0.04;

  const railMesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, height * 0.38, width * 0.98),
    M.steel,
  );
  railMesh.position.y = height * 0.28;
  railGroup.add(baseFlange, waistWeb, railMesh);

  // InstancedMesh row of bold chrome counterbored rail bolts (`r = width * 0.18`)
  const boltCount = Math.max(3, Math.round(length / 0.14));
  const boltGeo = new THREE.CylinderGeometry(width * 0.18, width * 0.18, height * 0.22, 6);
  const railBolts = new THREE.InstancedMesh(boltGeo, M.chrome, boltCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < boltCount; i++) {
    const u = boltCount === 1 ? 0 : i / (boltCount - 1) - 0.5;
    dummy.position.set(u * length * 0.88, height * 0.49, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    railBolts.setMatrixAt(i, dummy.matrix);
  }
  railBolts.instanceMatrix.needsUpdate = true;
  railGroup.add(railBolts);
  group.add(railGroup);

  // Recirculating ball-bearing slider carriages (`M.titanium` saddle + `M.bronze` end-wipers + `M.chrome` preload screws)
  const carriages = [];
  const baseXs = [];
  const saddleTopGeo = new THREE.BoxGeometry(carriageLen * 0.78, height * 0.48, width * 1.68);
  const saddleSkirtGeo = new THREE.BoxGeometry(carriageLen * 0.78, height * 0.56, width * 0.28);
  const wiperCapGeo = new THREE.BoxGeometry(carriageLen * 0.12, height * 0.88, width * 1.58);
  const preloadScrewGeo = new THREE.CylinderGeometry(width * 0.14, width * 0.14, height * 0.22, 6);
  const yBase = height * 0.26;

  for (let i = 0; i < carriageCount; i++) {
    const cGroup = new THREE.Group();
    const u = carriageCount === 1 ? 0 : i / (carriageCount - 1) - 0.5;
    const x0 = u * Math.max(0, length - carriageLen * 1.2) * 0.62;
    baseXs.push(x0);

    const saddleTop = new THREE.Mesh(saddleTopGeo, M.titanium);
    saddleTop.position.y = height * 0.28;
    const skirtL = new THREE.Mesh(saddleSkirtGeo, M.titanium);
    skirtL.position.set(0, -height * 0.08, width * 0.68);
    const skirtR = new THREE.Mesh(saddleSkirtGeo, M.titanium);
    skirtR.position.set(0, -height * 0.08, -width * 0.68);

    const wiperFore = new THREE.Mesh(wiperCapGeo, M.bronze);
    wiperFore.position.set(-carriageLen * 0.44, height * 0.08, 0);
    const wiperAft = new THREE.Mesh(wiperCapGeo, M.bronze);
    wiperAft.position.set(carriageLen * 0.44, height * 0.08, 0);

    for (const [sx, sz] of [
      [-carriageLen * 0.24, width * 0.52],
      [carriageLen * 0.24, width * 0.52],
      [-carriageLen * 0.24, -width * 0.52],
      [carriageLen * 0.24, -width * 0.52],
    ]) {
      const pScrew = new THREE.Mesh(preloadScrewGeo, M.chrome);
      pScrew.position.set(sx, height * 0.56, sz);
      cGroup.add(pScrew);
    }

    cGroup.add(saddleTop, skirtL, skirtR, wiperFore, wiperAft);
    cGroup.position.set(x0, yBase, 0);
    group.add(cGroup);
    carriages.push(cGroup);
  }

  applyClip(group, clipPlane);

  const maxSlide = Math.max(0.04, (length - carriageLen * 0.85) * 0.48);
  function update(slideOffsets = 0, explode = 0) {
    const yLift = yBase + height * 1.3 * explode;
    for (let i = 0; i < carriages.length; i++) {
      const rawX = Array.isArray(slideOffsets)
        ? (slideOffsets[i] ?? baseXs[i])
        : baseXs[i] + (slideOffsets || 0);
      carriages[i].position.x = Math.min(maxSlide, Math.max(-maxSlide, rawX));
      carriages[i].position.y = yLift;
    }
  }

  return { group, railMesh, carriages, update };
}

// ----------------------------------------------------------------------------
// 8. Heavy Toothed Rack-and-Pinion Linear Actuator with Servo Motor Can (Tier 2)
// ----------------------------------------------------------------------------
export function createRackAndPinionActuator(opts = {}) {
  const {
    rackLen = 0.85,
    teeth = 16,
    M,
    clipPlane,
  } = opts;
  const pitchRadius = Math.max(0.095, opts.pitchRadius || 0.095);
  const faceWidth = Math.max(0.068, opts.faceWidth || 0.068);

  const group = new THREE.Group();
  group.name = 'rackAndPinionActuator';

  // 1. Toothed Steel Linear Rack Bar along local X (`rackGroup`)
  const rackGroup = new THREE.Group();
  const backingBar = new THREE.Mesh(
    new THREE.BoxGeometry(rackLen * 1.04, pitchRadius * 0.38, faceWidth * 1.18),
    M.titanium,
  );
  backingBar.position.y = -pitchRadius * 0.36;

  const rackBody = new THREE.Mesh(
    new THREE.BoxGeometry(rackLen, pitchRadius * 0.28, faceWidth * 0.96),
    M.steel,
  );
  rackBody.position.y = -pitchRadius * 0.14;

  const toothPitch = (2 * Math.PI * pitchRadius) / Math.max(6, teeth);
  const rackToothCount = Math.max(8, Math.floor((rackLen * 0.92) / toothPitch));
  const toothGeo = new THREE.BoxGeometry(toothPitch * 0.50, pitchRadius * 0.24, faceWidth * 0.94);
  const teethMesh = new THREE.InstancedMesh(toothGeo, M.steel, rackToothCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < rackToothCount; i++) {
    const xT = (i - (rackToothCount - 1) * 0.5) * toothPitch;
    dummy.position.set(xT, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    teethMesh.setMatrixAt(i, dummy.matrix);
  }
  teethMesh.instanceMatrix.needsUpdate = true;

  // Heavy clevis end-blocks on the rack bar
  const endClevisGeo = new THREE.BoxGeometry(pitchRadius * 0.46, pitchRadius * 0.52, faceWidth * 1.28);
  const endPinGeo = new THREE.CylinderGeometry(pitchRadius * 0.16, pitchRadius * 0.16, faceWidth * 1.54, 14).rotateX(
    Math.PI / 2,
  );
  for (const xSgn of [-1, 1]) {
    const endClevis = new THREE.Mesh(endClevisGeo, M.titanium);
    endClevis.position.set(xSgn * rackLen * 0.51, -pitchRadius * 0.20, 0);
    const endPin = new THREE.Mesh(endPinGeo, M.bronze);
    endPin.position.copy(endClevis.position);
    rackGroup.add(endClevis, endPin);
  }
  rackGroup.add(backingBar, rackBody, teethMesh);

  // 2. Meshed Bronze Spur Pinion Gear (`pinionMesh`)
  const pinionGeo = gearGeometry({
    teeth,
    rOut: pitchRadius * 1.14,
    rRoot: pitchRadius * 0.84,
    width: faceWidth,
    holeR: pitchRadius * 0.30,
    bevel: Math.min(0.006, faceWidth * 0.08),
  });
  const pinionMesh = new THREE.Mesh(pinionGeo, M.bronze);
  pinionMesh.position.set(0, pitchRadius, 0);

  const pinionShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(pitchRadius * 0.29, pitchRadius * 0.29, faceWidth * 1.62, 16).rotateX(Math.PI / 2),
    M.chrome,
  );
  pinionMesh.add(pinionShaft);

  // 3. Heavy Stepped Cylindrical Servo Motor Can (`motorGroup`, `r = pitchRadius * 1.15`)
  const motorGroup = new THREE.Group();
  const zMotorBase = faceWidth * 1.34;
  const motorCan = new THREE.Mesh(
    new THREE.CylinderGeometry(pitchRadius * 1.15, pitchRadius * 1.15, faceWidth * 1.65, 24).rotateX(Math.PI / 2),
    M.aluDark,
  );
  motorCan.position.set(0, pitchRadius, zMotorBase);

  const finGeo = buildChamferRingGeo(pitchRadius * 1.32, pitchRadius * 1.08, faceWidth * 0.12, 0.003, 24);
  const finMesh = new THREE.InstancedMesh(finGeo, M.alu, 5);
  for (let i = 0; i < 5; i++) {
    dummy.position.set(0, pitchRadius, zMotorBase + (i - 2) * faceWidth * 0.28);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    finMesh.setMatrixAt(i, dummy.matrix);
  }
  finMesh.instanceMatrix.needsUpdate = true;

  const encoderCap = new THREE.Mesh(
    new THREE.CylinderGeometry(pitchRadius * 0.92, pitchRadius * 1.04, faceWidth * 0.48, 20).rotateX(Math.PI / 2),
    M.bronze,
  );
  encoderCap.position.set(0, pitchRadius, zMotorBase + faceWidth * 1.04);
  motorGroup.add(motorCan, finMesh, encoderCap);

  // 4. Gusseted Titanium Mounting Bracket
  const bracketGroup = createGussetBracket({
    width: pitchRadius * 2.6,
    height: pitchRadius * 2.2,
    depth: faceWidth * 2.2,
    M,
    clipPlane,
  }).group;
  bracketGroup.position.set(0, pitchRadius * 0.35, -faceWidth * 0.72);

  group.add(rackGroup, pinionMesh, motorGroup, bracketGroup);
  applyClip(group, clipPlane);

  function update(travel = 0, explode = 0) {
    rackGroup.position.x = travel;
    pinionMesh.rotation.z = -travel / Math.max(0.01, pitchRadius);
    motorGroup.position.z = faceWidth * 1.6 * explode;
  }

  return { group, rackGroup, pinionMesh, motorGroup, update };
}

// ----------------------------------------------------------------------------
// 9. Heavy Helical Worm-Gear Rotary Servo Actuator (Tier 2)
// ----------------------------------------------------------------------------
export function createWormGearActuator(opts = {}) {
  const {
    wheelTeeth = 20,
    M,
    clipPlane,
  } = opts;
  const wormRadius = Math.max(0.062, opts.wormRadius || 0.062);
  const wheelRadius = Math.max(0.125, opts.wheelRadius || 0.125);
  const wormLen = Math.max(wormRadius * 4.6, opts.wormLen || 0.28);

  const group = new THREE.Group();
  group.name = 'wormGearActuator';

  // 1. Helical Bronze Worm Shaft (`wormShaft`) along local X
  const wormShaft = new THREE.Group();
  const shaftCore = new THREE.Mesh(
    new THREE.CylinderGeometry(wormRadius * 0.58, wormRadius * 0.58, wormLen * 1.32, 18).rotateZ(Math.PI / 2),
    M.steel,
  );
  const wormCore = new THREE.Mesh(
    new THREE.CylinderGeometry(wormRadius * 0.76, wormRadius * 0.76, wormLen * 0.78, 18).rotateZ(Math.PI / 2),
    M.bronze,
  );
  const threadLen = wormLen * 0.74;
  const threadGeo = helixGeometry({
    r: wormRadius * 0.88,
    wire: wormRadius * 0.22,
    turns: 6,
    len: threadLen,
    seg: 96,
  });
  threadGeo.rotateZ(-Math.PI / 2);
  threadGeo.translate(-threadLen * 0.5, 0, 0);
  const wormThread = new THREE.Mesh(threadGeo, M.bronze);
  wormShaft.add(shaftCore, wormCore, wormThread);
  group.add(wormShaft);

  // 2. Twin Steel Thrust Bearing Pillow Blocks + Titanium Saddle Base
  const pillowGeo = new THREE.BoxGeometry(wormLen * 0.15, wormRadius * 2.6, wormRadius * 2.4);
  const bushingGeo = new THREE.CylinderGeometry(wormRadius * 0.80, wormRadius * 0.80, wormLen * 0.19, 16).rotateZ(
    Math.PI / 2,
  );
  const boltGeo = new THREE.CylinderGeometry(wormRadius * 0.20, wormRadius * 0.20, wormRadius * 0.48, 6);
  for (const xSgn of [-1, 1]) {
    const xPillow = xSgn * wormLen * 0.50;
    const pillow = new THREE.Mesh(pillowGeo, M.steel);
    pillow.position.set(xPillow, 0, 0);
    const bush = new THREE.Mesh(bushingGeo, M.bronze);
    bush.position.set(xPillow, 0, 0);
    group.add(pillow, bush);

    for (const zSgn of [-1, 1]) {
      const bolt = new THREE.Mesh(boltGeo, M.chrome);
      bolt.position.set(xPillow, wormRadius * 1.44, zSgn * wormRadius * 0.76);
      group.add(bolt);
    }
  }
  const baseBridge = new THREE.Mesh(
    new THREE.BoxGeometry(wormLen * 1.18, wormRadius * 0.52, wormRadius * 2.6),
    M.titanium,
  );
  baseBridge.position.set(0, wormRadius * 1.30, 0);
  group.add(baseBridge);

  // 3. Meshed Titanium Worm Wheel (`wheelMesh`)
  let wheelMesh = null;
  const yWheelBase = -(wormRadius * 0.88 + wheelRadius * 0.96);
  if (wheelRadius > 0) {
    const wheelGeo = gearGeometry({
      teeth: Math.max(8, wheelTeeth),
      rOut: wheelRadius * 1.10,
      rRoot: wheelRadius * 0.85,
      width: wormRadius * 1.22,
      helix: 0.22,
      holeR: wheelRadius * 0.28,
      lighteningHoles: 6,
      bevel: Math.min(0.006, wormRadius * 0.12),
    });
    wheelMesh = new THREE.Mesh(wheelGeo, M.titanium);
    wheelMesh.position.set(0, yWheelBase, 0);

    const wheelHub = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.44, wheelRadius * 0.44, wormRadius * 1.56, 20).rotateX(Math.PI / 2),
      M.bronze,
    );
    const wheelPin = new THREE.Mesh(
      new THREE.CylinderGeometry(wheelRadius * 0.28, wheelRadius * 0.28, wormRadius * 1.92, 16).rotateX(Math.PI / 2),
      M.chrome,
    );
    wheelMesh.add(wheelHub, wheelPin);
    group.add(wheelMesh);
  }

  // 4. Stepped Servo Motor Can at `-X` end of Worm Shaft
  const motorGroup = new THREE.Group();
  const xMotor = -wormLen * 0.92;
  const motorBody = new THREE.Mesh(
    new THREE.CylinderGeometry(wormRadius * 1.32, wormRadius * 1.32, wormLen * 0.58, 22).rotateZ(Math.PI / 2),
    M.aluDark,
  );
  motorBody.position.set(xMotor, 0, 0);
  const motorFin = new THREE.Mesh(
    new THREE.CylinderGeometry(wormRadius * 1.50, wormRadius * 1.50, wormLen * 0.24, 22).rotateZ(Math.PI / 2),
    M.alu,
  );
  motorFin.position.set(xMotor, 0, 0);
  const motorCap = new THREE.Mesh(
    new THREE.CylinderGeometry(wormRadius * 1.04, wormRadius * 1.18, wormLen * 0.18, 18).rotateZ(Math.PI / 2),
    M.bronze,
  );
  motorCap.position.set(xMotor - wormLen * 0.35, 0, 0);
  motorGroup.add(motorBody, motorFin, motorCap);
  group.add(motorGroup);

  applyClip(group, clipPlane);

  function update(angle = 0, explode = 0) {
    wormShaft.rotation.x = -angle * wheelTeeth;
    if (wheelMesh) {
      wheelMesh.rotation.z = angle;
      wheelMesh.position.y = yWheelBase - wheelRadius * 0.45 * explode;
    }
    motorGroup.position.x = -wormLen * 0.28 * explode;
  }

  return { group, wormShaft, wheelMesh, update };
}

// ----------------------------------------------------------------------------
// 10. Heavy Telescoping Pressurized Nitrogen Gas Strut (Tier 2, >= 8.4cm dia)
// ----------------------------------------------------------------------------
export function createGasStrut(opts = {}) {
  const {
    parentGroup,
    sockA,
    sockB,
    restLen = 0.65,
    detachVec = [0, 0, 0],
    M,
    clipPlane,
  } = opts;
  const cylRadius = Math.max(0.042, opts.cylRadius || 0.042);

  const strutGroup = new THREE.Group();
  strutGroup.name = 'gasStrut';
  const cylGroup = new THREE.Group();
  const rodGroup = new THREE.Group();
  strutGroup.add(cylGroup, rodGroup);
  if (parentGroup) parentGroup.add(strutGroup);

  const eyeletGeo = new THREE.CylinderGeometry(cylRadius * 1.32, cylRadius * 1.32, cylRadius * 1.35, 18).rotateZ(
    Math.PI / 2,
  );
  const ballPinGeo = new THREE.CylinderGeometry(cylRadius * 0.65, cylRadius * 0.65, cylRadius * 2.25, 16).rotateZ(
    Math.PI / 2,
  );
  const eClipGeo = new THREE.CylinderGeometry(cylRadius * 1.02, cylRadius * 1.02, cylRadius * 0.28, 14).rotateZ(
    Math.PI / 2,
  );

  // Cylinder barrel side (`M.steel` barrel + bold `M.bronze` wiper gland + `M.bronze` clevis eye + `M.steel` E-clip)
  const eyeA = new THREE.Mesh(eyeletGeo, M.bronze);
  eyeA.position.y = restLen * 0.028;
  const pinA = new THREE.Mesh(ballPinGeo, M.chrome);
  pinA.position.y = restLen * 0.028;
  const eClipA = new THREE.Mesh(eClipGeo, M.steel);
  eClipA.position.set(cylRadius * 0.92, restLen * 0.028, 0);

  const barrelLen = restLen * 0.54;
  const barrelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius, cylRadius, barrelLen, 20),
    M.steel,
  );
  barrelMesh.position.y = restLen * 0.055 + barrelLen * 0.5;

  const glandNut = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius * 1.28, cylRadius * 1.16, cylRadius * 1.65, 20),
    M.bronze,
  );
  glandNut.position.y = restLen * 0.055 + barrelLen;

  const glandCirclip = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius * 1.34, cylRadius * 1.34, cylRadius * 0.34, 20),
    M.steel,
  );
  glandCirclip.position.y = restLen * 0.055 + barrelLen + cylRadius * 0.72;
  cylGroup.add(eyeA, pinA, eClipA, barrelMesh, glandNut, glandCirclip);

  // Piston rod side (`M.chrome` rod + bold `M.bronze` clevis eye + `M.steel` E-clip)
  const eyeB = new THREE.Mesh(eyeletGeo, M.bronze);
  eyeB.position.y = restLen * 0.028;
  const pinB = new THREE.Mesh(ballPinGeo, M.chrome);
  pinB.position.y = restLen * 0.028;
  const eClipB = new THREE.Mesh(eClipGeo, M.steel);
  eClipB.position.set(cylRadius * 0.92, restLen * 0.028, 0);

  const rodLen = restLen * 0.58;
  const rodMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius * 0.58, cylRadius * 0.58, rodLen, 18),
    M.chrome,
  );
  rodMesh.position.y = restLen * 0.045 + rodLen * 0.5;

  const stopCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius * 0.96, cylRadius * 0.96, cylRadius * 0.75, 18),
    M.bronze,
  );
  stopCollar.position.y = restLen * 0.095;
  rodGroup.add(eyeB, pinB, eClipB, rodMesh, stopCollar);

  applyClip(strutGroup, clipPlane);

  // Pre-allocated scratch vectors for zero per-frame allocation
  const pAw = new V3();
  const pBw = new V3();
  const pAl = new V3();
  const pBl = new V3();
  const dir = new V3();
  const detachedB = new V3();

  function update(kDec = 0) {
    sockA.getWorldPosition(pAw);
    sockB.getWorldPosition(pBw);
    if (parentGroup) {
      parentGroup.worldToLocal(pAl.copy(pAw));
      parentGroup.worldToLocal(pBl.copy(pBw));
    } else {
      pAl.copy(pAw);
      pBl.copy(pBw);
    }

    if (kDec > 0.0005) {
      const kd = smooth01(kDec);
      pAl.x += detachVec[0] * kd;
      pAl.y += detachVec[1] * kd;
      pAl.z += detachVec[2] * kd;
      pBl.x += detachVec[0] * kd;
      pBl.y += detachVec[1] * kd;
      pBl.z += detachVec[2] * kd;
      dir.subVectors(pBl, pAl);
      const rawDist = dir.length();
      if (rawDist > 1e-4) dir.divideScalar(rawDist);
      else dir.set(1, 0, 0);
      detachedB.copy(pAl).addScaledVector(dir, restLen);
      pBl.lerp(detachedB, smooth01(kd * 1.45));
    }

    poseActuator(cylGroup, rodGroup, pAl, pBl);
  }

  return { group: strutGroup, update };
}

// ----------------------------------------------------------------------------
// 11. High-Density Stacked Aluminum Radiator Fin Bank (Tier 2)
// ----------------------------------------------------------------------------
export function createRadiatorFinStack({
  length = 2.1,
  height = 0.38,
  depth = 0.24,
  finCount = 24,
  pipeCount = 2,
  M,
  clipPlane,
} = {}) {
  const group = new THREE.Group();
  group.name = 'radiatorFinStack';

  // 1. InstancedMesh of `finCount` heavy beveled aluminum heat-sink fins along local X
  const finThick = Math.max(0.016, Math.min(0.022, (length * 0.90) / Math.max(8, finCount * 1.9)));
  const finGeo = new THREE.BoxGeometry(finThick, height * 0.88, depth * 0.88);
  const finsMesh = new THREE.InstancedMesh(finGeo, M.alu, finCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < finCount; i++) {
    const u = finCount === 1 ? 0 : i / (finCount - 1) - 0.5;
    dummy.position.set(u * length * 0.88, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    finsMesh.setMatrixAt(i, dummy.matrix);
  }
  finsMesh.instanceMatrix.needsUpdate = true;
  group.add(finsMesh);

  // 2. Longitudinal Copper / Bronze Coolant Heat-Pipes piercing the fin stack
  const pipeMat = M.copper || M.bronze;
  const rPipe = Math.max(0.032, Math.min(height, depth) * 0.12);
  const pipeGeo = new THREE.CylinderGeometry(rPipe, rPipe, length * 0.96, 16).rotateZ(Math.PI / 2);
  for (let p = 0; p < pipeCount; p++) {
    const v = pipeCount === 1 ? 0 : p / (pipeCount - 1) - 0.5;
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.position.set(0, v * height * 0.48, 0);
    group.add(pipe);
  }

  // 3. Fore & Aft Bronze Manifold Headers (`x = +-length/2`)
  const headerW = Math.max(0.068, length * 0.056);
  const headerGeo = new THREE.BoxGeometry(headerW, height * 0.98, depth * 0.98);
  const flangeGeo = new THREE.BoxGeometry(headerW * 0.38, height * 1.06, depth * 1.06);
  const portGeo = new THREE.CylinderGeometry(rPipe * 1.42, rPipe * 1.42, headerW * 0.95, 6).rotateZ(Math.PI / 2);
  const boltGeo = new THREE.CylinderGeometry(rPipe * 0.52, rPipe * 0.52, headerW * 0.55, 6).rotateZ(Math.PI / 2);

  const buildHeader = (xSgn) => {
    const hGroup = new THREE.Group();
    const block = new THREE.Mesh(headerGeo, M.bronze);
    const flange = new THREE.Mesh(flangeGeo, M.steel);
    flange.position.x = -xSgn * headerW * 0.42;
    const port = new THREE.Mesh(portGeo, M.bronze);
    port.position.set(xSgn * headerW * 0.65, 0, 0);
    hGroup.add(block, flange, port);

    for (const [by, bz] of [
      [height * 0.38, depth * 0.38],
      [height * 0.38, -depth * 0.38],
      [-height * 0.38, depth * 0.38],
      [-height * 0.38, -depth * 0.38],
    ]) {
      const b = new THREE.Mesh(boltGeo, M.chrome);
      b.position.set(xSgn * headerW * 0.52, by, bz);
      hGroup.add(b);
    }
    hGroup.position.x = xSgn * length * 0.5;
    return hGroup;
  };

  const foreHeader = buildHeader(-1);
  const aftHeader = buildHeader(1);
  group.add(foreHeader, aftHeader);

  // 4. Gusseted Titanium Sub-Frame + Protective Top Louver Tie-Bar
  const lowerRailGeo = new THREE.BoxGeometry(length * 0.96, height * 0.12, depth * 0.22);
  for (const zSgn of [-1, 1]) {
    const rail = new THREE.Mesh(lowerRailGeo, M.titanium);
    rail.position.set(0, -height * 0.48, zSgn * depth * 0.40);
    group.add(rail);
  }
  const topLouverBar = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.92, height * 0.10, depth * 0.72),
    M.titanium,
  );
  topLouverBar.position.set(0, height * 0.48, 0);
  group.add(topLouverBar);

  applyClip(group, clipPlane);

  function update(explode = 0) {
    const dx = 0.16 * length * explode;
    foreHeader.position.x = -length * 0.5 - dx;
    aftHeader.position.x = length * 0.5 + dx;
    topLouverBar.position.y = height * 0.48 + height * 0.36 * explode;
  }

  return { group, foreHeader, aftHeader, update };
}

// ----------------------------------------------------------------------------
// 12. Heavy Linkage Micro-Hardware Decorator: Bushings, Circlips & Cheek Bolts (Tier 3)
// ----------------------------------------------------------------------------
export function decorateLinkageWithMicroHardware(linkageRig, opts = {}) {
  const {
    lengthA = 0.85,
    lengthB = 0.85,
    M,
    clipPlane,
  } = opts;
  if (!linkageRig || !M) return linkageRig;

  // Enforce heavy-industrial minimum cross-sections (`pinRadius >= 0.042`)
  const pinRadius = Math.max(0.042, opts.pinRadius || 0.042);
  const thickness = Math.max(0.052, opts.thickness || 0.052);
  const clevisGap = Math.max(0.064, opts.clevisGap || 0.064);

  const cheekZ = (clevisGap + thickness) * 0.5;
  const fullSpanZ = clevisGap + thickness * 2;
  const tongueThick = Math.min(thickness, clevisGap * 0.86);

  const bushingCollarGeo = buildChamferRingGeo(
    pinRadius * 1.64,
    pinRadius * 1.02,
    thickness * 0.42,
    0.0035,
    20,
  );
  const circlipGeo = buildChamferRingGeo(
    pinRadius * 1.54,
    pinRadius * 0.98,
    thickness * 0.24,
    0.0025,
    20,
    Math.PI * 1.80,
  );
  const hexScrewGeo = new THREE.CylinderGeometry(pinRadius * 0.42, pinRadius * 0.42, thickness * 0.44, 6).rotateX(
    Math.PI / 2,
  );

  const addedMeshes = [];

  // 1. Decorate `armAGroup` (twin cheek plates at z = +-cheekZ, pins at y = 0 and y = lengthA)
  if (linkageRig.armAGroup) {
    for (const zSgn of [-1, 1]) {
      const zFace = zSgn * (cheekZ + thickness * 0.55);
      const zClip = zSgn * (cheekZ + thickness * 0.74);

      for (const yPin of [0, lengthA]) {
        const bush = new THREE.Mesh(bushingCollarGeo, M.bronze);
        bush.position.set(0, yPin, zFace);
        const clip = new THREE.Mesh(circlipGeo, M.steel);
        clip.position.set(0, yPin, zClip);
        linkageRig.armAGroup.add(bush, clip);
        addedMeshes.push(bush, clip);
      }

      for (const yScrew of [lengthA * 0.24, lengthA * 0.76]) {
        const screw = new THREE.Mesh(hexScrewGeo, M.chrome);
        screw.position.set(0, yScrew, zFace);
        linkageRig.armAGroup.add(screw);
        addedMeshes.push(screw);
      }
    }
  }

  // 2. Decorate `armBGroup` (central tongue at z = 0, pins at y = 0 and y = lengthB)
  if (linkageRig.armBGroup) {
    for (const zSgn of [-1, 1]) {
      const zTongueFace = zSgn * (tongueThick * 0.56);
      const bush0 = new THREE.Mesh(bushingCollarGeo, M.bronze);
      bush0.position.set(0, 0, zTongueFace);
      const bush1 = new THREE.Mesh(bushingCollarGeo, M.bronze);
      bush1.position.set(0, lengthB, zTongueFace);
      const screw0 = new THREE.Mesh(hexScrewGeo, M.chrome);
      screw0.position.set(0, lengthB * 0.28, zTongueFace);
      const screw1 = new THREE.Mesh(hexScrewGeo, M.chrome);
      screw1.position.set(0, lengthB * 0.72, zTongueFace);
      linkageRig.armBGroup.add(bush0, bush1, screw0, screw1);
      addedMeshes.push(bush0, bush1, screw0, screw1);
    }
  }

  // 3. Decorate `clevisA` & `clevisB` (external circlips & bronze thrust washers)
  for (const clevis of [linkageRig.clevisA, linkageRig.clevisB]) {
    if (!clevis) continue;
    for (const zSgn of [-1, 1]) {
      const clip = new THREE.Mesh(circlipGeo, M.steel);
      clip.position.set(0, 0, zSgn * (fullSpanZ * 0.55));
      const bush = new THREE.Mesh(bushingCollarGeo, M.bronze);
      bush.position.set(0, 0, zSgn * (clevisGap * 0.46));
      clevis.add(clip, bush);
      addedMeshes.push(clip, bush);
    }
  }

  if (Array.isArray(linkageRig.detailMeshes)) {
    linkageRig.detailMeshes.push(...addedMeshes);
  }
  applyClip(linkageRig.group, clipPlane);
  return linkageRig;
}

// ----------------------------------------------------------------------------
// 13. Heavy Routed Hydraulic / Coolant Hardline & Corrugated Conduit Bay (Tier 3)
// ----------------------------------------------------------------------------
export function createRoutedPlumbingBay(opts = {}) {
  const {
    routes = [],
    corrugated = false,
    clipCount = 3,
    tubeMat = null,
    M,
    clipPlane,
  } = opts;
  const group = new THREE.Group();
  group.name = 'routedPlumbingBay';
  if (!Array.isArray(routes) || routes.length === 0) return { group };

  const dummy = new THREE.Object3D();
  const pt = new V3();
  const tan = new V3();
  const quat = new THREE.Quaternion();

  for (let rIdx = 0; rIdx < routes.length; rIdx++) {
    const rSpec = routes[rIdx];
    const r = rSpec && !Array.isArray(rSpec) ? rSpec : {};
    const rawPts = Array.isArray(rSpec) ? rSpec : r.points;
    if (!Array.isArray(rawPts) || rawPts.length < 2) continue;

    // Enforce minimum tubeRadius >= 0.038 (7.6cm-11cm heavy armored conduits & hydraulic hardlines)
    const rTube = Math.max(0.038, r.tubeRadius ?? opts.tubeRadius ?? 0.042);
    const isCorr = r.corrugated !== undefined ? r.corrugated : corrugated;
    const nClips = r.clipCount !== undefined ? r.clipCount : clipCount;
    const lineMat =
      r.tubeMat ||
      tubeMat ||
      (isCorr ? M.aluDark : rIdx % 2 === 0 ? M.bronze : M.steel);

    const vecPts = rawPts.map((p) => (p.isVector3 ? p.clone() : new V3(p[0], p[1], p[2])));
    const curve = new THREE.CatmullRomCurve3(vecPts);
    const curveLen = Math.max(0.05, curve.getLength());
    const tubularSegs = Math.min(64, Math.max(18, Math.round(curveLen / 0.045)));

    // 1. Swept hardline or conduit core tube
    const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, rTube, 12, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, lineMat);
    group.add(tubeMesh);

    // Optional InstancedMesh corrugation rings along the conduit
    if (isCorr) {
      const ringCount = Math.min(72, Math.max(10, Math.floor(curveLen / Math.max(0.032, rTube * 1.45))));
      const corrRingGeo = new THREE.CylinderGeometry(rTube * 1.28, rTube * 1.28, rTube * 0.58, 12);
      const corrInst = new THREE.InstancedMesh(corrRingGeo, M.titanium, ringCount);
      for (let i = 0; i < ringCount; i++) {
        const u = 0.06 + (0.88 * i) / Math.max(1, ringCount - 1);
        curve.getPointAt(u, pt);
        curve.getTangentAt(u, tan).normalize();
        quat.setFromUnitVectors(UP_Y, tan);
        dummy.position.copy(pt);
        dummy.quaternion.copy(quat);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        corrInst.setMatrixAt(i, dummy.matrix);
      }
      corrInst.instanceMatrix.needsUpdate = true;
      group.add(corrInst);
    }

    // 2. Chunky Two-piece Bronze + Steel Hex AN Flare Fittings (`r = rTube * 1.55`) at both ends (u = 0 and u = 1)
    const hexUnionGeo = new THREE.CylinderGeometry(rTube * 1.68, rTube * 1.68, rTube * 1.85, 6);
    const flareNutGeo = new THREE.CylinderGeometry(rTube * 1.55, rTube * 1.42, rTube * 2.15, 6);
    for (const [uEnd, dirSgn] of [
      [0, 1],
      [1, -1],
    ]) {
      curve.getPointAt(uEnd, pt);
      curve.getTangentAt(uEnd, tan).normalize();
      const fitGroup = new THREE.Group();
      fitGroup.position.copy(pt);
      fitGroup.quaternion.setFromUnitVectors(UP_Y, tan);

      const hexUnion = new THREE.Mesh(hexUnionGeo, M.steel);
      hexUnion.position.y = dirSgn * rTube * 0.55;
      const flareNut = new THREE.Mesh(flareNutGeo, M.bronze);
      flareNut.position.y = dirSgn * rTube * 2.05;
      fitGroup.add(hexUnion, flareNut);
      group.add(fitGroup);
    }

    // 3. Heavy Spaced P-Clamp Collars (`thick = rTube * 0.85`, `M.titanium` band + `M.aluDark` cushion + twin `M.chrome` hex bolts)
    const collarThick = rTube * 0.85;
    const cushionGeo = new THREE.CylinderGeometry(rTube * 1.34, rTube * 1.34, collarThick * 1.32, 14);
    const bandGeo = new THREE.CylinderGeometry(rTube * 1.58, rTube * 1.58, collarThick, 14);
    const tangGeo = new THREE.BoxGeometry(rTube * 2.35, collarThick, collarThick);
    const pBoltGeo = new THREE.CylinderGeometry(rTube * 0.46, rTube * 0.46, collarThick * 1.45, 6).rotateX(Math.PI / 2);

    for (let c = 0; c < nClips; c++) {
      const uClip = (c + 1) / (nClips + 1);
      curve.getPointAt(uClip, pt);
      curve.getTangentAt(uClip, tan).normalize();

      const pClipGroup = new THREE.Group();
      pClipGroup.position.copy(pt);
      pClipGroup.quaternion.setFromUnitVectors(UP_Y, tan);

      const cushion = new THREE.Mesh(cushionGeo, M.aluDark);
      const band = new THREE.Mesh(bandGeo, M.titanium);
      const tang = new THREE.Mesh(tangGeo, M.titanium);
      tang.position.set(rTube * 1.55, 0, 0);

      const boltA = new THREE.Mesh(pBoltGeo, M.chrome);
      boltA.position.set(rTube * 1.45, -collarThick * 0.28, 0);
      const boltB = new THREE.Mesh(pBoltGeo, M.chrome);
      boltB.position.set(rTube * 2.22, collarThick * 0.28, 0);

      pClipGroup.add(cushion, band, tang, boltA, boltB);
      group.add(pClipGroup);
    }
  }

  applyClip(group, clipPlane);
  return { group };
}

// ============================================================================
// 14. NEW HEAVY MID-TIER BUILDER 1: 24-Station CNC Perforated I-Beam Hull Rib-Cage
// ============================================================================
const RIB_CAGE_REF_STATIONS = [
  { x: -8.25, y: 1.76, rY: 0.86, rZ: 1.08 },
  { x: -8.042, y: 1.726, rY: 0.92, rZ: 1.16 },
  { x: -6.536, y: 1.408, rY: 1.34, rZ: 1.57 },
  { x: -5.246, y: 1.188, rY: 1.56, rZ: 1.74 },
  { x: -3.740, y: 0.977, rY: 1.68, rZ: 1.81 },
  { x: -2.450, y: 0.838, rY: 1.70, rZ: 1.82 },
  { x: -0.622, y: 0.727, rY: 1.62, rZ: 1.69 },
  { x: 1.314, y: 0.636, rY: 1.49, rZ: 1.49 },
  { x: 2.927, y: 0.534, rY: 1.36, rZ: 1.28 },
  { x: 4.432, y: 0.427, rY: 1.19, rZ: 1.07 },
  { x: 5.938, y: 0.534, rY: 0.93, rZ: 0.87 },
  { x: 7.379, y: 0.838, rY: 0.75, rZ: 0.66 },
  { x: 8.734, y: 1.427, rY: 0.60, rZ: 0.49 },
  { x: 9.050, y: 1.560, rY: 0.52, rZ: 0.44 },
];

function sampleHullStationAtX(xWorld) {
  const tbl = RIB_CAGE_REF_STATIONS;
  if (xWorld <= tbl[0].x) return { ...tbl[0], x: xWorld };
  if (xWorld >= tbl[tbl.length - 1].x) return { ...tbl[tbl.length - 1], x: xWorld };
  for (let i = 0; i < tbl.length - 1; i++) {
    const a = tbl[i];
    const b = tbl[i + 1];
    if (xWorld >= a.x && xWorld <= b.x) {
      const u = (xWorld - a.x) / Math.max(1e-5, b.x - a.x);
      return {
        x: xWorld,
        y: a.y + (b.y - a.y) * u,
        rY: a.rY + (b.rY - a.rY) * u,
        rZ: a.rZ + (b.rZ - a.rZ) * u,
      };
    }
  }
  return { ...tbl[0], x: xWorld };
}

export function createHullRibCage({ BONES, BONE_WORLD_REST, M, clipPlane } = {}) {
  if (!BONES || !M) {
    return { update() {} };
  }

  const rest = {
    cranial: BONE_WORLD_REST?.cranial || new V3(-4.938, 1.117, 0),
    thoracic: BONE_WORLD_REST?.thoracic || new V3(0, 0, 0),
    spine_0: BONE_WORLD_REST?.spine_0 || new V3(1.95, 0.56, 0),
    lumbar: BONE_WORLD_REST?.lumbar || new V3(4.286, 0.43, 0),
    peduncle: BONE_WORLD_REST?.peduncle || new V3(7.236, 0.83, 0),
  };

  // Shared unit-radius CNC I-beam ring geometries (oriented in YZ plane via rotateY(PI/2))
  const unitOuterFlangeGeo = buildChamferRingGeo(1.00, 0.92, 0.088, 0.008, 36).rotateY(Math.PI / 2);
  const unitWebGeo = buildChamferRingGeo(0.93, 0.82, 0.046, 0.005, 36).rotateY(Math.PI / 2);
  const unitInnerFlangeGeo = buildChamferRingGeo(0.83, 0.76, 0.094, 0.008, 36).rotateY(Math.PI / 2);
  const boreSleeveGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.11, 14).rotateZ(Math.PI / 2);
  const gussetBlockGeo = new THREE.BoxGeometry(0.115, 0.125, 0.135);
  const gussetBoltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.13, 6).rotateZ(Math.PI / 2);

  // 24 Stations distributed across the 4 structural zones:
  //   - BONES.cranial        : 6 ribs (xWorld in [-8.05 .. -4.65]), gated by `cranialVis`
  //   - BONES.thoracic       : 8 ribs (xWorld in [-4.02 .. +1.44]), gated by `gearVis || reactVis`
  //   - BONES.spine_0/lumbar : 5 ribs (2 on spine_0 + 3 on lumbar, xWorld in [2.12 .. 5.64]), gated by `reactVis || tailVis`
  //   - BONES.peduncle       : 5 ribs (xWorld in [6.36 .. 8.84]), gated by `tailVis`
  const zoneConfigs = [
    {
      key: 'cranial',
      bone: BONES.cranial,
      boneRest: rest.cranial,
      xs: [-8.05, -7.37, -6.69, -6.01, -5.33, -4.65],
      trayYFactor: -0.34,
    },
    {
      key: 'thoracic',
      bone: BONES.thoracic,
      boneRest: rest.thoracic,
      xs: [-4.02, -3.24, -2.46, -1.68, -0.90, -0.12, 0.66, 1.44],
      trayYFactor: -0.42,
    },
    {
      key: 'spine_0',
      bone: BONES.spine_0,
      boneRest: rest.spine_0,
      xs: [2.12, 3.00],
      trayYFactor: -0.38,
    },
    {
      key: 'lumbar',
      bone: BONES.lumbar,
      boneRest: rest.lumbar,
      xs: [3.88, 4.76, 5.64],
      trayYFactor: -0.36,
    },
    {
      key: 'peduncle',
      bone: BONES.peduncle,
      boneRest: rest.peduncle,
      xs: [6.36, 6.98, 7.60, 8.22, 8.84],
      trayYFactor: -0.32,
    },
  ];

  const zoneGroups = {};
  const ribStationItems = [];
  let globalStationIdx = 0;

  for (const zc of zoneConfigs) {
    if (!zc.bone) continue;
    const zGroup = new THREE.Group();
    zGroup.name = `hullRibCage__${zc.key}`;
    zGroup.visible = false;
    zc.bone.add(zGroup);
    zoneGroups[zc.key] = zGroup;

    const stList = [];
    for (let i = 0; i < zc.xs.length; i++) {
      const xW = zc.xs[i];
      const st = sampleHullStationAtX(xW);
      const lx = st.x - zc.boneRest.x;
      const ly = st.y - zc.boneRest.y;
      const rY = st.rY * 0.83;
      const rZ = st.rZ * 0.83;
      stList.push({ lx, ly, rY, rZ, st });

      const ribGroup = new THREE.Group();
      ribGroup.position.set(lx, ly, 0);

      // Scaled I-beam elliptical ring (outer flange + recessed web + inner flange)
      const isEven = globalStationIdx % 2 === 0;
      const flangeMat = isEven ? M.titanium : M.alu;
      const webMat = isEven ? M.alu : M.titanium;

      const archCore = new THREE.Group();
      archCore.scale.set(1, rY, rZ);
      const outerFlange = new THREE.Mesh(unitOuterFlangeGeo, flangeMat);
      const webRing = new THREE.Mesh(unitWebGeo, webMat);
      const innerFlange = new THREE.Mesh(unitInnerFlangeGeo, flangeMat);
      archCore.add(outerFlange, webRing, innerFlange);
      ribGroup.add(archCore);

      // 8 Radial Bronze Lightening-Bore Sleeves + 4 Machined Bronze Joint Gusset Blocks with Chrome Bolts
      const rMid = 0.875;
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4 + Math.PI / 8;
        const py = Math.sin(ang) * rY * rMid;
        const pz = Math.cos(ang) * rZ * rMid;
        const bore = new THREE.Mesh(boreSleeveGeo, k % 2 === 0 ? M.bronze : M.steel);
        bore.position.set(0, py, pz);
        ribGroup.add(bore);
      }

      for (const [gy, gz] of [
        [rY * 0.88, 0],
        [-rY * 0.88, 0],
        [0, rZ * 0.88],
        [0, -rZ * 0.88],
      ]) {
        const gusset = new THREE.Mesh(gussetBlockGeo, M.bronze);
        gusset.position.set(0, gy, gz);
        const bolt = new THREE.Mesh(gussetBoltGeo, M.chrome);
        bolt.position.set(0, gy, gz);
        ribGroup.add(gusset, bolt);
      }

      zGroup.add(ribGroup);
      ribStationItems.push({
        group: ribGroup,
        baseX: lx,
        baseY: ly,
        idx: globalStationIdx,
      });
      globalStationIdx++;
    }

    // Longitudinal Box Stringers (6 beams connecting the zone's rib stations) + Equipment Bay Trays
    if (stList.length >= 2) {
      const first = stList[0];
      const last = stList[stList.length - 1];
      const mid = stList[Math.floor(stList.length * 0.5)];
      const spanX = Math.max(0.45, Math.abs(last.lx - first.lx) + 0.16);
      const cx = 0.5 * (first.lx + last.lx);
      const cy = 0.5 * (first.ly + last.ly);
      const pitchY = Math.atan2(last.ly - first.ly, Math.max(0.2, last.lx - first.lx));

      const stringerAngles = [
        Math.PI * 0.22,
        -Math.PI * 0.22,
        Math.PI * 0.78,
        -Math.PI * 0.78,
        0,
        Math.PI,
      ];
      const stringerBeamGeo = new THREE.BoxGeometry(spanX, 0.068, 0.076);
      for (let s = 0; s < stringerAngles.length; s++) {
        const ang = stringerAngles[s];
        const sy = cy + Math.sin(ang) * mid.rY * 0.84;
        const sz = Math.cos(ang) * mid.rZ * 0.84;
        const sBeam = new THREE.Mesh(stringerBeamGeo, s % 2 === 0 ? M.titanium : M.alu);
        sBeam.position.set(cx, sy, sz);
        sBeam.rotation.z = pitchY;
        zGroup.add(sBeam);
      }

      // Slotted CNC Equipment Bay Tray in ventral/mid-deck cavity
      const trayW = mid.rZ * 1.18;
      const trayY = cy + mid.rY * zc.trayYFactor;
      const trayGroup = new THREE.Group();
      trayGroup.position.set(cx, trayY, 0);
      trayGroup.rotation.z = pitchY;

      const sideRailGeo = new THREE.BoxGeometry(spanX * 0.94, 0.064, 0.072);
      for (const zSgn of [-1, 1]) {
        const sRail = new THREE.Mesh(sideRailGeo, M.titanium);
        sRail.position.set(0, 0, zSgn * trayW * 0.5);
        const busStrip = new THREE.Mesh(
          new THREE.BoxGeometry(spanX * 0.90, 0.028, 0.036),
          M.bronze,
        );
        busStrip.position.set(0, 0.042, zSgn * trayW * 0.46);
        trayGroup.add(sRail, busStrip);
      }

      const slatCount = Math.max(3, stList.length * 2);
      const slatGeo = new THREE.BoxGeometry(0.085, 0.042, trayW * 0.96);
      for (let k = 0; k < slatCount; k++) {
        const u = slatCount === 1 ? 0 : k / (slatCount - 1) - 0.5;
        const slat = new THREE.Mesh(slatGeo, k % 2 === 0 ? M.alu : M.steel);
        slat.position.set(u * spanX * 0.86, -0.01, 0);
        trayGroup.add(slat);
      }
      zGroup.add(trayGroup);
    }

    applyClip(zGroup, clipPlane);
  }

  function update(state = {}) {
    const {
      cranialVis = false,
      gearVis = false,
      reactVis = false,
      tailVis = false,
      ex = 0,
    } = state || {};

    if (zoneGroups.cranial) zoneGroups.cranial.visible = !!cranialVis;
    if (zoneGroups.thoracic) zoneGroups.thoracic.visible = !!(gearVis || reactVis);
    if (zoneGroups.spine_0) zoneGroups.spine_0.visible = !!(reactVis || tailVis);
    if (zoneGroups.lumbar) zoneGroups.lumbar.visible = !!(reactVis || tailVis);
    if (zoneGroups.peduncle) zoneGroups.peduncle.visible = !!tailVis;

    const kEx = smooth01(ex);
    for (let i = 0; i < ribStationItems.length; i++) {
      const item = ribStationItems[i];
      const yLift = (item.idx % 2 === 0 ? 0.14 : -0.10) * kEx;
      item.group.position.y = item.baseY + yLift;
    }
  }

  return {
    cranialGroup: zoneGroups.cranial || null,
    thoracicGroup: zoneGroups.thoracic || null,
    spine0Group: zoneGroups.spine_0 || null,
    lumbarGroup: zoneGroups.lumbar || null,
    peduncleGroup: zoneGroups.peduncle || null,
    update,
  };
}

// ============================================================================
// 15. NEW HEAVY MID-TIER BUILDER 2: Mechanical Baleen Hydro-Filter Louver Array
// ============================================================================
export function createBaleenLouverArray({ sideCount = 14, M, clipPlane } = {}) {
  const group = new THREE.Group();
  group.name = 'baleenLouverArray';
  if (!M) return { group, update() {} };

  const nVanes = Math.max(4, sideCount);
  const vaneH = 0.44;
  const vaneChord = 0.24;
  const vaneThick = 0.024;
  const xMin = -3.45;
  const xMax = -1.18;
  const railSpanX = xMax - xMin + 0.28;
  const xCenter = 0.5 * (xMin + xMax);

  // Shared vane geometries (`height = 0.44m, chord = 0.24m, thick = 0.024m`)
  const mainPlateGeo = new THREE.BoxGeometry(vaneThick, vaneH, vaneChord * 0.82);
  const bronzeEdgeGeo = new THREE.BoxGeometry(vaneThick * 1.24, vaneH * 0.96, vaneChord * 0.26);
  const combSlotBarGeo = new THREE.BoxGeometry(vaneThick * 1.32, 0.028, vaneChord * 0.92);
  const trunnionBushGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.044, 14);
  const crankPinGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.056, 12);

  // Shared rail & bus-bar geometries
  const manifoldRailGeo = new THREE.BoxGeometry(railSpanX, 0.056, 0.082);
  const busBarGeo = new THREE.BoxGeometry(railSpanX * 0.96, 0.044, 0.042);
  const servoBarrelGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.36, 18).rotateZ(Math.PI / 2);
  const servoCapGeo = new THREE.CylinderGeometry(0.062, 0.062, 0.065, 18).rotateZ(Math.PI / 2);

  const banks = [];

  for (const zSgn of [1, -1]) {
    const bankGroup = new THREE.Group();
    bankGroup.name = zSgn > 0 ? 'baleenBank_L' : 'baleenBank_R';
    // Positioned in the upper rostrum-to-maxilla bay so it sits 100% inside the beak profile
    // and is prominently exposed when `rostrum_shield` and `maxilla_cowl` hinge open in S2.1!
    bankGroup.position.set(0, 0.68, zSgn * 0.68);
    bankGroup.rotation.z = -0.08;
    bankGroup.rotation.y = -zSgn * 0.14;

    // 1. Twin `M.steel` Manifold Rails (upper & lower headers) + `M.titanium` end blocks
    const upperRail = new THREE.Mesh(manifoldRailGeo, M.steel);
    upperRail.position.set(xCenter, vaneH * 0.5 + 0.028, 0);
    const lowerRail = new THREE.Mesh(manifoldRailGeo, M.steel);
    lowerRail.position.set(xCenter, -vaneH * 0.5 - 0.028, 0);
    bankGroup.add(upperRail, lowerRail);

    // 2. Slotted `M.bronze` Actuator Bus-Bar + Fore Drive Cylinder
    const busBar = new THREE.Mesh(busBarGeo, M.bronze);
    busBar.position.set(xCenter, vaneH * 0.22, -zSgn * 0.068);
    const servoBarrel = new THREE.Mesh(servoBarrelGeo, M.aluDark);
    servoBarrel.position.set(xMin - 0.18, vaneH * 0.22, -zSgn * 0.068);
    const servoCap = new THREE.Mesh(servoCapGeo, M.bronze);
    servoCap.position.set(xMin - 0.02, vaneH * 0.22, -zSgn * 0.068);
    bankGroup.add(busBar, servoBarrel, servoCap);

    // 3. `sideCount` (14) Beveled `M.titanium` & `M.bronze` Louver Filter Plates
    const vanes = [];
    for (let i = 0; i < nVanes; i++) {
      const u = nVanes === 1 ? 0.5 : i / (nVanes - 1);
      const vx = xMin + (xMax - xMin) * u;
      const scaleY = 0.68 + 0.36 * u;

      const vanePivot = new THREE.Group();
      vanePivot.position.set(vx, 0, 0);
      vanePivot.scale.set(1, scaleY, 1);

      const plateMesh = new THREE.Mesh(mainPlateGeo, i % 2 === 0 ? M.titanium : M.alu);
      const bronzeEdge = new THREE.Mesh(bronzeEdgeGeo, M.bronze);
      bronzeEdge.position.z = zSgn * vaneChord * 0.36;

      // 3 horizontal hydro-filter comb ribs across each vane
      for (const yComb of [-vaneH * 0.30, 0, vaneH * 0.30]) {
        const combBar = new THREE.Mesh(combSlotBarGeo, M.bronze);
        combBar.position.y = yComb;
        vanePivot.add(combBar);
      }

      const topBush = new THREE.Mesh(trunnionBushGeo, M.bronze);
      topBush.position.y = vaneH * 0.48;
      const botBush = new THREE.Mesh(trunnionBushGeo, M.bronze);
      botBush.position.y = -vaneH * 0.48;
      const crankPin = new THREE.Mesh(crankPinGeo, M.chrome);
      crankPin.position.set(0, vaneH * 0.22, -zSgn * 0.048);

      vanePivot.add(plateMesh, bronzeEdge, topBush, botBush, crankPin);
      bankGroup.add(vanePivot);
      vanes.push(vanePivot);
    }

    group.add(bankGroup);
    banks.push({ bankGroup, busBar, vanes, zSgn });
  }

  applyClip(group, clipPlane);

  function update(open01 = 0.5, ex = 0) {
    let o = open01;
    let e = ex;
    if (typeof open01 === 'object' && open01 !== null) {
      o = open01.open01 ?? 0.5;
      e = open01.ex ?? 0;
    }
    const uOpen = clamp01(o);
    const kEx = smooth01(e);
    const pitch = 0.18 + 0.45 * uOpen;

    for (let b = 0; b < banks.length; b++) {
      const bank = banks[b];
      const zSgn = bank.zSgn;
      bank.bankGroup.position.z = zSgn * (0.68 + 0.28 * kEx);
      bank.bankGroup.position.y = 0.68 + 0.12 * kEx;
      bank.busBar.position.x = xCenter + (uOpen - 0.5) * 0.14;

      const rotY = zSgn * pitch;
      for (let i = 0; i < bank.vanes.length; i++) {
        bank.vanes[i].rotation.y = rotY;
      }
    }
  }

  update(0.5, 0);
  return { group, banks, update };
}

// ============================================================================
// 16. NEW HEAVY MID-TIER BUILDER 3: CNC Aerofoil Wing Ribs + Hydraulic Valve Island
// ============================================================================
function buildAerofoilRibExtrudeGeo(chord, height, webThick) {
  const halfC = chord * 0.5;
  const halfH = height * 0.5;
  const shape = new THREE.Shape();

  // Cambered hydrofoil profile in XY plane (leading edge at -halfC, trailing edge at +halfC)
  shape.moveTo(-halfC, 0);
  shape.quadraticCurveTo(-halfC * 0.92, halfH * 0.95, -halfC * 0.22, halfH);
  shape.quadraticCurveTo(halfC * 0.38, halfH * 0.88, halfC, 0.04 * halfH);
  shape.lineTo(halfC, -0.04 * halfH);
  shape.quadraticCurveTo(halfC * 0.32, -halfH * 0.68, -halfC * 0.22, -halfH * 0.78);
  shape.quadraticCurveTo(-halfC * 0.92, -halfH * 0.72, -halfC, 0);
  shape.closePath();

  // 2 CNC lightening bores along the chord
  for (const [xFrac, rFrac] of [
    [-0.18, 0.28],
    [0.24, 0.22],
  ]) {
    const holeR = Math.min(chord * 0.14, height * rFrac);
    if (holeR > 0.012) {
      const hp = new THREE.Path();
      hp.absarc(xFrac * chord, 0.04 * height, holeR, 0, Math.PI * 2, true);
      shape.holes.push(hp);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: webThick,
    bevelEnabled: true,
    bevelThickness: Math.min(0.005, webThick * 0.20),
    bevelSize: Math.min(0.005, webThick * 0.20),
    bevelSegments: 1,
    curveSegments: 22,
  });
  geo.translate(0, 0, -webThick * 0.5);
  geo.computeVertexNormals();
  return geo;
}

export function createAerofoilWingRibs({ count = 9, zSgn = 1, M, clipPlane } = {}) {
  const group = new THREE.Group();
  group.name = zSgn > 0 ? 'aerofoilWingRibs_L' : 'aerofoilWingRibs_R';
  if (!M) return { group, update() {} };

  const nRibs = Math.max(5, count);
  const ribsGroup = new THREE.Group();
  ribsGroup.name = 'wingRibArray';
  group.add(ribsGroup);

  // Span from the wing root collar (`[0.55, -0.42, ±0.65]`) all the way across the mid and distal
  // hydrofoil bays (`[3.65, -2.75, ±2.82]`) so the open inter-segment bays in S3.1 are packed with CNC ribs!
  const rootPos = new V3(0.55, -0.42, zSgn * 0.65);
  const tipPos = new V3(3.65, -2.75, zSgn * 2.82);
  const spanVec = tipPos.clone().sub(rootPos);
  const spanLen = spanVec.length();

  // Orient ribs so their thickness axis aligns with the wing span and chord aligns with X/Y
  const ribItems = [];
  const lugClevisGeo = new THREE.BoxGeometry(0.115, 0.082, 0.068);
  const lugPinGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.096, 12);

  for (let i = 0; i < nRibs; i++) {
    const u = nRibs === 1 ? 0 : i / (nRibs - 1);
    const pos = rootPos.clone().lerp(tipPos, u);
    const taper = 1.0 - 0.46 * u;
    const chord = 1.32 * taper;
    const ribH = 0.36 * taper;
    const webThick = Math.max(0.032, 0.048 * taper);

    const rHolder = new THREE.Group();
    rHolder.position.copy(pos);
    rHolder.rotation.set(zSgn * 0.28, -zSgn * 0.42, -0.58);

    const ribGeo = buildAerofoilRibExtrudeGeo(chord, ribH, webThick);
    const ribMesh = new THREE.Mesh(ribGeo, i % 2 === 0 ? M.titanium : M.alu);
    rHolder.add(ribMesh);

    // Top & bottom I-beam flange caps (`M.titanium` / `M.alu`)
    const topCap = new THREE.Mesh(
      new THREE.BoxGeometry(chord * 0.78, 0.028 * taper, webThick * 1.65),
      M.titanium,
    );
    topCap.position.set(-chord * 0.04, ribH * 0.46, 0);
    const botCap = new THREE.Mesh(
      new THREE.BoxGeometry(chord * 0.74, 0.026 * taper, webThick * 1.65),
      M.alu,
    );
    botCap.position.set(-chord * 0.04, -ribH * 0.38, 0);
    rHolder.add(topCap, botCap);

    // 2 Flanged `M.bronze` lightening-bore rings pressed into the rib holes
    for (const [xFrac, rFrac] of [
      [-0.18, 0.28],
      [0.24, 0.22],
    ]) {
      const holeR = Math.min(chord * 0.14, ribH * rFrac);
      const boreRing = new THREE.Mesh(
        buildChamferRingGeo(holeR * 1.28, holeR * 0.90, webThick * 1.42, 0.004, 20),
        M.bronze,
      );
      boreRing.position.set(xFrac * chord, 0.04 * ribH, 0);
      rHolder.add(boreRing);
    }

    // Leading-edge & Trailing-edge `M.steel` hinge lugs with `M.chrome` pins
    for (const xEnd of [-chord * 0.50, chord * 0.50]) {
      const lug = new THREE.Mesh(lugClevisGeo, M.steel);
      lug.position.set(xEnd, 0, 0);
      lug.scale.setScalar(taper);
      const pin = new THREE.Mesh(lugPinGeo, M.chrome);
      pin.position.set(xEnd, 0, 0);
      pin.scale.setScalar(taper);
      rHolder.add(lug, pin);
    }

    ribsGroup.add(rHolder);
    ribItems.push({ holder: rHolder, basePos: pos, u });
  }

  // Twin heavy tubular sub-spars threading through all aerofoil ribs
  const midSpanPos = rootPos.clone().lerp(tipPos, 0.5);
  const sparQuat = new THREE.Quaternion().setFromUnitVectors(UP_Y, spanVec.clone().normalize());
  const subSpars = [];
  for (const [dx, dy, rSpar, mat] of [
    [-0.24, 0.06, 0.048, M.titanium],
    [0.26, -0.05, 0.042, M.steel],
    [0.02, 0.11, 0.036, M.bronze],
  ]) {
    const sparTube = new THREE.Mesh(
      new THREE.CylinderGeometry(rSpar * 0.68, rSpar, spanLen * 1.16, 16),
      mat,
    );
    sparTube.position.set(midSpanPos.x + dx, midSpanPos.y + dy, midSpanPos.z);
    sparTube.quaternion.copy(sparQuat);
    ribsGroup.add(sparTube);
    subSpars.push({ mesh: sparTube, basePos: sparTube.position.clone() });
  }

  // Twin-Cylinder Thoracic Hydraulic Valve Island (`M.titanium` manifold block + 6 `M.bronze` spool valves + `M.chrome` gauges)
  const valveIslandGroup = new THREE.Group();
  valveIslandGroup.name = 'thoracicHydraulicValveIsland';
  const valveBasePos = new V3(0.42, -0.28, zSgn * 0.58);
  valveIslandGroup.position.copy(valveBasePos);

  const manifoldBlock = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.30), M.titanium);
  const subPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.36), M.alu);
  subPlate.position.y = -0.11;
  valveIslandGroup.add(manifoldBlock, subPlate);

  // Twin High-Pressure Hydraulic Cylinders (`M.steel` barrels + `M.bronze` glands + `M.chrome` rods)
  const islandRods = [];
  const cylBarrelGeo = new THREE.CylinderGeometry(0.064, 0.064, 0.36, 18).rotateZ(Math.PI / 2);
  const cylGlandGeo = new THREE.CylinderGeometry(0.074, 0.074, 0.058, 18).rotateZ(Math.PI / 2);
  const cylRodGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.28, 16).rotateZ(Math.PI / 2);
  for (const zOff of [-0.085, 0.085]) {
    const cylBarrel = new THREE.Mesh(cylBarrelGeo, M.steel);
    cylBarrel.position.set(-0.26, 0.02, zOff);
    const cylGland = new THREE.Mesh(cylGlandGeo, M.bronze);
    cylGland.position.set(-0.07, 0.02, zOff);
    const cylRod = new THREE.Mesh(cylRodGeo, M.chrome);
    cylRod.position.set(0.08, 0.02, zOff);
    valveIslandGroup.add(cylBarrel, cylGland, cylRod);
    islandRods.push(cylRod);
  }

  // 6 Directional Spool Valves (`M.bronze` bodies + `M.steel` solenoid caps + `M.chrome` override pins)
  const spoolBodyGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.11, 14);
  const solenoidCapGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.065, 14);
  const overridePinGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.035, 10);
  for (let r = 0; r < 3; r++) {
    const vx = -0.14 + r * 0.14;
    for (const vz of [-0.075, 0.075]) {
      const sBody = new THREE.Mesh(spoolBodyGeo, M.bronze);
      sBody.position.set(vx, 0.145, vz);
      const sCap = new THREE.Mesh(solenoidCapGeo, M.steel);
      sCap.position.set(vx, 0.225, vz);
      const oPin = new THREE.Mesh(overridePinGeo, M.chrome);
      oPin.position.set(vx, 0.27, vz);
      valveIslandGroup.add(sBody, sCap, oPin);
    }
  }

  // 2 Chrome Dial Pressure Gauges (`M.chrome` bezel + `M.bronze` stem + `M.aluDark` face)
  const gaugeBezelGeo = new THREE.CylinderGeometry(0.054, 0.054, 0.034, 18).rotateX(Math.PI / 2);
  const gaugeFaceGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.038, 16).rotateX(Math.PI / 2);
  const gaugeStemGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.055, 6).rotateX(Math.PI / 2);
  for (const gx of [-0.12, 0.12]) {
    const stem = new THREE.Mesh(gaugeStemGeo, M.bronze);
    stem.position.set(gx, 0.03, zSgn * 0.175);
    const bezel = new THREE.Mesh(gaugeBezelGeo, M.chrome);
    bezel.position.set(gx, 0.03, zSgn * 0.21);
    const face = new THREE.Mesh(gaugeFaceGeo, M.aluDark);
    face.position.set(gx, 0.03, zSgn * 0.212);
    valveIslandGroup.add(stem, bezel, face);
  }

  group.add(valveIslandGroup);
  applyClip(group, clipPlane);

  function update(flap = 0, ex = 0) {
    let f = flap;
    let e = ex;
    if (typeof flap === 'object' && flap !== null) {
      f = flap.flap ?? 0;
      e = flap.ex ?? 0;
    }
    const kEx = smooth01(e);

    // Fan the 9 aerofoil ribs out along the exploded wing trajectory so they fill the open inter-segment bays!
    for (let i = 0; i < ribItems.length; i++) {
      const item = ribItems[i];
      const u = item.u;
      item.holder.position.set(
        item.basePos.x + (0.35 + 1.55 * u) * kEx,
        item.basePos.y - (0.25 + 1.15 * u) * kEx,
        item.basePos.z + zSgn * (0.42 + 1.35 * u) * kEx,
      );
    }

    for (let s = 0; s < subSpars.length; s++) {
      const sp = subSpars[s];
      sp.mesh.position.set(
        sp.basePos.x + 0.95 * kEx,
        sp.basePos.y - 0.70 * kEx,
        sp.basePos.z + zSgn * 0.88 * kEx,
      );
    }

    valveIslandGroup.position.set(
      valveBasePos.x + 0.18 * kEx,
      valveBasePos.y - 0.12 * kEx,
      valveBasePos.z + zSgn * 0.34 * kEx,
    );
    const rodStroke = Math.sin(f * 3.0) * 0.045;
    if (islandRods[0]) islandRods[0].position.x = 0.08 + rodStroke;
    if (islandRods[1]) islandRods[1].position.x = 0.08 - rodStroke;
  }

  return { group, ribsGroup, valveIslandGroup, update };
}

// ============================================================================
// 17. NEW HEAVY MID-TIER BUILDER 4: Ribbed Armor Casing, Busbars & HV Capacitor Banks
// ============================================================================
export function createRibbedArmorCasing({ M, clipPlane } = {}) {
  const shroudArmorGroup = new THREE.Group();
  shroudArmorGroup.name = 'mhdShroudExternalRibArmor';
  const reactorBusGroup = new THREE.Group();
  reactorBusGroup.name = 'mhdReactorBusAndCapacitors';

  if (!M) {
    return { shroudArmorGroup, reactorBusGroup, update() {} };
  }

  // ------------------------------------------------------------------
  // a) 6 Heavy Machined `M.titanium` & `M.alu` External Circumferential Arch Ribs (`r = 0.85m, x in [-1.15 .. +1.15]`)
  //    + 2 Longitudinal Dorsal Box-Beams on `reactorShrouds[0].mesh`
  // ------------------------------------------------------------------
  const archSpan = Math.PI * 1.16;
  const extRibOuterGeo = buildChamferRingGeo(0.895, 0.835, 0.078, 0.008, 32, archSpan);
  extRibOuterGeo.rotateZ(-Math.PI * 0.18);
  extRibOuterGeo.rotateY(Math.PI * 0.5);

  const extRibWebGeo = buildChamferRingGeo(0.845, 0.812, 0.044, 0.005, 32, archSpan * 0.96);
  extRibWebGeo.rotateZ(-Math.PI * 0.18);
  extRibWebGeo.rotateY(Math.PI * 0.5);

  const archBossGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.095, 12).rotateZ(Math.PI * 0.5);
  const archBoltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.11, 6).rotateZ(Math.PI * 0.5);

  const xStations = [-1.15, -0.69, -0.23, 0.23, 0.69, 1.15];
  for (let i = 0; i < xStations.length; i++) {
    const rx = xStations[i];
    const isEven = i % 2 === 0;
    const ribOuter = new THREE.Mesh(extRibOuterGeo, isEven ? M.titanium : M.alu);
    ribOuter.position.x = rx;
    const ribWeb = new THREE.Mesh(extRibWebGeo, isEven ? M.alu : M.titanium);
    ribWeb.position.x = rx;
    shroudArmorGroup.add(ribOuter, ribWeb);

    // Bronze lug bosses + chrome hex bolts along each external rib arch
    for (const [by, bz] of [
      [0.85, 0.0],
      [0.64, 0.56],
      [0.64, -0.56],
      [0.0, 0.85],
    ]) {
      const boss = new THREE.Mesh(archBossGeo, M.bronze);
      boss.position.set(rx, by, bz);
      const bolt = new THREE.Mesh(archBoltGeo, M.chrome);
      bolt.position.set(rx, by, bz);
      shroudArmorGroup.add(boss, bolt);
    }
  }

  // 2 Heavy Longitudinal Dorsal Box-Beams + Lateral Window Stringers tying the 6 arch ribs together
  const dorsalBeamGeo = new THREE.BoxGeometry(2.52, 0.072, 0.096);
  const dorsalBeams = [];
  for (const [by, bz, mat] of [
    [0.84, 0.28, M.titanium],
    [0.84, -0.28, M.titanium],
    [0.42, 0.76, M.alu],
    [-0.42, 0.76, M.alu],
  ]) {
    const beam = new THREE.Mesh(dorsalBeamGeo, mat);
    beam.position.set(0, by, bz);
    shroudArmorGroup.add(beam);
    dorsalBeams.push({ mesh: beam, baseY: by, baseZ: bz });
  }

  // ------------------------------------------------------------------
  // b) 4 Thick Solid `M.copper` / `M.bronze` High-Current Busbars (`r = 0.044m`)
  //    with `M.alu` Ceramic Standoffs running along `reactorGroup`
  // ------------------------------------------------------------------
  const busMatPrimary = M.copper || M.bronze;
  const busbarLen = 2.68;
  const busbarGeo = new THREE.CylinderGeometry(0.044, 0.044, busbarLen, 18).rotateZ(Math.PI * 0.5);
  const standoffRingGeo = buildChamferRingGeo(0.078, 0.042, 0.068, 0.006, 18).rotateY(Math.PI * 0.5);
  const standoffFootGeo = new THREE.BoxGeometry(0.074, 0.088, 0.088);
  const terminalClampGeo = new THREE.BoxGeometry(0.096, 0.11, 0.11);

  const busbarConfigs = [
    { y: 0.62, z: 0.56, mat: busMatPrimary },
    { y: 0.62, z: -0.56, mat: busMatPrimary },
    { y: -0.48, z: 0.66, mat: M.bronze },
    { y: -0.48, z: -0.66, mat: M.bronze },
  ];
  const busbarItems = [];

  for (let b = 0; b < busbarConfigs.length; b++) {
    const cfg = busbarConfigs[b];
    const bGroup = new THREE.Group();
    bGroup.position.set(0, cfg.y, cfg.z);

    const barMesh = new THREE.Mesh(busbarGeo, cfg.mat);
    bGroup.add(barMesh);

    // 5 Ribbed `M.alu` insulator standoffs + `M.titanium` saddle clamps along each busbar
    for (const sx of [-1.05, -0.525, 0.0, 0.525, 1.05]) {
      const insulator = new THREE.Mesh(standoffRingGeo, M.alu);
      insulator.position.x = sx;
      const foot = new THREE.Mesh(standoffFootGeo, M.titanium);
      foot.position.set(sx, -Math.sign(cfg.y) * 0.055, -Math.sign(cfg.z) * 0.055);
      bGroup.add(insulator, foot);
    }

    for (const xTerm of [-1.28, 1.28]) {
      const tClamp = new THREE.Mesh(terminalClampGeo, M.steel);
      tClamp.position.x = xTerm;
      bGroup.add(tClamp);
    }

    reactorBusGroup.add(bGroup);
    busbarItems.push({ group: bGroup, baseY: cfg.y, baseZ: cfg.z });
  }

  // ------------------------------------------------------------------
  // c) Port & Starboard High-Voltage Pulse Capacitor Banks
  //    (`M.titanium` rack frame housing 2 x 6 cylindrical `M.steel` & `M.bronze` capacitor cans at `[+-0.68, -0.22, +-0.84]`)
  // ------------------------------------------------------------------
  const capCanGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.36, 20);
  const capCrownGeo = new THREE.CylinderGeometry(0.094, 0.094, 0.048, 20);
  const capTerminalGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.075, 12);
  const capNutGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.032, 6);

  const capBanks = [];
  for (const zSgn of [1, -1]) {
    const bankGroup = new THREE.Group();
    bankGroup.name = zSgn > 0 ? 'hvCapacitorBank_L' : 'hvCapacitorBank_R';
    bankGroup.position.set(0, -0.22, zSgn * 0.84);

    // Machined `M.titanium` structural rack frame spanning x in [-1.02 .. +1.02] (centers on x = +-0.68 sub-bays)
    const rackLen = 2.08;
    const rackRailGeo = new THREE.BoxGeometry(rackLen, 0.052, 0.22);
    const topRack = new THREE.Mesh(rackRailGeo, M.titanium);
    topRack.position.y = 0.14;
    const botRack = new THREE.Mesh(rackRailGeo, M.titanium);
    botRack.position.y = -0.19;
    const busHeader = new THREE.Mesh(
      new THREE.BoxGeometry(rackLen * 0.94, 0.032, 0.068),
      busMatPrimary,
    );
    busHeader.position.set(0, 0.23, 0);
    bankGroup.add(topRack, botRack, busHeader);

    const dividerGeo = new THREE.BoxGeometry(0.044, 0.36, 0.24);
    for (const xDiv of [-1.02, -0.34, 0.34, 1.02]) {
      const divWall = new THREE.Mesh(dividerGeo, M.titanium);
      divWall.position.set(xDiv, -0.02, 0);
      bankGroup.add(divWall);
    }

    // 6 Cylindrical `M.steel` & `M.bronze` pulse capacitor cans per side (clustered around x = -0.68 and x = +0.68)
    const canXs = [-0.88, -0.68, -0.48, 0.48, 0.68, 0.88];
    for (let c = 0; c < canXs.length; c++) {
      const cx = canXs[c];
      const canGroup = new THREE.Group();
      canGroup.position.set(cx, -0.01, 0);

      const canBody = new THREE.Mesh(capCanGeo, c % 2 === 0 ? M.steel : M.aluDark);
      const canCrown = new THREE.Mesh(capCrownGeo, M.bronze);
      canCrown.position.y = 0.18;
      const canBaseRing = new THREE.Mesh(capCrownGeo, M.bronze);
      canBaseRing.position.y = -0.18;
      const termPost = new THREE.Mesh(capTerminalGeo, busMatPrimary);
      termPost.position.y = 0.225;
      const hexNut = new THREE.Mesh(capNutGeo, M.chrome);
      hexNut.position.y = 0.21;

      canGroup.add(canBody, canCrown, canBaseRing, termPost, hexNut);
      bankGroup.add(canGroup);
    }

    reactorBusGroup.add(bankGroup);
    capBanks.push({ group: bankGroup, zSgn });
  }

  applyClip(shroudArmorGroup, clipPlane);
  applyClip(reactorBusGroup, clipPlane);

  function update(kReact = 0, ex = 0) {
    let kr = kReact;
    let e = ex;
    if (typeof kReact === 'object' && kReact !== null) {
      kr = kReact.kReact ?? 0;
      e = kReact.ex ?? 0;
    }
    const kOpen = clamp01(kr);
    const kEx = smooth01(e);

    for (let i = 0; i < dorsalBeams.length; i++) {
      const b = dorsalBeams[i];
      b.mesh.position.y = b.baseY + Math.sign(b.baseY || 1) * 0.08 * kEx;
      b.mesh.position.z = b.baseZ + Math.sign(b.baseZ || 1) * 0.08 * kEx;
    }

    const rScale = 1.0 + 0.16 * kOpen + 0.14 * kEx;
    for (let i = 0; i < busbarItems.length; i++) {
      const item = busbarItems[i];
      item.group.position.y = item.baseY * rScale;
      item.group.position.z = item.baseZ * rScale;
    }

    for (let i = 0; i < capBanks.length; i++) {
      const bank = capBanks[i];
      bank.group.position.y = -0.22 - 0.12 * kOpen - 0.10 * kEx;
      bank.group.position.z = bank.zSgn * (0.84 + 0.34 * kOpen + 0.24 * kEx);
    }
  }

  return { shroudArmorGroup, reactorBusGroup, update };
}
