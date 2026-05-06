# Acoustic emission monitoring for hydrogen leaks

A pressurised H2 leak through a small orifice generates a characteristic ultrasonic
hiss in the 30–100 kHz band — far above human hearing but trivially detectable with a
piezoelectric AE sensor stuck to the tank skin. The signal-to-noise ratio depends on
the leak geometry: a 100 µm pinhole at 4 bar produces ~75 dB above ambient AE noise at
50 cm. A leak through a clean threaded fitting is much quieter (~25–35 dB above noise)
because the choked flow regime damps the high frequencies.

Most published AE leak detection focuses on pipeline applications at room temperature.
The cryogenic case has been studied less. NASA Glenn's H2 research group ran the most
systematic survey at Plum Brook Station in 2023, finding that **AE detection
sensitivity drops 8–12 dB at LH2 temperatures** because the cryogenic pressure
differential changes the choked-flow acoustic profile. Their detection threshold
ended up at 1 mL/min on a 2-cm-diameter tank flange, which is ~30× worse than the
ambient-temperature equivalent.

The ML angle is denoising and source localisation. The Stanford Cryogenic Systems Lab's
multimodal fusion model includes 8 AE channels alongside the FBG strain and LWIR
imaging, and uses a TDOA (time-difference-of-arrival) cross-correlation step before
the fusion LSTM. The result is leak source localisation to ±5 cm on a 4-m-tall tank,
which is good enough to send a maintainer to a specific fitting rather than the whole
tank.

Open-data: ETH Zurich's aerospace LH2 lab released a small (~800 MB) AE-only dataset
with synced FBG + ground-truth leak rates from a 2024 calibration run. It's the only
publicly available cryogenic AE dataset I've found with leak-rate ground truth.

**Source:** NASA Glenn 2023 AE survey · cross-references: NASA Glenn, Stanford Cryo
Lab, ETH Zurich, multimodal sensor fusion, public H2 sensor datasets.
