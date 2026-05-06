# Physics-informed neural networks for cryogenic flow modelling

Physics-informed neural networks (PINNs) embed PDE residuals directly into the loss
function, yielding networks that respect conservation laws (mass, momentum, energy)
even on out-of-distribution data. For cryogenic systems, where thermodynamic regimes
shift drastically across the operating envelope (subcooled liquid, two-phase
boiling, superheated vapour), PINNs outperform pure data-driven networks because the
underlying physics is the same regardless of regime.

ETH Zurich's aerospace LH2 group has been the most active in this space. Their 2024
PINN paper (ETH-AERO-2024-11) presents a coupled mass-momentum-energy network for
LH2 vent-line dynamics: 4 MLP heads (one per conserved quantity), each ~800k
parameters, trained with a composite loss that includes 5 PDE-residual terms (Navier-
Stokes + thermal + species transport) plus a data-fitting term.

The training is hard. The PDE residuals span ~12 orders of magnitude in numerical
scale (from kg/s² to W/m³), so the loss-balancing scheme is non-trivial. ETH's paper
introduces an adaptive Lagrange-multiplier approach that re-weights the residual
terms every 100 steps based on running gradient norms. The result is a model that
predicts vent-line transient behavior to within 2 % over a 50× range of leak rates,
trained on only 200 hours of operational data.

**Why this matters for leak detection:** the PINN gives a "physics prior" that the
Stanford Cryogenic Systems Lab's multimodal fusion model uses as a confidence gate.
If the FBG strain channel triggers a leak alarm but the PINN-predicted vent flow
doesn't show a corresponding step change within 30 s, the alarm is downgraded. This
cross-validation cuts the multimodal model's false-positive rate by another ~40 %
compared to the FBG-only baseline.

**Open issues:** the PINN requires tank-specific calibration (geometry, MLI quality,
support thermal bridging) that takes ~2 weeks of operational data per new tank. The
Stanford Cryo Lab and ETH Zurich are jointly working on a transfer-learning approach
that reduces this to ~2 days per new tank.

**Source:** ETH-AERO-2024-11 · cross-references: ETH Zurich aerospace LH2, Stanford
Cryo Lab, multimodal sensor fusion, FBG strain sensors.
