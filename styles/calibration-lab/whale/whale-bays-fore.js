// V10 Heavy-Industrial Fore Inspection Bays (`S2.1` Cranial Sonar & Hydro-Optics + `S3.1` Pectoral Gearbox & Hydrofoil Wing)
// for Balaenoptera AQ-12 (`calibration-lab/whale`).
// Implements 3-Tier ILM + V10 Heavy-Industrial screen-space upgrades with strict closed-state occlusion (`visible = kBay > 0.004`).

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
  decorateLinkageWithMicroHardware,
  createRoutedPlumbingBay,
  createBaleenLouverArray,
  createAerofoilWingRibs,
} from './whale-tier-factory.js';

const V3 = THREE.Vector3;
const UP_Y = new V3(0, 1, 0);
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

// ----------------------------------------------------------------------------
// A-Heavy 1: Multi-Element Phased-Array Sonar Transducer Armor Sleeve (32 Barrels + 4 Tie-Rods)
// ----------------------------------------------------------------------------
function buildPhasedArrayTransducerSleeve({ M, clipPlane }) {
  const group = new THREE.Group();
  group.name = 'sonarPhasedArraySleeve';
  group.visible = false;

  const foreRingGroup = new THREE.Group();
  const aftRingGroup = new THREE.Group();
  const staveArrayGroup = new THREE.Group();
  const tieRodGroup = new THREE.Group();
  group.add(foreRingGroup, aftRingGroup, staveArrayGroup, tieRodGroup);

  // Shared geometries for the 32 exposed cylindrical transducer crystal barrels (`r = 0.048m, len = 0.14m`)
  const barrelGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.14, 16);
  const resonatorCapGeo = new THREE.CylinderGeometry(0.036, 0.040, 0.034, 16);
  const baseCollarGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.028, 16);
  const dirVec = new V3();

  const makeTransducerBarrel = (x, r, theta, isBronzePrimary) => {
    const unit = new THREE.Group();
    const y = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    unit.position.set(x, y, z);

    // Orient barrel radially outward with slight forward cone normal tilt
    dirVec.set(-0.08, Math.cos(theta), Math.sin(theta)).normalize();
    unit.quaternion.setFromUnitVectors(UP_Y, dirVec);

    const primaryMat = isBronzePrimary ? M.bronze : M.chrome;
    const secondaryMat = isBronzePrimary ? M.chrome : M.bronze;

    const baseCollar = new THREE.Mesh(baseCollarGeo, M.titanium);
    baseCollar.position.y = -0.052;

    const crystalBarrel = new THREE.Mesh(barrelGeo, primaryMat);
    crystalBarrel.position.y = 0;

    const acousticCap = new THREE.Mesh(resonatorCapGeo, secondaryMat);
    acousticCap.position.y = 0.078;

    unit.add(baseCollar, crystalBarrel, acousticCap);
    return unit;
  };

  // 1. Two Circumferential Rings (8 barrels on fore ring at x = -0.52, r = 0.48m; 8 barrels on aft ring at x = 0.46, r = 0.57m -> 16 barrels)
  const foreCarrierRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.455, 0.465, 0.11, 28, 1, true).rotateZ(Math.PI / 2),
    M.titanium,
  );
  foreCarrierRing.position.x = -0.52;
  foreRingGroup.add(foreCarrierRing);

  const aftCarrierRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.545, 0.558, 0.11, 28, 1, true).rotateZ(Math.PI / 2),
    M.titanium,
  );
  aftCarrierRing.position.x = 0.46;
  aftRingGroup.add(aftCarrierRing);

  for (let i = 0; i < 8; i++) {
    const thetaFore = (i / 8) * Math.PI * 2 + Math.PI / 8;
    foreRingGroup.add(makeTransducerBarrel(-0.52, 0.48, thetaFore, i % 2 === 0));

    const thetaAft = (i / 8) * Math.PI * 2;
    aftRingGroup.add(makeTransducerBarrel(0.46, 0.57, thetaAft, i % 2 === 1));
  }

  // 2. Two Longitudinal Dorsal/Lateral Stave Arrays (Port & Starboard x Dorsal & Lateral = 4 staves x 4 barrels = 16 barrels)
  // Spanning x in [-0.62, +0.58], r = 0.48..0.58m
  const staveAngles = [0.22 * Math.PI, 0.46 * Math.PI, -0.22 * Math.PI, -0.46 * Math.PI];
  const staveXs = [-0.62, -0.22, 0.18, 0.58];
  const staveRs = [0.48, 0.51, 0.55, 0.58];
  const staveSpineGeo = new THREE.BoxGeometry(1.34, 0.036, 0.088);

  for (let sIdx = 0; sIdx < staveAngles.length; sIdx++) {
    const theta = staveAngles[sIdx];
    const ca = Math.cos(theta);
    const sa = Math.sin(theta);

    // Machined titanium stave backing bar along cone slope
    const staveBar = new THREE.Mesh(staveSpineGeo, M.titanium);
    const rMid = 0.50;
    staveBar.position.set(-0.02, ca * rMid, sa * rMid);
    staveBar.rotation.x = theta;
    staveBar.rotation.z = -0.082;
    staveArrayGroup.add(staveBar);

    for (let k = 0; k < 4; k++) {
      const isBronze = (sIdx + k) % 2 === 0;
      staveArrayGroup.add(makeTransducerBarrel(staveXs[k], staveRs[k], theta, isBronze));
    }
  }

  // 3. Four External `M.steel` Axial Tie-Rods (`x in [-0.70, +0.70]`) with `M.bronze` Hex Tension Nuts
  const tieAngles = [0.10 * Math.PI, 0.64 * Math.PI, -0.10 * Math.PI, -0.64 * Math.PI];
  const tieRodGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.48, 14).rotateZ(Math.PI / 2);
  const hexNutGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.048, 6).rotateZ(Math.PI / 2);
  const tieLugGeo = new THREE.BoxGeometry(0.065, 0.082, 0.082);

  for (const ang of tieAngles) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rRod = 0.535;

    const rodAssembly = new THREE.Group();
    rodAssembly.position.set(0.0, ca * rRod, sa * rRod);
    rodAssembly.rotation.x = ang;
    rodAssembly.rotation.z = -0.078;

    const rodMesh = new THREE.Mesh(tieRodGeo, M.steel);
    rodAssembly.add(rodMesh);

    for (const xEnd of [-0.66, 0.66]) {
      const lug = new THREE.Mesh(tieLugGeo, M.titanium);
      lug.position.x = xEnd * 0.88;
      const nut = new THREE.Mesh(hexNutGeo, M.bronze);
      nut.position.x = xEnd;
      rodAssembly.add(lug, nut);
    }

    tieRodGroup.add(rodAssembly);
  }

  applyClip(group, clipPlane);

  function update(kSonar = 0) {
    group.position.x = -0.18 * kSonar;
    foreRingGroup.position.x = -0.42 * kSonar;
    aftRingGroup.position.x = 0.28 * kSonar;
    tieRodGroup.position.x = 0.12 * kSonar;
  }

  return { group, update };
}

