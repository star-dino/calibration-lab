/**
 * Balaenoptera AQ-12 · Hydro-Mech Field Simulator (V7 Bathymetric Proving Expanse, Full-Envelope Subsystem Macros & Self-Test) · calibration-lab world.
 *
 * 5 scenes / 7 shots / 26.0 s deterministic field-simulator inspection & 6-tier 184-part teardown film:
 *   - Scene 01 (0.0–3.8s)  : BANKING -> CRUISE (45° FOV upward pass over pale bathymetric shelf ridges, 1.95m beacons & 0.88m AQ-ROV-02)
 *   - Scene 02 (3.8–7.8s)  : OPTICS OPEN (complete in-frame cranial teardown + 2-step servo sweep & 0.0° bore-axis lock)
 *   - Scene 03 (7.8–11.8s) : HYDROFOIL 22-PART TEARDOWN (complete in-frame wing/hub/gearbox teardown + calm central spar pitch sweep)
 *   - Scene 04 (11.8–17.4s): MHD 13-PART CORE -> TAIL FANNED (complete in-frame dorsal sandwich/MHD core & full 12-part fluke fan)
 *   - Scene 05 (17.4–26.0s): FULL 184-PART TEARDOWN + TURNTABLE -> REASSEMBLY -> LOW-ANGLE MEGALITHIC DEPARTURE
 */
import { resolveLook } from '/engine/look.js';
import { THREE, createCalLabStudio, resolveMechProfile } from '/styles/calibration-lab/kernel.js';
import { studioEnvironment } from '/styles/calibration-lab/sample/kit-compat.js';
import { buildWhale } from './whale-model.js';
import { createBathymetricProvingGround } from './whale-env.js';
import { createFieldSimulatorHud } from './whale-hud.js';
import { P as WP } from './palette.js';
import { G, mechAt, SEQ } from './kin.js';

const DEG2RAD = Math.PI / 180;

const STAGE_TOKENS = {
  bg: '#EAE7E1',
  ground: '#E7E3DC',
  mark: '#D1CAC0',
  shadow: '#58524A',
  surround: '#44484E',
  sun: '#FFF9F0',
  ink: '#22262E',
  shadowOpacity: 0.18,
};
const BENCH_FLOOR_Y = -6.45;
const WIDE_FOV = 45;
const KEY_LIGHT_DIR = new THREE.Vector3(-0.24, 0.78, 0.58).normalize();
const KEY_LIGHT_POS = KEY_LIGHT_DIR.clone().multiplyScalar(32).toArray();

const smoothStep5 = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const easeWin = (a, b, t) => smoothStep5((t - a) / Math.max(1e-6, b - a));
const windowEnvelope = (t0, t1, t2, t3, t) => easeWin(t0, t1, t) * (1 - easeWin(t2, t3, t));

const FILM_DUR = 26.0;
const TIMELINE_EVENTS = [
  { t: 0.0, seq: 'cruise', view: 'hero' },
  { t: 1.8, toggle: 'labels' },
  { t: 3.8, view: 'cranial' },
  { t: 7.8, seq: 'dive', view: 'pectoral' },
  { t: 11.8, view: 'dorsal' },
  { t: 14.5, view: 'caudal' },
  { t: 15.8, seq: 'cruise' },
  { t: 17.4, view: 'hero' },
  { t: 17.7, toggle: 'exploded' },
  { t: 17.9, toggle: 'orbit' },
  { t: 21.65, toggle: 'exploded' },
  { t: 22.5, toggle: 'orbit' },
  { t: 22.7, toggle: 'labels' },
];
const TOGGLE_KEYS = ['labels', 'section', 'xray', 'exploded', 'orbit'];

const subsystemTeardownAt = (t) => ({
  cranial: windowEnvelope(4.10, 5.15, 6.65, 7.60, t),
  pectoral: windowEnvelope(8.10, 9.15, 10.65, 11.60, t),
  dorsal: windowEnvelope(12.00, 12.85, 13.75, 14.40, t),
  caudal: windowEnvelope(14.75, 15.65, 16.55, 17.25, t),
});

const activeSeqAt = (t) => {
  const ev = TIMELINE_EVENTS.filter((x) => x.seq && x.t <= t).pop();
  return { seq: ev.seq, tau: (t - ev.t) % SEQ[ev.seq].dur };
};

