#!/usr/bin/env python3
"""
Calibration Lab tactile texture generator (`tools/textures.py`).

Generates one deterministic, 100% tile-seamless 512x512 brushed-metal texture in
`assets/textures/` for the WebGL2 `u_paper` sampler (TEXTURE2 with GL_REPEAT):

  1. `assets/textures/brushed_metal.png` — Anisotropic brushed metallic normal/roughness map

Usage:
  python3 tools/textures.py [--size 512] [--out-dir assets/textures]
"""

import argparse
from pathlib import Path
import numpy as np
from PIL import Image


def tileable_fbm(size: int, rng: np.random.Generator, octaves=(2, 4, 8, 16, 32, 64), weights=None) -> np.ndarray:
    """Synthesizes a 100% seamless periodic 2D fBm field via FFT spectral shaping."""
    freq_y = np.fft.fftfreq(size)[:, None] * size
    freq_x = np.fft.fftfreq(size)[None, :] * size
    radius = np.hypot(freq_x, freq_y)

    if weights is None:
        weights = [1.0 / (i + 1) ** 1.15 for i in range(len(octaves))]

    acc = np.zeros((size, size), dtype=np.float64)
    for scale, w in zip(octaves, weights):
        white = rng.standard_normal((size, size)) + 1j * rng.standard_normal((size, size))
        band = np.exp(-0.5 * ((radius - scale) / max(1.0, scale * 0.45)) ** 2)
        band[0, 0] = 0.0
        layer = np.fft.ifft2(white * band).real
        std = layer.std()
        if std > 1e-8:
            acc += (layer / std) * w

    acc -= acc.min()
    mx = acc.max()
    return (acc / mx) if mx > 1e-8 else acc








def generate_brushed_metal(size: int, seed: int = 303) -> Image.Image:
    """Anisotropic horizontal brushed metallic micro-grooves + tangent normal/roughness."""
    rng = np.random.default_rng(seed)
    freq_y = np.fft.fftfreq(size)[:, None] * size
    freq_x = np.fft.fftfreq(size)[None, :] * size

    # Strong anisotropy: high vertical frequency (horizontal grooves), low horizontal frequency
    white = rng.standard_normal((size, size)) + 1j * rng.standard_normal((size, size))
    aniso_filter = np.exp(-0.5 * (freq_x / 3.5) ** 2) * np.exp(-0.5 * ((np.abs(freq_y) - 52.0) / 38.0) ** 2)
    aniso_filter[0, 0] = 0.0
    grooves = np.fft.ifft2(white * aniso_filter).real
    grooves = (grooves - grooves.mean()) / (grooves.std() + 1e-8)

    micro = tileable_fbm(size, rng, octaves=(12, 32, 96), weights=(0.5, 0.8, 0.6))
    height = np.clip(0.5 + 0.18 * grooves + 0.08 * (micro - 0.5), 0.0, 1.0)

    # Periodic finite differences for tangent-space normal X/Y + roughness in B
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx = np.clip(0.5 + dx * 2.2, 0.0, 1.0)
    ny = np.clip(0.5 + dy * 2.2, 0.0, 1.0)

    r = (height * 255.0).astype(np.uint8)
    g = (ny * 255.0).astype(np.uint8)
    b = (nx * 255.0).astype(np.uint8)
    return Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB")








def main():
    parser = argparse.ArgumentParser(description="Generate seamless 512x512 tactile textures for StyleHop.")
    parser.add_argument("--size", type=int, default=512, help="Texture width/height in pixels (default: 512)")
    parser.add_argument("--out-dir", type=str, default="assets/textures", help="Output directory")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    out_dir = (repo_root / args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    recipes = {
        "brushed_metal.png": generate_brushed_metal,
    }

    manifest = []
    for filename, fn in recipes.items():
        img = fn(args.size)
        dest = out_dir / filename
        img.save(dest, format="PNG", optimize=True)
        manifest.append({"file": str(dest.relative_to(repo_root)), "size": f"{args.size}x{args.size}"})
        print(f"[textures] wrote {dest.relative_to(repo_root)} ({args.size}x{args.size})")


if __name__ == "__main__":
    main()
