# ETH Zurich aerospace LH2 group

The ETH Zurich aerospace LH2 group (PI: Prof. R. Beltran) is part of the Institute of
Mechanical Systems and works on cryogenic propellant handling for next-generation
European launch vehicles — specifically the Themis reusable-stage program and ESA's
post-Ariane 6 LH2/LOX vehicle architecture.

The group operates a 12 m³ mobile LH2 test rig that's deployed both at ETH's Honggerberg
campus and at the Esrange Space Center for full-scale fill/drain testing. The mobile
nature of the rig — and the fact that the full sensor instrumentation moves with it —
makes ETH the primary "transferable" cryogenic LH2 platform in Europe.

**Notable publications (last 2 years):**

- *ETH-CRYO-2024-3* — "Stereoscopic LWIR + structure-from-motion plume reconstruction
  for cryogenic LH2 leak localisation". 4 cm source localisation through a 1.5 m
  visible plume. See `03-thermal-imaging-cryo.md`.

- *ETH-CRYO-2024-7* — "Distributed Brillouin sensing on 2 km of fiber for ambient
  thermal mapping of LH2 transfer lines". 0.1 K/m sensitivity, presented at ICEC 2025.
  See `01-fiber-optic-h2-sensor.md`.

- *ETH-AERO-2024-11* — "Physics-informed neural networks for cryogenic vent-line
  dynamics: an adaptive Lagrange approach". The PINN architecture used by the
  Stanford Cryo Lab's multimodal fusion model. See `11-physics-informed-nn-cryo.md`.

- *ETH-AERO-2024-15* — "Boil-off rate estimation via stacked-LSTM: 0.5 % accuracy on
  18 months of operational data". Real-time BOR for the Themis prelaunch hold model.
  See `08-boil-off-rate-monitoring.md`.

**Collaborations:**

- *Stanford Cryogenic Systems Lab* — joint PINN transfer-learning work; data exchange
  on the multimodal fusion architecture's tank-geometry sensitivity.
- *NASA Glenn Plum Brook* — exchange of operational sensor traces; on-site campaigns
  during 2023 and 2024.
- *ESA Themis* — primary industry partner; the group's research feeds into the
  Themis prelaunch fuel-system safety case.

**Open-data:** ETH released ~12 GB of synced LWIR + FBG + acoustic data from a 2024
Esrange calibration campaign (CC-BY-NC). It's one of the few public datasets with
ground-truth leak rates from a calibrated mass-flow controller; the Stanford lab's
multimodal model uses it as a held-out evaluation set.

**Funding:** SNSF (CHF 3.1M, 2023–2026), ESA Themis program (~CHF 1.8M, 2024–2027),
plus smaller grants from Linde Engineering and the European Hydrogen Backbone
initiative.

**Source:** internal research review · cross-references: thermal imaging, fiber-optic
H2 sensor, physics-informed NN, BOR monitoring, Stanford Cryo Lab, NASA Glenn.