const togglesAt = (t) => {
  const state = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, 0]));
  for (const ev of TIMELINE_EVENTS) {
    if (ev.toggle && ev.t <= t) state[ev.toggle] = state[ev.toggle] ? 0 : 1;
  }
  return state;
};

const latestToggleTime = (key, t) => TIMELINE_EVENTS.filter((e) => e.toggle === key && e.t <= t).pop()?.t ?? -10;
const smoothToggle = (key, t, span = 0.9) => {
  const on = togglesAt(t)[key];
  const k = easeWin(latestToggleTime(key, t), latestToggleTime(key, t) + span, t);
  return on ? k : 1 - k;
};

// Pre-integrate forward distance swum over the bathymetric proving range (halts smoothly during full turntable TEARDOWN)
const STEP_DT = 1 / 120;
const SWIM_TRACK = [0];
for (let i = 1; i * STEP_DT <= FILM_DUR + 1; i++) {
  const gt = (i - 0.5) * STEP_DT;
  const { seq, tau } = activeSeqAt(gt);
  const exAt = smoothToggle('exploded', gt, 1.35);
  SWIM_TRACK.push(SWIM_TRACK[i - 1] + mechAt(seq, tau, gt).speed * (1 - 0.92 * exAt) * STEP_DT * 0.38);
}
const swimDistAt = (t) => {
  const u = Math.max(0, Math.min(SWIM_TRACK.length - 2, t / STEP_DT));
  const idx = Math.floor(u);
  return SWIM_TRACK[idx] + (SWIM_TRACK[idx + 1] - SWIM_TRACK[idx]) * (u - idx);
};

// Multi-perspective Field Simulator Camera Rigs — each subsystem rig frames 100% of its exploded 3D bounding box inside screen bounds!
const camDrift = (base, u, { daz = 0, del = 0, push = 0.05, dur = 3.8 } = {}) => {
  const k = smoothStep5(Math.min(1, Math.max(0, u) / Math.max(0.1, dur)));
  return {
    ...base,
    az: base.az + daz * k,
    el: base.el + del * k,
    d: base.d * (1 - push * k),
  };
};

const CAMERA_RIGS = {
  // Act 1 & Act 5: Wide-angle (45° FOV) low-elevation (-11.0°) close-proximity upward pass over the bathymetric shelf & beacons
  hero: (u) =>
    camDrift(
      { tx: -0.95, ty: 0.14, tz: 0.15, az: -25, el: -11.0, d: 16.5, fov: WIDE_FOV, sx: 0, sy: -6 },
      u,
      { daz: 8.5, del: 2.5, push: 0.05, dur: 3.6 },
    ),
  // Act 2 (`OPTICS OPEN`): Full-envelope close-up centering split rostrum, lifted brow hood, 6-part sonar pod, pleats & 7-layer servo optic turret
  cranial: (u) =>
    camDrift(
      { tx: -7.15, ty: 0.58, tz: 0.85, az: -36, el: -4.5, d: 9.3, fov: WIDE_FOV, sx: 4, sy: -2 },
      u,
      { daz: 9.0, del: 3.5, push: 0.06, dur: 4.0 },
    ),
  // Act 3 (`HYDROFOIL 22-PART TEARDOWN`): Full-envelope diagonal close-up from planetary gearbox & shoulder hub all the way to flipper_L_05 tip
  pectoral: (u) =>
    camDrift(
      { tx: 0.35, ty: -1.48, tz: 3.95, az: -25, el: 7.5, d: 12.6, fov: WIDE_FOV, sx: 2, sy: 0 },
      u,
      { daz: 9.5, del: 4.5, push: 0.05, dur: 4.0 },
    ),
  // Act 4a (`MHD 13-PART STATOR`): Full-envelope close-up keeping lifted fin blades, dorsal sandwich & 13-part 6-ring copper stator 100% inside frame
  dorsal: (u) =>
    camDrift(
      { tx: 0.55, ty: 1.56, tz: 0.45, az: 18, el: 7.5, d: 9.5, fov: WIDE_FOV, sx: 0, sy: 0 },
      u,
      { daz: 8.5, del: -2.5, push: 0.06, dur: 2.7 },
    ),
  // Act 4b (`TAIL FANNED`): Full-envelope 3/4 macro capturing all 12 fanned composite fluke blades + spars + 7-layer peduncle gimbals unclipped
  caudal: (u) =>
    camDrift(
      { tx: 9.05, ty: 2.18, tz: 0.15, az: 22, el: -2.0, d: 10.4, fov: WIDE_FOV, sx: -2, sy: 0 },
      u,
      { daz: 8.0, del: 6.5, push: 0.06, dur: 2.9 },
    ),
};

