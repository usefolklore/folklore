# Stanford Cryogenic Systems Lab — publications overview

The Stanford Cryogenic Systems Lab (PI: Prof. M. Henderson) publishes ~6–8 papers per
year on the intersection of cryogenic instrumentation, ML for sensor fusion, and
hydrogen safety. The group is co-located with SLAC and shares instrumentation
infrastructure with the SLAC linear collider's superconducting magnet program — which
is where the original quench-detection LSTM came from.

**Notable recent work:**

- *Stanford-CRYO-2023-7* — "Real-time quench detection via FBG strain arrays and
  an early-exit LSTM" — the original quench paper, became the LH2 leak detector
  after a 3-day fine-tune. See `10-quench-detection-lstm.md`.

- *Stanford-CRYO-2024-2* — "Pd-Au alloy FBG sensors for sub-30 K hydrogen detection"
  — characterised the Pd:Au 90:10 coating that gives < 30 s response down to 25 K,
  losing sensitivity below 22 K. See `01-fiber-optic-h2-sensor.md`.

- *Stanford-CRYO-2024-9* — "Ortho-para H2 ratio classification from quadrupole
  mass-spec via 1.4 M-parameter transformer" — open-sourced model + weights at the
  lab's GitHub. See `07-ortho-para-ratio-ml.md`.

- *Stanford-CRYO-2025-3* — "Multimodal sensor fusion for cryogenic LH2 leak
  detection" — the SOTA fusion architecture. 3.2 s median time-to-detection on
  1 mL/s leaks, 0.12 false positives per day. See `09-multimodal-sensor-fusion-lh2.md`.

The lab's open-source releases are at `github.com/stanford-cryo-lab` — Apache-2.0
licensed, including model weights, training code, and reproducible-evaluation
fixtures. Three of the four datasets at `15-public-h2-sensor-datasets.md` were
released by this lab.

**Collaborations:**

- *NASA Glenn* (`13-nasa-glenn-h2-research.md`) — operational data exchange + joint
  publication on the AE detection-sensitivity drop at LH2 temperatures.
- *ETH Zurich aerospace LH2* (`14-eth-zurich-aerospace-lh2.md`) — physics-informed
  neural networks; jointly working on transfer learning to reduce per-tank PINN
  calibration time.
- *Air Liquide industrial cryogenics* — partner site for collecting 1000 m³
  industrial-scale tank data; not yet published.

**Funding:** primarily DOE (FY24 grant DE-EE-0010234, $4.2M over 3 years) plus a
smaller NASA grant on the AE work. No private-sector funding declared in their 2024
disclosures.

**Source:** internal review of the lab's publication record · cross-references:
quench-detection LSTM, fiber-optic H2 sensor, ortho-para ratio ML, multimodal sensor
fusion, NASA Glenn, ETH Zurich, public datasets.
