// V10 Aft-Bays Heavy-Industrial Three-Tier ILM Mechanical Assembly for Balaenoptera AQ-12 (`calibration-lab/whale`).
// Implements Subsystem C (`S4.1` Dorsal MHD Reactor & Cooling Bay) and Subsystem D (`S4.2` Caudal Universal Spine & Fanned Flukes)
// across Tier 1.5 (Ribbed Armor Shroud Casing, Underside Ribs, Latch Hooks & Gusset Brackets), Tier 2 (Heavy Copper Busbars,
// Port/Starboard 12-Can HV Capacitor Banks, 2.2x Heavy Dual Axial Linear Guide Rails + 12 Carriages, Stacked 26-Fin Radiator Banks,
// End-Bell Worm-Gear Louver Servos, Heavy Toothed Bronze/Steel Sector Gear Arches & Peduncle Torque Bridges, 9 Slewing Bearing Rings,
// Fluke Fanning Rack-and-Pinion Drives, and 8 Heavy Pressurized Gas Struts), and Tier 3 (Linkage Bushings/Circlips and Heavy Routed
// Coolant/Hydraulic Plumbing & Inter-Vertebra Bellows Hoses with P-Clips).
// Enforces 100% closed-state occlusion (`reactVis = kReact > 0.004`, `tailVis = kTailGate > 0.004`) and zero per-frame allocations.

import { THREE } from '/styles/calibration-lab/kernel.js';
import {
  applyClip,
  makeHullSocket,
  makeLocalSocket,
  createLatchPinPair,
  createGussetBracket,
  createSlewingBearingRing,
  createLinearGuideRail,
  createRackAndPinionActuator,
  createWormGearActuator,
  createGasStrut,
  createRadiatorFinStack,
  decorateLinkageWithMicroHardware,
  createRoutedPlumbingBay,
  createRibbedArmorCasing,
} from './whale-tier-factory.js';

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

// Chamfered circular sector arch geometry in XY plane centered around +Y (`theta = PI / 2`)
function buildSectorArchGeo(rOuter, rInner, thick, bevel = 0.005, segs = 28, arcSpan = Math.PI * 0.58) {
  const hz = thick * 0.5;
  const b = Math.min(bevel, (rOuter - rInner) * 0.30, hz * 0.50);
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
  const aStart = Math.PI * 0.5 - arcSpan * 0.5;

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
      const bIdx = row0 + j * 2 + 1;
      const c = row1 + j * 2 + 1;
      const d = row1 + j * 2;
      indices.push(a, d, c, a, c, bIdx);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// Heavy Toothed Bronze/Steel Sector Gear Arch (`rOuter = 0.52m, rInner = 0.36m, thick = 0.068m`, 12 teeth + M.titanium side cheek plates)
function createToothedSectorGearArch({
  rOuter = 0.52,
  rInner = 0.36,
  thick = 0.068,
  teethCount = 12,
  arcSpan = Math.PI * 0.58,
  isBronzePrimary = true,
  M,
  clipPlane,
}) {
  const group = new THREE.Group();
  group.name = 'toothedSectorGearArch';

  // Shift arch center downward so the toothed rim and torque bridge sit centered around local origin `(0, 0, 0)`
  const yCenterOffset = -0.34;
  const archPivot = new THREE.Group();
  archPivot.position.set(0, yCenterOffset, 0);
  group.add(archPivot);

  const primaryMat = isBronzePrimary ? M.bronze : M.steel;
  const secondaryMat = isBronzePrimary ? M.steel : M.bronze;

  // 1. Heavy Chamfered Sector Gear Rim (`rOuter = 0.52m, rInner = 0.36m, thick = 0.068m`)
  const sectorRim = new THREE.Mesh(
    buildSectorArchGeo(rOuter, rInner, thick, 0.006, 28, arcSpan),
    primaryMat,
  );
  archPivot.add(sectorRim);

  // 2. 12 Bold Machined Gear Teeth along `rOuter = 0.52m`
  const toothW = 0.036;
  const toothH = 0.044;
  const toothGeo = new THREE.BoxGeometry(toothW, toothH, thick * 0.94);
  const aStart = Math.PI * 0.5 - arcSpan * 0.44;
  const aStep = (arcSpan * 0.88) / Math.max(1, teethCount - 1);
  for (let i = 0; i < teethCount; i++) {
    const ang = aStart + i * aStep;
    const rTooth = rOuter + toothH * 0.40;
    const tooth = new THREE.Mesh(toothGeo, primaryMat);
    tooth.position.set(Math.cos(ang) * rTooth, Math.sin(ang) * rTooth, 0);
    tooth.rotation.z = ang - Math.PI * 0.5;
    archPivot.add(tooth);
  }

  // 3. Twin `M.titanium` Side Cheek Plates + Torque Bridge Struts & Central Trunnion Boss
  const cheekThick = 0.018;
  const cheekArchGeo = buildSectorArchGeo(rOuter * 0.94, rInner * 0.95, cheekThick, 0.003, 24, arcSpan * 0.96);
  const strutGeo = new THREE.BoxGeometry(0.056, rInner * 0.96, cheekThick * 1.15);
  const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, thick + cheekThick * 2.5, 6).rotateX(Math.PI * 0.5);

  const cheekGroupL = new THREE.Group();
  const cheekGroupR = new THREE.Group();
  const zCheekBase = (thick + cheekThick) * 0.5;
  cheekGroupL.position.z = zCheekBase;
  cheekGroupR.position.z = -zCheekBase;

  for (const cGroup of [cheekGroupL, cheekGroupR]) {
    const cheekRim = new THREE.Mesh(cheekArchGeo, M.titanium);
    cGroup.add(cheekRim);

    for (const sgn of [-1, 1]) {
      const angArm = Math.PI * 0.5 + sgn * arcSpan * 0.38;
      const rMid = rInner * 0.52;
      const strut = new THREE.Mesh(strutGeo, M.titanium);
      strut.position.set(Math.cos(angArm) * rMid, Math.sin(angArm) * rMid, 0);
      strut.rotation.z = angArm - Math.PI * 0.5;
      cGroup.add(strut);
    }
  }
  archPivot.add(cheekGroupL, cheekGroupR);

  // 5 Chrome Hex Through-Bolts clamping the cheek plates across the sector arch
  for (let b = 0; b < 5; b++) {
    const angB = Math.PI * 0.5 + ((b / 4) - 0.5) * arcSpan * 0.80;
    const rBolt = 0.5 * (rOuter * 0.92 + rInner * 1.04);
    const bolt = new THREE.Mesh(boltGeo, M.chrome);
    bolt.position.set(Math.cos(angB) * rBolt, Math.sin(angB) * rBolt, 0);
    archPivot.add(bolt);
  }

  // Central Torque-Bridge Trunnion Hub & Pinion Follower Boss
  const trunnionBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.072, thick * 1.56, 20).rotateX(Math.PI * 0.5),
    secondaryMat,
  );
  trunnionBoss.position.set(0, rInner * 0.22, 0);
  const trunnionPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, thick * 1.92, 16).rotateX(Math.PI * 0.5),
    M.chrome,
  );
  trunnionPin.position.copy(trunnionBoss.position);

  const crossBridge = new THREE.Mesh(
    new THREE.BoxGeometry(rInner * 1.32, 0.064, thick * 1.18),
    M.titanium,
  );
  crossBridge.position.set(0, rInner * 0.58, 0);
  archPivot.add(trunnionBoss, trunnionPin, crossBridge);

  applyClip(group, clipPlane);

  function update(pitchAngle = 0, explode = 0) {
    archPivot.rotation.z = pitchAngle;
    const zSep = 0.048 * explode;
    cheekGroupL.position.z = zCheekBase + zSep;
    cheekGroupR.position.z = -zCheekBase - zSep;
  }

  return { group, update };
}

