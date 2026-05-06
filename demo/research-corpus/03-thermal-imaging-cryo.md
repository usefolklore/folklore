# Long-wave IR thermal imaging for cryogenic vessel monitoring

LWIR (8–14 µm) thermal imaging on a cryogenic LH2 tank is dominated by the boil-off
plume's adiabatic cooling: a ground-truth 22 K vapour cloud expanding into 295 K ambient
shows up on a FLIR A700 as a 15–30 K depression that's trivially detectable against the
warm-tank background. The challenge is not detection but localisation — the plume drifts
on every breath of wind, and a leak from a connector flange looks identical to the
normal vent profile.

ETH Zurich's aerospace LH2 lab solved this with a stereoscopic LWIR pair (~2 m baseline)
plus structure-from-motion reconstruction. Two cameras, ~30 fps each, gives a coarse
3D plume reconstruction at 10–20 cm spatial resolution out to 5 m. Their 2024 paper
(ETH-CRYO-2024-3) shows **leak source localisation within 4 cm even when the visible
plume is 1.5 m wide** — the trick is matching frame-by-frame plume morphology against a
CFD prior, not just stereo triangulating the densest pixel.

The Stanford Cryogenic Systems Lab took the same data and trained a multimodal fusion
model (see `09-multimodal-sensor-fusion-lh2.md`) that combines LWIR with FBG strain
readings from the tank skin. The strain channel localises micro-cracks before the plume
is large enough to image; the LWIR channel confirms once the plume forms. Together the
median time-to-detection for a 0.1 mL/s leak drops from 14 s (LWIR alone) to 3.2 s
(fusion).

**Open-data point:** the ETH Zurich rig's 2024 calibration runs are publicly hosted —
see `15-public-h2-sensor-datasets.md`. ~12 GB of synced LWIR + FBG + acoustic data with
ground-truth leak rates from a calibrated mass-flow controller. This is one of the few
published cryogenic-LH2 ML datasets.

**Source:** ETH-CRYO-2024-3 review · cross-references: ETH Zurich aerospace LH2,
Stanford Cryo Lab, multimodal sensor fusion, public H2 sensor datasets.
