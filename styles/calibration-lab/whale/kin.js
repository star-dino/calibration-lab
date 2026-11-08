// Kinematics, hydro-flight dynamics, articulated bone-chain solver & field simulator telemetry
// for Mechanical Cetacean V5 (Balaenoptera AQ-12 · Field Simulator).
// Real engineering units (m, MPa, kN, kW, Hz). Pure deterministic functions of (seq, tau, globalT).

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const smooth5 = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smooth((t - a) / Math.max(1e-6, b - a));
const ss5 = (a, b, t) => smooth5((t - a) / Math.max(1e-6, b - a));

export const G = {
  length: 23.0,            // m overall length (rostrum tip to caudal fluke notch)
  wingspan: 10.6,          // m pectoral hydrofoil tip-to-tip span
  hullHeight: 8.25,        // m vertical span in hero frame
  hullBeam: 4.44,          // m maximum beam across barrel chest & shoulder hubs
  mass: 680,               // t submerged displacement
  maxDepth: 4500,          // m abyssal rated depth
  cruiseDepth: 480,        // m mesopelagic calibration depth (4.8 MPa)
  rostrumTip: [-9.655, 2.046, 0.0],
  eyeHub: [-4.956, 1.266, 1.880],
  shoulderHub: [-2.314, 0.713, 1.880],
  flipperDistHub: [0.216, -1.424, 3.619],
  dorsalFin: [2.450, 2.783, 0.0],
  midHub: [4.286, 0.267, 1.120],
  aftHub: [7.236, 0.695, 0.660],
  flukeHub: [9.380, 1.720, 0.380],
  flukeTip: [11.550, 3.680, 3.600],
  bulkheadCount: 5,
  pleatCount: 7,
  maxThrust: 340,          // kN peak caudal hydrofoil thrust
};

// Structural Spine Station Reference Table (x, y_center, y_trench, rY, rZ)
export const BULKHEAD_STATIONS = [
  { idx:  0, u: 0.075, x: -8.042, y: 1.726, yTr: 1.616, rY: 0.92, rZ: 1.16 },
  { idx:  1, u: 0.145, x: -6.536, y: 1.408, yTr: 1.406, rY: 1.34, rZ: 1.57 },
  { idx:  2, u: 0.205, x: -5.246, y: 1.188, yTr: 1.268, rY: 1.56, rZ: 1.74 },
  { idx:  3, u: 0.275, x: -3.740, y: 0.977, yTr: 0.936, rY: 1.68, rZ: 1.81 },
  { idx:  4, u: 0.335, x: -2.450, y: 0.838, yTr: 0.713, rY: 1.70, rZ: 1.82 },
  { idx:  5, u: 0.420, x: -0.622, y: 0.727, yTr: 0.528, rY: 1.62, rZ: 1.69 },
  { idx:  6, u: 0.510, x:  1.314, y: 0.636, yTr: 0.393, rY: 1.49, rZ: 1.49 },
  { idx:  7, u: 0.585, x:  2.927, y: 0.534, yTr: 0.313, rY: 1.36, rZ: 1.28 },
  { idx:  8, u: 0.655, x:  4.432, y: 0.427, yTr: 0.267, rY: 1.19, rZ: 1.07 },
  { idx:  9, u: 0.725, x:  5.938, y: 0.534, yTr: 0.409, rY: 0.93, rZ: 0.87 },
  { idx: 10, u: 0.792, x:  7.379, y: 0.838, yTr: 0.695, rY: 0.75, rZ: 0.66 },
  { idx: 11, u: 0.855, x:  8.734, y: 1.427, yTr: 1.302, rY: 0.60, rZ: 0.49 },
];

export const SEQ = {
  cruise: {
    dur: 8.0,
    from: 'HYDROFOIL BANK',
    to: 'LEVEL CRUISE',
    depth(tau) {
      return 480 + 18 * Math.sin((tau / 8.0) * Math.PI * 2);
    },
  },
  dive: {
    dur: 8.0,
    from: '480 M MESOPELAGIC',
    to: '1,240 M BATHYAL',
    depth(tau) {
      const d = ss(0.4, 4.3, tau) * (1 - 0.75 * ss(5.4, 7.8, tau));
      return 480 + 760 * d;
    },
  },
};