// ----------------------------------------------------------------------------
// A-Heavy 2: Twin Mandible Hydraulic Accumulator & Manifold Bank (`[-1.85, -0.28, +-0.54]`)
// ----------------------------------------------------------------------------
function buildMandibleAccumulatorBank({ M, clipPlane }) {
  const group = new THREE.Group();
  group.name = 'mandibleAccumulatorBank';

  const vesselCylGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.62, 22).rotateZ(Math.PI / 2);
  const vesselDomeGeo = new THREE.SphereGeometry(0.108, 18, 12);
  const clampBandGeo = new THREE.CylinderGeometry(0.122, 0.122, 0.052, 20).rotateZ(Math.PI / 2);
  const valveBlockGeo = new THREE.BoxGeometry(0.28, 0.34, 0.24);
  const subPlateGeo = new THREE.BoxGeometry(0.22, 0.28, 0.06);
  const hexPortGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.065, 6);
  const solenoidCanGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.12, 14);
  const boltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.032, 6);

  const sideBanks = [];

  for (const zSgn of [1, -1]) {
    const bankGroup = new THREE.Group();
    bankGroup.position.set(-1.85, -0.28, zSgn * 0.54);

    // Pair of cylindrical pressure vessels (`r = 0.11m, len = 0.62m`): upper `M.titanium` + lower `M.bronze`
    const vesselSpecs = [
      { dy: 0.118, dz: zSgn * 0.02, bodyMat: M.titanium, bandMat: M.bronze },
      { dy: -0.118, dz: -zSgn * 0.02, bodyMat: M.bronze, bandMat: M.titanium },
    ];

    for (const vs of vesselSpecs) {
      const vGroup = new THREE.Group();
      vGroup.position.set(0, vs.dy, vs.dz);

      const body = new THREE.Mesh(vesselCylGeo, vs.bodyMat);
      const domeFore = new THREE.Mesh(vesselDomeGeo, vs.bandMat);
      domeFore.scale.set(0.65, 1, 1);
      domeFore.position.x = -0.31;
      const domeAft = new THREE.Mesh(vesselDomeGeo, vs.bandMat);
      domeAft.scale.set(0.65, 1, 1);
      domeAft.position.x = 0.31;

      const bandFore = new THREE.Mesh(clampBandGeo, vs.bandMat);
      bandFore.position.x = -0.16;
      const bandAft = new THREE.Mesh(clampBandGeo, vs.bandMat);
      bandAft.position.x = 0.16;

      const chargeValve = new THREE.Mesh(hexPortGeo, M.chrome);
      chargeValve.rotation.z = Math.PI / 2;
      chargeValve.position.x = -0.38;

      vGroup.add(body, domeFore, domeAft, bandFore, bandAft, chargeValve);
      bankGroup.add(vGroup);
    }

    // Twin vertical tie-straps uniting the 2 pressure vessels
    const strapGeo = new THREE.BoxGeometry(0.056, 0.48, 0.26);
    for (const xStrap of [-0.16, 0.16]) {
      const strap = new THREE.Mesh(strapGeo, M.titanium);
      strap.position.set(xStrap, 0, 0);
      bankGroup.add(strap);

      for (const yBolt of [-0.22, 0, 0.22]) {
        const bolt = new THREE.Mesh(boltGeo, M.chrome);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(xStrap, yBolt, zSgn * 0.14);
        bankGroup.add(bolt);
      }
    }

    // Heavy `M.steel` Hydraulic Manifold Valve Block at aft end (`x = +0.44`)
    const valveBlock = new THREE.Mesh(valveBlockGeo, M.steel);
    valveBlock.position.set(0.44, 0, 0);
    const subPlate = new THREE.Mesh(subPlateGeo, M.titanium);
    subPlate.position.set(0.44, 0, zSgn * 0.14);
    bankGroup.add(valveBlock, subPlate);

    // 3 Bronze AN hex ports + 2 Chrome relief solenoid cartridges on the valve block
    for (const yPort of [-0.10, 0.0, 0.10]) {
      const port = new THREE.Mesh(hexPortGeo, M.bronze);
      port.rotation.x = Math.PI / 2;
      port.position.set(0.44, yPort, zSgn * 0.18);
      bankGroup.add(port);
    }
    for (const xSol of [0.38, 0.50]) {
      const sol = new THREE.Mesh(solenoidCanGeo, M.chrome);
      sol.position.set(xSol, 0.22, 0);
      bankGroup.add(sol);
    }

    group.add(bankGroup);
    sideBanks.push({ bankGroup, zSgn });
  }

  applyClip(group, clipPlane);

  function update(explode = 0) {
    for (let i = 0; i < sideBanks.length; i++) {
      const sb = sideBanks[i];
      sb.bankGroup.position.set(
        -1.85 - 0.18 * explode,
        -0.28 - 0.14 * explode,
        sb.zSgn * (0.54 + 0.22 * explode),
      );
    }
  }

  return { group, update };
}

