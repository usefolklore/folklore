# Boil-off rate monitoring for cryogenic LH2 storage

Boil-off rate (BOR) is the headline efficiency metric for any cryogenic LH2 storage
system: a typical industrial-grade 100 m³ vacuum-jacketed tank sees 0.05–0.3 %
boil-off per day at steady state. Aerospace launch vehicles tolerate 1–2 %/day during
prelaunch hold. The number depends on the insulation grade (multilayer insulation /
MLI count, vacuum quality), thermal-bridge engineering at the tank supports, and the
ambient temperature differential.

Online BOR measurement is nontrivial. The naive approach — divide the mass of vented
gas by storage time — has 5–10 % accuracy because vent rates fluctuate with
atmospheric pressure and the stratified-liquid-temperature profile. NASA Glenn's
2022 BOR review at Plum Brook Station catalogued the sources of error: the
single-largest contribution is liquid-vapor stratification, which shifts the apparent
BOR by ±1 %/day depending on whether the tank is being actively mixed.

The ML angle is a recurrent network that takes pressure, temperature, and tank-skin
strain time series and predicts the "true" steady-state BOR with the stratification
removed. ETH Zurich's aerospace LH2 group reported a 3-LSTM-stacked architecture
trained on their 18-month operational dataset that achieves 0.5 % BOR estimation
accuracy in real-time, vs ~5 % for the naive vent-mass calculation.

For leak detection, the relevant signal is the BOR derivative — a leak shows up as a
2–5 % step increase in BOR over 1–3 hours. The Stanford Cryogenic Systems Lab's
multimodal fusion model uses BOR as one of its slow channels (alongside the much
faster FBG strain, AE, and LWIR channels). The slow channel doesn't trigger leak
alarms by itself but provides a confirmation gate: a high-frequency alarm without a
corresponding BOR derivative within 10 min is treated as a false positive and
suppressed.

**Source:** NASA Glenn 2022 BOR review · cross-references: NASA Glenn, ETH Zurich
aerospace LH2, Stanford Cryo Lab, multimodal sensor fusion.