export function buildAftBays({
  M,
  BONES,
  BONE_WORLD_REST,
  itemByName,
  hubAssemblies = [],
  reactorGroup,
  reactorShrouds = [],
  reactorEndBells = [],
  reactorCopperRings = [],
  tailJointBellows = [],
  mhdLifters = [],
  endBellLouvers = [],
  cardanPeduncleItem,
  cardanFlukeItem,
  flukeLinks = [],
  clipPlane,
}) {
  void BONE_WORLD_REST;
  void reactorEndBells;

  // ============================================================================
  // 1. SUBSYSTEM C — DORSAL MHD REACTOR & COOLING BAY (`S4.1`, `reactVis`)
  // ============================================================================
  const mhdLatches = [];
  const mhdGuideRails = [];
  const mhdRadiatorBanks = [];
  const mhdWormDrives = [];
  const mhdGasStruts = [];
  let mhdArmor = null;
  let shroudUndersideGroup = null;
  let thoracicSillGroup = null;
  let mhdPlumbingGroup = null;

  // Pre-allocated 6-carriage slide offset buffer for zero per-frame heap allocation
  const mhdSlideOffsets = [0, 0, 0, 0, 0, 0];

  if (reactorGroup) {
    // ------------------------------------------------------------------
    // C · V10 Heavy Ribbed Armor Shroud, Copper Busbars & HV Capacitor Banks
    // ------------------------------------------------------------------
    const dorsalShroudMesh = reactorShrouds?.[0]?.mesh;
    if (typeof createRibbedArmorCasing === 'function') {
      mhdArmor = createRibbedArmorCasing({ M, clipPlane });
      if (mhdArmor?.shroudArmorGroup && dorsalShroudMesh) {
        mhdArmor.shroudArmorGroup.visible = false;
        dorsalShroudMesh.add(mhdArmor.shroudArmorGroup);
      }
      if (mhdArmor?.reactorBusGroup) {
        mhdArmor.reactorBusGroup.visible = false;
        reactorGroup.add(mhdArmor.reactorBusGroup);
      }
    }

    // ------------------------------------------------------------------
    // C · Tier 1.5: Shroud Underside Ribs, Cam-Lock Latch Hooks & Sill Gussets
    // ------------------------------------------------------------------
    if (dorsalShroudMesh) {
      shroudUndersideGroup = new THREE.Group();
      shroudUndersideGroup.name = 'mhdShroudUndersideTier15';
      shroudUndersideGroup.visible = false;

      // 4 Internal circumferential stiffening ribs (`r = 0.78 m, x in {-0.96, -0.32, +0.32, +0.96}`)
      const ribArcSpan = Math.PI * 0.62;
      const ribOuterGeo = new THREE.TorusGeometry(0.78, 0.019, 10, 28, ribArcSpan);
      ribOuterGeo.rotateZ(Math.PI * 0.5 - ribArcSpan * 0.5);
      ribOuterGeo.rotateY(Math.PI * 0.5);

      const ribWebGeo = new THREE.TorusGeometry(0.755, 0.012, 8, 28, ribArcSpan * 0.94);
      ribWebGeo.rotateZ(Math.PI * 0.5 - ribArcSpan * 0.47);
      ribWebGeo.rotateY(Math.PI * 0.5);

      const bossGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.028, 14).rotateZ(Math.PI * 0.5);

      const ribStations = [-0.96, -0.32, 0.32, 0.96];
      for (let i = 0; i < ribStations.length; i++) {
        const rx = ribStations[i];
        const ribMat = i % 2 === 0 ? M.titanium : M.alu;
        const ribRing = new THREE.Mesh(ribOuterGeo, ribMat);
        ribRing.position.x = rx;
        const ribWeb = new THREE.Mesh(ribWebGeo, i % 2 === 0 ? M.alu : M.titanium);
        ribWeb.position.x = rx;
        shroudUndersideGroup.add(ribRing, ribWeb);

        for (const zSgn of [-1, 1]) {
          const boss = new THREE.Mesh(bossGeo, M.bronze);
          boss.position.set(rx, 0.68, zSgn * 0.36);
          shroudUndersideGroup.add(boss);
        }
      }

      // Longitudinal dorsal crown stringer tying the 4 circumferential ribs together
      const crownStringer = new THREE.Mesh(
        new THREE.BoxGeometry(2.18, 0.024, 0.052),
        M.titanium,
      );
      crownStringer.position.set(0, 0.77, 0);
      shroudUndersideGroup.add(crownStringer);

      // 4 Cam-lock `createLatchPinPair` units at `[+-1.18, 0.48, +-0.62]`
      for (const xLatch of [-1.18, 1.18]) {
        for (const zSgn of [1, -1]) {
          const latch = createLatchPinPair({ scale: 1.05, M, clipPlane });
          latch.group.position.set(xLatch, 0.48, zSgn * 0.62);
          latch.group.rotation.x = zSgn * 0.65;
          shroudUndersideGroup.add(latch.group);
          mhdLatches.push(latch);
        }
      }

      applyClip(shroudUndersideGroup, clipPlane);
      dorsalShroudMesh.add(shroudUndersideGroup);
    }

    // 6 `createGussetBracket` units and 6 `createLatchPinPair` units along `BONES.thoracic` dorsal sill
    // (`x in {-1.65, 0.0, +1.65}, y = 1.52, z = +-0.88`)
    if (BONES?.thoracic) {
      thoracicSillGroup = new THREE.Group();
      thoracicSillGroup.name = 'thoracicDorsalSillTier15';
      thoracicSillGroup.visible = false;

      for (const xSill of [-1.65, 0.0, 1.65]) {
        for (const zSgn of [1, -1]) {
          const gusset = createGussetBracket({
            width: 0.16,
            height: 0.14,
            depth: 0.12,
            M,
            clipPlane,
          });
          gusset.group.position.set(xSill, 1.52, zSgn * 0.88);
          gusset.group.rotation.y = zSgn > 0 ? 0 : Math.PI;
          thoracicSillGroup.add(gusset.group);

          const sillLatch = createLatchPinPair({ scale: 1.1, M, clipPlane });
          sillLatch.group.position.set(xSill + 0.11, 1.56, zSgn * 0.86);
          sillLatch.group.rotation.x = -Math.PI * 0.5;
          sillLatch.group.rotation.z = zSgn > 0 ? 0 : Math.PI;
          thoracicSillGroup.add(sillLatch.group);
          mhdLatches.push(sillLatch);
        }
      }

      applyClip(thoracicSillGroup, clipPlane);
      BONES.thoracic.add(thoracicSillGroup);
    }

    // ------------------------------------------------------------------
    // C · Tier 2: 2.2x Heavy Dual Axial Linear Guide Rails + 12 Ball-Bearing Slider Carriages
    // ------------------------------------------------------------------
    for (const zSgn of [1, -1]) {
      const rail = createLinearGuideRail({
        length: 2.86,
        width: 0.105,
        height: 0.084,
        carriageCount: 6,
        carriageLen: 0.18,
        M,
        clipPlane,
      });
      rail.group.name = zSgn > 0 ? 'mhdStatorGuideRail_L' : 'mhdStatorGuideRail_R';
      rail.group.position.set(0, 0.18, zSgn * 0.78);
      // Rotate around X so carriage tops face radially outward/upward toward the copper stator rings
      rail.group.rotation.x = zSgn * 0.58;
      rail.group.visible = false;
      reactorGroup.add(rail.group);
      mhdGuideRails.push(rail);
    }

    // ------------------------------------------------------------------
    // C · Tier 2: Port & Starboard 2.2x Heavy Stacked Radiator Fin Banks (26 Fins x 2, 3 Heat-Pipes)
    // ------------------------------------------------------------------
    for (const zSgn of [1, -1]) {
      const holder = new THREE.Group();
      holder.name = zSgn > 0 ? 'mhdRadiatorBank_L' : 'mhdRadiatorBank_R';
      holder.position.set(0, 0.22, zSgn * 0.90);
      holder.visible = false;

      const bank = createRadiatorFinStack({
        length: 2.24,
        height: 0.46,
        depth: 0.28,
        finCount: 26,
        pipeCount: 3,
        M,
        clipPlane,
      });
      holder.add(bank.group);
      reactorGroup.add(holder);
      mhdRadiatorBanks.push({ holder, bank, zSgn });
    }

    // ------------------------------------------------------------------
    // C · Tier 2: Fore & Aft 2.2x Heavy Worm-Gear Louver Servo Drives
    // ------------------------------------------------------------------
    const louverSpecs =
      endBellLouvers.length > 0
        ? endBellLouvers.map((item) => ({ xEnd: item.xEnd, sgn: item.sgn }))
        : [
            { xEnd: -1.48, sgn: -1 },
            { xEnd: 1.48, sgn: 1 },
          ];

    for (const { xEnd, sgn } of louverSpecs) {
      const holder = new THREE.Group();
      holder.name = sgn < 0 ? 'mhdLouverWormServo_Fore' : 'mhdLouverWormServo_Aft';
      holder.position.set(xEnd + sgn * 0.06, 0.56, sgn * 0.52);
      holder.rotation.y = sgn > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      holder.visible = false;

      const worm = createWormGearActuator({
        wormLen: 0.44,
        wormRadius: 0.064,
        wheelRadius: 0.135,
        wheelTeeth: 18,
        M,
        clipPlane,
      });
      holder.add(worm.group);
      reactorGroup.add(holder);
      mhdWormDrives.push({ holder, worm, xEnd, sgn });
    }

    // ------------------------------------------------------------------
    // C · Tier 2: 4 Heavy Pressurized Gas Struts (`cylRadius: 0.046`, 9.2cm cylinders)
    // ------------------------------------------------------------------
    if (dorsalShroudMesh) {
      for (const xSgn of [-1, 1]) {
        const xPos = xSgn * 1.02;
        const sockA = makeLocalSocket(reactorGroup, [xPos, 0.12, -0.75]);
        const sockB = makeLocalSocket(dorsalShroudMesh, [xPos, -0.18, -0.79]);
        const strut = createGasStrut({
          parentGroup: reactorGroup,
          sockA,
          sockB,
          restLen: 0.66,
          cylRadius: 0.046,
          detachVec: [xSgn * 0.12, 0.18, -0.18],
          M,
          clipPlane,
        });
        strut.group.visible = false;
        mhdGasStruts.push(strut);
      }
    }

    if (BONES?.thoracic && itemByName) {
      for (const zSgn of [1, -1]) {
        const side = zSgn > 0 ? 'L' : 'R';
        const ridge01 =
          itemByName.get(`truss__dorsal__ridge_01_${side}_1`) ||
          itemByName.get(`dorsal__ridge_01_${side}`);
        if (ridge01) {
          const sockA = makeLocalSocket(BONES.thoracic, [-1.52, 1.62, zSgn * 0.86]);
          const sockB = makeHullSocket(ridge01, [-1.44, 2.12, zSgn * 1.10]);
          const strut = createGasStrut({
            parentGroup: BONES.thoracic,
            sockA,
            sockB,
            restLen: 0.96,
            cylRadius: 0.046,
            detachVec: [-0.14, 0.22, zSgn * 0.20],
            M,
            clipPlane,
          });
          strut.group.visible = false;
          mhdGasStruts.push(strut);
        }
      }
    }

    // ------------------------------------------------------------------
    // C · Tier 3: Micro-Fasteners on 6 `mhdLifters` & Heavy Routed Coolant Plumbing
    // ------------------------------------------------------------------
    for (let i = 0; i < mhdLifters.length; i++) {
      const isShroudLifter = i < 2;
      decorateLinkageWithMicroHardware(mhdLifters[i], {
        pinRadius: 0.020,
        lengthA: isShroudLifter ? 0.68 : i < 4 ? 1.02 : 0.94,
        lengthB: isShroudLifter ? 0.68 : i < 4 ? 1.02 : 0.94,
        thickness: 0.025,
        clevisGap: 0.032,
        M,
        clipPlane,
      });
    }

    const mhdPlumbingRoutes = [];
    for (const zSgn of [1, -1]) {
      // 2 Heavy Bronze coolant mains (`tubeRadius: 0.042, corrugated: false, clipCount: 5, tubeMat: M.bronze`)
      mhdPlumbingRoutes.push({
        points: [
          [-1.35, -0.22, zSgn * 0.72],
          [-0.68, -0.26, zSgn * 0.76],
          [0.0, -0.28, zSgn * 0.74],
          [0.68, -0.26, zSgn * 0.76],
          [1.35, -0.22, zSgn * 0.72],
        ],
        tubeRadius: 0.042,
        corrugated: false,
        clipCount: 5,
        tubeMat: M.bronze,
      });
      // 2 Heavy Armored HV corrugated conduits (`tubeRadius: 0.054, corrugated: true, clipCount: 4`)
      mhdPlumbingRoutes.push({
        points: [
          [-1.30, -0.36, zSgn * 0.62],
          [-0.45, -0.40, zSgn * 0.66],
          [0.45, -0.40, zSgn * 0.66],
          [1.30, -0.36, zSgn * 0.62],
        ],
        tubeRadius: 0.054,
        corrugated: true,
        clipCount: 4,
      });
    }
    const mhdPlumbing = createRoutedPlumbingBay({
      routes: mhdPlumbingRoutes,
      M,
      clipPlane,
    });
    mhdPlumbingGroup = mhdPlumbing.group;
    mhdPlumbingGroup.name = 'mhdReactorPlumbingBay';
    mhdPlumbingGroup.visible = false;
    reactorGroup.add(mhdPlumbingGroup);
  }

  // ============================================================================
  // 2. SUBSYSTEM D — CAUDAL UNIVERSAL SPINE & FANNED FLUKES (`S4.2`, `tailVis`)
  // ============================================================================
  const caudalLatches = [];
  const caudalSectorGears = [];
  const lateralHubSlewingItems = [];
  const spineSlewingItems = [];
  const flukeFanDrives = [];
  const caudalGasStruts = [];
  let peduncleTier15Group = null;
  let flukeTier15Group = null;
  let pedunclePlumbingGroup = null;
  let flukePlumbingGroup = null;

  // Pre-allocated 2-carriage slide offset buffer for fluke linear rails
  const flukeCarriageOffsets = [0, 0];

  // ------------------------------------------------------------------
  // D · V10 Heavy Toothed Sector Gears & Peduncle Torque Bridges
  // ------------------------------------------------------------------
  // Mount 2 heavy Toothed Bronze/Steel Sector Gear Arches (`rOuter = 0.52m, rInner = 0.36m, thick = 0.068m`
  // with 12 bold machined gear teeth + `M.titanium` side cheek plates) on `BONES.peduncle` (`[0.42, +-0.26, 0]`)
  // and `BONES.fluke` (`[-0.08, +-0.16, 0]`), rotating with `subPed` and `flkRotZ`.
  if (BONES?.peduncle) {
    for (const ySgn of [1, -1]) {
      const arch = createToothedSectorGearArch({
        rOuter: 0.52,
        rInner: 0.36,
        thick: 0.068,
        teethCount: 12,
        isBronzePrimary: ySgn > 0,
        M,
        clipPlane,
      });
      arch.group.name = ySgn > 0 ? 'peduncleSectorGear_Top' : 'peduncleSectorGear_Bot';
      arch.group.position.set(0.42, ySgn * 0.26, 0);
      if (ySgn < 0) arch.group.rotation.x = Math.PI;
      arch.group.visible = false;
      BONES.peduncle.add(arch.group);
      caudalSectorGears.push({ arch, isFluke: false, ySgn, baseY: ySgn * 0.26 });
    }
  }

  if (BONES?.fluke) {
    for (const ySgn of [1, -1]) {
      const arch = createToothedSectorGearArch({
        rOuter: 0.52,
        rInner: 0.36,
        thick: 0.068,
        teethCount: 12,
        isBronzePrimary: ySgn < 0,
        M,
        clipPlane,
      });
      arch.group.name = ySgn > 0 ? 'flukeSectorGear_Top' : 'flukeSectorGear_Bot';
      arch.group.position.set(-0.08, ySgn * 0.16, 0);
      if (ySgn < 0) arch.group.rotation.x = Math.PI;
      arch.group.visible = false;
      BONES.fluke.add(arch.group);
      caudalSectorGears.push({ arch, isFluke: true, ySgn, baseY: ySgn * 0.16 });
    }
  }

  // ------------------------------------------------------------------
  // D · Tier 1.5: Peduncle & Fluke Latch Pins & Gusset Brackets
  // ------------------------------------------------------------------
  if (BONES?.peduncle) {
    peduncleTier15Group = new THREE.Group();
    peduncleTier15Group.name = 'peduncleTier15Hardware';
    peduncleTier15Group.visible = false;

    // 4 Latch pin pairs + 2 Gusset brackets on `BONES.peduncle` (`[0.35, +-0.32, +-0.22]`)
    for (const ySgn of [1, -1]) {
      for (const zSgn of [1, -1]) {
        const latch = createLatchPinPair({ scale: 0.95, M, clipPlane });
        latch.group.position.set(0.35, ySgn * 0.32, zSgn * 0.22);
        latch.group.rotation.x = ySgn > 0 ? -Math.PI * 0.35 : Math.PI * 0.35;
        peduncleTier15Group.add(latch.group);
        caudalLatches.push(latch);
      }
    }
    for (const zSgn of [1, -1]) {
      const gusset = createGussetBracket({
        width: 0.14,
        height: 0.12,
        depth: 0.10,
        M,
        clipPlane,
      });
      gusset.group.position.set(0.35, 0.28, zSgn * 0.22);
      gusset.group.rotation.y = zSgn > 0 ? 0 : Math.PI;
      peduncleTier15Group.add(gusset.group);
    }

    applyClip(peduncleTier15Group, clipPlane);
    BONES.peduncle.add(peduncleTier15Group);
  }

  if (BONES?.fluke) {
    flukeTier15Group = new THREE.Group();
    flukeTier15Group.name = 'flukeTier15Hardware';
    flukeTier15Group.visible = false;

    // 2 Latch pin pairs + 2 Gusset brackets on `BONES.fluke` (`[0.18, 0.12, +-0.35]`)
    for (const zSgn of [1, -1]) {
      const latch = createLatchPinPair({ scale: 0.95, M, clipPlane });
      latch.group.position.set(0.18, 0.12, zSgn * 0.35);
      latch.group.rotation.y = zSgn > 0 ? 0 : Math.PI;
      flukeTier15Group.add(latch.group);
      caudalLatches.push(latch);

      const gusset = createGussetBracket({
        width: 0.14,
        height: 0.12,
        depth: 0.10,
        M,
        clipPlane,
      });
      gusset.group.position.set(0.18, 0.08, zSgn * 0.35);
      gusset.group.rotation.y = zSgn > 0 ? 0 : Math.PI;
      flukeTier15Group.add(gusset.group);

      // 1. Central Tail-Fin CNC Exoskeleton Lattice (`5` swept `M.titanium`/`M.alu` I-beam ribs + `M.bronze` bore sleeves)
      //    Clothing the exposed central fin blade (`x in [0.35 .. 1.35], y in [0.38 .. 1.78], z = +-0.22..0.38`) in S4.2
      const finRibGeo = new THREE.BoxGeometry(0.54, 0.056, 0.044);
      const finWebGeo = new THREE.BoxGeometry(0.48, 0.12, 0.024);
      const finBoreGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.052, 16);
      const finBoltGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.062, 6);
      for (let r = 0; r < 5; r++) {
        const u = r / 4;
        const rGroup = new THREE.Group();
        rGroup.position.set(0.42 + 0.82 * u, 0.42 + 1.28 * u, zSgn * (0.22 + 0.14 * u));
        rGroup.rotation.z = 0.52;
        rGroup.rotation.y = -zSgn * 0.18;
        const capTop = new THREE.Mesh(finRibGeo, r % 2 === 0 ? M.titanium : M.alu);
        capTop.position.y = 0.048;
        const capBot = new THREE.Mesh(finRibGeo, M.alu);
        capBot.position.y = -0.048;
        const web = new THREE.Mesh(finWebGeo, M.titanium);
        const bore1 = new THREE.Mesh(finBoreGeo, M.bronze);
        bore1.rotation.x = Math.PI / 2;
        bore1.position.x = -0.12;
        const bore2 = new THREE.Mesh(finBoreGeo, M.bronze);
        bore2.rotation.x = Math.PI / 2;
        bore2.position.x = 0.12;
        const boltL = new THREE.Mesh(finBoltGeo, M.chrome);
        boltL.rotation.x = Math.PI / 2;
        boltL.position.x = -0.22;
        const boltR = new THREE.Mesh(finBoltGeo, M.chrome);
        boltR.rotation.x = Math.PI / 2;
        boltR.position.x = 0.22;
        rGroup.add(capTop, capBot, web, bore1, bore2, boltL, boltR);
        flukeTier15Group.add(rGroup);
      }

      // 2. Spanwise Fluke Aerofoil Rib-Cage (`6` CNC `M.titanium`/`M.alu` chord ribs + `M.bronze` bore rings + twin `M.steel`/`M.bronze` sub-spars)
      //    Filling the fanned gaps between `caudal__fluke_01_L/R`, `02_L/R`, and `03_L/R` (`z in [0.95 .. 3.35]`)
      const flkChordGeo = new THREE.BoxGeometry(0.76, 0.18, 0.042);
      const flkFlangeGeo = new THREE.BoxGeometry(0.80, 0.032, 0.068);
      const flkBoreGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.056, 16);
      for (let s = 0; s < 6; s++) {
        const u = s / 5;
        const taper = 1.0 - 0.38 * u;
        const sGroup = new THREE.Group();
        sGroup.position.set(0.68 + 1.38 * u, 0.42 + 1.24 * u, zSgn * (0.96 + 2.32 * u));
        sGroup.rotation.set(zSgn * 0.24, -zSgn * 0.48, 0.44);
        sGroup.scale.setScalar(taper);
        const web = new THREE.Mesh(flkChordGeo, s % 2 === 0 ? M.titanium : M.alu);
        const topF = new THREE.Mesh(flkFlangeGeo, M.titanium);
        topF.position.y = 0.09;
        const botF = new THREE.Mesh(flkFlangeGeo, M.alu);
        botF.position.y = -0.09;
        const bRing1 = new THREE.Mesh(flkBoreGeo, M.bronze);
        bRing1.rotation.x = Math.PI / 2;
        bRing1.position.x = -0.18;
        const bRing2 = new THREE.Mesh(flkBoreGeo, M.bronze);
        bRing2.rotation.x = Math.PI / 2;
        bRing2.position.x = 0.18;
        sGroup.add(web, topF, botF, bRing1, bRing2);
        flukeTier15Group.add(sGroup);
      }
    }

    applyClip(flukeTier15Group, clipPlane);
    BONES.fluke.add(flukeTier15Group);
  }

  // ------------------------------------------------------------------
  // D · Tier 2: 9 Coaxial Slewing Bearing Rings (6 Lateral Hubs + 3 Axial Spine)
  // ------------------------------------------------------------------
  // 2a. 6 Lateral Hub Slewing Bearings (`hub_mid_L/R`, `hub_aft_L/R`, `hub_fluke_L/R`)
  for (const h of hubAssemblies) {
    if (!h?.name || !h?.group || !Array.isArray(h.ringMeshes)) continue;
    const isMid = h.name.startsWith('hub_mid_');
    const isAft = h.name.startsWith('hub_aft_');
    const isFluke = h.name.startsWith('hub_fluke_');
    if (!isMid && !isAft && !isFluke) continue;

    const sRing = createSlewingBearingRing({
      rOuter: 0.58,
      rInner: 0.44,
      axialThick: 0.07,
      ballCount: 20,
      M,
      clipPlane,
    });
    sRing.group.position.z = 0.06;
    sRing.group.visible = false;
    h.group.add(sRing.group);
    h.ringMeshes.push({
      mesh: sRing.group,
      baseZ: 0.06,
      extractZ: 1.44,
      spin: 0.42,
    });
    lateralHubSlewingItems.push({
      hub: h,
      sRing,
      isMid,
    });
  }

  // 2b. 3 Axial Gimbal Spine Slewing Bearings inside `tailJointBellows[0..2]`
  const spineBearingSpecs = [
    { rOuter: 0.82, rInner: 0.64, axialThick: 0.085, ballCount: 22, spinFactor: 0.8 },
    { rOuter: 0.54, rInner: 0.40, axialThick: 0.068, ballCount: 20, spinFactor: -1.2 },
    { rOuter: 0.35, rInner: 0.25, axialThick: 0.052, ballCount: 18, spinFactor: 1.5 },
  ];
  for (let i = 0; i < Math.min(tailJointBellows.length, spineBearingSpecs.length); i++) {
    const jb = tailJointBellows[i];
    if (!jb?.group) continue;
    const spec = spineBearingSpecs[i];
    const sRing = createSlewingBearingRing({
      rOuter: spec.rOuter,
      rInner: spec.rInner,
      axialThick: spec.axialThick,
      ballCount: spec.ballCount,
      M,
      clipPlane,
    });
    sRing.group.rotation.y = Math.PI * 0.5;
    sRing.group.visible = false;
    jb.group.add(sRing.group);
    spineSlewingItems.push({
      jb,
      sRing,
      idx: i,
      spinFactor: spec.spinFactor,
    });
  }

  // ------------------------------------------------------------------
  // D · Tier 2: 2.2x Heavy Fluke Fanning Rack-and-Pinion + Linear Guide Rail Drives (L/R)
  // ------------------------------------------------------------------
  if (BONES?.fluke) {
    const basisMat = new THREE.Matrix4();
    const xDir = new V3();
    const yDir = new V3();
    const zDir = new V3();
    const upHint = new V3(0, 1, 0);

    for (const zSgn of [1, -1]) {
      const holder = new THREE.Group();
      holder.name = zSgn > 0 ? 'flukeFanDrive_L' : 'flukeFanDrive_R';
      holder.position.set(0.32, 0.18, zSgn * 0.68);

      xDir.set(0.64, 0.32, zSgn * 0.70).normalize();
      zDir.crossVectors(xDir, upHint).normalize();
      yDir.crossVectors(zDir, xDir).normalize();
      basisMat.makeBasis(xDir, yDir, zDir);
      holder.quaternion.setFromRotationMatrix(basisMat);
      holder.visible = false;

      const rail = createLinearGuideRail({
        length: 1.08,
        width: 0.088,
        height: 0.068,
        carriageCount: 2,
        carriageLen: 0.18,
        M,
        clipPlane,
      });
      rail.group.position.set(0, -0.042, 0);

      const rack = createRackAndPinionActuator({
        rackLen: 0.92,
        pitchRadius: 0.092,
        teeth: 14,
        faceWidth: 0.064,
        M,
        clipPlane,
      });
      rack.group.position.set(0, 0.038, 0);

      holder.add(rail.group, rack.group);
      BONES.fluke.add(holder);
      flukeFanDrives.push({ holder, rail, rack, zSgn });
    }
  }

  // ------------------------------------------------------------------
  // D · Tier 2: 4 Heavy Auxiliary Pressurized Gas Struts (`cylRadius: 0.042`, 8.4cm cylinders)
  // ------------------------------------------------------------------
  if (BONES?.peduncle && itemByName) {
    // 2 Peduncle gas struts from `BONES.peduncle` `[0.32, +-0.22, +-0.24]` to `caudal__peduncle_top/bot_01_L/R`
    const pedStrutConfigs = [
      {
        zSgn: 1,
        ySgn: 1,
        targetName: 'caudal__peduncle_top_01_L',
        worldRest: [7.72, 1.05, 0.38],
      },
      {
        zSgn: -1,
        ySgn: -1,
        targetName: 'caudal__peduncle_bot_01_R',
        worldRest: [7.72, 0.52, -0.38],
      },
    ];
    for (const cfg of pedStrutConfigs) {
      const targetEntry = itemByName.get(cfg.targetName);
      if (targetEntry) {
        const sockA = makeLocalSocket(BONES.peduncle, [0.32, cfg.ySgn * 0.22, cfg.zSgn * 0.24]);
        const sockB = makeHullSocket(targetEntry, cfg.worldRest);
        const strut = createGasStrut({
          parentGroup: BONES.peduncle,
          sockA,
          sockB,
          restLen: 0.94,
          cylRadius: 0.042,
          detachVec: [0.12, cfg.ySgn * 0.18, cfg.zSgn * 0.18],
          M,
          clipPlane,
        });
        strut.group.visible = false;
        caudalGasStruts.push(strut);
      }
    }
  }

  if (BONES?.fluke && itemByName) {
    // 2 Fluke-root gas struts from `BONES.fluke` `[-0.18, 0.06, +-0.16]` to `caudal__fluke_01_L/R` (`[9.72, 1.84, +-0.46]`)
    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';
      const fluke01 = itemByName.get(`caudal__fluke_01_${side}`);
      if (fluke01) {
        const sockA = makeLocalSocket(BONES.fluke, [-0.18, 0.06, zSgn * 0.16]);
        const sockB = makeHullSocket(fluke01, [9.72, 1.84, zSgn * 0.46]);
        const strut = createGasStrut({
          parentGroup: BONES.fluke,
          sockA,
          sockB,
          restLen: 0.88,
          cylRadius: 0.042,
          detachVec: [0.16, 0.14, zSgn * 0.22],
          M,
          clipPlane,
        });
        strut.group.visible = false;
        caudalGasStruts.push(strut);
      }
    }
  }

  // ------------------------------------------------------------------
  // D · Tier 3: Micro-Fasteners on 8 `flukeLinks`, Cardan Caps & Heavy Caudal Plumbing
  // ------------------------------------------------------------------
  for (let i = 0; i < flukeLinks.length; i++) {
    const idxInSide = i % 4;
    const len = idxInSide === 0 ? 0.92 : idxInSide === 1 ? 1.24 : 0.98;
    decorateLinkageWithMicroHardware(flukeLinks[i], {
      pinRadius: idxInSide === 0 ? 0.020 : 0.018,
      lengthA: len,
      lengthB: len,
      thickness: idxInSide === 0 ? 0.026 : 0.024,
      clevisGap: idxInSide === 0 ? 0.034 : 0.030,
      M,
      clipPlane,
    });
  }

  // Bearing-cap castle nut & bronze thrust washer collars on `cardanPeduncleItem` and `cardanFlukeItem`
  for (const [cardanItem, rCap] of [
    [cardanPeduncleItem, 0.36],
    [cardanFlukeItem, 0.165],
  ]) {
    if (!cardanItem?.holder) continue;
    const capGroup = new THREE.Group();
    const nutGeo = new THREE.CylinderGeometry(rCap * 0.13, rCap * 0.13, rCap * 0.08, 6);
    const washerGeo = new THREE.CylinderGeometry(rCap * 0.18, rCap * 0.18, rCap * 0.03, 14);
    for (const sgn of [-1, 1]) {
      const washerTop = new THREE.Mesh(washerGeo, M.bronze);
      washerTop.position.set(0, sgn * rCap * 1.03, 0);
      const nutTop = new THREE.Mesh(nutGeo, M.chrome);
      nutTop.position.set(0, sgn * rCap * 1.08, 0);
      capGroup.add(washerTop, nutTop);
    }
    applyClip(capGroup, clipPlane);
    cardanItem.holder.add(capGroup);
  }

  // Heavy routed plumbing bay on `BONES.peduncle` (2 heavy 9.2cm inter-vertebra armored corrugated bellows hoses
  // + 2 heavy bronze hydraulic hardlines with 4 P-clips following the upward-curved spine trajectory)
  if (BONES?.peduncle) {
    const pedRoutes = [];
    for (const zSgn of [1, -1]) {
      pedRoutes.push({
        points: [
          [-0.65, 0.05, zSgn * 0.22],
          [0.00, 0.15, zSgn * 0.23],
          [0.78, 0.38, zSgn * 0.21],
          [1.48, 0.66, zSgn * 0.18],
        ],
        tubeRadius: 0.046,
        corrugated: true,
        clipCount: 4,
      });
      pedRoutes.push({
        points: [
          [-0.65, -0.21, zSgn * 0.21],
          [0.00, -0.11, zSgn * 0.22],
          [0.78, 0.14, zSgn * 0.20],
          [1.48, 0.46, zSgn * 0.17],
        ],
        tubeRadius: 0.038,
        corrugated: false,
        clipCount: 4,
        tubeMat: M.bronze,
      });
    }
    const pedPlumbing = createRoutedPlumbingBay({
      routes: pedRoutes,
      M,
      clipPlane,
    });
    pedunclePlumbingGroup = pedPlumbing.group;
    pedunclePlumbingGroup.name = 'pedunclePlumbingBay';
    pedunclePlumbingGroup.visible = false;
    BONES.peduncle.add(pedunclePlumbingGroup);
  }

  // Heavy routed plumbing bay on `BONES.fluke` (2 steel/bronze hydraulic lines `tubeRadius: 0.036` with 4 P-clips)
  if (BONES?.fluke) {
    const flukeRoutes = [];
    for (const zSgn of [1, -1]) {
      flukeRoutes.push({
        points: [
          [0.10, 0.08, zSgn * 0.25],
          [0.38, 0.24, zSgn * 0.68],
          [0.68, 0.42, zSgn * 1.15],
          [0.92, 0.56, zSgn * 1.56],
          [1.12, 0.68, zSgn * 1.95],
        ],
        tubeRadius: 0.036,
        corrugated: false,
        clipCount: 4,
        tubeMat: zSgn > 0 ? M.bronze : M.steel,
      });
    }
    const flkPlumbing = createRoutedPlumbingBay({
      routes: flukeRoutes,
      M,
      clipPlane,
    });
    flukePlumbingGroup = flkPlumbing.group;
    flukePlumbingGroup.name = 'flukePlumbingBay';
    flukePlumbingGroup.visible = false;
    BONES.fluke.add(flukePlumbingGroup);
  }

  // ============================================================================
  // 3. DETERMINISTIC PER-FRAME UPDATE (Zero Heap Allocations)
  // ============================================================================
  function update({
    time = 0,
    mech = {},
    ex = 0,
    focus = {},
    motionScale = 1,
    kGear = 0,
    kReact = 0,
    subPed = 0,
    flkRotZ = 0,
  }) {
    void motionScale;

    // ------------------------------------------------------------------
    // C. Subsystem C (`S4.1` Dorsal MHD Reactor & Cooling Bay + `S3.1` Window Bay)
    // ------------------------------------------------------------------
    const reactVis = kReact > 0.004;
    const windowBayVis = reactVis || kGear > 0.004;
    if (shroudUndersideGroup) shroudUndersideGroup.visible = reactVis;
    if (thoracicSillGroup) thoracicSillGroup.visible = reactVis;
    if (mhdPlumbingGroup) mhdPlumbingGroup.visible = windowBayVis;

    if (mhdArmor) {
      if (mhdArmor.shroudArmorGroup) mhdArmor.shroudArmorGroup.visible = windowBayVis;
      if (mhdArmor.reactorBusGroup) mhdArmor.reactorBusGroup.visible = windowBayVis;
      if (windowBayVis && mhdArmor.update) {
        mhdArmor.update(kReact, ex);
      }
    }

    if (windowBayVis) {
      // Step Port & Starboard 26-fin radiator banks outward on `kReact` (or stay docked in thoracic window during `S3.1`)
      for (let i = 0; i < mhdRadiatorBanks.length; i++) {
        const item = mhdRadiatorBanks[i];
        item.holder.visible = true;
        item.holder.position.set(
          0,
          0.22 + 0.16 * kReact,
          item.zSgn * (0.90 + 0.46 * kReact),
        );
        item.holder.rotation.x = -item.zSgn * 0.18 * kReact;
        item.bank.update(kReact * 0.45);
      }

      // Fore & Aft Worm-Gear Louver Servo Drives
      const wormAngle = (mech.louverOpen ?? 0.55) * 3.2 + time * 0.4;
      const kWormEx = stagger(ex, 0.24) * 0.5;
      for (let i = 0; i < mhdWormDrives.length; i++) {
        const item = mhdWormDrives[i];
        item.holder.visible = true;
        item.holder.position.set(
          item.xEnd + item.sgn * (0.06 + 1.02 * kReact),
          0.56,
          item.sgn * 0.52,
        );
        item.worm.update(wormAngle * item.sgn, kWormEx);
      }
    } else {
      for (let i = 0; i < mhdRadiatorBanks.length; i++) mhdRadiatorBanks[i].holder.visible = false;
      for (let i = 0; i < mhdWormDrives.length; i++) mhdWormDrives[i].holder.visible = false;
    }

    if (reactVis) {
      const kUnlatch = clamp01(kReact * 2.0);
      for (let i = 0; i < mhdLatches.length; i++) {
        mhdLatches[i].update(kUnlatch);
      }

      // Update 12 ball-bearing slider carriages across the twin linear guide rails to track the 6 copper stator rings
      const nRings = reactorCopperRings.length;
      for (let i = 0; i < 6; i++) {
        const sx = i < nRings ? reactorCopperRings[i].sx : -1.05 + (i / 5) * 2.10;
        mhdSlideOffsets[i] = sx * (1.0 + 0.64 * kReact);
      }
      const kRailEx = stagger(ex, 0.22) * 0.65;
      for (let i = 0; i < mhdGuideRails.length; i++) {
        const rail = mhdGuideRails[i];
        rail.group.visible = true;
        rail.update(mhdSlideOffsets, kRailEx);
      }

      // 4 Pressurized Gas Struts
      const kMhdDec = stagger(ex, 0.20);
      for (let i = 0; i < mhdGasStruts.length; i++) {
        const strut = mhdGasStruts[i];
        strut.group.visible = true;
        strut.update(kMhdDec);
      }
    } else {
      for (let i = 0; i < mhdGuideRails.length; i++) mhdGuideRails[i].group.visible = false;
      for (let i = 0; i < mhdGasStruts.length; i++) mhdGasStruts[i].group.visible = false;
    }

    // ------------------------------------------------------------------
    // D. Subsystem D (`S4.2` Caudal Universal Spine & Fanned Flukes)
    // ------------------------------------------------------------------
    const kTailGate = Math.max(ex, focus.caudal ?? 0);
    const tailVis = kTailGate > 0.004;
    const midHubVis = tailVis || (focus.dorsal ?? 0) > 0.004 || reactVis;

    if (peduncleTier15Group) peduncleTier15Group.visible = tailVis;
    if (flukeTier15Group) flukeTier15Group.visible = tailVis;
    if (pedunclePlumbingGroup) pedunclePlumbingGroup.visible = tailVis;
    if (flukePlumbingGroup) flukePlumbingGroup.visible = tailVis;

    // 6 Lateral Hub Slewing Bearings (`hub_mid_L/R` gated by `midHubVis`, `hub_aft/fluke_L/R` gated by `tailVis`)
    for (let i = 0; i < lateralHubSlewingItems.length; i++) {
      const item = lateralHubSlewingItems[i];
      const vis = item.isMid ? midHubVis : tailVis;
      item.sRing.group.visible = vis;
      if (vis) {
        const kHubEx = item.isMid
          ? Math.max(ex, focus.dorsal ?? 0, focus.caudal ?? 0)
          : kTailGate;
        item.sRing.update(
          (subPed * 2.2 + flkRotZ * 1.4 + time * 0.35) * item.hub.zSign,
          kHubEx * 0.32,
        );
      }
    }

    // 3 Axial Gimbal Spine Slewing Bearings inside `tailJointBellows[0..2]`
    const kTailMod = Math.min(1.0, stagger(ex, 0.20) + stagger(focus.caudal ?? 0, 0.18) * 0.88);
    for (let i = 0; i < spineSlewingItems.length; i++) {
      const item = spineSlewingItems[i];
      const vis = item.idx === 0 ? midHubVis : tailVis;
      item.sRing.group.visible = vis;
      if (vis) {
        item.sRing.group.position.x = 0.26 * kTailMod;
        const spinAng = (item.idx === 2 ? -flkRotZ : -subPed) * item.spinFactor + time * 0.25 * item.spinFactor;
        item.sRing.update(spinAng, kTailMod * 0.45);
      }
    }

    if (tailVis) {
      const kUnlatch = clamp01(kTailGate * 2.0);
      for (let i = 0; i < caudalLatches.length; i++) {
        caudalLatches[i].update(kUnlatch);
      }

      // Heavy Toothed Sector Gears & Peduncle Torque Bridges rotating with `subPed` and `flkRotZ`
      for (let i = 0; i < caudalSectorGears.length; i++) {
        const sg = caudalSectorGears[i];
        sg.arch.group.visible = true;
        sg.arch.group.position.y = sg.baseY + sg.ySgn * 0.14 * kTailMod;
        const pitchRot = (sg.isFluke ? flkRotZ * 1.35 : subPed * 1.65) * sg.ySgn;
        sg.arch.update(pitchRot, kTailMod * 0.55);
      }

      // Fluke Fanning Rack-and-Pinion + Linear Guide Rail Drives (L/R)
      const travel = 0.44 * kTailGate;
      const kFlukeEx = stagger(ex, 0.18) * 0.55;
      flukeCarriageOffsets[0] = -0.18 + travel * 0.65;
      flukeCarriageOffsets[1] = 0.18 + travel;
      for (let i = 0; i < flukeFanDrives.length; i++) {
        const drv = flukeFanDrives[i];
        drv.holder.visible = true;
        drv.rack.update(travel, kFlukeEx);
        drv.rail.update(flukeCarriageOffsets, kFlukeEx);
      }

      // 4 Auxiliary Pressurized Gas Struts
      const kCaudalDec = stagger(ex, 0.18);
      for (let i = 0; i < caudalGasStruts.length; i++) {
        const strut = caudalGasStruts[i];
        strut.group.visible = true;
        strut.update(kCaudalDec);
      }
    } else {
      for (let i = 0; i < caudalSectorGears.length; i++) caudalSectorGears[i].arch.group.visible = false;
      for (let i = 0; i < flukeFanDrives.length; i++) flukeFanDrives[i].holder.visible = false;
      for (let i = 0; i < caudalGasStruts.length; i++) caudalGasStruts[i].group.visible = false;
    }
  }

  return { update };
}
