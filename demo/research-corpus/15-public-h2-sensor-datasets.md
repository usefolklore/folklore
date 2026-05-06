# Public H2 sensor datasets — index

The list of publicly available cryogenic-LH2 sensor datasets is short. As of 2026 Q2,
these are the only ones with ground-truth leak rates and synced multi-channel data:

## NASA Glenn Plum Brook Raman LIDAR (NASA-Glenn-Raman-2023)

- **Size:** ~4 GB
- **License:** NASA Open Data Agreement (cite NASA TM-2023-0149)
- **Channels:** 532 nm pulsed Raman LIDAR returns; 50 ppm calibration runs at 5 m,
  10 m, 30 m standoff
- **Ground truth:** calibrated mass-flow controller leak rates (0.1, 0.5, 1.0, 5.0 mL/min)
- **Use:** the Stanford Cryo Lab denoiser was trained on this. Suitable for any
  Raman-spectroscopy ML work. Does NOT include cryogenic plume conditions —
  ambient-temperature leaks only.

## NASA Glenn AE Survey (NASA-Glenn-AE-2023)

- **Size:** ~12 GB
- **License:** NASA Open Data Agreement (cite NASA TM-2023-0244)
- **Channels:** 16 piezoelectric AE channels at 200 kHz sample rate; 2-cm-diameter
  flange leak source; LH2-temperature operating conditions
- **Ground truth:** leak rate (1, 5, 10, 50, 100 mL/min) + leak-source position
- **Use:** the only published cryogenic AE dataset. Reference for AE-channel
  detection-threshold studies.

## ETH Zurich Esrange 2024 (ETH-Esrange-LH2-2024)

- **Size:** ~12 GB
- **License:** CC-BY-NC
- **Channels:** stereo LWIR (30 fps each), 320-channel FBG strain (1 kHz), 8-channel
  AE, vent-line QMS at 1 Hz, BOR (1/min)
- **Ground truth:** calibrated leak rates (0.1, 1.0, 10 mL/s); leak-source position
  in tank coordinates
- **Use:** held-out evaluation set for the Stanford Cryo Lab multimodal fusion model.
  The closest thing the field has to a SOTA benchmark.

## Stanford Cryo Lab synthetic dataset (Stanford-Synthetic-2024)

- **Size:** ~80 GB
- **License:** Apache-2.0
- **Channels:** synthetic FBG + LWIR + AE traces from a CFD-simulated 4 m³ test tank
- **Ground truth:** by construction (every leak event has known source + rate)
- **Use:** pretraining the Stanford Cryo Lab quench-detection LSTM before fine-tuning
  on real operational data. Useful for any architecture-search work.

## Notes on access

All four datasets are mirrored on the Stanford Cryo Lab's S3 bucket
(`s3://stanford-cryo-lab-public/`) with a fast HTTP fallback at
`https://stanford-cryo-lab.org/public-datasets/`. The Stanford lab also maintains a
metadata index that lets you query by sensor type, leak rate, and tank geometry. The
ETH Zurich and NASA Glenn original sources are slower to download but are the
canonical citations.

**Source:** internal dataset review · cross-references: NASA Glenn, ETH Zurich, Stanford
Cryo Lab, every other note in this corpus.
