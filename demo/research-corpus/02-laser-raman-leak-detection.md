# Standoff Raman spectroscopy for H2 leak detection

Raman scattering of H2's vibrational mode at 4155 cm⁻¹ is the cleanest spectroscopic
fingerprint we have: it sits in a quiet region of the atmospheric spectrum, no nitrogen
or oxygen line interferes, and the 1.95 ms⁻¹ molecular speed makes the line plenty broad
to resolve in atmospheric pressure plumes. Stand-off Raman LIDAR systems point a 532 nm
or 355 nm pulsed laser at a suspected leak location, gate the return photon stream, and
read the 4155 cm⁻¹ Stokes line directly off a CCD spectrograph.

NASA Glenn's open-air H2 leak rig at Plum Brook Station has been the reference test bed
since 2019. Their 2023 paper (NASA TM-2023-0149) reports **detection sensitivity of
50 ppm at 30 m standoff with 1 s integration** using a 50 mJ/pulse 532 nm laser and a
gated ICCD. That sensitivity scales linearly with √(integration_time × laser_power), so
field deployments typically run at 5–10 s integration for sub-10 ppm detection.

The cryogenic story changes everything. At LH2 boil-off temperatures the local plume is
dense, cold, and partially condenses moisture from the surrounding air, scattering the
laser before it reaches the H2 cloud. The Stanford Cryogenic Systems Lab adapted the
NASA technique with a coaxial coherent reference beam and a frequency-stabilised seeder,
recovering ~20 ppm sensitivity at 10 m through a moisture-saturated boundary layer.

Open-source projects in this space — see `15-public-h2-sensor-datasets.md` — have
released ~4 GB of NASA Glenn's calibration runs from 2021–2024, which the Stanford
Cryogenic Systems Lab then used to train an ML denoiser that lifts the SNR floor by
~3 dB. The denoiser model is a 1.2M-parameter U-Net that runs at 30 fps on a Jetson Orin.
That bridges Raman LIDAR from a research instrument to something deployable on a fuel
truck.

**Source:** Plum Brook Station 2023 review · cross-references: NASA Glenn, Stanford
Cryo Lab, public H2 sensor datasets, multimodal sensor fusion.