// ----------------------------------------------------------------------------
// B-Heavy 1: Thoracic Hydraulic Manifold & Servo Valve Island (`[0.95, 0.42, +-0.88]` on `gearboxGroup`)
// ----------------------------------------------------------------------------
function buildThoracicValveIsland({ M, clipPlane }) {
  const group = new THREE.Group();
  group.name = 'thoracicValveIsland';
  group.visible = false;

  const manifoldBlockGeo = new THREE.BoxGeometry(0.68, 0.28, 0.34);
  const topDeckGeo = new THREE.BoxGeometry(0.62, 0.048, 0.28);
  const canisterGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.26, 20);
  const canisterCapGeo = new THREE.CylinderGeometry(0.052, 0.064, 0.042, 16);
  const canisterBaseGeo = new THREE.CylinderGeometry(0.076, 0.076, 0.032, 18);
  const spoolValveGeo = new THREE.BoxGeometry(0.12, 0.085, 0.095);
  const boltGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.034, 6);

  const sideIslands = [];

  for (const zSgn of [1, -1]) {
    const island = new THREE.Group();
    island.position.set(0.95, 0.42, zSgn * 0.88);

    // 1. Machined `M.titanium` Manifold Block (`0.68 x 0.28 x 0.34m`) + `M.steel` Valve Deck
    const manifoldBlock = new THREE.Mesh(manifoldBlockGeo, M.titanium);
    const topDeck = new THREE.Mesh(topDeckGeo, M.steel);
    topDeck.position.y = 0.16;
    island.add(manifoldBlock, topDeck);

    // 2. Four `M.bronze` Accumulator Canisters (`r = 0.068m, len = 0.26m`) with `M.chrome` pressure caps
    const canOffsets = [
      [-0.22, 0.30, -0.075],
      [-0.07, 0.30, 0.075],
      [0.08, 0.30, -0.075],
      [0.23, 0.30, 0.075],
    ];
    for (const [cx, cy, cz] of canOffsets) {
      const canBase = new THREE.Mesh(canisterBaseGeo, M.steel);
      canBase.position.set(cx, cy - 0.115, cz);
      const canBody = new THREE.Mesh(canisterGeo, M.bronze);
      canBody.position.set(cx, cy, cz);
      const canCap = new THREE.Mesh(canisterCapGeo, M.chrome);
      canCap.position.set(cx, cy + 0.145, cz);
      island.add(canBase, canBody, canCap);
    }

    // Lateral servo-spool blocks & chrome hex bolts on the outboard face (visible through the port oval window!)
    for (const xSpool of [-0.20, 0.0, 0.20]) {
      const spool = new THREE.Mesh(spoolValveGeo, M.steel);
      spool.position.set(xSpool, 0.02, zSgn * 0.19);
      const hexPlug = new THREE.Mesh(boltGeo, M.bronze);
      hexPlug.scale.set(1.8, 1.8, 1.8);
      hexPlug.rotation.x = Math.PI / 2;
      hexPlug.position.set(xSpool, 0.02, zSgn * 0.25);
      island.add(spool, hexPlug);
    }

    for (const [bx, bz] of [
      [-0.28, -0.12],
      [0.28, -0.12],
      [-0.28, 0.12],
      [0.28, 0.12],
    ]) {
      const bolt = new THREE.Mesh(boltGeo, M.chrome);
      bolt.position.set(bx, 0.19, bz);
      island.add(bolt);
    }

    group.add(island);
    sideIslands.push({ island, zSgn });
  }

  // 3. Two Heavy `M.steel` Crossover Pipes spanning between the Port & Starboard Manifold Islands
  const crossoverGroup = new THREE.Group();
  const pipeSpan = 1.76;
  const pipeGeo = new THREE.CylinderGeometry(0.046, 0.046, pipeSpan, 18).rotateX(Math.PI / 2);
  const unionHexGeo = new THREE.CylinderGeometry(0.074, 0.074, 0.075, 6).rotateX(Math.PI / 2);
  const centerClampGeo = new THREE.BoxGeometry(0.52, 0.14, 0.12);

  for (const xPipe of [0.95 - 0.18, 0.95 + 0.18]) {
    const pipe = new THREE.Mesh(pipeGeo, M.steel);
    pipe.position.set(xPipe, 0.42, 0);
    crossoverGroup.add(pipe);

    for (const zUnion of [-0.68, 0.68]) {
      const union = new THREE.Mesh(unionHexGeo, M.bronze);
      union.position.set(xPipe, 0.42, zUnion);
      crossoverGroup.add(union);
    }
  }

  const centerClamp = new THREE.Mesh(centerClampGeo, M.titanium);
  centerClamp.position.set(0.95, 0.42, 0);
  crossoverGroup.add(centerClamp);
  group.add(crossoverGroup);

  applyClip(group, clipPlane);

  function update(kGear = 0, kGearEx = 0) {
    for (let i = 0; i < sideIslands.length; i++) {
      const item = sideIslands[i];
      const kSide = item.zSgn > 0 ? kGear : kGearEx;
      item.island.position.set(
        0.95,
        0.42 + 0.16 * kGearEx,
        item.zSgn * (0.88 + 0.28 * kSide),
      );
    }
    crossoverGroup.position.y = 0.16 * kGearEx;
  }

  return { group, update };
}

