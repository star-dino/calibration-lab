// V8 Biomechanical Interlocking Linkages for Balaenoptera AQ-12 (`calibration-lab/whale`).
// Integrates `foldingLinkageRig`, `planetaryDriveRig`, `syncIrisRig`, and `cardanGimbalRig` across
// all 4 inspection bays (`S2.1` Cranial, `S3.1` Pectoral, `S4.1` Dorsal MHD, `S4.2` Caudal) + `S5.1` Teardown.
// Enforces 100% closed-state occlusion (`visible = kBay > 0.004`), >=75% bright metal (`steel`/`titanium`/`alu`/`chrome`),
// `M.bronze` (`#B47E44`) warm-metal gearing/pins/springs, and `#5A6068` mid-grey gearbox cavity liner (`open = 0.000`).

import {
  THREE,
  foldingLinkageRig,
  planetaryDriveRig,
  syncIrisRig,
  cardanGimbalRig,
  poseActuator,
  poseCompressedSpring,
  helixGeometry,
  governMaterialRole,
} from '/styles/calibration-lab/kernel.js';
import { decoratePanelUndersides, createHullRibCage } from './whale-tier-factory.js';
import { buildForeBays } from './whale-bays-fore.js';
import { buildAftBays } from './whale-bays-aft.js';

const V3 = THREE.Vector3;
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

export function applyClip(obj, clipPlane) {
  if (!obj) return obj;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (clipPlane && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        mat.clipShadows = true;
      }
    }
  });
  return obj;
}

function makeHullSocket(entry, worldRest) {
  const s = new THREE.Object3D();
  s.position.set(
    worldRest[0] - entry.worldPivot.x,
    worldRest[1] - entry.worldPivot.y,
    worldRest[2] - entry.worldPivot.z,
  );
  entry.obj.add(s);
  return s;
}

function makeLocalSocket(parent, localCoords) {
  const s = new THREE.Object3D();
  s.position.set(localCoords[0], localCoords[1], localCoords[2]);
  parent.add(s);
  return s;
}

// Indexed open-top thick U-cradle geometry in XY plane spanning Z in [-lenZ/2, +lenZ/2]
// Top opening spans angle [aGapEnd .. aGapStart] around +Y (theta = PI/2); solid wall spans [aStart .. aEnd].
function openArcCradleGeo(rOuter, rInner, lenZ, aStart = 0.73 * Math.PI, aEnd = 2.27 * Math.PI, segs = 44) {
  const hz = lenZ * 0.5;
  const profile = [
    [rInner, -hz],
    [rOuter, -hz],
    [rOuter, hz],
    [rInner, hz],
  ];
  const verts = [];
  const norms = [];
  const uvs = [];
  const indices = [];

  // Sweep wall faces along arc
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const ang = aStart + (aEnd - aStart) * u;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    for (let j = 0; j < 4; j++) {
      const [r0, z0] = profile[j];
      const [r1, z1] = profile[(j + 1) % 4];
      const dr = r1 - r0;
      const dz = z1 - z0;
      const len = Math.hypot(dr, dz) || 1;
      const nr = dz / len;
      const nz = -dr / len;

      for (const [r, z, vOff] of [
        [r0, z0, j / 4],
        [r1, z1, (j + 1) / 4],
      ]) {
        verts.push(r * ca, r * sa, z);
        norms.push(nr * ca, nr * sa, nz);
        uvs.push(u, vOff);
      }
    }
  }

  const stride = 8;
  for (let i = 0; i < segs; i++) {
    const row0 = i * stride;
    const row1 = (i + 1) * stride;
    for (let j = 0; j < 4; j++) {
      const a = row0 + j * 2;
      const b = row0 + j * 2 + 1;
      const c = row1 + j * 2 + 1;
      const d = row1 + j * 2;
      indices.push(a, d, c, a, c, b);
    }
  }

  // Cap the two longitudinal lip faces at aStart and aEnd so the open trough rim is manifold
  for (const [ang, flip] of [
    [aStart, -1],
    [aEnd, 1],
  ]) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const nx = -sa * flip;
    const ny = ca * flip;
    const base = verts.length / 3;
    for (let j = 0; j < 4; j++) {
      const [r, z] = profile[j];
      verts.push(r * ca, r * sa, z);
      norms.push(nx, ny, 0);
      uvs.push((r - rInner) / Math.max(1e-4, rOuter - rInner), (z + hz) / lenZ);
    }
    if (flip > 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export function buildOpenGearboxCradle({ M, machinedRingGeo, clipPlane }) {
  const gbLinerMat = new THREE.MeshStandardMaterial({
    color: '#5A6068',
    roughness: 0.68,
    metalness: 0.0,
  });
  governMaterialRole(gbLinerMat, 'liner');

  const group = new THREE.Group();
  group.name = 'gbOpenCradle';

  const outerCradle = new THREE.Mesh(
    openArcCradleGeo(0.76, 0.69, 2.74, 0.73 * Math.PI, 2.27 * Math.PI, 44),
    M.titanium,
  );
  const innerLiner = new THREE.Mesh(
    openArcCradleGeo(0.69, 0.62, 2.70, 0.73 * Math.PI, 2.27 * Math.PI, 44),
    gbLinerMat,
  );
  const centerBulkhead = new THREE.Mesh(
    new THREE.CylinderGeometry(0.615, 0.615, 0.09, 32).rotateX(Math.PI / 2),
    gbLinerMat,
  );
  group.add(outerCradle, innerLiner, centerBulkhead);

  for (const zCap of [-1.34, 1.34]) {
    const endWall = new THREE.Mesh(machinedRingGeo(0.75, 0.22, 0.07, 0.012, 36), M.alu);
    endWall.position.z = zCap;
    const endBacker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.04, 32).rotateX(Math.PI / 2),
      gbLinerMat,
    );
    endBacker.position.z = zCap - Math.sign(zCap) * 0.03;
    group.add(endWall, endBacker);
  }

  applyClip(group, clipPlane);
  return { group, gbLinerMat };
}