export function phaseAt(seq, tau) {
  if (seq === 'cruise') {
    if (tau < 2.2) return 'HYDROFOIL BANKING ENTRY & SONAR LOCK';
    if (tau < 5.2) return 'CAUDAL TORQUE STROKE & LAMINAR TRIM';
    return 'PECTORAL HYDROFOIL GLIDE';
  }
  if (tau < 2.6) return 'SUB-ASSEMBLY ISOLATION & DATUM TRACK';
  if (tau < 5.4) return 'MHD STATOR COUPLED · TORQUE VERIFIED';
  return 'HYDROFOIL RE-TRIM & ASCENT';
}

export function stateBadge(seq, stroke, depth) {
  if (seq === 'dive' && depth > 900) {
    return ['BATHYAL TRIM', `DEPTH ${Math.round(depth)} M · ${(depth * 0.01006).toFixed(1)} MPA`, 'warn'];
  }
  if (stroke > 0.62) {
    return ['CAUDAL DRIVE', `THRUST ${Math.round(72 + stroke * 268)} KN · PHASE LOCKED`, 'warn'];
  }
  return ['CRUISE', `DEPTH ${Math.round(depth)} M · SONAR LOCKED`, 'ok'];
}

export function mechAt(seq, tau, globalT = null) {
  const S = SEQ[seq] || SEQ.cruise;
  const isStaticOrtho = globalT === null;
  const gt = isStaticOrtho ? 0.35 : globalT;

  const winEnv = (t0, t1, t2, t3) => ss5(t0, t1, gt) * (1 - ss5(t2, t3, gt));

  // 5-Act Field Simulator Behavioral Envelopes:
  //   - Act 1 (0.0–2.4s)  : Smooth 3D Banking Glide Entry (`entryEnv`) leveling into cruise
  //   - Act 2 (3.8–7.8s)  : Calm Hover-Trim for Coaxial Optics & Sonar Nose Pod Inspection (`opticsEnv`)
  //   - Act 3 (7.8–11.8s) : Active Pectoral Hydrofoil Stroke while Detached 50% Apart (`wingEnv`)
  //   - Act 4 (11.8–17.4s): MHD Stator Spin & Caudal Fanning Stroke (`tailEnv`)
  //   - Act 5 (22.6–26.0s): Post-Reassembly Power Surge & Banking Departure (`departEnv`)
  const entryEnv = isStaticOrtho ? 0 : 1 - ss5(0.0, 2.55, gt);
  const opticsEnv = isStaticOrtho ? 0 : winEnv(3.9, 4.7, 6.9, 7.7);
  const wingEnv = isStaticOrtho ? 0 : winEnv(7.9, 8.8, 10.9, 11.7);
  const dorsalEnv = isStaticOrtho ? 0 : winEnv(11.9, 12.6, 13.8, 14.4);
  const tailEnv = isStaticOrtho ? 0 : winEnv(14.5, 15.3, 16.7, 17.3);
  const departBankEnv = isStaticOrtho ? 0 : ss5(23.1, 25.6, gt);
  const departMoveEnv = isStaticOrtho ? 0 : ss5(24.15, 26.0, gt);
  const departSurge = isStaticOrtho ? 0 : ss5(22.4, 24.4, gt);

  const swimPhase = gt * 1.66 + 0.38 * departSurge;
  const breathPhase = gt * 1.08;
  const cWave = (ph) => Math.sin(ph) + 0.12 * Math.sin(2.0 * ph - 0.65);
  const dWave = (ph) => Math.cos(ph) + 0.24 * Math.cos(2.0 * ph - 0.65);

  const breathWave = 0.5 + 0.5 * Math.sin(breathPhase - 0.5);
  const strokeWave = 0.5 + 0.46 * cWave(swimPhase);

  // Stabilize torso heave during close-up subsystem inspections so exploded assemblies stay framed rock-steady
  const inspectHold = Math.max(opticsEnv, wingEnv * 0.85, dorsalEnv * 0.90, tailEnv * 0.65);
  const calmFactor = 1.0 - 0.48 * inspectHold;
  const stroke = clamp((0.26 + 0.68 * strokeWave) * calmFactor + 0.22 * departSurge, 0.12, 1.0);
  const intake = clamp(0.20 + 0.60 * breathWave, 0.12, 0.90);
  const depth = S.depth(tau);
  const speed = Number((5.2 + 3.4 * strokeWave * calmFactor + 3.2 * departSurge).toFixed(2));
  const pressure = Number((depth * 0.01006).toFixed(2));
  const thrust = Math.round(68 + stroke * 260 + departSurge * 65);
  const knots = Number((speed * 1.94384).toFixed(1));
  const rotorRpm = Math.round(1260 + stroke * 2240 + departSurge * 620);

  // Spatial trajectory offsets (rostrum points toward -X; swimming forward moves toward -X)
  const entryCurve = entryEnv * entryEnv;
  const depCurve = departMoveEnv * departMoveEnv;
  const flightOffset = {
    x: 4.4 * entryCurve - 8.2 * depCurve,
    y: 1.25 * entryCurve + 1.38 * departBankEnv + 0.45 * depCurve,
    z: -1.55 * entryCurve - 2.05 * depCurve,
  };

  // Whole-body 3D attitude (banking roll, turning yaw, diving pitch)
  const bankRoll =
    0.34 * entryEnv -
    0.10 * wingEnv +
    Math.sin(gt * 0.9) * 0.035 * (1 - opticsEnv) -
    0.40 * departBankEnv;
  const turnYaw = 0.22 * entryEnv - 0.06 * opticsEnv - 0.26 * departBankEnv;
  const trimPitch = -0.08 * entryEnv - 0.11 * departBankEnv;

  const tailBoost = (1.16 + 0.18 * tailEnv + 0.24 * departSurge) * calmFactor;
  const wingBoost = 1.12 + 0.34 * wingEnv + 0.25 * entryEnv + 0.28 * departBankEnv;

  const lumLag = 0.54;
  const pedLag = 0.98;
  const flkLag = 1.62;

  const bodyHeave = cWave(swimPhase) * 0.28 * calmFactor;
  const bodyPitch = dWave(swimPhase) * 0.038 * calmFactor + trimPitch;
  const bodyRoll = bankRoll;
  const bodyYaw = turnYaw;

  const cranialPitch = -cWave(swimPhase - 0.30) * 0.026 * calmFactor - 0.018 * opticsEnv;
  const jawOpen = (0.12 + 0.88 * breathWave) * 0.014 + opticsEnv * 0.028;
  const pleatSurge = 0.55 + 0.25 * breathWave;

  // Calibration Self-Test 1: Smooth full-stroke central titanium spar pitch sweep during Scene 03 (`wingEnv`)
  const calWingSweep = Math.sin((gt - 8.35) * 1.95);
  const swimFlap = cWave(swimPhase - 0.50) * 0.175 * wingBoost;
  const swimSweep = dWave(swimPhase - 0.50) * 0.115 * wingBoost;
  const flipperFlap = swimFlap * (1 - wingEnv) + calWingSweep * 0.24 * wingEnv;
  const flipperSweep = swimSweep * (1 - wingEnv) + (0.08 + Math.cos((gt - 8.35) * 1.95) * 0.13) * wingEnv;
  const flipperYaw = dWave(swimPhase - 0.50) * 0.072 * wingBoost * (1 - 0.65 * wingEnv);
  const flipperDistFlap = cWave(swimPhase - 1.32) * 0.155 * wingBoost * (1 - 0.55 * wingEnv) + calWingSweep * 0.12 * wingEnv;
  const flipperDistSweep = dWave(swimPhase - 1.32) * 0.082 * wingBoost * (1 - 0.55 * wingEnv);

  const lumbarPitch = cWave(swimPhase - lumLag) * 0.140 * tailBoost - 0.052;
  const pedunclePitch = cWave(swimPhase - pedLag) * 0.205 * tailBoost - 0.076;
  const flukePitch = (cWave(swimPhase - flkLag) * 0.255 + dWave(swimPhase - pedLag) * 0.052) * tailBoost - 0.072;
  const flukeHeave = cWave(swimPhase - pedLag) * 0.44 * tailBoost;

  // Calibration Self-Test 2: 2-step damped servo target-acquisition sweep + bore-axis lock on Hydro-Optic Turret (`4.7s..6.8s`)
  const stepA = isStaticOrtho ? 0 : winEnv(4.70, 4.98, 5.26, 5.50);
  const stepB = isStaticOrtho ? 0 : winEnv(5.38, 5.64, 5.86, 6.08);
  const lockSettle =
    !isStaticOrtho && gt > 5.95 && gt < 6.95
      ? Math.exp(-(gt - 5.95) * 7.0) * Math.sin((gt - 5.95) * 24.0) * 0.022
      : 0;
  const cruiseEyeYaw = isStaticOrtho ? 0 : Math.sin(gt * 1.35) * 0.055 * (1 - opticsEnv);
  const cruiseEyePitch = isStaticOrtho ? 0 : Math.cos(gt * 1.05) * 0.032 * (1 - opticsEnv);
  const eyeGimbalYaw = cruiseEyeYaw + (0.205 * stepA - 0.175 * stepB + lockSettle) * opticsEnv;
  const eyeGimbalPitch = cruiseEyePitch + (-0.125 * stepA + 0.108 * stepB - lockSettle * 0.6) * opticsEnv;
  const eyeScan = isStaticOrtho ? 0 : Math.sin(gt * 1.45) * 0.12 * (1 - opticsEnv) + (0.68 * stepA - 0.54 * stepB) * opticsEnv;
  const eyeLocked = !isStaticOrtho && gt >= 5.98 && gt <= 7.05;

  // Deterministic Optical Iris Aperture & MHD Rotary Cooling Louver Schedule (steady in static ortho checks)
  const eyeLockEnv = isStaticOrtho ? 0 : winEnv(5.92, 6.06, 6.95, 7.28);
  const cruiseAperture = 0.52 + (isStaticOrtho ? 0 : 0.08 * breathWave);
  const calAperture = clamp(
    0.56 + 0.36 * stepA - 0.16 * stepB - 0.42 * eyeLockEnv + lockSettle * 2.2,
    0.12,
    0.94,
  );
  const eyeAperture = cruiseAperture * (1 - opticsEnv) + calAperture * opticsEnv;

  const rpmNorm = clamp((rotorRpm - 1200) / 2600, 0, 1);
  const louverFlutter = isStaticOrtho ? 0 : Math.sin(gt * 6.5) * 0.035 * (0.4 + 0.6 * rpmNorm);
  const louverOpen = clamp(0.28 + 0.58 * rpmNorm + louverFlutter, 0, 1);

  return {
    stroke,
    intake,
    depth,
    speed,
    knots,
    pressure,
    thrust,
    rotorRpm,
    waveAmp: tailBoost,
    wavePhase: swimPhase,
    breathPhase,
    breathWave,
    pleatSurge,
    entryEnv,
    opticsEnv,
    wingEnv,
    dorsalEnv,
    tailEnv,
    departBankEnv,
    flightOffset,
    bodyHeave,
    bodyPitch,
    bodyRoll,
    bodyYaw,
    totalPitch: bodyPitch,
    totalRoll: bodyRoll,
    cranialPitch,
    jawOpen,
    flipperFlap,
    flipperSweep,
    flipperPitch: flipperFlap,
    flipperYaw,
    flipperDistFlap,
    flipperDistSweep,
    lumbarPitch,
    pedunclePitch,
    flukePitch,
    flukeHeave,
    eyeScan,
    eyeGimbalYaw,
    eyeGimbalPitch,
    eyeLocked,
    eyeAperture,
    louverOpen,
    state: stateBadge(seq, stroke, depth),
  };
}
