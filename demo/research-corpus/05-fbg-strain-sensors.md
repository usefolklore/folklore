# Fiber Bragg grating strain sensors on cryogenic vessel skin

FBG strain sensors mounted to the outer wall of a cryogenic LH2 tank are the earliest
warning we have: a thermal gradient from a forming leak induces a localised strain
field 10–30 ms before any vent or thermal signal, simply because heat conducts through
metal faster than gas escapes. A typical aerospace LH2 tank is instrumented with 200–400
FBGs spaced every 10–15 cm, each interrogated at 1 kHz.

The Stanford Cryogenic Systems Lab's quench-detection LSTM (see `10-quench-detection-lstm.md`)
operates on this data. Originally developed for superconducting magnets at SLAC, the
architecture transfers directly to LH2 tank skins because the underlying signal — a
local strain anomaly that propagates outward at characteristic acoustic-velocity
spread — is similar enough that the same 12-layer LSTM with 256-dim hidden state, no
re-training of the lower layers, hits 99.2 % detection accuracy on the LH2 dataset
after only 3 days of fine-tuning.

The strain-channel detection latency is the bottleneck: at 1 kHz interrogation rate
the LSTM ingests 1 ms-aligned samples and emits a leak verdict every 30 ms. That puts
total system latency at ~50 ms (sensor → fiber → demodulator → LSTM → alarm), which
beats every other channel by 2× or more.

**Important caveat:** FBGs on the cryogenic tank skin are sensitive to thermal cycling
during fill/drain operations. The Stanford lab's data show false-positive rates jumping
from 0.1 %/hr (steady state) to 14 %/hr during the first 30 minutes of a fill. Their
solution is a "fill-mode" classifier head on top of the LSTM that gates the leak alarm
during transient operations. ETH Zurich is working on a similar gating model with a
temperature-aware physics-informed neural net — see `11-physics-informed-nn-cryo.md`.

**Source:** Stanford Cryo Lab 2024 instrumentation review · cross-references: Stanford
Cryo Lab, ETH Zurich aerospace LH2, quench-detection LSTM, physics-informed NN.