function createCoilSpringDamper({
  parentGroup,
  sockA,
  sockB,
  restLen,
  cylRadius = 0.034,
  coilRadius = 0.052,
  wireRadius = 0.010,
  turns = 7,
  detachVec = [0, 0, 0],
  M,
  clipPlane,
}) {
  const damperGroup = new THREE.Group();
  const cylGroup = new THREE.Group();
  const rodGroup = new THREE.Group();
  damperGroup.add(cylGroup, rodGroup);
  parentGroup.add(damperGroup);

  const clevisGeo = new THREE.BoxGeometry(cylRadius * 2.1, restLen * 0.075, cylRadius * 2.2);
  const pinGeo = new THREE.CylinderGeometry(cylRadius * 0.48, cylRadius * 0.48, cylRadius * 2.6, 14).rotateZ(Math.PI / 2);
  const perchGeo = new THREE.CylinderGeometry(coilRadius * 1.16, coilRadius * 1.16, 0.020, 24);

  const clevisA = new THREE.Mesh(clevisGeo, M.titanium);
  clevisA.position.y = restLen * 0.032;
  const pinA = new THREE.Mesh(pinGeo, M.bronze);
  const bodyLen = restLen * 0.46;
  const bodyCyl = new THREE.Mesh(new THREE.CylinderGeometry(cylRadius, cylRadius, bodyLen, 20), M.titanium);
  bodyCyl.position.y = restLen * 0.06 + bodyLen * 0.5;
  const upperPerch = new THREE.Mesh(perchGeo, M.alu);
  upperPerch.position.y = restLen * 0.185;

  const springRestLen = restLen * 0.58;
  const springRoot = new THREE.Group();
  springRoot.position.y = restLen * 0.19;
  const springMesh = new THREE.Mesh(
    helixGeometry({ r: coilRadius, wire: wireRadius, turns, len: springRestLen, seg: 136 }),
    M.bronze,
  );
  springRoot.add(springMesh);
  cylGroup.add(clevisA, pinA, bodyCyl, upperPerch, springRoot);

  const clevisB = new THREE.Mesh(clevisGeo, M.titanium);
  clevisB.position.y = restLen * 0.032;
  const pinB = new THREE.Mesh(pinGeo, M.bronze);
  const rodLen = restLen * 0.58;
  const rodCyl = new THREE.Mesh(
    new THREE.CylinderGeometry(cylRadius * 0.56, cylRadius * 0.56, rodLen, 18),
    M.chrome,
  );
  rodCyl.position.y = restLen * 0.04 + rodLen * 0.5;
  const lowerPerch = new THREE.Mesh(perchGeo, M.alu);
  lowerPerch.position.y = restLen * 0.23;
  rodGroup.add(clevisB, pinB, rodCyl, lowerPerch);

  applyClip(damperGroup, clipPlane);

  const pAw = new V3();
  const pBw = new V3();
  const pAl = new V3();
  const pBl = new V3();
  const dir = new V3();
  const detachedB = new V3();

  function update(kDec = 0) {
    sockA.getWorldPosition(pAw);
    sockB.getWorldPosition(pBw);
    parentGroup.worldToLocal(pAl.copy(pAw));
    parentGroup.worldToLocal(pBl.copy(pBw));

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

    const d = poseActuator(cylGroup, rodGroup, pAl, pBl);
    const curSpringLen = Math.max(springRestLen * 0.24, d - restLen * 0.42);
    poseCompressedSpring(springRoot, springRestLen, curSpringLen);
  }

  return { group: damperGroup, update };
}