export function buildForeBays({
  M,
  BONES,
  BONE_WORLD_REST,
  itemByName,
  eyeHubHooks = [],
  shoulderHubHooks = [],
  sonarPodGroup,
  gearboxGroup,
  rostrumGuideCollar,
  cranialLinks = [],
  wingRootUnits = [],
  clipPlane,
}) {
  void rostrumGuideCollar;

  // ============================================================================
  // 1. SUBSYSTEM A — CRANIAL SONAR & HYDRO-OPTICS BAY (`S2.1`)
  // ============================================================================
  const cranialBayGroup = new THREE.Group();
  cranialBayGroup.name = 'foreBay_cranial';
  cranialBayGroup.visible = false;
  if (BONES?.cranial) {
    BONES.cranial.add(cranialBayGroup);
  }

  // A-Heavy 0: 28-Plate Mechanical Baleen Hydro-Filter Louver Array (`sideCount: 14`)
  const baleenArray = createBaleenLouverArray({
    sideCount: 14,
    M,
    clipPlane,
  });
  if (baleenArray?.group) {
    cranialBayGroup.add(baleenArray.group);
  } else if (baleenArray?.isObject3D) {
    cranialBayGroup.add(baleenArray);
  }

  // A-Heavy 1: 32-Element Phased-Array Transducer Sleeve + 4 Axial Steel Tie-Rods on `sonarPodGroup`
  let sonarTransducerSleeve = null;
  if (sonarPodGroup) {
    sonarTransducerSleeve = buildPhasedArrayTransducerSleeve({ M, clipPlane });
    sonarPodGroup.add(sonarTransducerSleeve.group);
  }

  // A-Heavy 2: Twin Mandible Hydraulic Accumulator & Manifold Bank at `[-1.85, -0.28, +-0.54]`
  const mandibleAccumulatorBank = buildMandibleAccumulatorBank({ M, clipPlane });
  cranialBayGroup.add(mandibleAccumulatorBank.group);

  // A-Tier 1.5: 8 Edge Locking Latch-Pin Pairs + 4 Linkage-Base Gusset Brackets
  const cranialLatches = [];
  const cranialLatchSpecs = [
    // Rostrum dorsal seam (4 units)
    { pos: [-3.95, 1.52, 0.08], rot: [-Math.PI * 0.42, 0, 0], scale: 1.35 },
    { pos: [-3.95, 1.52, -0.08], rot: [Math.PI * 0.42, Math.PI, 0], scale: 1.35 },
    { pos: [-2.85, 1.68, 0.08], rot: [-Math.PI * 0.42, 0, 0], scale: 1.35 },
    { pos: [-2.85, 1.68, -0.08], rot: [Math.PI * 0.42, Math.PI, 0], scale: 1.35 },
    // Brow rim (2 units)
    { pos: [-1.85, 1.92, 0.12], rot: [-Math.PI * 0.38, 0, 0], scale: 1.45 },
    { pos: [-1.85, 1.92, -0.12], rot: [Math.PI * 0.38, Math.PI, 0], scale: 1.45 },
    // Maxilla trench (2 units)
    { pos: [-1.75, 0.48, 1.48], rot: [0, 0, 0], scale: 1.45 },
    { pos: [-1.75, 0.48, -1.48], rot: [0, Math.PI, 0], scale: 1.45 },
  ];
  for (const sp of cranialLatchSpecs) {
    const latch = createLatchPinPair({ scale: sp.scale, M, clipPlane });
    latch.group.position.set(sp.pos[0], sp.pos[1], sp.pos[2]);
    latch.group.rotation.set(sp.rot[0], sp.rot[1], sp.rot[2]);
    cranialBayGroup.add(latch.group);
    cranialLatches.push(latch);
  }

  const cranialGussetSpecs = [
    { pos: [-1.60, 1.22, 0.48], rot: [0, 0, 0] },
    { pos: [-1.60, 1.22, -0.48], rot: [0, Math.PI, 0] },
    { pos: [-0.65, 0.58, 1.15], rot: [0, 0, 0] },
    { pos: [-0.65, 0.58, -1.15], rot: [0, Math.PI, 0] },
  ];
  for (const gs of cranialGussetSpecs) {
    const gusset = createGussetBracket({
      width: 0.24,
      height: 0.20,
      depth: 0.16,
      M,
      clipPlane,
    });
    gusset.group.position.set(gs.pos[0], gs.pos[1], gs.pos[2]);
    gusset.group.rotation.set(gs.rot[0], gs.rot[1], gs.rot[2]);
    cranialBayGroup.add(gusset.group);
  }

  // A-Tier 2.1: Upper Rostrum Collar Guide Rails (L/R) — 2.2x Heavy Scale (`width: 0.105, height: 0.082`)
  const rostrumRails = [];
  for (const zSgn of [1, -1]) {
    const rail = createLinearGuideRail({
      length: 1.42,
      width: 0.105,
      height: 0.082,
      carriageCount: 1,
      carriageLen: 0.22,
      M,
      clipPlane,
    });
    rail.group.position.set(-2.55, 0.903, zSgn * 0.62);
    cranialBayGroup.add(rail.group);
    rostrumRails.push(rail);
  }

  // A-Tier 2.2: Lower Sonar Pod Extraction Guide Rails (L/R) — 2.2x Heavy Scale (`width: 0.115, height: 0.088, carriageLen: 0.24`)
  const sonarRails = [];
  for (const zSgn of [1, -1]) {
    const rail = createLinearGuideRail({
      length: 1.82,
      width: 0.115,
      height: 0.088,
      carriageCount: 2,
      carriageLen: 0.24,
      M,
      clipPlane,
    });
    rail.group.position.set(-2.35, 0.383, zSgn * 0.58);
    rail.group.rotation.z = -0.125;
    cranialBayGroup.add(rail.group);
    sonarRails.push(rail);
  }

  // A-Tier 2.3: Sonar Dorsal Rack-and-Pinion Servo Drive — 2.2x Heavy Scale (`rackLen: 1.48, pitchRadius: 0.125, teeth: 14, faceWidth: 0.078`)
  const sonarRackDrive = createRackAndPinionActuator({
    rackLen: 1.48,
    pitchRadius: 0.125,
    teeth: 14,
    faceWidth: 0.078,
    M,
    clipPlane,
  });
  sonarRackDrive.group.position.set(-2.15, 0.88, 0);
  cranialBayGroup.add(sonarRackDrive.group);

  // A-Tier 2.4: Eye Turret 20-Ball Slewing Bearing Ring & Worm-Gear Gimbal Drive
  const eyeTurretDrives = [];
  for (const hook of eyeHubHooks) {
    if (!hook?.irisStage) continue;
    const slewingRing = createSlewingBearingRing({
      rOuter: 0.58,
      rInner: 0.42,
      axialThick: 0.085,
      ballCount: 20,
      M,
      clipPlane,
    });
    slewingRing.group.position.z = -0.025;
    slewingRing.group.visible = false;
    hook.irisStage.add(slewingRing.group);

    const wormDrive = createWormGearActuator({
      wormLen: 0.28,
      wormRadius: 0.048,
      wheelRadius: 0.095,
      wheelTeeth: 16,
      M,
      clipPlane,
    });
    wormDrive.group.position.set(0, -0.54, -0.02);
    wormDrive.group.visible = false;
    hook.irisStage.add(wormDrive.group);

    eyeTurretDrives.push({
      hook,
      zSgn: hook.zSign ?? 1,
      slewingRing,
      wormDrive,
    });
  }

  // A-Tier 2.5: 4 Heavy Pressurized Gas/Hydraulic Cylinders (`browStrut_L/R` & `jawStrut_L/R`, `cylRadius: 0.046`)
  const cranialGasStruts = [];
  if (BONES?.cranial) {
    const cranialRest = BONE_WORLD_REST?.cranial || new V3(-4.938, 1.117, 0);
    for (const zSgn of [1, -1]) {
      const side = zSgn > 0 ? 'L' : 'R';

      // browStrut_L/R alongside browRig
      const browTarget =
        itemByName?.get(`truss__cranial__brow_hood_${side}_1`) ||
        itemByName?.get(`cranial__brow_hood_${side}`);
      const browSockA = makeLocalSocket(BONES.cranial, [-1.82, 1.08, zSgn * 0.56]);
      const browSockB = browTarget
        ? makeHullSocket(browTarget, [-6.35, 2.68, zSgn * 0.82])
        : makeLocalSocket(BONES.cranial, [
            -6.35 - cranialRest.x,
            2.68 - cranialRest.y,
            zSgn * 0.82 - cranialRest.z,
          ]);
      const browStrut = createGasStrut({
        parentGroup: BONES.cranial,
        sockA: browSockA,
        sockB: browSockB,
        restLen: 0.86,
        cylRadius: 0.046,
        detachVec: [-0.16, 0.20, zSgn * 0.14],
        M,
        clipPlane,
      });
      browStrut.group.visible = false;
      cranialGasStruts.push({ strut: browStrut, order: 0.14 });

      // jawStrut_L/R alongside jawRig
      const throatTarget =
        itemByName?.get(`pectoral__throat_liner_${side}`) ||
        itemByName?.get(`truss__pectoral__throat_liner_${side}_1`);
      const jawSockA = makeLocalSocket(BONES.cranial, [-2.18, -0.44, zSgn * 0.66]);
      const jawSockB = throatTarget
        ? makeHullSocket(throatTarget, [-7.10, 0.08, zSgn * 0.94])
        : makeLocalSocket(BONES.cranial, [
            -7.10 - cranialRest.x,
            0.08 - cranialRest.y,
            zSgn * 0.94 - cranialRest.z,
          ]);
      const jawStrut = createGasStrut({
        parentGroup: BONES.cranial,
        sockA: jawSockA,
        sockB: jawSockB,
        restLen: 1.04,
        cylRadius: 0.046,
        detachVec: [-0.16, -0.20, zSgn * 0.16],
        M,
        clipPlane,
      });
      jawStrut.group.visible = false;
      cranialGasStruts.push({ strut: jawStrut, order: 0.14 });
    }
  }

  // A-Tier 3: Micro-Fasteners on `cranialLinks` & Heavy Routed Cranial Plumbing Bay (`tubeRadius: 0.042` & `0.052`)
  for (const item of cranialLinks) {
    const rig = item?.rig || item;
    if (!rig) continue;
    decorateLinkageWithMicroHardware(rig, {
      pinRadius: 0.036,
      lengthA: 0.96,
      lengthB: 0.96,
      thickness: 0.048,
      M,
      clipPlane,
    });
  }

  const cranialRoutes = [];
  for (const zSgn of [1, -1]) {
    // Heavy bronze/steel hydraulic & coolant hardlines (`tubeRadius: 0.042`)
    cranialRoutes.push({
      points: [
        [-1.45, 0.52, zSgn * 0.46],
        [-1.78, 0.48, zSgn * 0.54],
        [-2.12, 0.42, zSgn * 0.50],
        [-2.45, 0.38, zSgn * 0.38],
      ],
      tubeRadius: 0.042,
      corrugated: false,
      clipCount: 4,
      tubeMat: zSgn > 0 ? M.bronze : M.steel,
    });
    // Heavy armored corrugated sensor & power conduits (`tubeRadius: 0.052`)
    cranialRoutes.push({
      points: [
        [-1.42, 0.28, zSgn * 0.64],
        [-1.12, 0.22, zSgn * 1.06],
        [-0.58, 0.18, zSgn * 1.44],
        [-0.12, 0.15, zSgn * 1.64],
      ],
      tubeRadius: 0.052,
      corrugated: true,
      clipCount: 3,
      tubeMat: M.aluDark,
    });
  }
  const cranialPlumbing = createRoutedPlumbingBay({
    routes: cranialRoutes,
    tubeRadius: 0.042,
    corrugated: false,
    clipCount: 4,
    tubeMat: M.bronze,
    M,
    clipPlane,
  });
  cranialBayGroup.add(cranialPlumbing.group);
  applyClip(cranialBayGroup, clipPlane);

  // ============================================================================
  // 2. SUBSYSTEM B — PECTORAL SHOULDER GEARBOX & HYDROFOIL WING BAY (`S3.1`)
  // ============================================================================

  // B-Heavy 0, B-Tier 1.5 & B-Tier 3 (Wing-mounted): 7-Rib CNC Aerofoil Wing Skeleton, 6 Spar Gussets, 4 Latch Pins & Heavy Wing Plumbing
  const wingBayUnits = [];
  for (const zSgn of [1, -1]) {
    const isPort = zSgn > 0;
    const fBone = isPort ? BONES?.flipper_L : BONES?.flipper_R;
    const fDistBone = isPort ? BONES?.flipper_dist_L : BONES?.flipper_dist_R;
    if (!fBone) continue;

    const wingGroup = new THREE.Group();
    wingGroup.name = isPort ? 'foreBay_wing_L' : 'foreBay_wing_R';
    wingGroup.visible = false;
    fBone.add(wingGroup);

    const distGroup = new THREE.Group();
    distGroup.name = isPort ? 'foreBay_wingDist_L' : 'foreBay_wingDist_R';
    distGroup.visible = false;
    if (fDistBone) fDistBone.add(distGroup);

    // B-Heavy 0: 9-Rib CNC Aerofoil Wing Skeleton (`createAerofoilWingRibs`) inside `wingGroup`
    const wingRibs = createAerofoilWingRibs({
      count: 9,
      zSgn,
      M,
      clipPlane,
    });
    if (wingRibs?.group) {
      wingGroup.add(wingRibs.group);
    } else if (wingRibs?.isObject3D) {
      wingGroup.add(wingRibs);
    }

    // 3 Heavy Gusset Brackets per wing (6 total across L/R)
    for (const gPos of [
      [0.32, -0.58, zSgn * 0.72],
      [0.96, -1.08, zSgn * 1.18],
      [1.62, -1.52, zSgn * 1.56],
    ]) {
      const gusset = createGussetBracket({
        width: 0.24,
        height: 0.20,
        depth: 0.15,
        M,
        clipPlane,
      });
      gusset.group.position.set(gPos[0], gPos[1], gPos[2]);
      gusset.group.rotation.y = isPort ? 0 : Math.PI;
      wingGroup.add(gusset.group);
    }

    // 2 Latch-Pin Pairs per wing (4 total across L/R: 1 on flipper_L/R + 1 on flipper_dist_L/R)
    const latches = [];
    const proxLatch = createLatchPinPair({ scale: 1.35, M, clipPlane });
    proxLatch.group.position.set(0.96, -1.08, zSgn * 1.18);
    proxLatch.group.rotation.y = isPort ? 0 : Math.PI;
    wingGroup.add(proxLatch.group);
    latches.push(proxLatch);

    const distLatch = createLatchPinPair({ scale: 1.25, M, clipPlane });
    distLatch.group.position.set(0.35, -0.28, zSgn * 0.24);
    distLatch.group.rotation.y = isPort ? 0 : Math.PI;
    if (fDistBone) {
      distGroup.add(distLatch.group);
    } else {
      wingGroup.add(distLatch.group);
    }
    latches.push(distLatch);

    // Mid-wing joint heavy gas/hydraulic cylinder (`midHingeStrut_L/R`, `cylRadius: 0.044`) from `fBone` to `fDistBone`
    let midHingeStrut = null;
    if (fDistBone) {
      const mSockA = makeLocalSocket(fBone, [1.92, -1.65, zSgn * 1.40]);
      const mSockB = makeLocalSocket(fDistBone, [0.42, -0.35, zSgn * 0.30]);
      midHingeStrut = createGasStrut({
        parentGroup: fBone,
        sockA: mSockA,
        sockB: mSockB,
        restLen: 0.64,
        cylRadius: 0.044,
        detachVec: [0.12, -0.14, zSgn * 0.16],
        M,
        clipPlane,
      });
      midHingeStrut.group.visible = false;
    }

    // Heavy twin steel & bronze hydraulic hardlines (`0.038m`) + 1 armored corrugated conduit (`0.048m`) with 5 P-clips along wing spar
    const wingPlumbing = createRoutedPlumbingBay({
      routes: [
        {
          points: [
            [-0.08, -0.18, zSgn * 0.32],
            [0.72, -0.78, zSgn * 0.78],
            [1.54, -1.38, zSgn * 1.24],
            [2.35, -1.98, zSgn * 1.68],
          ],
          tubeRadius: 0.038,
          corrugated: false,
          clipCount: 5,
          tubeMat: M.bronze,
        },
        {
          points: [
            [-0.04, -0.22, zSgn * 0.35],
            [0.76, -0.82, zSgn * 0.81],
            [1.58, -1.42, zSgn * 1.27],
            [2.39, -2.02, zSgn * 1.71],
          ],
          tubeRadius: 0.038,
          corrugated: false,
          clipCount: 5,
          tubeMat: M.steel,
        },
        {
          points: [
            [-0.12, -0.14, zSgn * 0.29],
            [0.68, -0.74, zSgn * 0.75],
            [1.50, -1.34, zSgn * 1.21],
            [2.31, -1.94, zSgn * 1.65],
          ],
          tubeRadius: 0.048,
          corrugated: true,
          clipCount: 5,
          tubeMat: M.aluDark,
        },
      ],
      tubeRadius: 0.038,
      clipCount: 5,
      M,
      clipPlane,
    });
    wingGroup.add(wingPlumbing.group);

    wingBayUnits.push({
      zSgn,
      isPort,
      wingGroup,
      distGroup,
      wingRibs,
      latches,
      midHingeStrut,
    });
  }

  // B-Tier 2.1: 24-Ball Shoulder Slewing Bearing Ring inside `hub_shoulder_L/R` (`hook.planetaryStage`)
  const shoulderSlewingItems = [];
  for (const hook of shoulderHubHooks) {
    if (!hook?.planetaryStage) continue;
    const ring = createSlewingBearingRing({
      rOuter: 0.62,
      rInner: 0.44,
      axialThick: 0.11,
      ballCount: 24,
      M,
      clipPlane,
    });
    ring.group.position.z = -0.02;
    ring.group.visible = false;
    hook.planetaryStage.add(ring.group);
    shoulderSlewingItems.push({
      hook,
      ring,
      zSgn: hook.zSign ?? 1,
    });
  }

  // B-Heavy 1, B-Tier 2.2, 2.3 & B-Tier 3 (Gearbox-mounted):
  // Thoracic Hydraulic Valve Island (`[0.95, 0.42, +-0.88]`), Heavy Guide Rails (`0.11 x 0.086`), Worm Cans (`0.068 / 0.14`) & Cross-Manifold Hardlines
  const gbGuideRails = [];
  const gbWormCans = [];
  let gbPlumbing = null;
  let gbValveIsland = null;
  if (gearboxGroup) {
    gbValveIsland = buildThoracicValveIsland({ M, clipPlane });
    gearboxGroup.add(gbValveIsland.group);

    for (const xSgn of [1, -1]) {
      const rail = createLinearGuideRail({
        length: 2.40,
        width: 0.11,
        height: 0.086,
        carriageCount: 2,
        carriageLen: 0.26,
        M,
        clipPlane,
      });
      rail.group.position.set(xSgn * 0.52, -0.46, 0);
      rail.group.rotation.y = Math.PI / 2;
      rail.group.visible = false;
      gearboxGroup.add(rail.group);
      gbGuideRails.push(rail);
    }

    for (const zSgn of [1, -1]) {
      const worm = createWormGearActuator({
        wormLen: 0.38,
        wormRadius: 0.068,
        wheelRadius: 0.14,
        wheelTeeth: 18,
        M,
        clipPlane,
      });
      worm.group.position.set(0.56, 0.18, zSgn * 1.18);
      worm.group.visible = false;
      gearboxGroup.add(worm.group);
      gbWormCans.push({ worm, zSgn });
    }

    gbPlumbing = createRoutedPlumbingBay({
      routes: [
        {
          points: [
            [-0.62, -0.39, -1.20],
            [-0.65, -0.41, -0.40],
            [-0.65, -0.41, 0.40],
            [-0.62, -0.39, 1.20],
          ],
          tubeRadius: 0.042,
          corrugated: false,
          clipCount: 4,
          tubeMat: M.bronze,
        },
        {
          points: [
            [-0.58, -0.45, -1.20],
            [-0.61, -0.47, -0.40],
            [-0.61, -0.47, 0.40],
            [-0.58, -0.45, 1.20],
          ],
          tubeRadius: 0.042,
          corrugated: false,
          clipCount: 4,
          tubeMat: M.steel,
        },
      ],
      tubeRadius: 0.042,
      corrugated: false,
      clipCount: 4,
      tubeMat: M.bronze,
      M,
      clipPlane,
    });
    gbPlumbing.group.visible = false;
    gearboxGroup.add(gbPlumbing.group);
  }

  // B-Heavy 2: Lateral Inter-Hub Torque & Conduit Trench Assembly (`BONES.thoracic`, gated by `gearVis`)
  // Fills the smooth dark-grey `trench__channel_thoracic_L/R` & `trench__channel_spine_0_L/R` channels in S3.1 & S5.1
  let lateralTrenchGroup = null;
  const lateralTrenchRails = [];
  if (BONES?.thoracic) {
    lateralTrenchGroup = new THREE.Group();
    lateralTrenchGroup.name = 'thoracicLateralTorqueTrench';
    lateralTrenchGroup.visible = false;

    const saddleOuterGeo = new THREE.BoxGeometry(0.068, 0.42, 0.16);
    const saddleBoreGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.084, 16).rotateZ(Math.PI / 2);
    const saddleBoltGeo = new THREE.CylinderGeometry(0.020, 0.020, 0.18, 6).rotateX(Math.PI / 2);

    for (const zSgn of [1, -1]) {
      // 1. Fore Inter-Hub Trench (`hub_eye` to `hub_shoulder`: x in [-4.85 .. -3.25])
      const foreStations = [
        [-4.75, 0.72, 1.62],
        [-4.25, 0.65, 1.70],
        [-3.75, 0.58, 1.76],
        [-3.25, 0.52, 1.80],
      ];
      for (let i = 0; i < foreStations.length; i++) {
        const [sx, sy, sz] = foreStations[i];
        const sHolder = new THREE.Group();
        sHolder.position.set(sx, sy, zSgn * sz);
        const plate = new THREE.Mesh(saddleOuterGeo, i % 2 === 0 ? M.titanium : M.alu);
        const bore = new THREE.Mesh(saddleBoreGeo, M.bronze);
        const bTop = new THREE.Mesh(saddleBoltGeo, M.chrome);
        bTop.position.y = 0.16;
        const bBot = new THREE.Mesh(saddleBoltGeo, M.chrome);
        bBot.position.y = -0.16;
        sHolder.add(plate, bore, bTop, bBot);
        lateralTrenchGroup.add(sHolder);
      }

      // 2. Aft Inter-Hub Trench (`hub_shoulder` to `hub_mid`: x in [-1.10 .. +3.35])
      const aftStations = [
        [-1.05, 0.46, 1.68],
        [-0.42, 0.46, 1.62],
        [0.22, 0.46, 1.54],
        [0.86, 0.46, 1.44],
        [1.50, 0.46, 1.32],
        [2.14, 0.47, 1.20],
        [2.78, 0.48, 1.08],
        [3.38, 0.49, 0.96],
      ];
      for (let i = 0; i < aftStations.length; i++) {
        const [sx, sy, sz] = aftStations[i];
        const sHolder = new THREE.Group();
        sHolder.position.set(sx, sy, zSgn * sz);
        sHolder.rotation.y = zSgn * 0.15;
        const plate = new THREE.Mesh(saddleOuterGeo, i % 2 === 0 ? M.titanium : M.alu);
        const bore = new THREE.Mesh(saddleBoreGeo, M.bronze);
        const bTop = new THREE.Mesh(saddleBoltGeo, M.chrome);
        bTop.position.y = 0.16;
        const bBot = new THREE.Mesh(saddleBoltGeo, M.chrome);
        bBot.position.y = -0.16;
        sHolder.add(plate, bore, bTop, bBot);
        lateralTrenchGroup.add(sHolder);
      }

      // 3. Heavy Longitudinal Linear Guide Rail & 3 Ball-Bearing Carriages along Aft Trench
      const trenchRail = createLinearGuideRail({
        length: 4.15,
        width: 0.098,
        height: 0.076,
        carriageCount: 3,
        carriageLen: 0.24,
        M,
        clipPlane,
      });
      trenchRail.group.position.set(1.15, 0.64, zSgn * 1.32);
      trenchRail.group.rotation.y = zSgn * 0.16;
      trenchRail.group.rotation.x = zSgn * 0.42;
      lateralTrenchGroup.add(trenchRail.group);
      lateralTrenchRails.push(trenchRail);

      // 4. Routed Braided & Bronze Hydraulic Conduits along the Lateral Trench
      const trenchPlumbing = createRoutedPlumbingBay({
        routes: [
          {
            points: [
              [-1.12, 0.30, zSgn * 1.66],
              [0.35, 0.31, zSgn * 1.50],
              [1.85, 0.33, zSgn * 1.24],
              [3.35, 0.35, zSgn * 0.96],
            ],
            tubeRadius: 0.042,
            corrugated: false,
            clipCount: 6,
            tubeMat: M.bronze,
          },
          {
            points: [
              [-4.85, 0.56, zSgn * 1.58],
              [-4.05, 0.46, zSgn * 1.68],
              [-3.20, 0.38, zSgn * 1.76],
            ],
            tubeRadius: 0.040,
            corrugated: false,
            clipCount: 4,
            tubeMat: M.bronze,
          },
        ],
        M,
        clipPlane,
      });
      lateralTrenchGroup.add(trenchPlumbing.group);
    }

    applyClip(lateralTrenchGroup, clipPlane);
    BONES.thoracic.add(lateralTrenchGroup);
  }

  // B-Tier 2.4, 2.5 & B-Tier 3 (Wing-Root Carrier-mounted):
  // Heavy Rack-and-Pinion Pitch Drives (`pitchRadius: 0.088, faceWidth: 0.064`), Root Aux Gas Struts (`cylRadius: 0.044`) & Scissor Micro-Hardware
  const wingCarrierDrives = [];
  for (const unit of wingRootUnits) {
    if (!unit?.carrier) continue;
    const zSgn = unit.zSgn ?? (unit.isPort ? 1 : -1);
    const isPort = unit.isPort ?? zSgn > 0;
    const fBone = isPort ? BONES?.flipper_L : BONES?.flipper_R;

    const rackDrive = createRackAndPinionActuator({
      rackLen: 0.68,
      pitchRadius: 0.088,
      teeth: 14,
      faceWidth: 0.064,
      M,
      clipPlane,
    });
    rackDrive.group.position.set(0.05, -0.18, zSgn * 0.14);
    rackDrive.group.visible = false;
    unit.carrier.add(rackDrive.group);

    let rootAuxStrut = null;
    if (fBone && BONES?.thoracic) {
      const rSockA = makeLocalSocket(unit.carrier, [-0.08, -0.30, zSgn * 0.14]);
      const rSockB = makeLocalSocket(fBone, [0.34, -0.52, zSgn * 0.48]);
      rootAuxStrut = createGasStrut({
        parentGroup: BONES.thoracic,
        sockA: rSockA,
        sockB: rSockB,
        restLen: 0.58,
        cylRadius: 0.044,
        detachVec: [-0.12, -0.16, zSgn * 0.15],
        M,
        clipPlane,
      });
      rootAuxStrut.group.visible = false;
    }

    if (unit.scissorRig) {
      decorateLinkageWithMicroHardware(unit.scissorRig, {
        pinRadius: 0.036,
        lengthA: 0.48,
        lengthB: 0.48,
        thickness: 0.046,
        clevisGap: 0.052,
        M,
        clipPlane,
      });
    }
    if (unit.midScissorRig) {
      decorateLinkageWithMicroHardware(unit.midScissorRig, {
        pinRadius: 0.034,
        lengthA: 0.58,
        lengthB: 0.58,
        thickness: 0.044,
        clevisGap: 0.050,
        M,
        clipPlane,
      });
    }

    wingCarrierDrives.push({
      unit,
      zSgn,
      isPort,
      rackDrive,
      rootAuxStrut,
    });
  }

  // ============================================================================
  // 3. DETERMINISTIC PER-FRAME UPDATE
  // ============================================================================
  const lowerSlideOffsets = [0, 0];
  const gbSlideOffsets = [0, 0];

  function update({
    time = 0,
    mech = {},
    ex = 0,
    focus = {},
    motionScale = 1,
    kSonar = 0,
    kGear = 0,
    kWingL = 0,
    kWingR = 0,
  }) {
    // ------------------------------------------------------------------ 1. Subsystem A: Cranial (`S2.1`)
    const kCranialGate = Math.max(ex, focus.cranial ?? 0);
    const cranialVis = kCranialGate > 0.004;
    cranialBayGroup.visible = cranialVis;
    if (sonarTransducerSleeve) {
      sonarTransducerSleeve.group.visible = cranialVis;
    }

    if (cranialVis) {
      if (baleenArray?.update) {
        baleenArray.update(0.45 + 0.45 * Math.sin(time * 1.6), ex);
      }
      if (sonarTransducerSleeve) {
        sonarTransducerSleeve.update(kSonar);
      }

      const unlatch = clamp01(kCranialGate * 2.2);
      for (let i = 0; i < cranialLatches.length; i++) {
        cranialLatches[i].update(unlatch);
      }

      const kCranialEx = stagger(ex, 0.18);
      mandibleAccumulatorBank.update(kCranialEx);

      const upperSlide = -0.48 * kSonar;
      for (let i = 0; i < rostrumRails.length; i++) {
        rostrumRails[i].update(upperSlide, kCranialEx);
      }

      lowerSlideOffsets[0] = -0.35 - 0.95 * kSonar;
      lowerSlideOffsets[1] = 0.35 - 0.95 * kSonar;
      for (let i = 0; i < sonarRails.length; i++) {
        sonarRails[i].update(lowerSlideOffsets, kCranialEx);
      }

      sonarRackDrive.update(-0.95 * kSonar, kCranialEx);
    }

    const kEyeEx = stagger(ex, 0.22) * 0.45;
    const eyeYaw = mech.eyeGimbalYaw ?? 0;
    const eyePitch = mech.eyeGimbalPitch ?? 0;
    const eyeScan = mech.eyeScan ?? 0;
    for (let i = 0; i < eyeTurretDrives.length; i++) {
      const ed = eyeTurretDrives[i];
      ed.slewingRing.group.visible = cranialVis;
      ed.wormDrive.group.visible = cranialVis;
      if (cranialVis) {
        const gimbalAngle = (eyeYaw * 1.8 + eyePitch * 1.4 + eyeScan * 1.2) * ed.zSgn * motionScale;
        ed.slewingRing.update(gimbalAngle, kEyeEx);
        ed.wormDrive.update(gimbalAngle, kEyeEx);
      }
    }

    for (let i = 0; i < cranialGasStruts.length; i++) {
      const item = cranialGasStruts[i];
      item.strut.group.visible = cranialVis;
      if (cranialVis) {
        const kDec = stagger(ex, item.order);
        item.strut.update(kDec);
      }
    }

    // ------------------------------------------------------------------ 2. Subsystem B: Pectoral Gearbox & Wing (`S3.1`)
    const gearVis = kGear > 0.004;
    const flap = mech.flipperFlap ?? mech.flipperPitch ?? 0;
    const sweep = mech.flipperSweep ?? 0;
    const kGearEx = stagger(ex, 0.18);

    if (gbValveIsland) {
      gbValveIsland.group.visible = gearVis;
      if (gearVis) {
        gbValveIsland.update(kGear, kGearEx);
      }
    }

    for (let i = 0; i < shoulderSlewingItems.length; i++) {
      const item = shoulderSlewingItems[i];
      const kSide = item.zSgn > 0 ? kGear : kGearEx;
      const sideVis = gearVis && kSide > 0.004;
      item.ring.group.visible = sideVis;
      if (sideVis) {
        const carrierTheta =
          item.zSgn * (2.2 * sweep + 1.6 * flap) * motionScale + item.zSgn * time * 0.30;
        item.ring.update(-carrierTheta * 1.5, kSide * 0.42);
      }
    }

    gbSlideOffsets[0] = -0.86 - 0.42 * kGear;
    gbSlideOffsets[1] = 0.86 + 0.42 * kGear;
    for (let i = 0; i < gbGuideRails.length; i++) {
      const rail = gbGuideRails[i];
      rail.group.visible = gearVis;
      if (gearVis) {
        rail.update(gbSlideOffsets, kGearEx);
      }
    }

    for (let i = 0; i < gbWormCans.length; i++) {
      const item = gbWormCans[i];
      item.worm.group.visible = gearVis;
      if (gearVis) {
        const kSide = item.zSgn > 0 ? kGear : kGearEx;
        const carrierTheta =
          item.zSgn * (2.2 * sweep + 1.6 * flap) * motionScale + item.zSgn * time * 0.30;
        item.worm.group.position.z = item.zSgn * (1.18 + 0.36 * kSide);
        item.worm.update(carrierTheta, kSide * 0.5);
      }
    }

    if (gbPlumbing) {
      gbPlumbing.group.visible = gearVis;
    }
    if (lateralTrenchGroup) {
      lateralTrenchGroup.visible = gearVis;
      if (gearVis) {
        const trenchSlide = Math.sin(time * 1.8) * 0.22;
        for (let i = 0; i < lateralTrenchRails.length; i++) {
          lateralTrenchRails[i].update(trenchSlide, kGearEx);
        }
      }
    }

    const kWingDec = stagger(ex, 0.20);
    for (let i = 0; i < wingBayUnits.length; i++) {
      const wb = wingBayUnits[i];
      const kW = wb.isPort ? kWingL : kWingR;
      const wingVis = kW > 0.004;
      wb.wingGroup.visible = wingVis;
      wb.distGroup.visible = wingVis;
      if (wb.midHingeStrut) {
        wb.midHingeStrut.group.visible = wingVis;
      }
      if (wingVis) {
        if (wb.wingRibs?.update) {
          wb.wingRibs.update(flap, kW);
        }
        const unlatch = clamp01(kW * 2.2);
        for (let j = 0; j < wb.latches.length; j++) {
          wb.latches[j].update(unlatch);
        }
        if (wb.midHingeStrut) {
          wb.midHingeStrut.update(kWingDec);
        }
      }
    }

    for (let i = 0; i < wingCarrierDrives.length; i++) {
      const wc = wingCarrierDrives[i];
      const kW = wc.isPort ? kWingL : kWingR;
      const wingVis = kW > 0.004;
      wc.rackDrive.group.visible = wingVis;
      if (wc.rootAuxStrut) {
        wc.rootAuxStrut.group.visible = wingVis;
      }
      if (wingVis) {
        const rackTravel = ((flap * 0.34 + sweep * 0.28) * motionScale + 0.14 * kW) * wc.zSgn;
        wc.rackDrive.update(rackTravel, kWingDec);
        if (wc.rootAuxStrut) {
          wc.rootAuxStrut.update(kWingDec);
        }
      }
    }
  }

  return { update };
}
