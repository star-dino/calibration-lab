#!/usr/bin/env python3
"""
Calibration Lab cue-driven mechanical score synthesizer (`tools/sound.py`).

Pure Python (NumPy + SciPy + stdlib `wave`) synthesizer that turns a deterministic
DOM & runtime motion cue sheet (`window.CUES` -> `cues.json`) into a mastered 48kHz 16-bit
stereo WAV soundtrack for the `mech` preset: a diegetic hydraulic pump/flow bed, cyclic
power-stroke thuds, servo/valve transits and mechanical foley (detents, ratchets, servo
tilts, impacts). No musical pads and no high-frequency chimes.

Optional recorded one-shots: `styles/calibration-lab/samples.json` maps cue kinds to CC0
recordings fetched by `tools/samples.py`. Missing cache = pure synthesis.

Usage:
  python3 tools/sound.py --cues cues.json --out <work-dir>/mix.wav [--preset mech]
  python3 tools/sound.py --cues cues.json --voice voice.wav --out mix.wav [--duck-db -10] [--voice-gain 0]
"""

import argparse
import json
from pathlib import Path
import sys
import wave
import zlib
import numpy as np
from scipy import signal

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT / "tools") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tools"))
try:
    from audio_grains import ensure_audio_grains
except Exception:
    ensure_audio_grains = None

SR = 48000

PRESETS = {
    "mech": {
        "chords": [
            [55.00, 82.41, 110.00, 146.83],
            [49.00, 73.42, 98.00, 130.81],
            [58.27, 87.31, 116.54, 146.83],
            [55.00, 82.41, 110.00, 138.59],
        ],
        "pad_gain": 0.09,
        "chime_freqs": [165.00, 220.00, 246.94, 293.66],
        "tap_freq": 185.0,
        "tick_freq": 280.0,
    },
}

PRESET_ALIASES = {
    "crt_synth": "mech",
    "terminal": "mech",
    "industrial-mech": "mech",
    "calibration-lab": "mech",
}


def resolve_preset(name: str) -> str:
    key = PRESET_ALIASES.get(name, name) if name else "mech"
    if key not in PRESETS:
        print(f"[sound] unknown preset {name!r}; this repo only ships 'mech'", file=sys.stderr)
        return "mech"
    return key


# =============================================================================
# 0. HYBRID GRAIN BANK LOADER & CORE PHYSICAL MODELING TOOLKIT
# =============================================================================

_GRAIN_CACHE = {}


def load_grain(name: str) -> np.ndarray:
    """Loads a 48kHz WAV grain from `assets/audio/<name>.wav` (auto-building if missing)."""
    key = name if name.endswith(".wav") else f"{name}.wav"
    if key in _GRAIN_CACHE:
        return _GRAIN_CACHE[key]
    audio_dir = REPO_ROOT / "assets" / "audio"
    fpath = audio_dir / key
    if not fpath.exists() and ensure_audio_grains is not None:
        ensure_audio_grains(audio_dir)
    if not fpath.exists():
        return np.zeros(int(0.2 * SR), dtype=np.float64)
    with wave.open(str(fpath), "rb") as wf:
        nch = wf.getnchannels()
        nframes = wf.getnframes()
        raw = np.frombuffer(wf.readframes(nframes), dtype=np.int16).astype(np.float64) / 32768.0
        if nch > 1:
            raw = raw.reshape(-1, nch)
    _GRAIN_CACHE[key] = raw
    return raw


def slice_grain(
    name: str,
    dur: float,
    pitch=1.0,
    rng: np.random.Generator = None,
    random_offset: bool = True,
    gain: float = 1.0,
) -> np.ndarray:
    """
    Slices a mono segment from a pre-baked acoustic grain in `assets/audio/`, applies
    fractional pitch-shifting (so every event has unique formant/pitch variation), and
    applies smooth raised-cosine anti-click fades.
    Accepts `dur` either in seconds (float <= 60) or in sample count (int > 60), and
    allows the 3rd positional arg to be either `pitch` (float) or `rng` (Generator).
    """
    if isinstance(pitch, np.random.Generator):
        rng = pitch
        pitch = 1.0
    if rng is None:
        rng = np.random.default_rng(101)
    raw = load_grain(name)
    if raw.ndim == 2:
        raw = raw.mean(axis=1)
    if isinstance(dur, (int, np.integer)) and dur > 60:
        n_out = max(16, int(dur))
    else:
        n_out = max(16, int(round(float(dur) * SR)))
    pitch_eff = float(np.clip(float(pitch) * rng.uniform(0.95, 1.05), 0.55, 1.95))
    n_src = max(16, int(round(n_out * pitch_eff)))

    if len(raw) <= n_src:
        reps = int(np.ceil(n_src / max(1, len(raw)))) + 1
        src = np.tile(raw, reps)[:n_src]
    else:
        max_off = len(raw) - n_src
        off = int(rng.integers(0, max_off + 1)) if random_offset and max_off > 0 else 0
        src = raw[off : off + n_src]

    # Fast linear interpolation resampling for pitch shift
    x_old = np.linspace(0.0, 1.0, len(src))
    x_new = np.linspace(0.0, 1.0, n_out)
    out = np.interp(x_new, x_old, src)
    return fade_in_out(out, 0.002, 0.015) * float(gain)