export function buildWhaleLinkages({
  mechProfile,
  M,
  BONES,
  BONE_WORLD_REST,
  itemByName,
  hullCustomExplode = [],
  hubAssemblies = [],
  eyeHubHooks = [],
  shoulderHubHooks = [],
  sonarPodGroup,
  gearboxGroup,
  reactorGroup,
  reactorShrouds = [],
  reactorEndBells = [],
  reactorCopperRings = [],
  tailJointBellows,
  clipPlane,
}) {
  const useIris = !!(mechProfile?.enabled && mechProfile?.syncIrises);
  const useFolding = !!(mechProfile?.enabled && mechProfile?.foldingLinkages);
  const usePlanetary = !!(mechProfile?.enabled && mechProfile?.planetaryDrives);
  const useCardan = !!(mechProfile?.enabled && mechProfile?.cardanGimbals);

  // ------------------------------------------------------------------ A. CRANIAL (`S2.1` OPTICS OPEN)
  // A1. 10-blade `syncIrisRig` inside `hub_eye_L` & `hub_eye_R` (`irisStage` local units, `1.0 = 0.62 m`)
  const eyeIrisItems = [];
  if (useIris) {
    for (const hook of eyeHubHooks) {
      const rig = syncIrisRig({
        rInner: 0.115,
        rOuter: 0.435,
        rOpen: 0.308,
        bladeCount: 10,
        bladeThick: 0.012,
        housingMat: M.alu,
        ringMat: M.bronze,
        bladeMat: M.steel,
        pinMat: M.chrome,
      });
      applyClip(rig.group, clipPlane);
      hook.irisStage.add(rig.group);
      eyeIrisItems.push({ rig, hook });
    }
  }

  // A2. Supraorbital `browLink_L/R`, rail-coupled `rostrumLink_L/R`, `maxillaLink_L/R` & `jawLink_L/R` (`foldingLinkageRig`)
  const cranialLinks = [];
  let rostrumGuideCollar = null;
  if (useFolding) {
    rostrumGuideCollar = new THREE.Group();
    rostrumGuideCollar.name = 'rostrumGuideCollar';
    rostrumGuideCollar.position.set(-2.412, 0.903, 0);
    const guideBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.09, 1.28),
      M.titanium,
    );
    const guideBushing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.18, 20).rotateZ(Math.PI / 2),
      M.bronze,
    );
    rostrumGuideCollar.add(guideBridge, guideBushing);
    applyClip(rostrumGuideCollar, clipPlane);
    rostrumGuideCollar.visible = false;
    BONES.cranial.add(rostrumGuideCollar);

    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';
      const browTarget =
        itemByName.get(`truss__cranial__brow_hood_${side}_1`) ||
        itemByName.get(`cranial__brow_hood_${side}`);
      if (browTarget) {
        const sockA = makeLocalSocket(BONES.cranial, [-1.598, 1.223, zSgn * 0.480]);
        const sockB = makeHullSocket(browTarget, [-6.120, 2.760, zSgn * 0.740]);
        const browRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.88,
          lengthB: 0.88,
          beamWidth: 0.155,
          thickness: 0.056,
          clevisGap: 0.072,
          pinRadius: 0.046,
          bendDir: [0.80, -0.58, -zSgn * 0.15],
          couplerOffset: 0.115,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(browRig.group, clipPlane);
        browRig.group.visible = false;
        BONES.cranial.add(browRig.group);
        cranialLinks.push({ rig: browRig, order: 0.14 });
      }

      const rostrumTarget =
        itemByName.get(`truss__cranial__rostrum_shield_${side}_1`) ||
        itemByName.get(`cranial__rostrum_shield_${side}`);
      if (rostrumTarget) {
        const sockA = makeLocalSocket(rostrumGuideCollar, [0, 0, zSgn * 0.620]);
        const sockB = makeHullSocket(rostrumTarget, [-8.320, 2.260, zSgn * 0.620]);
        const rostrumRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 1.12,
          lengthB: 1.12,
          beamWidth: 0.155,
          thickness: 0.056,
          clevisGap: 0.072,
          pinRadius: 0.046,
          bendDir: [0.42, -0.32, -zSgn * 0.85],
          couplerOffset: 0.115,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(rostrumRig.group, clipPlane);
        rostrumRig.group.visible = false;
        BONES.cranial.add(rostrumRig.group);
        cranialLinks.push({ rig: rostrumRig, order: 0.12 });
      }

      const maxillaTarget =
        itemByName.get(`truss__cranial__maxilla_cowl_${side}_1`) ||
        itemByName.get(`cranial__maxilla_cowl_${side}`);
      if (maxillaTarget) {
        const sockA = makeLocalSocket(BONES.cranial, [-0.650, 0.580, zSgn * 1.150]);
        const sockB = makeHullSocket(maxillaTarget, [-5.730, 1.950, zSgn * 1.780]);
        const maxillaRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.98,
          lengthB: 0.98,
          beamWidth: 0.155,
          thickness: 0.056,
          clevisGap: 0.072,
          pinRadius: 0.046,
          bendDir: [0.78, -0.48, -zSgn * 0.38],
          couplerOffset: 0.115,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(maxillaRig.group, clipPlane);
        maxillaRig.group.visible = false;
        BONES.cranial.add(maxillaRig.group);
        cranialLinks.push({ rig: maxillaRig, order: 0.15 });
      }

      const throatTarget = itemByName.get(`pectoral__throat_liner_${side}`);
      if (throatTarget) {
        const sockA = makeLocalSocket(BONES.cranial, [-1.950, -0.520, zSgn * 0.580]);
        const sockB = makeHullSocket(throatTarget, [-6.850, 0.020, zSgn * 0.860]);
        const jawRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 1.08,
          lengthB: 1.08,
          beamWidth: 0.155,
          thickness: 0.056,
          clevisGap: 0.072,
          pinRadius: 0.046,
          bendDir: [0.82, 0.46, -zSgn * 0.32],
          couplerOffset: 0.115,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(jawRig.group, clipPlane);
        jawRig.group.visible = false;
        BONES.cranial.add(jawRig.group);
        cranialLinks.push({ rig: jawRig, order: 0.14 });
      }
    }
  }

  // ------------------------------------------------------------------ B. PECTORAL (`S3.1` HYDROFOIL OFF)
  // B1. Dual Coaxial `planetaryDriveRig` Trains inside `gearboxGroup` + Outboard Shoulder Hub Reducers
  const planetaryItems = [];
  const shoulderPlanetaryItems = [];
  let gbCrossShaft = null;
  if (usePlanetary && gearboxGroup) {
    gbCrossShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.082, 1.72, 24).rotateX(Math.PI / 2),
      M.steel,
    );
    applyClip(gbCrossShaft, clipPlane);
    gbCrossShaft.visible = false;
    gearboxGroup.add(gbCrossShaft);

    for (const zSgn of [1, -1]) {
      const holder = new THREE.Group();
      holder.name = zSgn > 0 ? 'planetaryDrive_L' : 'planetaryDrive_R';
      holder.rotation.y = zSgn > 0 ? 0 : Math.PI;
      holder.position.set(0, 0, zSgn * 0.86);
      const rig = planetaryDriveRig({
        sunTeeth: 12,
        planetTeeth: 9,
        planetCount: 3,
        module: 0.025,
        faceWidth: 0.15,
        sunMat: M.steel,
        gearMat: M.bronze,
        carrierMat: M.titanium,
        ringMat: M.alu,
        pinMat: M.chrome,
      });
      applyClip(rig.group, clipPlane);
      holder.add(rig.group);
      holder.visible = false;
      gearboxGroup.add(holder);
      planetaryItems.push({ holder, rig, zSgn });
    }

    for (const hook of shoulderHubHooks) {
      const rig = planetaryDriveRig({
        sunTeeth: 12,
        planetTeeth: 9,
        planetCount: 3,
        module: 0.031,
        faceWidth: 0.14,
        sunMat: M.steel,
        gearMat: M.bronze,
        carrierMat: M.titanium,
        ringMat: M.alu,
        pinMat: M.chrome,
      });
      applyClip(rig.group, clipPlane);
      hook.planetaryStage.add(rig.group);
      hook.planetaryStage.visible = false;
      shoulderPlanetaryItems.push({ hook, rig, zSgn: hook.zSign });
    }
  }

  // B2. Wing-Root 4-Bar Scissor Stabilizer + Coil-Over Bronze Spring Damper + Mid-Wing Spar Scissor
  const wingRootUnits = [];
  if (useFolding) {
    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';
      const fBone = zSgn > 0 ? BONES.flipper_L : BONES.flipper_R;
      const restPos = zSgn > 0 ? BONE_WORLD_REST.flipper_L : BONE_WORLD_REST.flipper_R;

      const carrier = new THREE.Group();
      carrier.name = zSgn > 0 ? 'wingCarrierL' : 'wingCarrierR';
      carrier.position.copy(restPos);

      // Machined titanium spline trunnion bracket collar anchoring `sockA1` and `sockA2`
      const trunnionCollar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.27, 0.14, 28).rotateX(Math.PI / 2),
        M.titanium,
      );
      trunnionCollar.position.z = zSgn * 0.06;
      const trunnionArm = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.10), M.alu);
      trunnionArm.position.set(0.05, -0.27, zSgn * 0.09);
      carrier.add(trunnionCollar, trunnionArm);
      applyClip(carrier, clipPlane);
      carrier.visible = false;
      BONES.thoracic.add(carrier);

      const sockA1 = makeLocalSocket(carrier, [0.380, -0.220, zSgn * 0.080]);
      const sockB1 = makeLocalSocket(fBone, [0.840, -0.540, zSgn * 0.440]);
      const scissorRig = foldingLinkageRig({
        socketA: sockA1,
        socketB: sockB1,
        lengthA: 0.48,
        lengthB: 0.48,
        beamWidth: 0.135,
        thickness: 0.050,
        clevisGap: 0.064,
        pinRadius: 0.040,
        bendDir: [0.75, 0.62, -zSgn * 0.22],
        couplerOffset: 0.105,
        linkMat: M.steel,
        clevisMat: M.titanium,
        pinMat: M.bronze,
      });
      applyClip(scissorRig.group, clipPlane);
      scissorRig.group.visible = false;
      BONES.thoracic.add(scissorRig.group);

      let midScissorRig = null;
      const wingSpar = itemByName.get(`pectoral__flipper_spar_${side}`);
      const wingRootShell = itemByName.get(`pectoral__flipper_root_${side}`);
      if (wingSpar && wingRootShell) {
        const mSockA = makeHullSocket(wingSpar, [-1.620, -0.420, zSgn * 2.280]);
        const mSockB = makeHullSocket(wingRootShell, [-1.880, -0.100, zSgn * 2.520]);
        midScissorRig = foldingLinkageRig({
          socketA: mSockA,
          socketB: mSockB,
          lengthA: 0.58,
          lengthB: 0.58,
          beamWidth: 0.135,
          thickness: 0.050,
          clevisGap: 0.064,
          pinRadius: 0.040,
          bendDir: [0.82, 0.48, -zSgn * 0.30],
          couplerOffset: 0.105,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(midScissorRig.group, clipPlane);
        midScissorRig.group.visible = false;
        fBone.add(midScissorRig.group);
      }

      const sockA2 = makeLocalSocket(carrier, [-0.280, -0.340, zSgn * 0.100]);
      const sockB2 = makeLocalSocket(fBone, [0.120, -0.560, zSgn * 0.520]);
      const damper = createCoilSpringDamper({
        parentGroup: BONES.thoracic,
        sockA: sockA2,
        sockB: sockB2,
        restLen: 0.620,
        cylRadius: 0.058,
        coilRadius: 0.088,
        wireRadius: 0.018,
        turns: 7,
        detachVec: [-0.14, -0.18, zSgn * 0.16],
        M,
        clipPlane,
      });
      damper.group.visible = false;

      wingRootUnits.push({
        zSgn,
        isPort: zSgn > 0,
        restPos,
        carrier,
        scissorRig,
        midScissorRig,
        damper,
      });
    }
  }

  // ------------------------------------------------------------------ C. DORSAL MHD (`S4.1` STATOR OPEN)
  // C1. Fore & Aft `foldingLinkageRig` Shroud Lifters (`r = 0.774 > 0.750` copper stator rings) + Dorsal Carapace Lifters
  const mhdLifters = [];
  let mhdRailGroup = null;
  if (useFolding && reactorGroup && reactorShrouds?.length > 0) {
    const dorsalShroudMesh = reactorShrouds[0].mesh;
    mhdRailGroup = new THREE.Group();
    mhdRailGroup.visible = false;
    reactorGroup.add(mhdRailGroup);

    for (const [xPos, xBend] of [
      [-1.160, 1.0],
      [1.160, -1.0],
    ]) {
      const railBracket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.09), M.titanium);
      railBracket.position.set(xPos, 0.120, 0.755);
      mhdRailGroup.add(railBracket);

      const sockA = makeLocalSocket(reactorGroup, [xPos, 0.120, 0.765]);
      const sockB = makeLocalSocket(dorsalShroudMesh, [xPos, -0.180, 0.795]);
      const lifterRig = foldingLinkageRig({
        socketA: sockA,
        socketB: sockB,
        lengthA: 0.68,
        lengthB: 0.68,
        beamWidth: 0.150,
        thickness: 0.054,
        clevisGap: 0.070,
        pinRadius: 0.044,
        bendDir: [xBend, 0.0, 0.16],
        couplerOffset: 0.110,
        linkMat: M.steel,
        clevisMat: M.titanium,
        pinMat: M.bronze,
      });
      applyClip(lifterRig.group, clipPlane);
      lifterRig.group.visible = false;
      reactorGroup.add(lifterRig.group);
      mhdLifters.push(lifterRig);
    }

    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';
      const ridge01 =
        itemByName.get(`truss__dorsal__ridge_01_${side}_1`) ||
        itemByName.get(`dorsal__ridge_01_${side}`);
      if (ridge01) {
        const sockA = makeLocalSocket(BONES.thoracic, [-1.750, 1.650, zSgn * 0.920]);
        const sockB = makeHullSocket(ridge01, [-1.640, 2.150, zSgn * 1.180]);
        const r1Rig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 1.02,
          lengthB: 1.02,
          beamWidth: 0.150,
          thickness: 0.054,
          clevisGap: 0.070,
          pinRadius: 0.044,
          bendDir: [-0.82, -0.35, zSgn * 0.42],
          couplerOffset: 0.110,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(r1Rig.group, clipPlane);
        r1Rig.group.visible = false;
        BONES.thoracic.add(r1Rig.group);
        mhdLifters.push(r1Rig);
      }

      const ridge02 =
        itemByName.get(`truss__dorsal__ridge_02_${side}_1`) ||
        itemByName.get(`dorsal__ridge_02_${side}`);
      if (ridge02) {
        const sockA = makeLocalSocket(BONES.thoracic, [1.650, 1.480, zSgn * 0.720]);
        const sockB = makeHullSocket(ridge02, [1.720, 1.900, zSgn * 0.920]);
        const r2Rig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.94,
          lengthB: 0.94,
          beamWidth: 0.150,
          thickness: 0.054,
          clevisGap: 0.070,
          pinRadius: 0.044,
          bendDir: [0.82, -0.35, zSgn * 0.42],
          couplerOffset: 0.110,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(r2Rig.group, clipPlane);
        r2Rig.group.visible = false;
        BONES.thoracic.add(r2Rig.group);
        mhdLifters.push(r2Rig);
      }
    }
    applyClip(mhdRailGroup, clipPlane);
  }

  // C2. Fore & Aft 12-Vane `syncIrisRig` Rotary Cooling Louvers nested in counterbored `reactorEndBells`
  const endBellLouvers = [];
  if (useIris && reactorGroup) {
    for (const xEnd of [-1.48, 1.48]) {
      const sgn = Math.sign(xEnd);
      const holder = new THREE.Group();
      holder.name = sgn < 0 ? 'mhdLouverFore' : 'mhdLouverAft';
      holder.rotation.y = sgn * (Math.PI / 2);
      holder.position.set(xEnd + sgn * 0.06, 0, 0);
      const rig = syncIrisRig({
        rInner: 0.180,
        rOuter: 0.750,
        rOpen: 0.440,
        bladeCount: 12,
        bladeThick: 0.020,
        housingMat: M.titanium,
        ringMat: M.bronze,
        bladeMat: M.alu,
        pinMat: M.chrome,
      });
      applyClip(rig.group, clipPlane);
      holder.add(rig.group);
      holder.visible = false;
      reactorGroup.add(holder);
      endBellLouvers.push({ holder, rig, xEnd, sgn });
    }
  }

  // ------------------------------------------------------------------ D. CAUDAL (`S4.2` TAIL FANNED)
  // D1. `cardanPeduncle` ([7.236, 0.830, 0]) + 4 opposing bronze spring-damper struts + `cardanFluke` ([9.240, 1.665, 0])
  let cardanPeduncleItem = null;
  let cardanFlukeItem = null;
  const peduncleDampers = [];
  if (useCardan) {
    const pedHolder = new THREE.Group();
    pedHolder.name = 'cardanPeduncleHolder';
    pedHolder.position.copy(BONE_WORLD_REST.peduncle).sub(BONE_WORLD_REST.lumbar_2);
    pedHolder.rotation.y = Math.PI / 2;
    const pedRig = cardanGimbalRig({
      radius: 0.36,
      yokeWidth: 0.13,
      yokeThick: 0.052,
      pinRadius: 0.046,
      maxAngle: 0.56,
      yokeMat: M.steel,
      crossMat: M.chrome,
      pinMat: M.bronze,
      damperCount: 0,
    });
    applyClip(pedRig.group, clipPlane);
    pedHolder.add(pedRig.group);
    pedHolder.visible = false;
    BONES.lumbar_2.add(pedHolder);
    cardanPeduncleItem = { holder: pedHolder, rig: pedRig };

    // 4 External Opposing Dorsal & Ventral Bronze Spring-Damper Struts (`lumbar_2` <-> `peduncle_2`)
    for (const zSgn of [1, -1]) {
      // Dorsal pitch damper (`d_rest = 1.229 m`)
      const dSockA = makeLocalSocket(BONES.lumbar_2, [0.700, 0.480, zSgn * 0.240]);
      const dSockB = makeLocalSocket(BONES.peduncle_2, [-0.370, 0.140, zSgn * 0.200]);
      const dDamper = createCoilSpringDamper({
        parentGroup: BONES.lumbar_2,
        sockA: dSockA,
        sockB: dSockB,
        restLen: 1.229,
        cylRadius: 0.056,
        coilRadius: 0.086,
        wireRadius: 0.018,
        turns: 8,
        detachVec: [0, 0.22, zSgn * 0.42],
        M,
        clipPlane,
      });
      dDamper.group.visible = false;
      peduncleDampers.push(dDamper);

      // Ventral pitch damper (`d_rest = 1.158 m`)
      const vSockA = makeLocalSocket(BONES.lumbar_2, [0.740, -0.120, zSgn * 0.220]);
      const vSockB = makeLocalSocket(BONES.peduncle_2, [-0.430, -0.360, zSgn * 0.180]);
      const vDamper = createCoilSpringDamper({
        parentGroup: BONES.lumbar_2,
        sockA: vSockA,
        sockB: vSockB,
        restLen: 1.158,
        cylRadius: 0.056,
        coilRadius: 0.086,
        wireRadius: 0.018,
        turns: 8,
        detachVec: [0, -0.22, zSgn * 0.42],
        M,
        clipPlane,
      });
      vDamper.group.visible = false;
      peduncleDampers.push(vDamper);
    }

    const flkHolder = new THREE.Group();
    flkHolder.name = 'cardanFlukeHolder';
    flkHolder.position.set(0.120, 0.045, 0);
    flkHolder.rotation.y = Math.PI / 2;
    const flkRig = cardanGimbalRig({
      radius: 0.165,
      yokeWidth: 0.068,
      yokeThick: 0.028,
      pinRadius: 0.024,
      maxAngle: 0.64,
      yokeMat: M.steel,
      crossMat: M.chrome,
      pinMat: M.bronze,
      damperCount: 2,
      damperRadius: 0.017,
      springTurns: 6,
      springMat: M.bronze,
    });
    applyClip(flkRig.group, clipPlane);
    flkHolder.add(flkRig.group);
    flkHolder.visible = false;
    BONES.peduncle_3.add(flkHolder);
    cardanFlukeItem = { holder: flkHolder, rig: flkRig };
  }

  // D2. Articulated Fluke Fanning Linkages (`flukeRootLink_L/R`, `flukeMidLink_L/R`, `peduncleTop/BotLink_L/R`)
  const flukeLinks = [];
  if (useFolding) {
    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';
      const fluke01 = itemByName.get(`caudal__fluke_01_${side}`);
      if (fluke01) {
        const sockA = makeLocalSocket(BONES.fluke, [-0.260, 0.010, zSgn * 0.110]);
        const sockB = makeHullSocket(fluke01, [9.780, 1.885, zSgn * 0.520]);
        const rootRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.92,
          lengthB: 0.92,
          beamWidth: 0.140,
          thickness: 0.052,
          clevisGap: 0.066,
          pinRadius: 0.042,
          bendDir: [0.84, 0.28, zSgn * 0.46],
          couplerOffset: 0.105,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(rootRig.group, clipPlane);
        rootRig.group.visible = false;
        BONES.fluke.add(rootRig.group);
        flukeLinks.push(rootRig);
      }

      const flukeSpar = itemByName.get(`caudal__fluke_spar_${side}`);
      const fluke02 = itemByName.get(`caudal__fluke_02_${side}`);
      if (flukeSpar && fluke02) {
        const sockA = makeHullSocket(flukeSpar, [9.960, 2.410, zSgn * 1.580]);
        const sockB = makeHullSocket(fluke02, [10.490, 2.628, zSgn * 2.160]);
        const midRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 1.24,
          lengthB: 1.24,
          beamWidth: 0.140,
          thickness: 0.052,
          clevisGap: 0.066,
          pinRadius: 0.042,
          bendDir: [0.86, 0.22, -zSgn * 0.45],
          couplerOffset: 0.105,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(midRig.group, clipPlane);
        midRig.group.visible = false;
        BONES.fluke.add(midRig.group);
        flukeLinks.push(midRig);
      }

      const pedTop = itemByName.get(`caudal__peduncle_top_01_${side}`);
      if (pedTop) {
        const sockA = makeLocalSocket(BONES.peduncle, [0.550, 0.250, zSgn * 0.280]);
        const sockB = makeHullSocket(pedTop, [7.850, 1.150, zSgn * 0.420]);
        const pTopRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.98,
          lengthB: 0.98,
          beamWidth: 0.140,
          thickness: 0.052,
          clevisGap: 0.066,
          pinRadius: 0.042,
          bendDir: [-0.84, -0.32, zSgn * 0.42],
          couplerOffset: 0.105,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(pTopRig.group, clipPlane);
        pTopRig.group.visible = false;
        BONES.peduncle.add(pTopRig.group);
        flukeLinks.push(pTopRig);
      }

      const pedBot = itemByName.get(`caudal__peduncle_bot_01_${side}`);
      if (pedBot) {
        const sockA = makeLocalSocket(BONES.peduncle, [0.450, -0.250, zSgn * 0.260]);
        const sockB = makeHullSocket(pedBot, [7.680, 0.450, zSgn * 0.380]);
        const pBotRig = foldingLinkageRig({
          socketA: sockA,
          socketB: sockB,
          lengthA: 0.98,
          lengthB: 0.98,
          beamWidth: 0.140,
          thickness: 0.052,
          clevisGap: 0.066,
          pinRadius: 0.042,
          bendDir: [-0.84, 0.32, zSgn * 0.42],
          couplerOffset: 0.105,
          linkMat: M.steel,
          clevisMat: M.titanium,
          pinMat: M.bronze,
        });
        applyClip(pBotRig.group, clipPlane);
        pBotRig.group.visible = false;
        BONES.peduncle.add(pBotRig.group);
        flukeLinks.push(pBotRig);
      }
    }
  }

  // ------------------------------------------------------------------ E. V9 THREE-TIER ILM SUBSYSTEMS & PANEL UNDERSIDES
  const panelUndersides = mechProfile?.enabled
    ? decoratePanelUndersides({ hullCustomExplode, M, clipPlane })
    : null;

  const hullRibCage = mechProfile?.enabled
    ? createHullRibCage({ BONES, BONE_WORLD_REST, M, clipPlane })
    : null;

  const foreBays = mechProfile?.enabled
    ? buildForeBays({
        M,
        BONES,
        BONE_WORLD_REST,
        itemByName,
        eyeHubHooks,
        shoulderHubHooks,
        sonarPodGroup,
        gearboxGroup,
        rostrumGuideCollar,
        cranialLinks,
        wingRootUnits,
        clipPlane,
      })
    : null;

  const aftBays = mechProfile?.enabled
    ? buildAftBays({
        M,
        BONES,
        BONE_WORLD_REST,
        itemByName,
        hubAssemblies,
        reactorGroup,
        reactorShrouds,
        reactorEndBells,
        reactorCopperRings,
        tailJointBellows,
        mhdLifters,
        endBellLouvers,
        cardanPeduncleItem,
        cardanFlukeItem,
        flukeLinks,
        clipPlane,
      })
    : null;

  // ------------------------------------------------------------------ Deterministic Per-Frame Update
  function update({
    time = 0,
    mech,
    ex = 0,
    focus = {},
    motionScale = 1,
    camDist = 16,
    kSonar = 0,
    kGear = 0,
    kWingL = 0,
    kWingR = 0,
    kReact = 0,
    subPed = 0,
    flkRotZ = 0,
  }) {
    if (!mechProfile?.enabled) return;

    // A1. Cranial Eye Irises (recessed behind dark sapphire meniscus; hide micro-pins at hero distance)
    const eyeAp = mech.eyeAperture ?? 0.52;
    const kEyeEx = stagger(ex, 0.24) * 0.40;
    const showEyeDetails = ex > 0.01 || (focus.cranial ?? 0) > 0.01 || camDist < 13.0;
    for (const item of eyeIrisItems) {
      const state = item.rig.update({ aperture: eyeAp, spin: 0, explode: kEyeEx });
      if (item.hook.orangeSeal) {
        item.hook.orangeSeal.rotation.z = state.syncAngle;
      }
      if (item.rig.detailMeshes) {
        for (const dm of item.rig.detailMeshes) dm.visible = showEyeDetails;
      }
    }

    // A2. Cranial Brow, Rostrum, Maxilla & Jaw 4-Bar Linkages (strictly occluded when cranial bay is closed!)
    const kCranialGate = Math.max(ex, focus.cranial ?? 0);
    const cranialVis = kCranialGate > 0.004;
    if (rostrumGuideCollar) {
      rostrumGuideCollar.visible = cranialVis;
      if (cranialVis) {
        rostrumGuideCollar.position.set(-2.412 - 0.48 * kSonar, 0.903, 0);
        rostrumGuideCollar.updateMatrixWorld(true);
      }
    }
    for (const item of cranialLinks) {
      item.rig.group.visible = cranialVis;
      if (cranialVis) {
        const kDec = stagger(ex, item.order);
        item.rig.update({ decouple: kDec, explode: kDec });
      }
    }

    // B1. Pectoral Coaxial Planetary Gear Trains (inboard + outboard shoulder hub reducers)
    const gearVis = kGear > 0.004;
    if (gbCrossShaft) gbCrossShaft.visible = gearVis;
    const flap = mech.flipperFlap ?? mech.flipperPitch ?? 0;
    const sweep = mech.flipperSweep ?? 0;
    if (gearVis) {
      for (const item of planetaryItems) {
        item.holder.visible = true;
        const kSide = item.zSgn > 0 ? kGear : stagger(ex, 0.18);
        item.holder.position.z = item.zSgn * (0.86 + 0.42 * kSide);
        const carrierTheta =
          item.zSgn * (2.2 * sweep + 1.6 * flap) * motionScale + item.zSgn * time * 0.30;
        item.rig.update({
          inputAngle: 3.5 * carrierTheta,
          ringAngle: 0,
          explode: kSide * 0.88,
        });
      }
      for (const item of shoulderPlanetaryItems) {
        const kSide = item.zSgn > 0 ? kGear : stagger(ex, 0.18);
        const sideVis = kSide > 0.004;
        item.hook.planetaryStage.visible = sideVis;
        if (item.hook.innerStator) item.hook.innerStator.visible = !sideVis;
        if (item.hook.cap) item.hook.cap.visible = !sideVis;
        if (sideVis) {
          const carrierTheta =
            item.zSgn * (2.2 * sweep + 1.6 * flap) * motionScale + item.zSgn * time * 0.30;
          item.rig.update({
            inputAngle: 3.5 * carrierTheta,
            ringAngle: 0,
            explode: kSide * 0.42,
          });
        }
      }
    } else {
      for (const item of planetaryItems) item.holder.visible = false;
      for (const item of shoulderPlanetaryItems) {
        item.hook.planetaryStage.visible = false;
        if (item.hook.innerStator) item.hook.innerStator.visible = true;
        if (item.hook.cap) item.hook.cap.visible = true;
      }
    }

    // B2. Wing-Root 4-Bar Scissor + Mid-Wing Scissor + Coil-Over Bronze Spring Damper
    const kWingDec = stagger(ex, 0.20);
    for (const unit of wingRootUnits) {
      const kW = unit.isPort ? kWingL : kWingR;
      const vis = kW > 0.004;
      unit.carrier.visible = vis;
      unit.scissorRig.group.visible = vis;
      unit.damper.group.visible = vis;
      if (unit.midScissorRig) unit.midScissorRig.group.visible = vis;
      if (vis) {
        const follow = kW * (1 - 0.35 * kWingDec);
        unit.carrier.position.set(
          unit.restPos.x - 0.62 * follow,
          unit.restPos.y - 0.92 * follow,
          unit.restPos.z + unit.zSgn * 2.65 * follow,
        );
        unit.carrier.updateMatrixWorld(true);
        unit.scissorRig.update({ decouple: kWingDec, explode: kWingDec });
        if (unit.midScissorRig) unit.midScissorRig.update({ decouple: kWingDec, explode: kWingDec });
        unit.damper.update(kWingDec);
      }
    }

    // C1 & C2. Dorsal MHD Shroud Lifters, Carapace Lifters & 12-Vane Rotary Cooling Louvers (occluded when `kReact <= 0.004`)
    const reactVis = kReact > 0.004;
    if (mhdRailGroup) mhdRailGroup.visible = reactVis;
    const kMhdDec = stagger(ex, 0.20);
    for (const rig of mhdLifters) {
      rig.group.visible = reactVis;
      if (reactVis) rig.update({ decouple: kMhdDec, explode: kMhdDec });
    }
    const louverAp = 0.15 + 0.55 * (mech.louverOpen ?? 0.55);
    const kLouverEx = Math.min(1, stagger(ex, 0.24) * 0.45 + stagger(focus.dorsal ?? 0, 0.20) * 0.20);
    for (const item of endBellLouvers) {
      item.holder.visible = reactVis;
      if (reactVis) {
        item.holder.position.x = item.xEnd + item.sgn * (0.06 + 1.02 * kReact);
        item.rig.update({ aperture: louverAp, spin: 0, explode: kLouverEx });
      }
    }

    // D1 & D2. Caudal Cardan Cross-Yokes, Opposing Spring-Dampers & Fluke Fanning Linkages
    const kTailGate = Math.max(ex, focus.caudal ?? 0);
    const tailVis = kTailGate > 0.004;
    if (useCardan && tailJointBellows?.length >= 3) {
      // Seal peduncle & fluke joints in closed cruise (`S1.1`/`S5.2`); expose bright Cardan spiders in `S4.2`/`S5.1`
      const showDrum = kTailGate <= 0.02;
      if (tailJointBellows[1]?.drum) tailJointBellows[1].drum.visible = showDrum;
      if (tailJointBellows[2]?.drum) tailJointBellows[2].drum.visible = showDrum;
    }

    const kCardanEx = Math.min(1, stagger(ex, 0.22) * 0.72 + stagger(focus.caudal ?? 0, 0.20) * 0.24);
    if (cardanPeduncleItem) {
      cardanPeduncleItem.holder.visible = tailVis;
      if (tailVis) {
        cardanPeduncleItem.rig.update({
          yaw: 0,
          pitch: -subPed,
          inputSpin: 0,
          explode: kCardanEx,
        });
      }
    }
    if (cardanFlukeItem) {
      cardanFlukeItem.holder.visible = tailVis;
      if (tailVis) {
        cardanFlukeItem.rig.update({
          yaw: 0,
          pitch: -flkRotZ,
          inputSpin: 0,
          explode: kCardanEx,
        });
      }
    }

    const kDamperDec = stagger(ex, 0.20);
    for (const dmp of peduncleDampers) {
      dmp.group.visible = tailVis;
      if (tailVis) dmp.update(kDamperDec);
    }

    const kFlukeDec = stagger(ex, 0.16);
    for (const rig of flukeLinks) {
      rig.group.visible = tailVis;
      if (tailVis) rig.update({ decouple: kFlukeDec, explode: kFlukeDec });
    }

    if (panelUndersides) {
      panelUndersides.update();
    }
    if (hullRibCage) {
      hullRibCage.update({ cranialVis, gearVis, reactVis, tailVis, ex });
    }
    if (foreBays) {
      foreBays.update({
        time,
        mech,
        ex,
        focus,
        motionScale,
        kSonar,
        kGear,
        kWingL,
        kWingR,
      });
    }
    if (aftBays) {
      aftBays.update({
        time,
        mech,
        ex,
        focus,
        motionScale,
        kGear,
        kReact,
        subPed,
        flkRotZ,
      });
    }
  }

  return { update };
}
