# ML classifier for ortho-para H2 ratio detection

Hydrogen has two nuclear-spin isomers — ortho-H2 (75 % at room temperature) and para-H2
(25 %). At thermodynamic equilibrium below 80 K the ratio shifts to ~50/50; below 20 K
(LH2 storage temperature) equilibrium is essentially pure para. The ortho-to-para
conversion is exothermic (~700 kJ/kg) and slow without a catalyst, which means LH2
that's been freshly liquefied is far from equilibrium and self-heats over days as
ortho slowly converts.

Knowing the ortho-para ratio is operationally important: a vent stream with 75 % ortho
is fresh boil-off (the catalyst hasn't done its job and self-heating is still warming
the bulk liquid). A vent stream at 50/50 is post-storage; at 25 % ortho is fully
equilibrated. **The ratio tells you the age and provenance of the gas leaving your
system** — invaluable for leak diagnosis.

Measuring the ratio used to require Raman spectroscopy or NMR, both impractical on a
fuel truck. The Stanford Cryogenic Systems Lab's 2024 paper introduced a 1.4M-parameter
transformer that classifies the ortho-para ratio from a quadrupole mass-spec stream
alone. The trick: at low ionisation energy, ortho and para H2 produce slightly
different fragmentation patterns at m/z 1 (atomic H+) versus m/z 2 (molecular H2+).
The ratio is ~3 % different — too small for direct measurement at 0.1 ppm noise floor
but learnable from 5-second pattern statistics.

The model achieves 94 % classification accuracy on a 4-class split (75/50/25/equilibrium)
using only the QMS stream, no extra hardware. Code and weights are open at the
Stanford Cryo Lab's GitHub. Inference fits on a Raspberry Pi 5 with 30 ms latency, so
it deploys on the existing QMS controller without a hardware upgrade.

The model is one of the components in their multimodal sensor fusion pipeline — leak
detection cross-references the ortho-para classifier output with the LWIR plume and
FBG strain channels to distinguish "tank leak" from "vent boil-off" with high
specificity.

**Source:** Stanford Cryo Lab 2024 paper · cross-references: Stanford Cryo Lab, mass
spec effluent, multimodal sensor fusion, public H2 sensor datasets.