const FULL_EXPLODE_RIG = { tx: -0.35, ty: 0.68, tz: 0.0, az: -56, el: -6.0, d: 23.6, fov: WIDE_FOV, sx: 0, sy: -6 };
const DEPART_RIG = { tx: -0.65, ty: 0.48, tz: -0.10, az: -18, el: -3.5, d: 17.0, fov: WIDE_FOV, sx: 0, sy: -2 };
const VIEW_CUTS = TIMELINE_EVENTS.filter((e) => e.view).map((e) => [e.t, e.view]);

const interpCam = (a, b, k, arcBump = true) => {
  const out = {};
  for (const key in b) {
    out[key] = key === 'az' ? a.az + (((b.az - a.az + 540) % 360) - 180) * k : a[key] + (b[key] - a[key]) * k;
  }
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  if (arcBump) out.d += Math.max(0, Math.max(a.d, b.d) + 1.2 * swing - out.d) * Math.sin(Math.PI * k) * swing;
  return out;
};

const evalCameraAt = (t, orbitAmt = 0, explodeAmt = 0) => {
  let idx = 0;
  while (idx < VIEW_CUTS.length - 1 && VIEW_CUTS[idx + 1][0] <= t) idx++;
  const cur = CAMERA_RIGS[VIEW_CUTS[idx][1]](t - VIEW_CUTS[idx][0]);
  let cam = { ...cur };
  if (idx > 0) {
    const k = easeWin(VIEW_CUTS[idx][0], VIEW_CUTS[idx][0] + 1.15, t);
    if (k < 1) cam = interpCam(CAMERA_RIGS[VIEW_CUTS[idx - 1][1]](t - VIEW_CUTS[idx - 1][0]), cur, k);
  }
  if (explodeAmt > 0.001) {
    cam = interpCam(cam, FULL_EXPLODE_RIG, explodeAmt, false);
  }
  // Genuine 3D Turntable sweep during 184-part TEARDOWN (sweeps from -56° low front-3/4 past -13.5° broadside-3/4 to +2°)
  if (t >= 17.7 && t <= 22.8) {
    const uTurn = Math.min(1, Math.max(0, (t - 17.7) / 4.3));
    const kTurn = smoothStep5(uTurn);
    const activeTurn = Math.max(orbitAmt, explodeAmt);
    cam.az += 58 * kTurn * activeTurn;
    cam.el += 12.5 * Math.sin(Math.PI * kTurn) * activeTurn;
  }
  if (t > 22.6) {
    const kDep = easeWin(22.6, 25.4, t);
    cam = interpCam(cam, DEPART_RIG, kDep, false);
  }
  return cam;
};

const currentViewCut = (t) => VIEW_CUTS.filter(([tCut]) => tCut <= t).pop();

// Automated Operator Cursor Timeline targeting Field Simulator Right-Rail Pills
const CURSOR_SCRIPT = [
  { t: 1.8, id: 'disp:labels' },
  { t: 3.8, id: 'asm:cranial' },
  { t: 7.8, id: 'asm:pectoral' },
  { t: 14.5, id: 'asm:caudal' },
  { t: 17.7, id: 'disp:exploded' },
  { t: 18.0, id: 'disp:turntable' },
  { t: 21.65, id: 'disp:exploded' },
  { t: 22.6, id: 'asm:hero' },
];

function operatorCursorAt(t) {
  if (t < 1.1 || t > 24.0) return null;
  let i = -1;
  while (i + 1 < CURSOR_SCRIPT.length && CURSOR_SCRIPT[i + 1].t <= t) i++;
  const next = CURSOR_SCRIPT[i + 1];
  const prev = i >= 0 ? CURSOR_SCRIPT[i] : { t: 1.1, id: 'asm:hero' };
  const fade = easeWin(1.1, 1.5, t) * (1 - easeWin(23.3, 24.0, t));
  if (next && next.t - t < 0.52) {
    const mk = easeWin(next.t - 0.52, next.t - 0.05, t);
    return { fromId: prev.id, toId: next.id, moveK: mk, opacity: fade, press: 0, ring: 0 };
  }
  const dt = t - prev.t;
  const press = i >= 0 && dt < 0.12 ? 1 : 0;
  const ring = i >= 0 && dt < 0.55 ? 1 - dt / 0.55 : 0;
  return { fromId: prev.id, toId: prev.id, moveK: 1, opacity: fade, press, ring };
}

