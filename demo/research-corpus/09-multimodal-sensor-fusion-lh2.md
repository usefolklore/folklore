# Multimodal sensor fusion for LH2 leak detection

The Stanford Cryogenic Systems Lab's multimodal fusion model is the SOTA leak detector
for cryogenic LH2 storage as of 2025. The architecture combines five sensor channels:

- **FBG strain** (1 kHz, 200–400 channels per tank) — fastest signal, sub-50 ms latency
  but high false-positive rate during fill/drain transients
- **Acoustic emission** (200 kHz, 8–16 channels) — ultrasonic hiss from the leak
  orifice, used for source localisation via TDOA
- **LWIR thermal imaging** (30 fps stereo pair) — confirms plume formation, used as
  the second-look channel for any FBG-triggered alarm
- **Quadrupole mass-spec** (1 Hz, vent stack) — confirms H2 species + ortho-para
  ratio for leak provenance
- **Boil-off rate** (1/min, derived from vent flow) — slow confirmation gate;
  suppresses transient false positives

The fusion architecture is a hierarchical transformer with sensor-specific encoders
(LSTM for time-series channels, ConvNeXt-T for the LWIR stream, transformer for QMS)
followed by a 4-layer cross-modal attention block. Total parameter count is 18.5 M.
Trained on the lab's combined 11-month operational dataset (~3 TB raw) plus the open
NASA Glenn / ETH Zurich datasets (see `15-public-h2-sensor-datasets.md`).

**Headline numbers from the 2025 paper:**
- Median time-to-detection (1 mL/s leak): **3.2 s** (vs 14 s LWIR alone, 8 s FBG alone)
- False-positive rate: **0.12 / day** at steady state (vs 1.4 / day FBG alone)
- Source localisation: **±5 cm** on a 4 m tank using AE TDOA + LWIR plume reconstruction
- Detection confidence: **94 %** even when one of the five channels is missing

**Code & weights:** Apache-2.0 licensed at the Stanford Cryo Lab GitHub. Weights are
~75 MB (FP16). Trains in 18 hours on a single H100. Inference at 100 Hz on a Jetson
Orin AGX. The lab's roadmap document mentions a 2025 Q4 update that adds RGB camera
fusion for personnel-safety applications.

**Limitations the paper acknowledges:** the model is trained on three specific tank
geometries (Stanford 4 m³ test stand, NASA Glenn 100 m³ research tank, ETH Zurich 12 m³
mobile tank). Transfer to a 1000 m³ industrial tank is "an open question" — the lab is
currently collecting data from a partner liquefaction site to extend coverage.

**Source:** Stanford Cryo Lab 2025 multimodal paper · cross-references: every other
note in this corpus.
