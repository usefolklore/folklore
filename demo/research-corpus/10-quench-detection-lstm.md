# Quench-detection LSTMs (Stanford Cryo Lab)

The Stanford Cryogenic Systems Lab originally developed their LSTM architecture for
*magnet quench detection* on the SLAC accelerator complex's superconducting cavities.
A quench — the sudden loss of superconductivity in a portion of a magnet — propagates
at acoustic-velocity scale through the magnet's structural support, identifiable by a
characteristic strain profile that's similar enough to a cryogenic-tank leak that the
same architecture transfers nearly out-of-the-box.

The 2023 paper (Stanford-CRYO-2023-7) introduced the architecture: a 12-layer LSTM with
256-dim hidden state, ingesting 1 ms-aligned strain samples from 200–400 FBG channels
arranged around the magnet body. The model emits a quench prediction every 30 ms with
two outputs: probability and source-channel distribution. The trick that made this
practical for real-time operation was an **early-exit head** at layer 6: in 92 % of
samples the early head is confident enough to skip layers 7–12, dropping inference
latency from 22 ms to 4 ms.

Transferring to LH2 leak detection (see `05-fbg-strain-sensors.md`) was a 3-day
fine-tune on the lab's LH2 operational data:

1. Replaced the upper 2 layers + classification heads while freezing layers 1–10
2. Re-mapped the strain profile from "quench" (sudden, propagating) to "leak" (slower,
   localised) labels using NASA Glenn's open dataset
3. Added a fill-mode gating head that suppresses alarms during transient operations

The transferred model achieves **99.2 % detection accuracy on a held-out LH2 leak
test set**, with the same ~50 ms total latency budget (sensor → fiber → demodulator →
LSTM → alarm).

**Why an LSTM and not a transformer:** the lab benchmarked both. A 24M-parameter
transformer hits 99.4 % accuracy but at 18 ms inference (vs 4 ms for the early-exit
LSTM), which doesn't fit the 30 ms decision budget on a Jetson Xavier (the embedded
target the lab cares about). For a server-grade target where inference latency is
unconstrained, the transformer wins, but for the in-tank-controller use case the LSTM
is correct. The paper makes this argument explicitly.

**Open-source release:** weights + training code at github.com/stanford-cryo-lab/quench-lstm
(and the LH2 fine-tune at the same org). Apache-2.0.

**Source:** Stanford-CRYO-2023-7 · cross-references: Stanford Cryo Lab, FBG strain
sensors, multimodal sensor fusion, NASA Glenn datasets.