export default async function createWorld({ width, height, scenes = [], style = {} } = {}) {
  const isThreeView = !!style?.look?.threeView;
  const refPal = style.ref && style.ref.palette ? style.ref.palette : {};
  const bgHex = refPal.background || STAGE_TOKENS.bg;

  const whaleStageLook = {
    color: { output: 'srgb', toneMapping: 'linear', exposure: 0.89 },
    light: {
      illuminance: 1.16,
      keyRatio: 3.0,
      key: {
        color: STAGE_TOKENS.sun,
        pos: KEY_LIGHT_POS,
        shadow: {
          type: 'vsm',
          mapSize: 2048,
          extent: [26, 26],
          near: 2,
          far: 76,
          bias: -0.0004,
          normalBias: 0.006,
          radius: 6,
          blurSamples: 16,
        },
      },
      bounce: { color: '#FAF8F3', pos: [-6, -4, 24], share: 0.56 },
      rim: { color: '#E2EAF5', pos: [-15, 14, -12], ratio: 0.46 },
    },
    env: { enabled: true, share: 0.72, softbox: 3.8, studioStrips: false, surround: STAGE_TOKENS.surround },
    backdrop: { color: bgHex, fog: 0.0036 },
    contact: { enabled: false },
    ao: {
      enabled: true,
      intensity: 0.32,
      radius: 0.62,
      thickness: 1.0,
      distanceExponent: 1.6,
      distanceFallOff: 1.0,
      scale: 0.80,
      resolutionScale: 1.0,
      samples: 16,
      denoiseRadius: 6,
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      inkStrength: 0.09,
      inkColor: STAGE_TOKENS.ink,
    },
  };

  const studio = createCalLabStudio({
    width,
    height,
    scenes,
    style: { ...style, look: resolveLook(whaleStageLook, style.look) },
    maxDist: null,
  });
  studio.bench.visible = false;
  studio.scene.add(studio.camera);
  const camera = studio.camera;
  const scene = studio.scene;

  const hud = createFieldSimulatorHud({ camera, width, height });

  const provingGround = createBathymetricProvingGround({
    scene,
    baseY: BENCH_FLOOR_Y,
    bgHex,
    sunDir: KEY_LIGHT_DIR,
    shadowColor: STAGE_TOKENS.shadow,
    shadowOpacity: STAGE_TOKENS.shadowOpacity,
  });

  const rawMech = style?.look?.mech ?? style?.mech ?? style?.ref?.mech;
  const mechProfile = resolveMechProfile(rawMech === undefined ? 'kinetic' : rawMech);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.08);
  const whale = await buildWhale({ clipPlane, studio, mechProfile });
  const tdEnv = studioEnvironment(studio.renderer, { surround: WP.stage.surround, floor: WP.stage.envFloor });
  whale.root.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m.isMeshStandardMaterial || m.userData.tdEnv) continue;
      m.userData.tdEnv = true;
      m.userData.lookEnv = false;
      m.envMap = tdEnv;
      m.envMapIntensity = (m.envMapIntensity ?? 1) * WP.stage.envIntensity * 1.22;
      m.needsUpdate = true;
    }
  });

  const subjectRoot = new THREE.Group();
  subjectRoot.name = 'MechWhaleRoot';
  subjectRoot.add(whale.root);
  scene.add(subjectRoot);

  // Director shot list for multi-aspect framing (9:16, 1:1) & 7-shot storyboard generation
  const subjects = {
    whale: { center: [0.25, 0.18, 0.0], size: [22.4, 8.4, 6.2] },
    cranialCore: { center: [-7.15, 0.88, 0.85], size: [7.4, 6.0, 5.2] },
    pectoralDrive: { center: [0.35, -1.54, 3.95], size: [8.0, 7.4, 8.4] },
    dorsalReactor: { center: [0.55, 1.75, 0.45], size: [7.8, 5.6, 4.4] },
    caudalFlukes: { center: [9.05, 2.15, 0.15], size: [8.2, 6.4, 9.8] },
    explodedWhale: { center: [0.35, 0.85, 0.0], size: [29.8, 11.8, 14.2] },
  };
  const shots = {
    'hero-cruise': [{ subject: 'whale', size: 'full', fill: 0.84, fov: 42, minY: -5.4, angle: -21, height: -9, move: 'push', amount: 0.20 }],
    'cranial-teardown': [{ subject: 'cranialCore', size: 'close', fill: 0.82, fov: 42, minY: -5.4, angle: -32, height: -3, move: 'push', amount: 0.18 }],
    'pectoral-teardown': [{ subject: 'pectoralDrive', size: 'medium', fill: 0.82, fov: 42, minY: -5.4, angle: -22, height: 8, move: 'push', amount: 0.18 }],
    'dorsal-caudal': [
      { dur: 2.7, subject: 'dorsalReactor', size: 'close', fill: 0.82, fov: 42, minY: -5.4, angle: 20, height: 7, move: 'push', amount: 0.18 },
      { subject: 'caudalFlukes', size: 'medium', fill: 0.82, fov: 42, minY: -5.4, angle: 25, height: 2, move: 'push', amount: 0.18 },
    ],
    'full-teardown': [
      { dur: 5.0, subject: 'explodedWhale', size: 'full', fill: 0.84, fov: 42, minY: -5.4, angle: -14, height: 3, move: 'orbit', amount: 1.4 },
      { subject: 'whale', size: 'full', fill: 0.84, fov: 42, minY: -5.4, angle: -23, height: -9, move: 'push', amount: 0.20 },
    ],
  };
  const director = studio.director({ subjects, shots });

  const isWideAspect = camera.aspect >= 1.5;
  const tmpVec = new THREE.Vector3();

  function applyExactCamera(cam, W, H) {
    const targetFov = cam.fov ?? WIDE_FOV;
    if (Math.abs(camera.fov - targetFov) > 1e-4) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
    const tanHalfFov = Math.tan((camera.fov * DEG2RAD) / 2);
    const az = cam.az * DEG2RAD;
    const el = cam.el * DEG2RAD;
    camera.position.set(
      cam.tx + cam.d * Math.cos(el) * Math.sin(az),
      cam.ty + cam.d * Math.sin(el),
      cam.tz + cam.d * Math.cos(el) * Math.cos(az),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    const scale = W / 1600;
    const nx = ((cam.sx ?? 0) * scale) / (W / 2);
    const ny = ((cam.sy ?? 0) * scale) / (H / 2);
    if (nx !== 0) camera.rotateY(Math.atan(nx * tanHalfFov * (W / H)));
    if (ny !== 0) camera.rotateX(Math.atan(ny * tanHalfFov));
    camera.updateMatrixWorld(true);
  }

  // Surgical, Assembly-Specific 3D Callout Sets (tracks moving/detaching sockets with zero visual clutter)
  function buildCalloutsForMode(viewName, explodeAmt, focusExplode, labelsAlpha) {
    if (labelsAlpha <= 0.02) return [];
    const S = whale.sockets;
    const isKin = !!mechProfile.enabled;
    if (explodeAmt > 0.35) {
      return [
        { target: S.sonarPod, label: '6-PART SONAR POD', sub: isKin ? '4-BAR LINKAGE · PHASED RADOME' : 'RADOME · WAFER · TITANIUM BELL', side: 'left', dy: -88, accent: true, opacity: labelsAlpha },
        { target: isKin && S.shoulderGearbox ? S.shoulderGearbox : S.gearbox, label: isKin ? 'EPICYCLIC GEARBOX & WING' : '9-PART GEARBOX & WING', sub: isKin ? 'PLANETARY CARRIER · 4-BAR FOIL' : 'CASING · SPLINE · 22-PART FOIL', side: 'left', dy: 76, opacity: labelsAlpha },
        { target: S.mhdCore, label: '13-PART MHD STATOR', sub: isKin ? '12-VANE LOUVERS · 6 COPPER RINGS' : 'SHROUDS · 6 COPPER RINGS · ROTOR', side: 'right', dy: -88, accent: true, opacity: labelsAlpha },
        { target: S.tailSpine, label: isKin ? 'CARDAN YOKE & SPINE' : '7-LAYER HUBS & SPINE', sub: isKin ? 'UNIVERSAL SPIDERS · SPRING DAMPERS' : 'CERAMIC SHELLS + TITANIUM TRUSSES', side: 'right', dy: 80, opacity: labelsAlpha },
      ];
    }
    if (viewName === 'cranial' || focusExplode.cranial > 0.15) {
      return [
        { target: S.opticsLens, label: 'SAPPHIRE MENISCUS', sub: isKin ? '10-BLADE SYNC IRIS · 7-LAYER TURRET' : '7-LAYER COAXIAL OPTIC TURRET', side: 'right', dy: -84, accent: true, opacity: labelsAlpha },
        { target: S.opticsBarrel, label: 'FASTENER & SEAL RINGS', sub: '8-BOLT FLANGE · STATOR RACE', side: 'right', dy: 78, opacity: labelsAlpha },
        { target: S.sonarPod, label: '6-PART SONAR RADOME', sub: isKin ? '4-BAR COUPLER · PHASED TRANSDUCER' : 'SPLIT CONE · PHASED TRANSDUCER', side: 'left', dy: -70, accent: true, opacity: labelsAlpha },
      ];
    }
    if (viewName === 'pectoral' || focusExplode.pectoral > 0.15) {
      return [
        { target: isKin && S.shoulderGearbox ? S.shoulderGearbox : S.gearbox, label: isKin ? 'EPICYCLIC TWIN GEARBOX' : '9-PART TWIN GEARBOX', sub: isKin ? 'SUN-PLANET CARRIER · SPLINE OUTPUT' : 'LIFTED COVER · SPLINE OUTPUT', side: 'left', dy: -78, opacity: labelsAlpha },
        { target: S.wingRoot, label: '3-STAGE SPLINE HUB', sub: isKin ? '4-BAR SCISSOR · COIL DAMPER' : 'BRONZE COLLAR · LOCK RING', side: 'left', dy: 68, accent: true, opacity: labelsAlpha },
        { target: S.wingSpar, label: '22-PART HYDROFOIL WING', sub: '5 FAIRINGS + TRUSSES + TI SPAR', side: 'right', dy: 70, accent: true, opacity: labelsAlpha },
      ];
    }
    if (viewName === 'dorsal' || focusExplode.dorsal > 0.15) {
      return [
        { target: S.mhdCore, label: '13-PART MHD STATOR', sub: isKin ? '6 COPPER RINGS · 12-VANE LOUVERS' : '6 SOLID COPPER RINGS · FLUTED ROTOR', side: 'right', dy: -90, accent: true, opacity: labelsAlpha },
        { target: S.gearbox, label: 'TITANIUM BACKING TRUSS', sub: 'DUAL-LAYER ARMOR SANDWICH', side: 'left', dy: 82, opacity: labelsAlpha },
      ];
    }
    if (viewName === 'caudal' || focusExplode.caudal > 0.15) {
      return [
        { target: S.flukeFan, label: '12-PART FLUKE ARRAY', sub: isKin ? '4-BAR FAN LINKS · 6 TI SPARS' : '6 COMPOSITE BLADES + 6 TI SPARS', side: 'right', dy: -76, accent: true, opacity: labelsAlpha },
        { target: S.tailSpine, label: isKin ? 'CARDAN PEDUNCLE YOKE' : '7-LAYER PEDUNCLE HUB', sub: isKin ? 'UNIVERSAL SPIDER · COIL DAMPERS' : 'COAXIAL RACE · BELLOWS COLLARS', side: 'left', dy: 76, opacity: labelsAlpha },
      ];
    }
    return [
      { target: S.opticsLens, label: 'HYDRO-OPTIC TURRET', sub: '7-LAYER COAXIAL GIMBAL', side: 'left', dy: -80, opacity: labelsAlpha },
      { target: S.wingSpar, label: 'PECTORAL HYDROFOIL', sub: '22-PART COMPOSITE WING', side: 'left', dy: 76, accent: true, opacity: labelsAlpha },
      { target: S.mhdCore, label: 'MHD STATOR WINDOW', sub: '6-RING COPPER THRUSTER BAY', side: 'right', dy: -80, opacity: labelsAlpha },
    ];
  }

  function render(frame = { t: 0, sceneIndex: 0, localT: 0 }) {
    const t = frame.t ?? frame.globalT ?? 0;
    const { seq, tau } = activeSeqAt(t);
    const m = mechAt(seq, tau, isThreeView ? null : t);
    const tog = togglesAt(t);
    const explode = isThreeView ? (t >= 18.0 ? 1.0 : 0.0) : smoothToggle('exploded', t, 1.35);
    const orbitAmt = isThreeView ? 0 : smoothToggle('orbit', t, 1.1);
    const focusExplode = isThreeView
      ? { cranial: 0, pectoral: 0, dorsal: 0, caudal: 0 }
      : subsystemTeardownAt(t);
    const xray = smoothToggle('xray', t, 0.7);

    director.update(frame);
    let camDist;
    if (isThreeView) {
      const cam3 =
        t < 4.0
          ? { tx: 0.25, ty: 0.10, tz: 0.0, az: -15, el: -3.0, d: 35.5, fov: 28, sx: 0, sy: 0 }
          : t < 8.0
            ? { tx: 0.45, ty: 0.50, tz: 0.0, az: 0, el: 88.5, d: 36.0, fov: 28, sx: 0, sy: 0 }
            : t < 12.0
              ? { tx: 0.20, ty: 0.05, tz: 0.0, az: -89.5, el: 2, d: 26.5, fov: 28, sx: 0, sy: 0 }
              : t < 18.0
                ? { tx: 3.80, ty: 1.15, tz: 0.0, az: 36, el: 18, d: 26.5, fov: 28, sx: 0, sy: 0 }
                : { tx: 0.35, ty: 0.85, tz: 0.0, az: -14, el: 14, d: 44.5, fov: 28, sx: 0, sy: 2 };
      applyExactCamera(cam3, width, height);
      camDist = cam3.d;
    } else if (isWideAspect) {
      const cam = evalCameraAt(t, orbitAmt, explode);
      applyExactCamera(cam, width, height);
      camDist = cam.d;
    } else {
      camera.updateMatrixWorld(true);
      camDist = camera.getWorldPosition(tmpVec).length();
    }

    whale.update({
      time: t,
      mech: m,
      dist: swimDistAt(t),
      explode,
      focusExplode,
      xray,
      section: !!tog.section,
      turntable: orbitAmt,
      camDist,
      isOrthoCheck: isThreeView && t >= 4.0 && t < 12.0,
    });

    const tgt = camera.getWorldDirection(tmpVec).multiplyScalar(camDist).add(camera.position);
    const focusMacro = Math.max(
      focusExplode.cranial,
      focusExplode.pectoral * 0.55,
      focusExplode.dorsal,
      focusExplode.caudal,
    );
    provingGround.update({
      time: t,
      swim: swimDistAt(t),
      centerX: tgt.x,
      centerZ: tgt.z,
      explode,
      focusMacro,
      isThreeView,
      flightOffset: m.flightOffset,
    });

    // Derive Field Simulator Headline, Mode Badges & Callouts
    const [vt0, viewName] = currentViewCut(t);
    const labelsAlpha = smoothToggle('labels', t, 0.45) * easeWin(vt0 + 0.35, vt0 + 0.85, t);
    const anyDatum =
      explode > 0.08 ||
      focusExplode.cranial > 0.08 ||
      focusExplode.pectoral > 0.08 ||
      focusExplode.dorsal > 0.08 ||
      focusExplode.caudal > 0.08;

    let headline = 'CRUISE';
    let subHeadline = '23.0M LEVIATHAN · LOW-ELEVATION PROXIMITY PASS';
    let modeBadge = 'CRUISE';
    let operatorNote = 'OPERATOR · HYDROFOIL TRIM';
    let activeAssembly = 'hero';

    if (t < 2.2 && !isThreeView) {
      headline = 'BANKING';
      subHeadline = 'BANK +18° · 680T DISPLACEMENT · ENTERING VOLUME';
      modeBadge = 'BANKING';
      operatorNote = 'OPERATOR · BANKING ENTRY';
    } else if (explode > 0.12 || (t >= 17.8 && t < 22.3)) {
      const reassembling = t >= 21.0 && !isThreeView;
      headline = reassembling ? 'REASSEMBLY' : 'TEARDOWN';
      subHeadline = `TURNTABLE · ${Math.round(explode * 100)}% APART · 184 PARTS`;
      modeBadge = reassembling ? 'REASSEMBLY' : '184-PART';
      operatorNote = reassembling ? 'OPERATOR · EXPLODED OFF · REASSEMBLE' : 'OPERATOR · FULL 6-TIER COMPONENT EXPLODE';
      activeAssembly = 'none';
    } else if (t >= 23.0 && !isThreeView) {
      headline = 'DEPARTING';
      subHeadline = 'BANK -22° · LOW-ANGLE MEGALITHIC SURGE';
      modeBadge = 'DEPARTING';
      operatorNote = 'OPERATOR · HERO · RELEASE';
    } else if (viewName === 'cranial') {
      headline = 'OPTICS OPEN';
      subHeadline = m.eyeLocked
        ? mechProfile.enabled
          ? 'BORE LOCKED 0.0° · 10-BLADE IRIS & 4-BAR SONAR'
          : 'BORE LOCKED 0.0° · 7-LAYER TURRET & 6-PART SONAR'
        : mechProfile.enabled
          ? 'SERVO SWEEP · 10-BLADE IRIS & 4-BAR SONAR'
          : 'SERVO SWEEP · 7-LAYER TURRET & 6-PART SONAR';
      modeBadge = m.eyeLocked ? 'BORE LOCKED' : 'OPTICS OPEN';
      operatorNote = 'OPERATOR · ISOLATE CRANIAL & GIMBAL LOCK';
      activeAssembly = 'cranial';
    } else if (viewName === 'pectoral') {
      headline = 'HYDROFOIL OFF';
      subHeadline = mechProfile.enabled
        ? 'SPAR PITCH CAL · PLANETARY GEARBOX & 4-BAR WING'
        : 'SPAR PITCH CAL · 22-PART WING · 9-PART GEARBOX';
      modeBadge = '22-PART WING';
      operatorNote = 'OPERATOR · FULL HYDROFOIL SPAR SWEEP';
      activeAssembly = 'pectoral';
    } else if (viewName === 'dorsal') {
      headline = 'STATOR OPEN';
      subHeadline = mechProfile.enabled
        ? '13-PART MHD CORE · 12-VANE LOUVERS & 6 RINGS'
        : '13-PART MHD CORE · 6 SOLID COPPER RINGS';
      modeBadge = '13-PART MHD';
      operatorNote = 'OPERATOR · EXPLODE STATOR CORE';
      activeAssembly = 'hero';
    } else if (viewName === 'caudal') {
      headline = 'TAIL FANNED';
      subHeadline = mechProfile.enabled
        ? '12-PART FLUKE ARRAY · CARDAN YOKES & DAMPERS'
        : '12-PART FLUKE ARRAY · 7-LAYER PEDUNCLE GIMBALS';
      modeBadge = 'TAIL FANNED';
      operatorNote = 'OPERATOR · ISOLATE CAUDAL PARTS';
      activeAssembly = 'caudal';
    }

    hud.fit();
    hud.draw({
      time: t,
      dur: FILM_DUR,
      compact: isThreeView,
      accent: studio.refPalette?.accent || '#F26419',
      title: 'Balaenoptera AQ-12',
      subtitle: 'ARTICULATED HYDROFOIL CETACEAN / FIELD SIMULATOR',
      modeBadge,
      headline,
      subHeadline,
      operatorNote,
      mech: m,
      detached: explode > 0.25,
      opticsOpen: focusExplode.cranial > 0.15 || explode > 0.25,
      wingOff: focusExplode.pectoral > 0.15 || explode > 0.25,
      reactorOpen: focusExplode.dorsal > 0.15 || explode > 0.25,
      tailFanned: focusExplode.caudal > 0.15 || explode > 0.25,
      activeAssembly,
      labelsOn: labelsAlpha > 0.2,
      explodedOn: explode > 0.2,
      datumOn: anyDatum,
      turntableOn: orbitAmt > 0.2 || explode > 0.2,
      callouts: buildCalloutsForMode(viewName, explode, focusExplode, labelsAlpha),
      cursor: isThreeView ? null : operatorCursorAt(t),
    });

    studio.render(frame);
  }

  render({ t: 0, sceneIndex: 0, localT: 0, scene: scenes[0] });

  return {
    canvas: studio.canvas,
    scene,
    camera,
    subjectRoot,
    render,
    storyboard: () => director.storyboard(),
  };
}
