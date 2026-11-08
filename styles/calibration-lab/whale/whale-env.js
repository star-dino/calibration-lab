// Pale Bathymetric Proving Expanse & Megalithic Scale Anchors for Mechanical Cetacean V7 (AQ-12).
// Inspired by Elvar's SANDWORM MK-X open-expanse proving ground:
//   - Sculpted pale continental-shelf sand ridges & central calibration trench with bathymetric contour isolines
//   - Seamless horizon mist dissolution into studio warm-ivory (#EAE7E1) preserving crisp dark HUD contrast
//   - Human-scale 1.95m Acoustic Range Beacon Pylons + abyssal outcrops scrolling with 3D motion parallax
//   - Autonomous 0.88m Companion Calibration Micro-ROV (AQ-ROV-02) + subtle hydro-particulate flow streaks

import { THREE } from '/styles/calibration-lab/kernel.js';

function markEnvTree(root) {
  root.userData.isGround = true;
  root.userData.skipContactShadow = true;
  root.userData.noSilhouette = true;
  root.userData.auditIgnore = true;
  root.traverse((o) => {
    o.userData.isGround = true;
    o.userData.skipContactShadow = true;
    o.userData.noSilhouette = true;
    o.userData.auditIgnore = true;
  });
  return root;
}

function smoothstepJS(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Shared deterministic bathymetric heightfield (matches GLSL vertex shader 1:1)
export function bathyElevation(sx, sz) {
  const absZ = Math.abs(sz);
  // Central calibration channel (|z| < 6.5m) stays gently rippled; far -Z backdrop rises into sculpted abyssal dunes
  const farBackdrop = sz < 0 ? smoothstepJS(6.2, 19.5, -sz) : smoothstepJS(8.5, 26.0, sz) * 0.65;
  const farShelf = sz < 0 ? smoothstepJS(15.0, 44.0, -sz) : smoothstepJS(22.0, 56.0, sz) * 0.6;

  // Sweeping current-carved abyssal dunes (windward/leeward crest asymmetry via 2nd harmonic)
  const phase1 = sx * 0.092 + sz * 0.068;
  const dunePrimary = Math.sin(phase1) + 0.34 * Math.sin(phase1 * 2.0 - 0.85);
  const duneCross = Math.sin(sx * 0.048 - sz * 0.105 + 1.4) * 0.88;
  const terrace = Math.sin(sx * 0.028 + sz * 0.042 - 0.6);

  // Fine current ripples inside & outside the trench
  const ripple =
    Math.sin(sx * 0.42 + sz * 0.24) * 0.11 +
    Math.sin(sx * 0.23 - sz * 0.51 + 0.7) * 0.07;

  return (
    ripple * (0.65 + 0.55 * farBackdrop) +
    farBackdrop * (1.85 + 1.65 * dunePrimary + 1.15 * duneCross) +
    farShelf * (2.95 + 1.75 * terrace)
  );
}

const TERRAIN_VERT_GLSL = /* glsl */ `
uniform float uSwim;
uniform float uBaseY;
varying vec3 vWorld;
varying vec3 vNorm;
varying float vElev;
varying vec2 vSurveyXZ;

float bathyH(float sx, float sz) {
  float farBackdrop = sz < 0.0 ? smoothstep(6.2, 19.5, -sz) : smoothstep(8.5, 26.0, sz) * 0.65;
  float farShelf = sz < 0.0 ? smoothstep(15.0, 44.0, -sz) : smoothstep(22.0, 56.0, sz) * 0.6;
  float phase1 = sx * 0.092 + sz * 0.068;
  float dunePrimary = sin(phase1) + 0.34 * sin(phase1 * 2.0 - 0.85);
  float duneCross = sin(sx * 0.048 - sz * 0.105 + 1.4) * 0.88;
  float terrace = sin(sx * 0.028 + sz * 0.042 - 0.6);
  float ripple = sin(sx * 0.42 + sz * 0.24) * 0.11 + sin(sx * 0.23 - sz * 0.51 + 0.7) * 0.07;
  return ripple * (0.65 + 0.55 * farBackdrop)
       + farBackdrop * (1.85 + 1.65 * dunePrimary + 1.15 * duneCross)
       + farShelf * (2.95 + 1.75 * terrace);
}

void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  float sx = w.x - uSwim;
  float sz = w.z;
  float hC = bathyH(sx, sz);
  float eps = 0.35;
  float hL = bathyH(sx - eps, sz);
  float hR = bathyH(sx + eps, sz);
  float hD = bathyH(sx, sz - eps);
  float hU = bathyH(sx, sz + eps);

  w.y = uBaseY + hC;
  vElev = hC;
  vSurveyXZ = vec2(sx, sz);
  vNorm = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const TERRAIN_FRAG_GLSL = /* glsl */ `
uniform vec3 uLitSand;
uniform vec3 uShadeSand;
uniform vec3 uContour;
uniform vec3 uBackdrop;
uniform vec3 uSunDir;
uniform vec3 uCenter;
varying vec3 vWorld;
varying vec3 vNorm;
varying float vElev;
varying vec2 vSurveyXZ;

void main() {
  vec3 n = normalize(vNorm);
  float ndl = clamp(dot(n, uSunDir), -0.35, 1.0);
  float shadeK = smoothstep(-0.22, 0.78, ndl);

  // Subtle ambient darkening in deeper trench / dune troughs
  float troughK = smoothstep(-0.25, 3.2, vElev);
  vec3 baseCol = mix(uShadeSand, uLitSand, shadeK * (0.82 + 0.18 * troughK));

  // Crisp anti-aliased bathymetric elevation isolines (every 0.95m)
  float isoScaled = vElev / 0.95;
  float isoDist = abs(fract(isoScaled - 0.5) - 0.5) / max(fwidth(isoScaled), 1e-4);
  float isoLine = (1.0 - smoothstep(0.55, 1.45, isoDist)) * smoothstep(0.18, 1.15, vElev);

  // Subtle calibration range grid inside the central proving trench
  float trenchMask = 1.0 - smoothstep(5.5, 13.5, abs(vSurveyXZ.y));
  float gx = step(abs(mod(vSurveyXZ.x + 4.0, 8.0) - 4.0), 0.028);
  float gz = step(abs(mod(vSurveyXZ.y + 4.0, 8.0) - 4.0), 0.028);
  float subx = step(abs(mod(vSurveyXZ.x + 1.0, 2.0) - 1.0), 0.011);
  float gridMark = max(max(gx, gz) * 0.34, subx * 0.12) * trenchMask;

  vec3 markedCol = mix(baseCol, uContour, max(isoLine * 0.34, gridMark));

  // Atmospheric silt/mist dissolution into warm studio horizon (#EAE7E1)
  float d = length(vWorld.xz - uCenter.xz);
  float mistK = smoothstep(22.0, 86.0, d);
  vec3 outCol = mix(markedCol, uBackdrop, mistK);

  gl_FragColor = linearToOutputTexel(vec4(outCol, 1.0));
}
`;

export function createBathymetricProvingGround({
  scene,
  baseY = -6.45,
  bgHex = '#EAE7E1',
  sunDir = new THREE.Vector3(-0.24, 0.78, 0.58).normalize(),
  shadowColor = '#58524A',
  shadowOpacity = 0.18,
} = {}) {
  const blendHex = (a, b, k) =>
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');

  const litSandHex = blendHex(bgHex, '#FFFFFF', 0.32);
  const shadeSandHex = blendHex(bgHex, '#544B3E', 0.18);
  const contourHex = blendHex(bgHex, '#2C2A26', 0.30);

  const envGroup = new THREE.Group();
  envGroup.name = 'BathymetricProvingGround';

  // 1. Sculpted Pale Bathymetric Shelf & Continental Trench (280m x 280m)
  const terrainMat = new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VERT_GLSL,
    fragmentShader: TERRAIN_FRAG_GLSL,
    extensions: { derivatives: true },
    uniforms: {
      uLitSand: { value: new THREE.Color(litSandHex) },
      uShadeSand: { value: new THREE.Color(shadeSandHex) },
      uContour: { value: new THREE.Color(contourHex) },
      uBackdrop: { value: new THREE.Color(bgHex) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSwim: { value: 0 },
      uBaseY: { value: baseY },
      uCenter: { value: new THREE.Vector3(0, baseY, 0) },
    },
    side: THREE.DoubleSide,
    fog: false,
  });

  const terrainGeo = new THREE.PlaneGeometry(280, 280, 192, 192);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  envGroup.add(terrainMesh);

  // 2. Conforming VSM Shadow-Receiving Mesh over the Central Basin (72m x 36m)
  const shSegX = 64;
  const shSegZ = 32;
  const shadowGeo = new THREE.PlaneGeometry(72, 36, shSegX, shSegZ);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowBaseXZ = new Float32Array((shSegX + 1) * (shSegZ + 1) * 2);
  {
    const pos = shadowGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      shadowBaseXZ[i * 2] = pos.getX(i);
      shadowBaseXZ[i * 2 + 1] = pos.getZ(i);
    }
  }
  const shadowMesh = new THREE.Mesh(
    shadowGeo,
    new THREE.ShadowMaterial({
      color: shadowColor,
      opacity: shadowOpacity,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    }),
  );
  shadowMesh.receiveShadow = true;
  envGroup.add(shadowMesh);

  // Shared clean non-role industrial materials for scale-reference micro-props
  const matPlinth = new THREE.MeshStandardMaterial({ color: shadeSandHex, roughness: 0.85, metalness: 0.05 });
  const matMast = new THREE.MeshStandardMaterial({ color: '#2E333B', roughness: 0.52, metalness: 0.65 });
  const matCowl = new THREE.MeshStandardMaterial({ color: '#DFDCD4', roughness: 0.42, metalness: 0.08 });
  const matBronze = new THREE.MeshStandardMaterial({ color: '#B4824C', roughness: 0.36, metalness: 0.78 });
  const matBeacon = new THREE.MeshBasicMaterial({ color: '#F26419' });
  const matRock = new THREE.MeshStandardMaterial({
    color: blendHex(bgHex, '#544D43', 0.24),
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });

  // 3. Human-Scale (1.95m) Abyssal Acoustic Range Beacon Pylons & Outcrops (3D Parallax Scale Anchors!)
  function buildAcousticBeaconPylon() {
    const g = new THREE.Group();
    // Weighted seabed concrete/ceramic survey pad
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.16, 6), matPlinth);
    pad.position.y = 0.08;
    g.add(pad);

    // 3 angled tripod anchor legs
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.52, 8), matMast);
      leg.position.set(Math.cos(ang) * 0.24, 0.28, Math.sin(ang) * 0.24);
      leg.rotation.z = Math.cos(ang) * 0.42;
      leg.rotation.x = -Math.sin(ang) * 0.42;
      g.add(leg);
    }

    // Slender 1.85m gunmetal mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.048, 1.72, 10), matMast);
    mast.position.y = 0.96;
    g.add(mast);

    // White ceramic ID collar & dual bronze hydrophone transducer rings
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.28, 12), matCowl);
    collar.position.y = 1.18;
    g.add(collar);

    for (const ry of [1.46, 1.62]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.018, 8, 18), matBronze);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      g.add(ring);
    }

    // Cross-arm current sensor bar
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.024, 0.024), matMast);
    cross.position.y = 1.74;
    g.add(cross);

    // Safety-orange optical/acoustic strobe tip (1.92m high — human eye-height scale marker!)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), matBeacon);
    tip.position.y = 1.90;
    g.add(tip);

    return g;
  }

  const TRACK_SPAN = 64.0;
  const beaconSpecs = [
    { baseX: -14.0, z: -11.4, rotY: 0.3 },
    { baseX: 8.5, z: -13.2, rotY: -0.4 },
    { baseX: 26.0, z: -10.6, rotY: 0.8 },
    { baseX: -2.0, z: 13.6, rotY: 2.1 },
  ];
  const beacons = beaconSpecs.map((spec) => {
    const mesh = buildAcousticBeaconPylon();
    mesh.rotation.y = spec.rotY;
    envGroup.add(mesh);
    return { ...spec, mesh };
  });

  // Faceted angular abyssal sedimentary rock outcrops along ridge toes (crisp flat-shaded strata, not smooth pebbles)
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 0);
  const rockSpecs = [
    { baseX: -22.0, z: -15.5, sx: 1.15, sy: 0.38, sz: 0.72, rx: 0.18, ry: 0.4, rz: -0.12 },
    { baseX: -6.5, z: -18.2, sx: 1.45, sy: 0.48, sz: 0.88, rx: -0.14, ry: 1.7, rz: 0.15 },
    { baseX: 4.2, z: -12.8, sx: 0.72, sy: 0.24, sz: 0.48, rx: 0.12, ry: 2.5, rz: -0.08 },
    { baseX: 17.5, z: -16.8, sx: 1.25, sy: 0.42, sz: 0.78, rx: -0.16, ry: 0.9, rz: 0.10 },
    { baseX: -18.5, z: 15.2, sx: 0.88, sy: 0.30, sz: 0.58, rx: 0.10, ry: 1.2, rz: -0.14 },
    { baseX: 13.0, z: 16.5, sx: 1.05, sy: 0.34, sz: 0.68, rx: -0.12, ry: 2.9, rz: 0.09 },
  ];
  const rocks = rockSpecs.map((rs) => {
    const m = new THREE.Mesh(rockGeo, matRock);
    m.scale.set(rs.sx, rs.sy, rs.sz);
    m.rotation.set(rs.rx, rs.ry, rs.rz);
    envGroup.add(m);
    return { ...rs, mesh: m };
  });

  // 4. Companion Autonomous Calibration Micro-ROV (`AQ-ROV-02`, 0.88m length — 1:26 Megalithic Scale Anchor!)
  const rovGroup = new THREE.Group();
  {
    // Streamlined 0.88m ceramic fairing body (oriented toward -X alongside the whale)
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.56, 14), matCowl);
    hull.rotation.z = Math.PI / 2;
    rovGroup.add(hull);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), matMast);
    nose.scale.set(1.35, 1.0, 1.0);
    nose.position.x = -0.30;
    rovGroup.add(nose);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), matBeacon);
    eye.position.set(-0.42, 0.01, 0.04);
    rovGroup.add(eye);

    const collarR = new THREE.Mesh(new THREE.TorusGeometry(0.122, 0.014, 8, 18), matBronze);
    collarR.rotation.y = Math.PI / 2;
    collarR.position.x = -0.14;
    rovGroup.add(collarR);

    // Dorsal hydro-antenna fin
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.022), matMast);
    fin.position.set(0.08, 0.15, 0);
    fin.rotation.z = -0.25;
    rovGroup.add(fin);

    // Twin lateral vectored micro-thruster pods
    for (const sz of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.16), matMast);
      strut.position.set(0.12, -0.02, sz * 0.16);
      rovGroup.add(strut);

      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.20, 10), matMast);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(0.16, -0.02, sz * 0.24);
      rovGroup.add(pod);
    }
  }
  envGroup.add(rovGroup);

  // 5. Sparse Abyssal Current Flow-Streaks (subtle hydro-velocity sensation)
  const STREAK_COUNT = 44;
  const streakBase = [];
  for (let i = 0; i < STREAK_COUNT; i++) {
    // Deterministic Halton-like distribution around the calibration channel
    const s1 = ((i * 73 + 19) % 97) / 97;
    const s2 = ((i * 41 + 53) % 89) / 89;
    const s3 = ((i * 29 + 11) % 83) / 83;
    streakBase.push({
      x0: (s1 - 0.5) * 44.0,
      y: -5.2 + s2 * 9.8,
      z: (s3 - 0.5) * 24.0,
      len: 0.42 + (i % 5) * 0.16,
      speedMul: 0.85 + (i % 4) * 0.12,
    });
  }
  const streakArr = new Float32Array(STREAK_COUNT * 6);
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakArr, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: blendHex(bgHex, '#5E5850', 0.32),
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  envGroup.add(streakLines);

  markEnvTree(envGroup);
  scene.add(envGroup);

  function wrapTrack(val, center, span) {
    const half = span * 0.5;
    let d = (val - center) % span;
    if (d < -half) d += span;
    if (d > half) d -= span;
    return center + d;
  }

  function update({
    time = 0,
    swim = 0,
    centerX = 0,
    centerZ = 0,
    explode = 0,
    focusMacro = 0,
    isThreeView = false,
    flightOffset = null,
  } = {}) {
    terrainMesh.position.set(centerX, 0, centerZ);
    terrainMat.uniforms.uSwim.value = swim;
    terrainMat.uniforms.uCenter.value.set(centerX, baseY, centerZ);

    // Deform central VSM shadow receiver to hug the exact bathymetric trench floor
    shadowMesh.position.set(centerX, 0, centerZ);
    const shPos = shadowGeo.attributes.position;
    for (let i = 0; i < shPos.count; i++) {
      const lx = shadowBaseXZ[i * 2];
      const lz = shadowBaseXZ[i * 2 + 1];
      const wx = centerX + lx;
      const wz = centerZ + lz;
      shPos.setY(i, baseY + bathyElevation(wx - swim, wz) + 0.016);
    }
    shPos.needsUpdate = true;

    const showProps = !isThreeView;
    for (const b of beacons) {
      b.mesh.visible = showProps;
      if (!showProps) continue;
      const wx = wrapTrack(b.baseX + swim, centerX, TRACK_SPAN);
      const wy = baseY + bathyElevation(wx - swim, b.z) - 0.03;
      b.mesh.position.set(wx, wy, b.z);
    }

    for (const r of rocks) {
      r.mesh.visible = showProps;
      if (!showProps) continue;
      const wx = wrapTrack(r.baseX + swim, centerX, TRACK_SPAN);
      const wy = baseY + bathyElevation(wx - swim, r.z) - r.sy * 0.35;
      r.mesh.position.set(wx, wy, r.z);
    }

    // Companion Micro-ROV station-keeping beside the 23m Leviathan (steps clear during tight subsystem close-ups so it never overlaps detached plates)
    rovGroup.visible = showProps && focusMacro < 0.65;
    if (rovGroup.visible) {
      const fx = flightOffset?.x ?? 0;
      const fy = flightOffset?.y ?? 0;
      const fz = flightOffset?.z ?? 0;
      const bob = Math.sin(time * 2.1) * 0.14;
      const bank = Math.cos(time * 1.6) * 0.08;
      rovGroup.position.set(
        fx + 2.65 + explode * 4.2 + focusMacro * 2.4,
        fy + 3.72 + bob + explode * 1.6 + focusMacro * 1.8,
        fz - 2.45 - explode * 1.8 - focusMacro * 2.2,
      );
      rovGroup.rotation.set(bank, 0.06 * Math.sin(time * 0.9), -0.04 * Math.cos(time * 1.4));
    }

    // Hydro-particulate flow streaks (pause gracefully when full turntable teardown halts forward swim)
    streakLines.visible = showProps && explode < 0.85;
    if (streakLines.visible) {
      const streakFade = 1.0 - smoothstepJS(0.25, 0.85, explode);
      streakMat.opacity = 0.22 * streakFade;
      for (let i = 0; i < STREAK_COUNT; i++) {
        const sb = streakBase[i];
        const wx = wrapTrack(sb.x0 + swim * sb.speedMul, centerX, 46.0);
        const len = sb.len * (0.35 + 0.65 * streakFade);
        const idx = i * 6;
        streakArr[idx] = wx;
        streakArr[idx + 1] = sb.y;
        streakArr[idx + 2] = sb.z;
        streakArr[idx + 3] = wx + len;
        streakArr[idx + 4] = sb.y;
        streakArr[idx + 5] = sb.z;
      }
      streakGeo.attributes.position.needsUpdate = true;
    }
  }

  return { group: envGroup, update };
}
