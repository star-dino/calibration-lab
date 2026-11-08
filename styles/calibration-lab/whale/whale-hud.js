// Hydro-Mech Field Simulator HUD & 3D Dot-Leader Callouts for Mechanical Cetacean V6 (AQ-12).
// Slim peripheral edge-telemetry layout built for close-proximity megalithic framing:
//   - Ultra-slim frameless edge rails (188px) with soft gradient frost so the 23m whale dominates ~90% of the viewport
//   - Live propulsive waveform, MHD power bus, per-joint torque load bars, attitude horizon reticle
//   - Interactive-style ASSEMBLIES / DISPLAY pill selectors with animated operator cursor + click ripple
//   - Responsive layout: slim dual-rail simulator on 16:9 widescreen; compact header/footer on 9:16 & 1:1

import { THREE } from '/styles/calibration-lab/kernel.js';

const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
const MONO = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

const TOKENS = {
  ink: '#1B1F26',
  inkSoft: '#3A404A',
  muted: '#7C8087',
  faint: 'rgba(27, 31, 38, 0.11)',
  hairline: 'rgba(27, 31, 38, 0.16)',
  cardBg: 'rgba(246, 244, 239, 0.62)',
  pillBg: 'rgba(27, 31, 38, 0.055)',
  accent: '#F26419',
  accentSoft: 'rgba(242, 100, 25, 0.14)',
  emerald: '#169868',
  emeraldSoft: 'rgba(22, 152, 104, 0.14)',
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fillPill(ctx, x, y, w, h, fill, stroke = null, r = 3) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCrosshair(ctx, x, y, s = 5) {
  ctx.strokeStyle = 'rgba(27, 31, 38, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
}

function spacedText(ctx, text, x, y, tracking = 1.2) {
  const str = String(text || '');
  if (!tracking || str.length <= 1) {
    ctx.fillText(str, x, y);
    return ctx.measureText(str).width;
  }
  let cx = x;
  for (let i = 0; i < str.length; i++) {
    ctx.fillText(str[i], cx, y);
    cx += ctx.measureText(str[i]).width + tracking;
  }
  return cx - x;
}

export function createFieldSimulatorHud({ camera, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  plane.frustumCulled = false;
  plane.renderOrder = 999;
  plane.position.set(0, 0, -1);
  plane.userData.isHudOverlay = true;
  plane.userData.skipContactShadow = true;
  plane.userData.auditIgnore = true;
  camera.add(plane);

  function fit() {
    const h = 2 * Math.tan((camera.fov * Math.PI) / 360);
    plane.scale.set(h * camera.aspect, h, 1);
  }
  fit();

  function drawSectionHeader(x, y, w, indexStr, title, u, accent) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 3.5 * u, y - 3.5 * u, 2.5 * u, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `700 ${Math.round(9.5 * u)}px ${MONO}`;
    ctx.fillStyle = TOKENS.ink;
    spacedText(ctx, title, x + 11 * u, y, 1.3 * u);

    if (indexStr) {
      ctx.font = `500 ${Math.round(9 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.muted;
      ctx.textAlign = 'right';
      ctx.fillText(indexStr, x + w, y);
      ctx.textAlign = 'left';
    }

    ctx.strokeStyle = TOKENS.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, Math.round(y + 7 * u) + 0.5);
    ctx.lineTo(x + w, Math.round(y + 7 * u) + 0.5);
    ctx.stroke();
  }

  function draw(state = {}) {
    const W = canvas.width;
    const H = canvas.height;
    const wide = W >= H * 1.45 && !state.compact;
    const u = wide ? W / 1920 : Math.min(W, H) / 1080;
    const accent = state.accent || TOKENS.accent;
    const t = state.time ?? 0;
    const dur = state.dur ?? 26.0;
    const m = state.mech || {};
    const detached = Boolean(state.detached);

    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const padX = Math.round(20 * u);
    const padY = Math.round(20 * u);

    // Soft top & bottom edge-frost gradients so close-up dark titanium/wing silhouettes never reduce header or log legibility
    if (wide) {
      const topGrad = ctx.createLinearGradient(0, 0, 0, padY + Math.round(62 * u));
      topGrad.addColorStop(0.0, 'rgba(234, 231, 225, 0.84)');
      topGrad.addColorStop(0.68, 'rgba(234, 231, 225, 0.58)');
      topGrad.addColorStop(1.0, 'rgba(234, 231, 225, 0.0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, W, padY + Math.round(62 * u));

      const botGrad = ctx.createLinearGradient(0, H - padY - Math.round(78 * u), 0, H);
      botGrad.addColorStop(0.0, 'rgba(234, 231, 225, 0.0)');
      botGrad.addColorStop(0.36, 'rgba(234, 231, 225, 0.64)');
      botGrad.addColorStop(1.0, 'rgba(234, 231, 225, 0.86)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, H - padY - Math.round(78 * u), W, padY + Math.round(78 * u));
    }

    // Subtle registration crosshairs
    drawCrosshair(ctx, padX * 0.55, padY * 0.65, 4.0 * u);
    drawCrosshair(ctx, W - padX * 0.55, padY * 0.65, 4.0 * u);
    drawCrosshair(ctx, padX * 0.55, H - padY * 0.65, 4.0 * u);
    drawCrosshair(ctx, W - padX * 0.55, H - padY * 0.65, 4.0 * u);
    if (wide) {
      drawCrosshair(ctx, W * 0.24, H * 0.12, 3.8 * u);
      drawCrosshair(ctx, W * 0.76, H * 0.12, 3.8 * u);
      drawCrosshair(ctx, W * 0.24, H * 0.85, 3.8 * u);
      drawCrosshair(ctx, W * 0.76, H * 0.85, 3.8 * u);
    }

    // ------------------------------------------------------------------ 1. Top Header Strip
    const badgeW = Math.round(52 * u);
    const badgeH = Math.round(38 * u);
    fillPill(ctx, padX, padY, badgeW, badgeH, accent, null, 3 * u);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(13.5 * u)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('AQ-12', padX + badgeW * 0.5, padY + badgeH * 0.63);
    ctx.textAlign = 'left';

    const titleX = padX + badgeW + Math.round(14 * u);
    ctx.font = `600 ${Math.round(8.5 * u)}px ${MONO}`;
    ctx.fillStyle = TOKENS.muted;
    spacedText(ctx, 'ABYSSAL HYDRO-BIOMIMETIC PROTOTYPE', titleX, padY + Math.round(9 * u), 1.3 * u);

    ctx.font = `700 ${Math.round(22 * u)}px ${SANS}`;
    ctx.fillStyle = TOKENS.ink;
    ctx.fillText(state.title || 'Balaenoptera AQ-12', titleX, padY + Math.round(29 * u));

    ctx.font = `500 ${Math.round(9 * u)}px ${MONO}`;
    ctx.fillStyle = TOKENS.muted;
    spacedText(
      ctx,
      state.subtitle || 'ARTICULATED HYDROFOIL CETACEAN / FIELD SIMULATOR',
      titleX,
      padY + Math.round(44 * u),
      1.2 * u,
    );

    if (wide) {
      // Top-right telemetry metadata columns
      const cols = [
        ['SERIAL', 'AQ12-0418'],
        ['DEPTH', `${Math.round(m.depth ?? 480)} M`],
        ['PRESSURE', `${(m.pressure ?? 4.8).toFixed(1)} MPA`],
        ['RUNTIME', `00:00:${String(Math.floor(t)).padStart(2, '0')}`],
        ['STATUS', `● ${state.modeBadge || 'CRUISE'}`],
        ['TANK', 'HYDRO-B2'],
      ];
      let cx = W - padX - Math.round(620 * u);
      for (let i = 0; i < cols.length; i++) {
        const [k, v] = cols[i];
        ctx.font = `500 ${Math.round(8.5 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.muted;
        spacedText(ctx, k, cx, padY + Math.round(12 * u), 1.1 * u);

        ctx.font = `600 ${Math.round(11 * u)}px ${MONO}`;
        ctx.fillStyle = k === 'STATUS' ? accent : TOKENS.ink;
        ctx.fillText(v, cx, padY + Math.round(29 * u));
        cx += Math.round((k === 'STATUS' ? 128 : 98) * u);
      }
    }

    // Store interactive button target centers for the automated operator cursor
    const buttonCenters = {};

    // ------------------------------------------------------------------ 2. Slim Peripheral Edge Telemetry Rails (16:9 Widescreen)
    if (wide) {
      const railW = Math.round(188 * u);
      const leftX = padX;
      const rightX = W - padX - railW;

      // Soft horizontal gradient edge-frost (frameless: zero hard card borders cutting across close-proximity whale silhouette)
      const railCardTop = padY + Math.round(62 * u);
      const railCardH = Math.round(542 * u);
      const leftGrad = ctx.createLinearGradient(0, 0, leftX + railW + Math.round(34 * u), 0);
      leftGrad.addColorStop(0.0, 'rgba(234, 231, 225, 0.84)');
      leftGrad.addColorStop(0.76, 'rgba(234, 231, 225, 0.66)');
      leftGrad.addColorStop(1.0, 'rgba(234, 231, 225, 0.0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, railCardTop, leftX + railW + Math.round(34 * u), railCardH);

      const rightGrad = ctx.createLinearGradient(rightX - Math.round(34 * u), 0, W, 0);
      rightGrad.addColorStop(0.0, 'rgba(234, 231, 225, 0.0)');
      rightGrad.addColorStop(0.24, 'rgba(234, 231, 225, 0.66)');
      rightGrad.addColorStop(1.0, 'rgba(234, 231, 225, 0.84)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(rightX - Math.round(34 * u), railCardTop, W - (rightX - Math.round(34 * u)), railCardH);

      // ---- LEFT RAIL 01: PROPULSIVE WAVE OSCILLOSCOPE ----
      let ly = padY + Math.round(80 * u);
      drawSectionHeader(leftX, ly, railW, '01', 'PROPULSIVE WAVE', u, accent);

      const freqHz = detached ? 0.0 : Number((1.18 + 0.42 * (m.stroke ?? 0.5)).toFixed(1));
      const strokeDeg = detached ? 0 : Math.round(18 + 10 * (m.waveAmp ?? 1));
      ctx.font = `700 ${Math.round(22 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.ink;
      ctx.fillText(`${freqHz.toFixed(1)}`, leftX, ly + Math.round(33 * u));
      const fw = ctx.measureText(`${freqHz.toFixed(1)}`).width;
      ctx.font = `600 ${Math.round(11 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.inkSoft;
      ctx.fillText('HZ', leftX + fw + 4 * u, ly + Math.round(33 * u));

      ctx.textAlign = 'right';
      ctx.font = `600 ${Math.round(13 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.inkSoft;
      ctx.fillText(`±${strokeDeg}°`, leftX + railW, ly + Math.round(32 * u));
      ctx.textAlign = 'left';

      const waveBoxY = ly + Math.round(44 * u);
      const waveBoxH = Math.round(58 * u);
      fillPill(ctx, leftX, waveBoxY, railW, waveBoxH, TOKENS.cardBg, TOKENS.faint, 3 * u);

      // Center zero line & grid ticks
      const midWaveY = waveBoxY + waveBoxH * 0.5;
      ctx.strokeStyle = 'rgba(27, 31, 38, 0.12)';
      ctx.setLineDash([3 * u, 3 * u]);
      ctx.beginPath();
      ctx.moveTo(leftX + 6 * u, midWaveY);
      ctx.lineTo(leftX + railW - 6 * u, midWaveY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Secondary phase-lagged fluke curve (muted grey)
      const ampPx = detached ? 2.2 * u : waveBoxH * (0.28 + 0.10 * (m.stroke ?? 0.5));
      const wPhase = m.wavePhase ?? t * 1.7;
      ctx.strokeStyle = 'rgba(110, 116, 126, 0.45)';
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      for (let i = 0; i <= 56; i++) {
        const frac = i / 56;
        const px = leftX + 7 * u + frac * (railW - 14 * u);
        const py = midWaveY - Math.sin(frac * Math.PI * 4.5 - wPhase + 1.1) * ampPx * 0.78;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Primary caudal torque wave (signal orange)
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      for (let i = 0; i <= 56; i++) {
        const frac = i / 56;
        const px = leftX + 7 * u + frac * (railW - 14 * u);
        const py = midWaveY - Math.sin(frac * Math.PI * 4.5 - wPhase) * ampPx;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.muted;
      ctx.fillText('120 HZ', leftX, waveBoxY + waveBoxH + Math.round(13 * u));
      ctx.textAlign = 'right';
      ctx.fillText('PHASE 24°', leftX + railW, waveBoxY + waveBoxH + Math.round(13 * u));
      ctx.textAlign = 'left';

      // ---- LEFT RAIL 02: MHD STATOR POWER ----
      ly = waveBoxY + waveBoxH + Math.round(40 * u);
      drawSectionHeader(leftX, ly, railW, '02', 'MHD STATOR BUS', u, accent);

      ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.muted;
      ctx.fillText('BUS RESERVE', leftX, ly + Math.round(21 * u));
      ctx.textAlign = 'right';
      ctx.fillStyle = TOKENS.ink;
      ctx.font = `700 ${Math.round(9.5 * u)}px ${MONO}`;
      ctx.fillText('92%', leftX + railW, ly + Math.round(21 * u));
      ctx.textAlign = 'left';

      const segY = ly + Math.round(28 * u);
      const segCount = 12;
      const segGap = 2.5 * u;
      const segW = (railW - segGap * (segCount - 1)) / segCount;
      for (let s = 0; s < segCount; s++) {
        fillPill(
          ctx,
          leftX + s * (segW + segGap),
          segY,
          segW,
          8 * u,
          s < 11 ? TOKENS.emerald : 'rgba(27, 31, 38, 0.10)',
          null,
          1.5 * u,
        );
      }

      const kwVal = detached ? 18.4 : Number((142 + (m.thrust ?? 180) * 0.52).toFixed(1));
      const tempVal = Math.round(31 + (m.stroke ?? 0.5) * 6);
      const pMetrics = [
        ['OUTPUT', `${kwVal} kW`],
        ['STATOR', '640 V'],
        ['CORE', `${tempVal} °C`],
      ];
      for (let i = 0; i < pMetrics.length; i++) {
        const mx = leftX + i * Math.round(68 * u);
        ctx.font = `500 ${Math.round(7.8 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.muted;
        ctx.fillText(pMetrics[i][0], mx, segY + Math.round(24 * u));
        ctx.font = `700 ${Math.round(10.8 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.ink;
        ctx.fillText(pMetrics[i][1], mx, segY + Math.round(40 * u));
      }

      // ---- LEFT RAIL 03: ACTUATOR TORQUE ----
      ly = segY + Math.round(68 * u);
      drawSectionHeader(leftX, ly, railW, '03', 'ACTUATOR TORQUE', u, accent);

      ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.muted;
      ctx.fillText('LOAD · KN·M', leftX, ly + Math.round(21 * u));

      const pillText = detached ? 'DETACHED' : 'NOMINAL';
      const pillW = Math.round(56 * u);
      fillPill(
        ctx,
        leftX + railW - pillW,
        ly + Math.round(10 * u),
        pillW,
        14 * u,
        detached ? TOKENS.accentSoft : TOKENS.emeraldSoft,
        null,
        2 * u,
      );
      ctx.font = `700 ${Math.round(7.6 * u)}px ${MONO}`;
      ctx.fillStyle = detached ? accent : TOKENS.emerald;
      ctx.textAlign = 'center';
      ctx.fillText(pillText, leftX + railW - pillW * 0.5, ly + Math.round(20 * u));
      ctx.textAlign = 'left';

      const servoRows = [
        ['WING L', clamp(0.42 + Math.abs(m.flipperFlap ?? 0) * 1.9, 0.18, 0.94), state.wingOff],
        ['WING R', clamp(0.40 + Math.abs(m.flipperSweep ?? 0) * 2.1, 0.18, 0.92), false],
        ['OPTICS', clamp(0.24 + Math.abs(m.eyeScan ?? 0) * 1.6, 0.14, 0.78), state.opticsOpen],
        ['LUMBAR', clamp(0.35 + Math.abs(m.lumbarPitch ?? 0) * 2.2, 0.20, 0.95), false],
        ['CAUDAL', clamp(0.48 + Math.abs(m.flukePitch ?? 0) * 1.8, 0.22, 0.98), state.tailFanned],
      ];
      let sy = ly + Math.round(40 * u);
      for (const [name, load, isolated] of servoRows) {
        const isOff = detached || isolated;
        ctx.font = `600 ${Math.round(8.5 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.ink;
        ctx.fillText(name, leftX, sy);

        const barX = leftX + Math.round(46 * u);
        const barW = Math.round(88 * u);
        fillPill(ctx, barX, sy - 5.5 * u, barW, 4.2 * u, 'rgba(27, 31, 38, 0.10)', null, 2 * u);
        if (!isOff) {
          fillPill(ctx, barX, sy - 5.5 * u, barW * load, 4.2 * u, TOKENS.ink, null, 2 * u);
        } else {
          fillPill(ctx, barX, sy - 5.5 * u, barW * 0.28, 4.2 * u, accent, null, 2 * u);
        }

        ctx.textAlign = 'right';
        ctx.font = `600 ${Math.round(8 * u)}px ${MONO}`;
        ctx.fillStyle = isOff ? accent : TOKENS.inkSoft;
        ctx.fillText(isOff ? 'OPEN' : `${Math.round(load * 100)}%`, leftX + railW, sy);
        ctx.textAlign = 'left';
        sy += Math.round(22 * u);
      }

      // ---- RIGHT RAIL 04: ATTITUDE & TRIM COMPASS ----
      let ry = padY + Math.round(80 * u);
      drawSectionHeader(rightX, ry, railW, '04', 'HYDRO-TRIM', u, accent);

      const dialR = Math.round(32 * u);
      const dialCX = rightX + dialR + Math.round(4 * u);
      const dialCY = ry + Math.round(52 * u);
      ctx.strokeStyle = 'rgba(27, 31, 38, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(dialCX, dialCY, dialR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([2 * u, 3 * u]);
      ctx.beginPath();
      ctx.arc(dialCX, dialCY, dialR * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Horizon tilt line driven by live bodyRoll & bodyPitch
      const rollRad = m.totalRoll ?? m.bodyRoll ?? 0;
      const pitchDeg = ((m.totalPitch ?? m.bodyPitch ?? 0) * 180) / Math.PI;
      const bankDeg = (rollRad * 180) / Math.PI;
      const pyShift = clamp(pitchDeg * 0.85, -10, 10) * u;
      ctx.save();
      ctx.translate(dialCX, dialCY + pyShift);
      ctx.rotate(-rollRad);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.moveTo(-dialR * 0.78, 0);
      ctx.lineTo(dialR * 0.78, 0);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const attRows = [
        ['SPEED', `${(m.speed ?? 6.4).toFixed(1)} m/s`],
        ['PITCH', `${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(1)}°`],
        ['BANK', `${bankDeg >= 0 ? '+' : ''}${bankDeg.toFixed(1)}°`],
      ];
      let ay = ry + Math.round(30 * u);
      for (const [k, v] of attRows) {
        ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.muted;
        ctx.fillText(k, rightX + dialR * 2 + Math.round(14 * u), ay);
        ctx.textAlign = 'right';
        ctx.font = `700 ${Math.round(9.8 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.ink;
        ctx.fillText(v, rightX + railW, ay);
        ctx.textAlign = 'left';
        ay += Math.round(22 * u);
      }

      // ---- RIGHT RAIL 05: ASSEMBLIES ----
      ry = dialCY + dialR + Math.round(28 * u);
      drawSectionHeader(rightX, ry, railW, '05', 'ASSEMBLIES', u, accent);

      const asmList = [
        { id: 'hero', label: 'HERO' },
        { id: 'cranial', label: 'OPTIC' },
        { id: 'pectoral', label: 'WING' },
        { id: 'caudal', label: 'TAIL' },
      ];
      const pillGap = Math.round(5 * u);
      const asmW = Math.floor((railW - pillGap * 3) / 4);
      const asmH = Math.round(22 * u);
      const asmY = ry + Math.round(17 * u);
      asmList.forEach((item, idx) => {
        const px = rightX + idx * (asmW + pillGap);
        const active = state.activeAssembly === item.id;
        fillPill(
          ctx,
          px,
          asmY,
          asmW,
          asmH,
          active ? (item.id === 'hero' ? TOKENS.ink : accent) : TOKENS.pillBg,
          active ? null : TOKENS.hairline,
          2.5 * u,
        );
        ctx.font = `600 ${Math.round(8.2 * u)}px ${MONO}`;
        ctx.fillStyle = active ? '#FFFFFF' : TOKENS.inkSoft;
        ctx.textAlign = 'center';
        ctx.fillText(item.label, px + asmW * 0.5, asmY + asmH * 0.65);
        ctx.textAlign = 'left';
        buttonCenters[`asm:${item.id}`] = [px + asmW * 0.5, asmY + asmH * 0.5];
      });

      // ---- RIGHT RAIL 06: DISPLAY MODES ----
      ry = asmY + asmH + Math.round(26 * u);
      drawSectionHeader(rightX, ry, railW, '06', 'DISPLAY', u, accent);

      const dispButtons = [
        { id: 'labels', label: 'LABELS', on: Boolean(state.labelsOn) },
        { id: 'exploded', label: 'EXPLODED', on: Boolean(state.explodedOn) },
        { id: 'datum', label: 'CAD DATUM', on: Boolean(state.datumOn) },
        { id: 'turntable', label: 'TURNTABLE', on: Boolean(state.turntableOn) },
      ];
      const dW = Math.floor((railW - pillGap) / 2);
      const dH = Math.round(22 * u);
      dispButtons.forEach((btn, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const px = rightX + col * (dW + pillGap);
        const py = ry + Math.round(17 * u) + row * (dH + pillGap);
        fillPill(
          ctx,
          px,
          py,
          dW,
          dH,
          btn.on ? (btn.id === 'labels' ? TOKENS.ink : accent) : TOKENS.pillBg,
          btn.on ? null : TOKENS.hairline,
          2.5 * u,
        );
        ctx.font = `600 ${Math.round(8.2 * u)}px ${MONO}`;
        ctx.fillStyle = btn.on ? '#FFFFFF' : TOKENS.inkSoft;
        ctx.textAlign = 'center';
        ctx.fillText(btn.label, px + dW * 0.5, py + dH * 0.65);
        ctx.textAlign = 'left';
        buttonCenters[`disp:${btn.id}`] = [px + dW * 0.5, py + dH * 0.5];
      });

      // ---- RIGHT RAIL 07: SUBSYSTEMS MATRIX ----
      ry = ry + Math.round(17 * u) + (dH + pillGap) * 2 + Math.round(24 * u);
      drawSectionHeader(rightX, ry, railW, '07', 'SUBSYSTEMS', u, accent);

      const subRows = [
        ['01', 'OPTICPOD', state.opticsOpen ? ['6-TIER', true] : ['LOCKED', false]],
        ['02', 'GEARBOX', detached ? ['9-PART', true] : ['COUPLED', false]],
        ['03', 'WING SPAR', state.wingOff ? ['22-PART', true] : ['ACTIVE', false]],
        ['04', 'MHD CORE', state.reactorOpen || detached ? ['13-PART', true] : ['NOMINAL', false]],
        ['05', 'FLUKES', state.tailFanned ? ['FANNED', true] : ['STROKE', false]],
      ];
      let subY = ry + Math.round(22 * u);
      for (const [num, label, [stLabel, isWarn]] of subRows) {
        ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.muted;
        ctx.fillText(num, rightX, subY);

        ctx.font = `600 ${Math.round(8.5 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.ink;
        ctx.fillText(label, rightX + Math.round(19 * u), subY);

        const stW = Math.round(56 * u);
        fillPill(
          ctx,
          rightX + railW - stW,
          subY - 9.5 * u,
          stW,
          13.5 * u,
          isWarn ? accent : TOKENS.emerald,
          null,
          2 * u,
        );
        ctx.font = `700 ${Math.round(7.4 * u)}px ${MONO}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(stLabel, rightX + railW - stW * 0.5, subY - 0.5 * u);
        ctx.textAlign = 'left';

        subY += Math.round(24 * u);
      }
    }

    // ------------------------------------------------------------------ 3. Bottom Action Headline & Timeline Log
    const botY = H - padY - Math.round(12 * u);
    const headlineX = wide ? Math.round(226 * u) : padX;

    ctx.font = `700 ${Math.round((wide ? 26 : 22) * u)}px ${MONO}`;
    ctx.fillStyle = accent;
    spacedText(ctx, state.headline || 'CRUISE', headlineX, botY - Math.round(52 * u), 1.4 * u);

    ctx.font = `500 ${Math.round(9 * u)}px ${MONO}`;
    ctx.fillStyle = TOKENS.muted;
    spacedText(ctx, state.subHeadline || 'MESOPELAGIC HYDROFOIL TRIM', headlineX, botY - Math.round(34 * u), 1.15 * u);

    if (wide) {
      const logX = Math.round(625 * u);
      const logW = Math.round(775 * u);
      const logY = botY - Math.round(10 * u);

      ctx.font = `600 ${Math.round(8.5 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.ink;
      spacedText(ctx, 'TEST LOG', logX, logY - Math.round(12 * u), 1.2 * u);

      ctx.font = `500 ${Math.round(8.5 * u)}px ${MONO}`;
      ctx.fillStyle = TOKENS.muted;
      spacedText(ctx, state.operatorNote || 'OPERATOR · AUTO CALIBRATION SEQUENCE', logX + Math.round(84 * u), logY - Math.round(12 * u), 1.1 * u);

      ctx.textAlign = 'right';
      ctx.fillText(
        `00:${String(Math.floor(t)).padStart(2, '0')} / 00:${String(Math.round(dur)).padStart(2, '0')}`,
        logX + logW,
        logY - Math.round(12 * u),
      );
      ctx.textAlign = 'left';

      // Track line
      ctx.strokeStyle = 'rgba(27, 31, 38, 0.16)';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(logX, logY);
      ctx.lineTo(logX + logW, logY);
      ctx.stroke();

      const prog = clamp(t / Math.max(0.1, dur), 0, 1);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.2 * u;
      ctx.beginPath();
      ctx.moveTo(logX, logY);
      ctx.lineTo(logX + logW * prog, logY);
      ctx.stroke();

      // Event ticks along timeline
      for (const et of state.eventTimes || [4.0, 8.0, 12.2, 14.8, 17.8, 22.0]) {
        const ex = logX + (et / dur) * logW;
        ctx.fillStyle = et <= t ? accent : 'rgba(27, 31, 38, 0.28)';
        ctx.beginPath();
        ctx.arc(ex, logY, 2.4 * u, 0, Math.PI * 2);
        ctx.fill();
      }

      // Playhead ring
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(logX + logW * prog, logY, 4.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // ------------------------------------------------------------------ 4. 3D-to-2D Minimalist Dot-Leader Callouts
    const callouts = state.compact ? null : state.callouts;
    if (Array.isArray(callouts) && callouts.length > 0) {
      camera.updateMatrixWorld();
      const projVec = new THREE.Vector3();
      const leftList = [];
      const rightList = [];

      const safeLeft = wide ? Math.round(224 * u) : Math.round(32 * u);
      const safeRight = wide ? W - Math.round(224 * u) : W - Math.round(32 * u);
      const safeTop = Math.round(108 * u);
      const safeBot = H - Math.round(128 * u);

      for (const item of callouts) {
        const alpha = clamp(item.opacity ?? 1, 0, 1);
        if (alpha <= 0.03) continue;
        if (item.target && item.target.isObject3D) {
          item.target.getWorldPosition(projVec);
        } else if (Array.isArray(item.worldPos)) {
          projVec.set(item.worldPos[0], item.worldPos[1], item.worldPos[2]);
        } else {
          continue;
        }
        projVec.project(camera);
        if (projVec.z > 1.0 || projVec.z < -1.0) continue;
        const sx = (projVec.x * 0.5 + 0.5) * W;
        const sy = (-projVec.y * 0.5 + 0.5) * H;
        if (sx < safeLeft - 45 * u || sx > safeRight + 45 * u) continue;

        const side = item.side || (sx < W * 0.5 ? 'left' : 'right');
        const defaultDy = sy < H * 0.48 ? -58 : 58;
        const entry = {
          label: String(item.label || '').toUpperCase(),
          sub: String(item.sub || '').toUpperCase(),
          sx,
          sy,
          ly: clamp(sy + (item.dy ?? defaultDy) * u, safeTop, safeBot),
          alpha,
          accent: Boolean(item.accent),
        };
        if (side === 'left') leftList.push(entry);
        else rightList.push(entry);
      }

      const minGap = Math.round(46 * u);
      const stack = (arr) => {
        arr.sort((a, b) => a.ly - b.ly);
        for (let i = 1; i < arr.length; i++) {
          if (arr[i].ly - arr[i - 1].ly < minGap) arr[i].ly = arr[i - 1].ly + minGap;
        }
        for (let i = arr.length - 2; i >= 0; i--) {
          if (arr[i + 1].ly > safeBot) arr[i + 1].ly = safeBot;
          if (arr[i + 1].ly - arr[i].ly < minGap) arr[i].ly = Math.max(safeTop, arr[i + 1].ly - minGap);
        }
      };
      stack(leftList);
      stack(rightList);

      const drawLeader = (e, side) => {
        ctx.save();
        ctx.globalAlpha = e.alpha;

        ctx.font = `700 ${Math.round(9.5 * u)}px ${MONO}`;
        const w1 = ctx.measureText(e.label).width;
        ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
        const w2 = e.sub ? ctx.measureText(e.sub).width : 0;
        const boxW = Math.ceil(Math.max(w1, w2) + 18 * u);
        const boxH = Math.round((e.sub ? 29 : 18) * u);

        const textX =
          side === 'left'
            ? clamp(e.sx - 115 * u, safeLeft + boxW + 6 * u, safeRight - 20 * u)
            : clamp(e.sx + 115 * u, safeLeft + 20 * u, safeRight - boxW - 6 * u);
        const kneeX = side === 'left' ? textX + 22 * u : textX - 22 * u;

        ctx.strokeStyle = e.accent ? accent : 'rgba(27, 31, 38, 0.48)';
        ctx.lineWidth = 1.15 * u;
        ctx.beginPath();
        ctx.moveTo(e.sx, e.sy);
        ctx.lineTo(kneeX, e.ly);
        ctx.lineTo(textX, e.ly);
        ctx.stroke();

        // Crisp target dot with studio halo
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(e.sx, e.sy, 4.2 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(e.sx, e.sy, 2.9 * u, 0, Math.PI * 2);
        ctx.fill();

        // Technical frosted callout pill
        const pillX = side === 'left' ? textX - boxW : textX;
        const pillY = Math.round(e.ly - 14.5 * u);
        fillPill(ctx, pillX, pillY, boxW, boxH, 'rgba(246, 244, 239, 0.91)', 'rgba(27, 31, 38, 0.15)', 2.5 * u);
        ctx.fillStyle = e.accent ? accent : TOKENS.ink;
        if (side === 'left') {
          ctx.fillRect(pillX + boxW - 2.5 * u, pillY + 2 * u, 2.5 * u, boxH - 4 * u);
        } else {
          ctx.fillRect(pillX, pillY + 2 * u, 2.5 * u, boxH - 4 * u);
        }

        ctx.textAlign = side === 'left' ? 'right' : 'left';
        const lx = side === 'left' ? textX - 8.5 * u : textX + 8.5 * u;

        ctx.font = `700 ${Math.round(9.5 * u)}px ${MONO}`;
        ctx.fillStyle = TOKENS.ink;
        ctx.fillText(e.label, lx, e.ly - 2.5 * u);

        if (e.sub) {
          ctx.font = `500 ${Math.round(8 * u)}px ${MONO}`;
          ctx.fillStyle = TOKENS.inkSoft;
          ctx.fillText(e.sub, lx, e.ly + 9.5 * u);
        }
        ctx.restore();
      };

      for (const e of leftList) drawLeader(e, 'left');
      for (const e of rightList) drawLeader(e, 'right');
      ctx.textAlign = 'left';
    }

    // ------------------------------------------------------------------ 5. Animated Operator Cursor & Click Ripple
    const cur = state.cursor;
    if (wide && cur && cur.opacity > 0.02) {
      const pFrom = buttonCenters[cur.fromId] || [W * 0.86, H * 0.56];
      const pTo = buttonCenters[cur.toId] || pFrom;
      const cx = pFrom[0] + (pTo[0] - pFrom[0]) * (cur.moveK ?? 1);
      const cy = pFrom[1] + (pTo[1] - pFrom[1]) * (cur.moveK ?? 1);

      ctx.save();
      ctx.globalAlpha = clamp(cur.opacity, 0, 1);
      if (cur.ring > 0.01) {
        const rr = (8 + (1 - cur.ring) * 18) * u;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = clamp(cur.opacity * cur.ring, 0, 1);
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = clamp(cur.opacity, 0, 1);
      }

      ctx.translate(cx, cy);
      if (cur.press) ctx.scale(0.9, 0.9);
      ctx.fillStyle = TOKENS.ink;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.3 * u;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15 * u);
      ctx.lineTo(4.2 * u, 11.6 * u);
      ctx.lineTo(7.4 * u, 17.5 * u);
      ctx.lineTo(9.8 * u, 16.3 * u);
      ctx.lineTo(6.6 * u, 10.4 * u);
      ctx.lineTo(11.5 * u, 10.4 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    tex.needsUpdate = true;
  }

  return { plane, canvas, fit, draw };
}
