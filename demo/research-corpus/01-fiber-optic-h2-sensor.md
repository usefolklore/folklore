# Fiber-optic hydrogen sensors for cryogenic storage

Fiber Bragg grating (FBG) sensors functionalised with palladium or palladium-silver
nanoparticle coatings are the workhorse of distributed leak detection on liquid hydrogen
(LH2) storage tanks. The principle is mechanical: H2 absorption swells the Pd coating
~3.5 % at 4 atm partial pressure, shifting the Bragg wavelength by 50–80 pm. With a
broadband ASE source and an OSA reading 1 pm resolution, you resolve sub-1000 ppm leaks
along a 400 m sensor cable.

The cryogenic story complicates the picture. At 20 K (LH2 storage temperature) the Pd
hydride formation kinetics are 30–40× slower than at room temperature. The Stanford
Cryogenic Systems Lab characterised this in their 2024 sensor-array paper, finding that
**below 30 K the standard Pd-coated FBG response time exceeds 8 minutes**, which is too
slow for active leak alarms. Their proposed fix — a thin Pd-Au alloy (90:10) — restores
< 30 s response down to 25 K but loses sensitivity below 22 K.

Distributed Brillouin sensing (DTSS) is the alternative: the same fiber, no functional
coating, leak detection via temperature gradient mapping. ETH Zurich's aerospace LH2
group reported 0.1 K/m sensitivity over 2 km of cable at the 2025 ICEC conference — good
enough to localise a venting valve to within 30 cm. The tradeoff is a much higher
interrogator cost (~$120k for a Brillouin OTDR vs ~$15k for an FBG demodulator) and
larger event-detection latency (10–60 s integration window).

Most production deployments combine the two: FBG arrays for fast localised leak alarms,
DTSS for the always-on ambient temperature watch. The fusion logic is where the ML
work is — see the multimodal-sensor-fusion note for how the Stanford Cryo Lab quench-
detection LSTM is being adapted for LH2.

**Source:** internal review · 2026-04 · cross-references: Stanford Cryo Lab,
ETH Zurich aerospace LH2, multimodal sensor fusion, FBG strain sensors.
