# Sound Credits & Sample Licenses (`SOUND_CREDITS.md`)

The calibration-lab score is **synthesized** by `tools/sound.py`. The optional recorded
one-shots referenced by `styles/calibration-lab/samples.json` are not committed and are
not required: without a cache, every cue falls back to synthesis.

## Recorded sources (`tools/samples.manifest.json`)

### Versilian Community Sample Library (VCSL) — CC0-1.0
- **Source**: <https://github.com/sgossner/VCSL>
- **Attribution**: Versilian Studios, VCSL (CC0-1.0)
- **Files used**:
  - Ratchet1_Crank / Ratchet1_Slow (`ratchet-crank`, `ratchet-slow`)
  - Anvil_Hit1 (`anvil-hit`)
  - BrakeDrum1_Hammer (`brake-hammer`)
  - Claves1_Hit (`claves-hit`)
  - slapstick (`slapstick`)

### VSCO 2 Community Edition (VSCO-2-CE) — CC0-1.0
- **Source**: <https://github.com/sgossner/VSCO-2-CE>
- **Attribution**: Versilian Studios, VSCO 2 Community Edition (CC0-1.0)
- **Files used**:
  - Cello Section susvib B3 (`cello-bed`)
  - Trumpet sus A2 (`trumpet-sting`)

### Sonniss #GameAudioGDC Bundle — optional manual import
- **Source**: <https://gdc.sonniss.com/>
- **License**: Sonniss GDC Bundle EULA v2.0 (royalty-free commercial use; no redistribution,
  no AI training).
- **Distribution**: never downloaded by `tools/samples.py`; a user who already owns the bundle
  may register it locally with `python3 tools/samples.py import --pack sonniss-gdc --src <folder>`.
  The files stay in `../out/samples-cache/` and must never enter this repository.

## Cache location

`python3 tools/samples.py fetch` writes verified 48 kHz WAVs and `index.json` to
`../out/samples-cache/` (override with `$STYLEHOP_SAMPLES_CACHE`). `styles/calibration-lab/samples.json`
maps `brass_ratchet` / `count_tick` / `scale_tilt` / `card_enter` / `layer_float` and the cello bed
onto those IDs. `tools/sound.py` refuses nothing at render time: a missing index simply yields the
pure-synthesis score.

## Generated grains

The only generated grain consumed by the mechanical score is `assets/audio/foliage_paw_grain.wav`
(footstep scuff), built deterministically by `tools/audio_grains.py`. It is git-ignored.