def fade_in_out(sig: np.ndarray, fade_in_s: float = 0.002, fade_out_s: float = 0.015) -> np.ndarray:
    """Smooth raised-cosine fade-in and fade-out so event boundaries never click."""
    n = len(sig)
    if n < 4:
        return sig
    out = sig.copy()
    fi = min(int(fade_in_s * SR), n // 3)
    fo = min(int(fade_out_s * SR), n // 3)
    if fi > 1:
        w_in = 0.5 * (1.0 - np.cos(np.pi * np.arange(fi) / fi))
        out[:fi] *= w_in[:, None] if out.ndim == 2 else w_in
    if fo > 1:
        w_out = 0.5 * (1.0 + np.cos(np.pi * np.arange(fo) / fo))
        out[-fo:] *= w_out[:, None] if out.ndim == 2 else w_out
    return out


def generate_pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """True 1/f pink noise via FFT spectral shaping (never harsh white noise)."""
    if n < 8:
        return np.zeros(max(1, n), dtype=np.float64)
    white = rng.standard_normal(n)
    spec = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, d=1.0 / SR)
    scale = 1.0 / np.sqrt(np.maximum(freqs, 20.0))
    scale[0] = 0.0
    pink = np.fft.irfft(spec * scale, n=n)
    return pink / (np.max(np.abs(pink)) + 1e-12)


def time_varying_bandpass(
    sig: np.ndarray,
    f_curve,
    q: float = 2.6,
    btype: str = "bandpass",
    block: int = 128,
) -> np.ndarray:
    """Zipper-free block-wise biquad filter sweep carrying exact state `zi` across blocks."""
    n = len(sig)
    if np.ndim(f_curve) == 0:
        f_arr = np.full(n, float(f_curve), dtype=np.float64)
    else:
        f_arr = np.asarray(f_curve, dtype=np.float64)
    out = np.zeros(n, dtype=np.float64)
    nyq = 0.5 * SR
    zi = None
    for i in range(0, n, block):
        j = min(n, i + block)
        fc = float(np.clip(f_arr[min(len(f_arr) - 1, (i + j) // 2)], 35.0, nyq * 0.92))
        if btype == "bandpass":
            bw = max(fc / max(q, 0.5), 28.0)
            low = np.clip((fc - 0.5 * bw) / nyq, 0.001, 0.94)
            high = np.clip((fc + 0.5 * bw) / nyq, low + 0.002, 0.96)
            sos = signal.butter(2, [low, high], btype="bandpass", output="sos")
        elif btype == "low":
            sos = signal.butter(2, np.clip(fc / nyq, 0.002, 0.96), btype="low", output="sos")
        else:
            sos = signal.butter(2, np.clip(fc / nyq, 0.002, 0.96), btype="high", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2), dtype=np.float64)
        out[i:j], zi = signal.sosfilt(sos, sig[i:j], zi=zi)
    return out


def modal_strike(
    f0: float,
    dur: float,
    material: str = "wood",
    pitch_drop=0.0,
    rng: np.random.Generator = None,
    amp: float = 1.0,
) -> np.ndarray:
    """Physical modal resonator + contact transient for wood, marimba, ceramic, glass, bell, brass, timpani, metal."""
    if isinstance(pitch_drop, np.random.Generator):
        rng = pitch_drop
        pitch_drop = 0.0
    if rng is None:
        rng = np.random.default_rng(101)
    n = max(16, int(round(dur * SR)))
    t = np.arange(n, dtype=np.float64) / SR

    if material == "wood":
        ratios, amps, decays = [1.0, 2.42, 4.15, 6.32], [1.0, 0.45, 0.22, 0.08], [0.055, 0.028, 0.014, 0.007]
        click_freq, click_dur, click_amp = 1400.0, 0.0035, 0.42
    elif material == "marimba":
        ratios, amps, decays = [1.0, 3.98, 9.25, 14.8], [1.0, 0.38, 0.14, 0.04], [0.18, 0.058, 0.018, 0.006]
        click_freq, click_dur, click_amp = 1800.0, 0.003, 0.30
    elif material == "ceramic":
        ratios, amps, decays = (
            [1.0, 1.58, 2.37, 3.44],
            [0.9, 0.55, 0.32, 0.14],
            [0.085, 0.055, 0.032, 0.018],
        )
        click_freq, click_dur, click_amp = 2200.0, 0.0025, 0.28
    elif material == "glass":
        ratios, amps, decays = [1.0, 2.0, 3.0], [1.0, 0.28, 0.08], [0.38, 0.18, 0.075]
        click_freq, click_dur, click_amp = 1800.0, 0.0025, 0.14
    elif material == "bell":
        ratios = [0.5, 1.0, 1.501, 2.0, 2.44]
        amps = [0.32, 1.0, 0.36, 0.40, 0.14]
        decays = [0.65, 0.52, 0.34, 0.24, 0.12]
        click_freq, click_dur, click_amp = 2100.0, 0.0025, 0.18
    elif material == "brass":
        ratios, amps, decays = (
            [1.0, 1.498, 2.002, 2.76, 3.85, 5.12],
            [1.0, 0.55, 0.48, 0.28, 0.15, 0.08],
            [0.34, 0.25, 0.19, 0.11, 0.065, 0.035],
        )
        click_freq, click_dur, click_amp = 2600.0, 0.0025, 0.40
    elif material == "timpani":
        ratios, amps, decays = (
            [1.0, 1.504, 1.742, 2.00, 2.295],
            [1.0, 0.62, 0.38, 0.26, 0.14],
            [0.52, 0.34, 0.22, 0.16, 0.10],
        )
        click_freq, click_dur, click_amp = 420.0, 0.008, 0.35
    else:  # metal
        ratios, amps, decays = (
            [1.0, 1.38, 1.92, 2.78, 4.05, 5.88],
            [0.9, 0.65, 0.5, 0.35, 0.22, 0.12],
            [0.09, 0.06, 0.045, 0.03, 0.018, 0.01],
        )
        click_freq, click_dur, click_amp = 2900.0, 0.002, 0.55

    out = np.zeros(n, dtype=np.float64)
    if abs(float(pitch_drop)) > 1e-4:
        f_env = f0 * (1.0 + float(pitch_drop) * np.exp(-t / 0.035))
        phase_base = 2.0 * np.pi * np.cumsum(f_env) / SR
    else:
        phase_base = 2.0 * np.pi * f0 * t

    att = 1.0 - np.exp(-t / 0.0008)
    for r, a, d in zip(ratios, amps, decays):
        if f0 * r >= 0.46 * SR:
            continue
        det = 1.0 + rng.uniform(-0.003, 0.003)
        out += a * att * np.exp(-t / d) * np.sin(r * det * phase_base)

    c_len = min(int(click_dur * SR * 4), n)
    if c_len > 8:
        t_c = np.arange(c_len) / SR
        burst = rng.standard_normal(c_len) * np.exp(-t_c / click_dur)
        nyq = 0.5 * SR
        bw_low = np.clip(click_freq * 0.5 / nyq, 0.01, 0.85)
        bw_high = np.clip(click_freq * 1.6 / nyq, bw_low + 0.02, 0.95)
        transient = signal.sosfilt(signal.butter(2, [bw_low, bw_high], btype="bandpass", output="sos"), burst)
        mallet = np.sin(np.pi * np.clip(t_c / (click_dur * 1.5), 0.0, 1.0)) * np.exp(-t_c / click_dur)
        out[:c_len] += click_amp * (0.65 * transient + 0.35 * mallet)

    mx = float(np.max(np.abs(out))) + 1e-12
    return fade_in_out(out / mx, fade_in_s=0.0004, fade_out_s=0.015) * float(amp)





def pan_stereo_haas(mono: np.ndarray, pan: float = 0.0, haas_ms: float = 0.16) -> np.ndarray:
    """Equal-power stereo panner with subtle Haas micro-delay on the contralateral channel."""
    pan = float(np.clip(pan, -1.0, 1.0))
    angle = (pan + 1.0) * (np.pi / 4.0)
    g_l, g_r = np.cos(angle), np.sin(angle)
    n = len(mono)
    out = np.zeros((n, 2), dtype=np.float64)
    delay_samples = int(abs(pan) * (haas_ms * 0.001 * SR))
    if 0 < delay_samples < n:
        if pan < 0:
            out[:, 0] = mono * g_l
            out[delay_samples:, 1] = mono[:-delay_samples] * g_r
        else:
            out[delay_samples:, 0] = mono[:-delay_samples] * g_l
            out[:, 1] = mono * g_r
    else:
        out[:, 0] = mono * g_l
        out[:, 1] = mono * g_r
    return out


def add_studio_tail(
    stereo: np.ndarray,
    wet: float = 0.14,
    rt60: float = 0.26,
    damp_hz: float = 3800.0,
    room_size: float = None,
) -> np.ndarray:
    """Finite 10-tap early reflection + air-damped room tail so foley events sit in a real acoustic space."""
    if room_size is not None:
        rt60 = float(room_size)
    tail_len = int(rt60 * 1.25 * SR)
    n_in = len(stereo)
    total_len = n_in + tail_len
    padded = np.zeros((total_len, 2), dtype=np.float64)
    padded[:n_in] = stereo
    taps_ms = [6.7, 11.3, 17.9, 24.1, 32.3, 43.7, 56.9, 73.1, 94.7, 121.3]
    refl = np.zeros_like(padded)
    for idx, t_ms in enumerate(taps_ms):
        d = int(t_ms * 0.001 * SR)
        if d >= total_len:
            continue
        decay_gain = (10.0 ** (-3.0 * (t_ms * 0.001) / max(rt60, 0.05))) * (0.85 ** idx)
        if idx % 2 == 0:
            refl[d:, 0] += padded[:-d, 0] * decay_gain
            refl[d:, 1] += padded[:-d, 1] * decay_gain * 0.90
        else:
            refl[d:, 0] += padded[:-d, 1] * decay_gain * 0.88
            refl[d:, 1] += padded[:-d, 0] * decay_gain
    sos_lp = signal.butter(2, float(np.clip(damp_hz, 250.0, 14000.0)) / (0.5 * SR), btype="low", output="sos")
    sos_hp = signal.butter(1, 110.0 / (0.5 * SR), btype="high", output="sos")
    refl = signal.sosfilt(sos_lp, refl, axis=0)
    refl = signal.sosfilt(sos_hp, refl, axis=0)
    return fade_in_out(padded + wet * refl, fade_in_s=0.0004, fade_out_s=0.025)


def load_sample_wav(path: str) -> np.ndarray:
    """Decode an indexed 48 kHz stereo wav to float32 (n, 2)."""
    from scipy.io import wavfile

    rate, data = wavfile.read(path)
    if rate != SR:
        raise ValueError(f"sample.py index must be 48 kHz, got {rate}: {path}")
    if data.ndim == 1:
        data = np.stack([data, data], axis=1)
    return (data.astype(np.float32) / 32768.0)


def pitch_sample(sig: np.ndarray, ratio: float) -> np.ndarray:
    """Cheap linear resample: `ratio` < 1 lowers pitch, > 1 raises it."""
    if abs(ratio - 1.0) < 1e-4:
        return sig
    n = max(16, int(round(len(sig) / ratio)))
    src = np.linspace(0.0, len(sig) - 1.0, n)
    i0 = np.floor(src).astype(np.int64)
    i1 = np.minimum(i0 + 1, len(sig) - 1)
    frac = (src - i0)[:, None]
    return (sig[i0] * (1.0 - frac) + sig[i1] * frac).astype(np.float32)


def overlay_samples(stereo: np.ndarray, cue_data: dict, sample_map_path: str) -> tuple[np.ndarray, list[str]]:
    """
    Add recorded one-shots over the synthesized score.

    `sample_map_path` is a style-level JSON: an index path plus kind -> sample bindings:
      { "index": "../../../out/samples-cache/index.json",
        "map": { "brass_ratchet": {"sample": "ratchet-crank", "gain": 0.9} },
        "bed": {"sample": "cello-bed", "gain": 0.16, "pitch": 0.5} }
    A missing cache is not an error: the score falls back to synthesis.
    """
    import json as _json
    from pathlib import Path as _Path

    map_path = _Path(sample_map_path)
    if not map_path.is_file():
        return stereo, []
    cfg = _json.loads(map_path.read_text(encoding="utf-8"))
    index_path = _Path(cfg.get("index", "../../../out/samples-cache/index.json"))
    if not index_path.is_absolute():
        index_path = (map_path.parent / index_path).resolve()
    if not index_path.is_file():
        print(f"[sound] samples: no index at {index_path}; falling back to synthesis", file=sys.stderr)
        return stereo, []
    index = _json.loads(index_path.read_text(encoding="utf-8"))
    cache = _Path(index.get("cache", index_path.parent))
    entries = index.get("samples", {})
    used: list[str] = []

    def play(ident: str, t: float, gain: float, ratio: float, pan: float) -> None:
        entry = entries.get(ident)
        if not entry:
            return
        path = cache / entry["file"]
        if not path.is_file():
            return
        sig = pitch_sample(load_sample_wav(str(path)), ratio)
        sig = sig * float(gain) * float(entry.get("gain", 1.0))
        mix_into(stereo, int(round(t * SR)), sig, pan=pan)
        used.append(ident)

    bed = cfg.get("bed")
    if bed and bed.get("sample"):
        entry = entries.get(bed["sample"])
        if entry:
            path = cache / entry["file"]
            if path.is_file():
                sig = pitch_sample(load_sample_wav(str(path)), float(bed.get("pitch", 1.0)))
                gain = float(bed.get("gain", 0.12))
                reps = int(np.ceil(float(cue_data.get("dur", 6.0)) * SR / max(1, len(sig)))) + 1
                loop = np.tile(sig, (reps, 1))[: int(float(cue_data.get("dur", 6.0)) * SR)]
                loop *= gain
                loop = fade_in_out(loop, 0.6, 0.9)
                stereo[: len(loop)] += loop
                used.append(bed["sample"])

    bindings = cfg.get("map", {})
    for idx, cue in enumerate(cue_data.get("cues", [])):
        kind = str(cue.get("kind", ""))
        bind = bindings.get(kind)
        if not bind:
            continue
        intensity = float(cue.get("intensity", 0.75))
        pan = float(np.clip(((zlib.crc32(f"{kind}:{idx}".encode()) % 100) - 50) / 125.0, -0.4, 0.4))
        play(
            bind.get("sample", ""),
            float(cue.get("t", 0.0)),
            float(bind.get("gain", 1.0)) * (0.6 + 0.4 * intensity),
            float(bind.get("pitch", 1.0)),
            pan,
        )
    return stereo, used


def mix_into(stereo: np.ndarray, start_idx: int, sig: np.ndarray, pan: float = 0.0):
    """Mixes a mono or stereo signal into stereo buffer at `start_idx`."""
    if start_idx >= stereo.shape[0] or len(sig) == 0:
        return
    if start_idx < 0:
        sig = sig[-start_idx:]
        start_idx = 0
    end_idx = min(stereo.shape[0], start_idx + len(sig))
    n = end_idx - start_idx
    if n <= 0:
        return
    if sig.ndim == 2:
        stereo[start_idx:end_idx, 0] += sig[:n, 0]
        stereo[start_idx:end_idx, 1] += sig[:n, 1]
    else:
        panned = pan_stereo_haas(sig[:n], pan=pan)
        stereo[start_idx:end_idx] += panned


def _derive_topic_signature(cue_data: dict, base_seed: int = 77) -> dict:
    """
    Computes a deterministic musical variation signature from the video's scenes & cues so
    different topics within the same style have distinct key centers, chord progressions,
    melodic contours, and tempo breathing instead of identical background loops.
    """
    scenes = cue_data.get("scenes") or []
    cues = cue_data.get("cues") or []
    fingerprint = "|".join(
        [f"{s.get('id','')}:{s.get('title','')}:{s.get('look','')}:{s.get('dur',0)}" for s in scenes]
        + [f"{c.get('kind','')}:{c.get('label','')}" for c in cues[:16]]
    )
    h = zlib.crc32(fingerprint.encode("utf-8")) & 0xFFFFFFFF
    semitones = [-3, -2, 0, 2, 3, 4, 5][h % 7]
    pitch_mult = float(2.0 ** (semitones / 12.0))
    prog_orders = [
        [0, 1, 2, 3],
        [0, 3, 1, 2],
        [1, 3, 0, 2],
        [0, 2, 3, 1],
    ]
    arp_patterns = [
        [0, 2, 1, 3, 2, 4, 1, 2],
        [0, 1, 3, 2, 4, 3, 1, 2],
        [2, 0, 3, 1, 4, 2, 3, 0],
        [0, 3, 2, 4, 1, 3, 2, 0],
    ]
    tempo_scale = 0.94 + 0.03 * ((h >> 8) % 5)
    prog_order = prog_orders[(h >> 3) % len(prog_orders)]
    return {
        "hash": h,
        "seed": (int(base_seed) ^ int(h)) & 0xFFFFFFFF,
        "semitones": semitones,
        "pitch_mult": pitch_mult,
        "pitch_ratio": pitch_mult,
        "prog_order": prog_order,
        "chord_rot": prog_order[0],
        "arp_pattern": arp_patterns[(h >> 5) % len(arp_patterns)],
        "tempo_scale": tempo_scale,
    }





def _build_foley_pocket_mask(n_samples: int, scenes: list, cues: list, duck_floor: float = 0.58) -> np.ndarray:
    """
    Builds a smooth dynamic envelope (0..1) for the score bed that:
      1. Honors explicit scene `silence` or tension moods;
      2. Ducks melodic accompaniment slightly (`duck_floor`) around prominent foley cues
         so physical actions (ratchets, footsteps, page turns, splashes) read clearly;
      3. Gives scenes a natural dramatic arc (gentle intro -> fuller middle -> warm resolution).
    """
    mask = np.ones(n_samples, dtype=np.float64)
    for idx, sc in enumerate(scenes or []):
        s0 = max(0, int(round(float(sc.get("start", 0.0)) * SR)))
        s1 = min(n_samples, int(round(float(sc.get("end", float(sc.get("start", 0.0)) + float(sc.get("dur", 3.5)))) * SR)))
        if s1 <= s0:
            continue
        mood = str(sc.get("mood") or sc.get("look") or "").lower()
        if any(w in mood for w in ("suspend", "tension", "dusk", "drought")):
            mask[s0:s1] *= 0.72
        elif idx == 0:
            mask[s0:s1] *= 0.85
        if sc.get("silence"):
            try:
                parts = [float(x) for x in str(sc.get("silence")).split(":")]
                if len(parts) >= 2:
                    q0 = max(s0, s0 + int(round(parts[0] * SR)))
                    q1 = min(s1, s0 + int(round(parts[1] * SR)))
                    if q1 > q0:
                        mask[q0:q1] = 0.08
            except Exception:
                pass

    for c in cues or []:
        t_c = float(c.get("t", -1.0))
        inten = float(c.get("intensity", 0.7))
        if t_c < 0 or inten < 0.55:
            continue
        c_idx = int(round(t_c * SR))
        w_pre = int(0.03 * SR)
        w_hold = int(0.22 * SR)
        i0 = max(0, c_idx - w_pre)
        i1 = min(n_samples, c_idx + w_hold)
        if i1 > i0:
            t_local = np.linspace(0.0, 1.0, i1 - i0)
            dip = 1.0 - (1.0 - duck_floor) * min(1.0, inten) * (np.sin(np.pi * t_local) ** 1.2)
            mask[i0:i1] = np.minimum(mask[i0:i1], dip)
    return mask


# =============================================================================
# 1. ACOUSTIC BODY & SPACE IMPULSE RESPONSE (IR) CONVOLUTION ENGINE
# =============================================================================

_IR_CACHE = {}








# =============================================================================
# 2. MEDIUM-SPECIFIC PHYSICAL MODELING & SCORE ENGINES
# =============================================================================
























































def synth_industrial_mech_bed(
    dur: float,
    scenes: list,
    cfg: dict,
    rng: np.random.Generator,
    cues: list = None,
    sig: dict = None,
) -> np.ndarray:
    """
    Pure Diegetic Mechanical & Hydraulic Acoustic Bed (`mech` / `industrial-mech` / `calibration-lab`):
      - ZERO musical chords, ZERO synth pads, ZERO high-frequency chimes/beeps.
      - Layer 1: Deep-sea / laboratory hydraulic pump & fluid flow bed (38-135 Hz low-passed pink/brown noise
        + damped 52 Hz turbine fundamental with gentle kinematic breathing).
      - Layer 2: Cyclic mechanical power-stroke / propulsion thud cadence (soft 56-74 Hz damped sub-thumps
        paired with low-mid pneumatic valve breaths, inspired by teardown's score_kit.thud & airy).
      - Layer 3: Per-scene servo/actuator gimbal glide on camera & subsystem transitions.
    """
    sig = sig or _derive_topic_signature({"scenes": scenes, "cues": cues})
    n_samples = int(round(dur * SR))
    stereo = np.zeros((n_samples, 2), dtype=np.float64)
    if not scenes:
        scenes = [{"start": 0.0, "dur": dur, "end": dur}]

    t_full = np.arange(n_samples, dtype=np.float64) / SR

    # 1. Continuous deep hydraulic & fluid flow bed (warm 38-135 Hz low-passed pink noise + 52 Hz pump hum)
    pink_l = generate_pink_noise(n_samples, rng)
    pink_r = generate_pink_noise(n_samples, rng)
    fc_flow = 88.0 + 28.0 * np.sin(2.0 * np.pi * 0.42 * t_full) + 14.0 * np.sin(2.0 * np.pi * 1.15 * t_full)
    flow_l = time_varying_bandpass(pink_l, fc_flow, btype="low") * 0.085
    flow_r = time_varying_bandpass(pink_r, fc_flow * 1.04, btype="low") * 0.085

    # Subtle 52 Hz hydraulic pump fundamental + 104 Hz second harmonic (heavily damped, warm)
    f_pump = 52.0 * (1.0 + 0.018 * np.sin(2.0 * np.pi * 0.35 * t_full))
    ph_pump = 2.0 * np.pi * np.cumsum(f_pump) / SR
    pump_mod = 0.78 + 0.22 * np.sin(2.0 * np.pi * 1.35 * t_full)
    pump_hum = (np.sin(ph_pump) + 0.28 * np.sin(2.0 * ph_pump)) * pump_mod * 0.042

    stereo[:, 0] += flow_l + pump_hum * 0.96
    stereo[:, 1] += flow_r + pump_hum * 1.04

    # 2. Cyclic mechanical power-stroke thuds & soft valve air across scenes
    for idx, sc in enumerate(scenes):
        start_t = float(sc.get("start", 0.0))
        sc_dur = float(sc.get("dur", max(1.0, dur - start_t)))
        stroke_period = 0.74 if idx in (1, 2) else 0.84
        t_cursor = start_t + 0.22
        stroke_i = 0
        while t_cursor < min(dur - 0.25, start_t + sc_dur - 0.15):
            thud_dur = 0.32
            n_th = int(round(thud_dur * SR))
            t_th = np.arange(n_th, dtype=np.float64) / SR
            f_th = (64.0 if (stroke_i % 2 == 0) else 56.0) + 28.0 * np.exp(-t_th / 0.028)
            ph_th = 2.0 * np.pi * np.cumsum(f_th) / SR
            att_th = np.clip(t_th / 0.005, 0.0, 1.0)
            thud_sig = np.sin(ph_th) * np.exp(-t_th / 0.085) * att_th * 0.068

            air_noise = generate_pink_noise(n_th, rng)
            air_fc = 190.0 + 140.0 * np.sin(np.pi * t_th / thud_dur)
            air_sig = time_varying_bandpass(air_noise, air_fc, q=1.4, btype="bandpass") * np.sin(np.pi * t_th / thud_dur) * 0.028

            pan_pos = -0.16 if (stroke_i % 2 == 0) else 0.16
            mix_into(stereo, int(round(t_cursor * SR)), thud_sig + air_sig, pan=pan_pos)
            t_cursor += stroke_period
            stroke_i += 1

        # 3. Scene-opening gimbal servo & pneumatic actuator transit
        servo_dur = min(1.15, sc_dur * 0.35)
        if servo_dur > 0.25:
            n_sv = int(round(servo_dur * SR))
            t_sv = np.arange(n_sv, dtype=np.float64) / SR
            env_sv = np.sin(np.pi * t_sv / servo_dur) ** 1.15
            f_rot = 135.0 + 42.0 * np.sin(np.pi * t_sv / servo_dur)
            ph_rot = 2.0 * np.pi * np.cumsum(f_rot) / SR
            rotor = (np.sin(ph_rot) + 0.32 * np.sin(2.0 * ph_rot)) * env_sv * 0.024
            sv_air = time_varying_bandpass(
                generate_pink_noise(n_sv, rng),
                240.0 + 220.0 * np.sin(np.pi * t_sv / servo_dur),
                q=1.2,
                btype="bandpass",
            ) * env_sv * 0.036
            mix_into(stereo, int(round((start_t + 0.06) * SR)), rotor + sv_air, pan=0.12 if idx % 2 == 0 else -0.12)

    pocket = _build_foley_pocket_mask(n_samples, scenes, cues, duck_floor=0.68)
    return fade_in_out(stereo * pocket[:, None], 0.18, 0.35)





# =============================================================================
# 3. FRAME-ACCURATE SEMANTIC FOLEY & SCENE TRANSITION CUES
# =============================================================================


def synth_scene_cut(cfg: dict, preset: str, intensity: float, idx: int, rng: np.random.Generator) -> np.ndarray:
    """Mechanical scene transition: sub thud, air release and a wooden clunk."""
    dur = 0.58
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f_sub = 48.0 + 54.0 * np.exp(-t / 0.038)
    sub_thud = np.sin(2.0 * np.pi * np.cumsum(f_sub) / SR) * np.exp(-t / 0.13) * np.clip(t / 0.004, 0.0, 1.0) * 0.42
    noise = generate_pink_noise(n, rng)
    air_release = time_varying_bandpass(noise, 180.0 + 340.0 * np.exp(-t / 0.18), 1.5) * np.sin(np.pi * np.clip(t / 0.38, 0.0, 1.0)) * 0.24
    clunk = modal_strike(168.0, 0.18, "wood", rng, amp=0.22)
    out = sub_thud + air_release
    out[: min(n, len(clunk))] += clunk[: min(n, len(clunk))]
    return out * intensity


def synth_card_enter(cfg: dict, preset: str, intensity: float, idx: int, rng: np.random.Generator) -> np.ndarray:
    """Mechanical card/element entrance: pitch-swept thock plus a soft detent strike."""
    f0 = cfg["tap_freq"] * (1.0 + ((idx * 3) % 5) * 0.055)
    dur = 0.18
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    f_thock = (145.0 + 65.0 * np.exp(-t / 0.018)) * (0.94 + 0.04 * (idx % 3))
    thock = np.sin(2.0 * np.pi * np.cumsum(f_thock) / SR) * np.exp(-t / 0.042) * np.clip(t / 0.002, 0.0, 1.0) * 0.30
    detent = modal_strike(240.0, dur, "wood", rng, amp=0.18)
    return (thock + detent[:n]) * intensity


def synth_layer_float(cfg: dict, preset: str, intensity: float, idx: int, rng: np.random.Generator) -> np.ndarray:
    """Servo glide plus a damped stop thud for a mechanical layer lift."""
    dur = 0.46
    n = int(round(dur * SR))
    f1 = cfg["chime_freqs"][(idx + 1) % len(cfg["chime_freqs"])]
    t = np.arange(n, dtype=np.float64) / SR
    noise = generate_pink_noise(n, rng)
    glide = time_varying_bandpass(noise, 190.0 + 220.0 * np.sin(np.pi * t / dur), 1.6) * np.sin(np.pi * t / dur) * 0.22
    stop_thud = np.sin(2.0 * np.pi * 68.0 * t) * np.exp(-t / 0.09) * np.clip(t / 0.005, 0.0, 1.0) * 0.18
    return (glide + stop_thud) * intensity


def synth_count_tick(cfg: dict, preset: str, intensity: float, idx: int, rng: np.random.Generator) -> np.ndarray:
    """Mechanical detent tick: damped thock plus a high-frequency burst."""
    f0 = cfg["tick_freq"] * (1.0 + (idx % 4) * 0.04)
    dur = 0.048
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    thock = np.sin(2.0 * np.pi * (210.0 + 18.0 * (idx % 3)) * t) * np.exp(-t / 0.009) * 0.16
    burst = time_varying_bandpass(generate_pink_noise(n, rng), 420.0, 1.8) * np.exp(-t / 0.004) * 0.12
    return fade_in_out((thock + burst) * intensity, 0.0005, 0.008)


def synth_stroke_draw(preset: str, intensity: float, rng: np.random.Generator) -> np.ndarray:
    """Band-swept noise stroke for mechanical draw-on cues."""
    dur = 0.38
    n = int(round(dur * SR))
    t = np.arange(n, dtype=np.float64) / SR
    noise = generate_pink_noise(n, rng)
    f_c = 700.0 + 1800.0 * np.sin(np.pi * t / dur)
    return time_varying_bandpass(noise, f_c, 2.8) * np.sin(np.pi * t / dur) * 0.16 * intensity


def synth_runtime_foley(
    kind: str,
    preset: str,
    intensity: float,
    rng: np.random.Generator,
    pitch: float = 1.0,
) -> np.ndarray:
    """
    Synthesizes the calibration-lab mechanical semantic action foley cues.
    """
    p_scale = float(np.clip(pitch * rng.uniform(0.95, 1.05), 0.65, 1.55))

    # --- MECHANICAL FOLEY ---

    if kind == "brass_ratchet":
        dur = 0.42
        n = int(round(dur * SR))
        t = np.arange(n, dtype=np.float64) / SR
        out = np.zeros(n, dtype=np.float64)
        for click_i, t_off in enumerate((0.01, 0.085, 0.165, 0.255)):
            s0 = int(round(t_off * SR))
            c_len = min(int(0.065 * SR), n - s0)
            if c_len > 8:
                tc = np.arange(c_len, dtype=np.float64) / SR
                f_det = (185.0 + 22.0 * click_i) * p_scale
                det = np.sin(2.0 * np.pi * f_det * tc) * np.exp(-tc / 0.012) * 0.24
                clunk = modal_strike(260.0 * p_scale, 0.065, "wood", rng, amp=0.18)
                out[s0 : s0 + c_len] += det + clunk[:c_len]
        flow = time_varying_bandpass(generate_pink_noise(n, rng), 220.0 * p_scale, 1.6) * np.sin(np.pi * t / dur) * 0.16
        return fade_in_out((out + flow) * intensity, 0.002, 0.02)

    if kind == "scale_tilt":
        dur = 0.50
        n = int(round(dur * SR))
        t = np.arange(n, dtype=np.float64) / SR
        f_servo = (128.0 + 48.0 * np.sin(np.pi * t / dur)) * p_scale
        ph_servo = 2.0 * np.pi * np.cumsum(f_servo) / SR
        servo = (np.sin(ph_servo) + 0.35 * np.sin(2.0 * ph_servo)) * np.sin(np.pi * t / dur) * 0.18
        valve = time_varying_bandpass(generate_pink_noise(n, rng), (240.0 + 160.0 * np.sin(np.pi * t / dur)) * p_scale, 1.8) * np.sin(np.pi * t / dur) * 0.20
        lock_thud = np.sin(2.0 * np.pi * 74.0 * t) * np.exp(-t / 0.095) * np.clip(t / 0.004, 0.0, 1.0) * 0.28
        return fade_in_out((servo + valve + lock_thud) * intensity, 0.003, 0.025)

    if kind == "curtain_whoosh":
        dur = 0.44
        n = int(round(dur * SR))
        t = np.arange(n, dtype=np.float64) / SR
        f_sw = (320.0 + 1600.0 * np.sin(np.pi * t / dur)) * p_scale
        sw = time_varying_bandpass(generate_pink_noise(n, rng), f_sw, 2.2) * np.sin(np.pi * t / dur) * 0.34
        return sw * intensity

    if kind in ("boing_hop", "cartoon_boing"):
        dur = 0.34
        n = int(round(dur * SR))
        t = np.arange(n, dtype=np.float64) / SR
        f_curve = 230.0 * p_scale * (1.0 + 0.92 * (1.0 - np.exp(-t / 0.08)) + 0.22 * np.sin(2.0 * np.pi * 22.0 * t))
        phase = 2.0 * np.pi * np.cumsum(f_curve) / SR
        boing = (np.sin(phase) + 0.35 * np.sin(2.0 * phase)) * np.exp(-t / 0.16) * 0.24
        return boing * intensity

    if kind == "cymbal_clang":
        dur = 0.58
        n = int(round(dur * SR))
        cym = modal_strike(1180.0 * p_scale, dur, "metal", rng, amp=0.32)
        sizzle = time_varying_bandpass(generate_pink_noise(n, rng), 5200.0, 1.8) * np.exp(-np.arange(n) / (0.18 * SR)) * 0.22
        return (cym[:n] + sizzle) * intensity

    if kind == "slide_whistle":
        dur = 0.42
        n = int(round(dur * SR))
        t = np.arange(n, dtype=np.float64) / SR
        f_gliss = (540.0 + 1320.0 * np.sin(np.pi * np.clip(t / dur, 0.0, 1.0)) ** 1.2) * p_scale
        whistle = np.sin(2.0 * np.pi * np.cumsum(f_gliss) / SR) * np.sin(np.pi * t / dur) * 0.24
        breath = time_varying_bandpass(generate_pink_noise(n, rng), f_gliss, 6.0) * 0.08
        return (whistle + breath) * intensity

    if kind == "foot_step":
        dur = 0.14
        n = int(round(dur * SR))
        thud = modal_strike(155.0 * p_scale, dur, "wood", rng, amp=0.22)
        scuff = slice_grain("foliage_paw_grain", n, rng, gain=0.28)
        return (thud[:n] + scuff) * intensity

    return synth_stroke_draw(preset, intensity, rng)


def _resolve_cue_semantic_action(kind: str, label: str, preset: str) -> str:
    """Maps (kind, label) from HTML data-cues and runtime cues to calibration-lab synthesis primitives."""
    k = (kind or "").strip().lower()
    lbl = (label or "").strip().lower()

    direct_foley = {
        "brass_ratchet",
        "scale_tilt",
        "cymbal_clang",
        "curtain_whoosh",
        "slide_whistle",
        "foot_step",
        "boing_hop",
        "cartoon_boing",
        "brush_sweep",
    }
    if k in direct_foley:
        return k
    if lbl in direct_foley:
        return lbl

    # Direct [data-sfx] aliases used by mechanical worlds.
    if k in ("whoosh", "swipe"):
        return "curtain_whoosh"
    if k in ("pop", "thud", "impact", "hit", "slam"):
        return "foot_step" if k == "thud" else "card_enter"
    if k == "chime":
        return "card_enter"

    for token in (lbl, k):
        if not token:
            continue
        # Mechanical parts & measurement
        if any(w in token for w in ("dial", "compass", "caliper", "escapement", "ratchet", "chronometer", "gear", "vernier")):
            return "brass_ratchet"
        if any(w in token for w in ("balance", "scale", "tilt", "pendulum", "equilibrium")):
            return "scale_tilt"
        if any(w in token for w in ("clang", "cymbal", "crash", "starburst", "anvil", "smash", "pie")):
            return "cymbal_clang"
        if any(w in token for w in ("curtain", "drape", "spotlight", "stage")):
            return "curtain_whoosh"
        if any(w in token for w in ("whistle", "slide_whistle", "siren", "eyeball", "jaw_drop", "take")):
            return "slide_whistle"
        if any(w in token for w in ("boing", "hop", "bounce", "spring", "jump", "glove")):
            return "cartoon_boing"
        if any(w in token for w in ("step", "walk", "stride")):
            return "foot_step"
        if any(w in token for w in ("brush", "stroke", "draw", "etch", "scribe")):
            return "stroke_draw"

    if k in ("scene_cut", "cut"):
        return "scene_cut"
    if k in ("layer_float", "float", "mist"):
        return "layer_float"
    if k in ("count_tick", "tick"):
        return "count_tick"
    if k in ("stroke_draw", "stroke"):
        return "stroke_draw"
    if k in ("enter", "card_enter"):
        return "card_enter"
    return "card_enter"


def master_bus(stereo: np.ndarray, preset: str = "mech", ceiling_db: float = -1.2) -> np.ndarray:
    """Applies calibration-lab tonal shaping, DC block, dynamic-range-preserving leveling, and true-peak limiting."""
    # Remove DC/rumble below 28 Hz.
    sos_hp = signal.butter(2, 28.0 / (0.5 * SR), btype="high", output="sos")
    out = signal.sosfilt(sos_hp, stereo, axis=0)

    # Warm heavy-machinery / deep-sea lab acoustic roll-off at 2.2 kHz: zero harsh metallic/electronic highs
    sos_lp = signal.butter(2, 2200.0 / (0.5 * SR), btype="low", output="sos")
    out = signal.sosfilt(sos_lp, out, axis=0)

    # Measure RMS only on active (non-silent) regions so silence holds are never pumped up
    mono_abs = np.max(np.abs(out), axis=1)
    active_mask = mono_abs > 1.5e-3
    if np.any(active_mask):
        active_rms = np.sqrt(np.mean(out[active_mask] ** 2) + 1e-12)
    else:
        active_rms = np.sqrt(np.mean(out ** 2) + 1e-12)

    # Preserve wide Crest Factor for mechanical transients while keeping healthy loudness
    target_rms = 0.095
    max_gain = 1.8
    gain = float(np.clip(target_rms / active_rms, 0.55, max_gain))
    out = out * gain

    # Soft-knee transparent limiting only above knee_thresh (0.68 ~ -3.3 dBFS) so silence & quiet passages stay linear
    knee_thresh = 0.68
    mag = np.abs(out)
    over = mag > knee_thresh
    if np.any(over):
        sign = np.sign(out[over])
        excess = (mag[over] - knee_thresh) / (1.0 - knee_thresh)
        out[over] = sign * (knee_thresh + (1.0 - knee_thresh) * np.tanh(excess))

    # True-peak ceiling at ceiling_db (-1.2 dBTP)
    ceiling = 10.0 ** (ceiling_db / 20.0)
    peak = float(np.max(np.abs(out)))
    if peak > ceiling:
        out *= ceiling / peak
    elif peak > 1e-5:
        out *= min(1.22, ceiling / peak)

    # Gentle 40ms fade-in and 120ms fade-out
    n = out.shape[0]
    fi = min(n, int(0.04 * SR))
    fo = min(n, int(0.12 * SR))
    if fi > 0:
        out[:fi] *= np.linspace(0.0, 1.0, fi)[:, None]
    if fo > 0:
        out[-fo:] *= np.linspace(1.0, 0.0, fo)[:, None]

    return out


def _load_voice(path: str, n: int) -> np.ndarray:
    """Read a mono/stereo voice WAV, resample to 48 kHz, and fit it to `n` samples."""
    try:
        import soundfile as sf
    except ImportError:
        raise SystemExit("sound.py: --voice needs soundfile (pip install soundfile)")
    try:
        audio, sr = sf.read(path, dtype="float32", always_2d=False)
    except Exception as e:
        raise SystemExit(f"sound.py: cannot read voice '{path}': {e}")
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = audio.reshape(-1)
    if sr != SR and audio.size:
        audio = signal.resample_poly(audio, SR, sr).astype(np.float32)
    if audio.size < n:
        audio = np.pad(audio, (0, n - audio.size))
    else:
        audio = audio[:n]
    return audio


def voice_envelope(voice: np.ndarray, attack: float = 0.02, release: float = 0.25) -> np.ndarray:
    """10 ms RMS envelope (0..1) with a fast attack and a slow release for sidechain ducking."""
    hop = max(1, int(0.01 * SR))
    frames = voice.size // hop
    if frames <= 0:
        return np.zeros(voice.size, dtype=np.float32)
    rms = np.sqrt(np.mean(voice[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    ref = float(np.percentile(rms, 95))
    if ref < 1e-5:
        return np.zeros(voice.size, dtype=np.float32)
    target = np.clip((rms / ref - 0.04) / 0.96, 0.0, 1.0)
    ca = 1.0 - np.exp(-hop / (max(float(attack), 1e-3) * SR))
    cr = 1.0 - np.exp(-hop / (max(float(release), 1e-3) * SR))
    env = np.empty_like(target)
    y = 0.0
    for i, x in enumerate(target):
        y += (x - y) * (ca if x > y else cr)
        env[i] = y
    env = np.repeat(env, hop)
    if env.size < voice.size:
        env = np.pad(env, (0, voice.size - env.size), constant_values=float(env[-1]) if env.size else 0.0)
    return env[: voice.size].astype(np.float32)


def mix_voice_into(
    stereo: np.ndarray,
    voice_path: str,
    duck_db: float = -10.0,
    voice_gain_db: float = 0.0,
    attack: float = 0.02,
    release: float = 0.25,
    ceiling_db: float = -1.2,
) -> np.ndarray:
    """
    Carve a Mid-channel spectral vocal pocket (220 Hz - 3800 Hz) under the voice with 18 ms lookahead,
    preserving <220 Hz bass fundamentals and stereo Side ambience, then blend the voice with a subtle
    decorrelated early-reflection halo and soft-knee true-peak limiting.
    """
    n = stereo.shape[0]
    voice = _load_voice(voice_path, n)
    if not np.any(voice):
        return stereo
    duck_db = min(0.0, float(duck_db))
    bg = np.asarray(stereo, dtype=np.float64)
    v = np.asarray(voice, dtype=np.float64)

    if duck_db < 0.0:
        lookahead = int(0.018 * SR)
        v_det = np.pad(v[lookahead:], (0, min(lookahead, v.size))) if lookahead < v.size else v
        env = voice_envelope(v_det.astype(np.float32), attack=attack, release=max(release, 0.28)).astype(np.float64)

        mid = 0.5 * (bg[:, 0] + bg[:, 1])
        side = 0.5 * (bg[:, 0] - bg[:, 1])
        sos_formant = signal.butter(2, [220.0 / (0.5 * SR), 3800.0 / (0.5 * SR)], btype="band", output="sos")
        mid_formant = signal.sosfilt(sos_formant, mid)
        mid_outer = mid - mid_formant

        floor_mid = 10.0 ** (duck_db / 20.0)
        floor_outer = 10.0 ** ((duck_db * 0.35) / 20.0)
        floor_side = 10.0 ** ((duck_db * 0.22) / 20.0)

        mid_ducked = mid_formant * (1.0 - (1.0 - floor_mid) * env) + mid_outer * (1.0 - (1.0 - floor_outer) * env)
        side_ducked = side * (1.0 - (1.0 - floor_side) * env)
        bg = np.column_stack((mid_ducked + side_ducked, mid_ducked - side_ducked))

    v_scaled = v * (10.0 ** (float(voice_gain_db) / 20.0))
    sos_halo = signal.butter(2, [200.0 / (0.5 * SR), 2800.0 / (0.5 * SR)], btype="band", output="sos")
    v_halo = signal.sosfilt(sos_halo, v_scaled) * 0.18
    d_l, d_r = int(0.013 * SR), int(0.021 * SR)
    halo_l = np.pad(v_halo[:-d_l], (d_l, 0)) if d_l < n else np.zeros_like(v_scaled)
    halo_r = -np.pad(v_halo[:-d_r], (d_r, 0)) if d_r < n else np.zeros_like(v_scaled)

    out = np.column_stack((bg[:, 0] + v_scaled + halo_l, bg[:, 1] + v_scaled + halo_r))
    ceiling = 10.0 ** (float(ceiling_db) / 20.0)
    knee = ceiling * 0.78
    mag = np.abs(out)
    over = mag > knee
    if np.any(over):
        sign = np.sign(out[over])
        excess = (mag[over] - knee) / max(ceiling - knee, 1e-6)
        out[over] = sign * (knee + (ceiling - knee) * np.tanh(excess))
    peak = float(np.max(np.abs(out)))
    if peak > ceiling:
        out = out * (ceiling / peak)
    return out.astype(np.float32)


def synthesize_from_cues(cue_data: dict, preset: str = "mech", seed: int = 77, skip_kinds: set | None = None) -> np.ndarray:
    preset = resolve_preset(preset)
    cfg = PRESETS[preset]
    dur = float(cue_data.get("dur", 6.0))
    scenes = cue_data.get("scenes", [])
    cues = cue_data.get("cues", [])

    # Derive topic-unique acoustic signature so different topics keep distinct mechanical cadences
    sig = _derive_topic_signature(cue_data, base_seed=seed)
    rng = np.random.default_rng(sig["seed"])

    stereo = synth_industrial_mech_bed(dur, scenes, cfg, rng, cues=cues, sig=sig)

    foley_actions = {
        "brass_ratchet",
        "scale_tilt",
        "cymbal_clang",
        "curtain_whoosh",
        "slide_whistle",
        "foot_step",
        "boing_hop",
        "cartoon_boing",
        "brush_sweep",
    }

    room_size = 0.22
    room_wet = 0.08

    last_action_t = {}
    skip_kinds = skip_kinds or set()
    for idx, cue in enumerate(cues):
        t = float(cue.get("t", 0.0))
        kind = str(cue.get("kind", "card_enter"))
        if kind in skip_kinds:
            # A recorded sample replaces the synthetic foley for this kind (no flam, no double hit).
            continue
        label = str(cue.get("label", ""))
        intensity = float(cue.get("intensity", 0.75))
        pitch = float(cue.get("pitch", 1.0))
        start_sample = int(round(t * SR))

        # Per-event deterministic RNG seeded by CRC32 so every cue instance has organic micro-variation
        cue_crc = zlib.crc32(f"{preset}:{idx}:{kind}:{label}:{int(round(t * 1000))}".encode("utf-8")) & 0xFFFFFFFF
        cue_rng = np.random.default_rng(cue_crc)

        if "pan" in cue and cue["pan"] is not None:
            pan = float(np.clip(float(cue["pan"]), -0.75, 0.75))
        else:
            pan = float(np.clip(((cue_crc % 100) - 50) / 125.0, -0.40, 0.40))

        action = _resolve_cue_semantic_action(kind, label, preset)
        if action != "scene_cut":
            min_gap = 0.65 if action in ("foot_step", "boing_hop") else 0.24
            if action in last_action_t and (t - last_action_t[action]) < min_gap:
                continue
            last_action_t[action] = t

        if action == "scene_cut":
            mono = synth_scene_cut(cfg, preset, intensity, idx, cue_rng)
            pan = 0.0
        elif action == "layer_float":
            mono = synth_layer_float(cfg, preset, intensity, idx, cue_rng)
        elif action == "count_tick":
            mono = synth_count_tick(cfg, preset, intensity, idx, cue_rng)
        elif action == "stroke_draw":
            mono = synth_stroke_draw(preset, intensity, cue_rng)
        elif action in foley_actions:
            mono = synth_runtime_foley(action, preset, intensity, cue_rng, pitch=pitch)
        else:
            mono = synth_card_enter(cfg, preset, intensity, idx, cue_rng)

        cue_st = pan_stereo_haas(mono, pan=pan)
        cue_st = add_studio_tail(cue_st, room_size=room_size, wet=room_wet)
        n_c = cue_st.shape[0]
        if start_sample < stereo.shape[0] and n_c > 0:
            s0 = max(0, start_sample)
            c0 = max(0, -start_sample)
            length = min(stereo.shape[0] - s0, n_c - c0)
            if length > 0:
                stereo[s0 : s0 + length] += cue_st[c0 : c0 + length]

    return master_bus(stereo, preset=preset, ceiling_db=-1.2)


def write_wav(path: Path, stereo: np.ndarray):
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = np.clip(stereo * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm16.tobytes())


def default_cue_sheet() -> dict:
    """Fallback 4-scene cue sheet when --cues is omitted in standalone CLI invocations."""
    return {
        "dur": 16.0,
        "scenes": [
            {"index": 0, "id": "bench-overview", "start": 0.0, "dur": 4.0, "end": 4.0},
            {"index": 1, "id": "section-cut", "start": 4.0, "dur": 4.0, "end": 8.0},
            {"index": 2, "id": "explode", "start": 8.0, "dur": 4.0, "end": 12.0},
            {"index": 3, "id": "measure", "start": 12.0, "dur": 4.0, "end": 16.0},
        ],
        "cues": [
            {"t": 0.0, "kind": "scene_cut", "intensity": 0.8},
            {"t": 0.08, "kind": "click", "label": "click", "intensity": 0.78},
            {"t": 0.5, "kind": "whir", "label": "whir", "intensity": 0.65},
            {"t": 2.2, "kind": "tick", "label": "tick", "intensity": 0.55},
            {"t": 4.0, "kind": "scene_cut", "intensity": 1.0},
            {"t": 4.08, "kind": "click", "label": "click", "intensity": 0.75},
            {"t": 4.4, "kind": "whir", "label": "whir", "intensity": 0.7},
            {"t": 5.5, "kind": "clunk", "label": "clunk", "intensity": 0.85},
            {"t": 6.6, "kind": "tick", "label": "tick", "intensity": 0.55},
            {"t": 7.4, "kind": "clunk", "label": "clunk", "intensity": 0.8},
            {"t": 8.0, "kind": "scene_cut", "intensity": 1.0},
            {"t": 8.08, "kind": "click", "label": "click", "intensity": 0.75},
            {"t": 9.0, "kind": "scale_tilt", "label": "scale_tilt", "intensity": 0.75},
            {"t": 10.4, "kind": "brass_ratchet", "label": "brass_ratchet", "intensity": 0.7},
            {"t": 12.0, "kind": "scene_cut", "intensity": 1.0},
            {"t": 12.08, "kind": "click", "label": "click", "intensity": 0.75},
            {"t": 13.0, "kind": "count_tick", "label": "count_tick", "intensity": 0.6},
            {"t": 14.2, "kind": "layer_float", "label": "layer_float", "intensity": 0.7},
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Cue-driven calibration-lab mechanical score synthesizer.")
    parser.add_argument("--cues", required=False, default=None, help="Path to cues.json extracted from window.CUES")
    parser.add_argument("--out", required=True, help="Output 48kHz stereo WAV path")
    parser.add_argument(
        "--preset",
        default="mech",
        help="Sonic palette preset (mech or the calibration-lab / industrial-mech / terminal aliases)",
    )
    parser.add_argument("--samples", default=None, help="Style sample map (JSON): recorded one-shots layered over the score")
    parser.add_argument("--voice", default=None, help="48 kHz mono/stereo voice WAV to mix over the score")
    parser.add_argument("--duck-db", type=float, default=-10.0, help="Music gain reduction under speech (0 disables ducking)")
    parser.add_argument("--voice-gain", type=float, default=0.0, help="Voice gain in dB before the final limiter")
    parser.add_argument("--duck-attack", type=float, default=0.02, help="Sidechain attack in seconds")
    parser.add_argument("--duck-release", type=float, default=0.25, help="Sidechain release in seconds")
    args = parser.parse_args()

    if args.cues:
        cue_path = Path(args.cues)
        cue_data = json.loads(cue_path.read_text(encoding="utf-8"))
    else:
        cue_data = default_cue_sheet()

    preset = resolve_preset(cue_data.get("soundPreset") or args.preset)

    # Only retire a synthesized cue kind when the sample it maps to is actually on disk;
    # otherwise a missing cache would silently delete foley instead of falling back.
    sample_kinds: set = set()
    if args.samples:
        try:
            _map = json.loads(Path(args.samples).read_text(encoding="utf-8"))
            _idx_path = Path(_map.get("index", "../../../out/samples-cache/index.json"))
            if not _idx_path.is_absolute():
                _idx_path = (Path(args.samples).resolve().parent / _idx_path).resolve()
            if _idx_path.is_file():
                _idx = json.loads(_idx_path.read_text(encoding="utf-8"))
                _cache = Path(_idx.get("cache", _idx_path.parent))
                for kind, bind in (_map.get("map") or {}).items():
                    entry = (_idx.get("samples") or {}).get(bind.get("sample", ""))
                    if entry and (_cache / entry["file"]).is_file():
                        sample_kinds.add(kind)
        except Exception:
            sample_kinds = set()
    stereo = synthesize_from_cues(cue_data, preset=preset, skip_kinds=sample_kinds)
    samples_used: list[str] = []
    if args.samples:
        stereo, samples_used = overlay_samples(stereo, cue_data, args.samples)
    if args.voice:
        voice_path = Path(args.voice)
        if not voice_path.is_file():
            raise SystemExit(f"sound.py: voice file not found: {voice_path}")
        stereo = mix_voice_into(
            stereo,
            str(voice_path),
            duck_db=args.duck_db,
            voice_gain_db=args.voice_gain,
            attack=args.duck_attack,
            release=args.duck_release,
        )
    out_path = Path(args.out)
    write_wav(out_path, stereo)
    peak_db = 20.0 * np.log10(max(1e-9, float(np.max(np.abs(stereo)))))
    rms_db = 20.0 * np.log10(max(1e-9, float(np.sqrt(np.mean(stereo ** 2)))))
    print(
        json.dumps(
            {
                "out": str(out_path),
                "preset": preset,
                "dur": float(cue_data.get("dur", 0)),
                "cues": len(cue_data.get("cues", [])),
                "samples": sorted(set(samples_used)),
                "voice": str(Path(args.voice)) if args.voice else None,
                "peak_dbtp": round(peak_db, 2),
                "rms_dbfs": round(rms_db, 2),
            }
        )
    )


if __name__ == "__main__":
    main()
