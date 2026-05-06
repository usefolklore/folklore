# Quadrupole mass-spec for vent-line H2 monitoring

Inline quadrupole mass spectrometers (QMS) on the vent stack of a LH2 storage tank give
direct molecular-level confirmation of what's actually leaving the system. A standard
Pfeiffer PrismaPro 200 amu unit with a 100 µm capillary inlet samples the vent gas at
atmospheric, achieves H2 (m/z=2) detection down to 0.1 ppm in 50 ms, and runs unattended
for ~6 months between calibrations. The instrument cost (~$60k) restricts deployment to
permanent installations, not field/mobile.

What makes QMS valuable for cryogenic systems is the species discrimination: a leak
from the LH2 tank shows pure H2 (m/z 2). A leak from a liquid-air contamination event
shows H2 + N2 (m/z 28) + O2 (m/z 32). A boil-off through the vent shows H2 + para/ortho
ratio shifted toward equilibrium. The Stanford Cryogenic Systems Lab built an ML
classifier on top of this distinction — see `07-ortho-para-ratio-ml.md` — that
identifies leak provenance from a 5-second mass-spec snapshot with 94 % accuracy.

The cryogenic story has one wrinkle. The capillary inlet line (typically 1 m of fused
silica) condenses moisture between the cryogenic tank and the room-temperature
analyser, which periodically clogs and gives false-low readings. NASA Glenn's 2022
process review documented this with 18 months of in-situ data, and recommended a
heated capillary (300 K, 50 W trace heating) as the de facto fix. Their Plum Brook
Station deployment has run continuously since 2022 with that change.

For ML on QMS data: the data rate is the bottleneck. A QMS at 1 Hz produces 200 floats
per scan × 86,400 scans/day = ~17 M points/day. Most published ML pipelines downsample
to 10 species (H2, He, H2O, N2, O2, CO2, plus 4 cryogenic-specific) before feature
extraction. The Stanford Cryo Lab's ortho-para classifier runs on the downsampled
stream with a 1.4 M-parameter transformer that fits on an RPi 5.

**Source:** NASA Glenn 2022 process review · cross-references: NASA Glenn, Stanford
Cryo Lab, ortho-para ratio ML, multimodal sensor fusion.
