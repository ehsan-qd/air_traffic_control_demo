# Open questions and implementation boundaries

The supplied `SPEC.md` ends at section 6.6. Sections 7–13, the mockup canvas and the
Changi formatting handoff were not present when this implementation started.

1. **Full edge/slack/order-bit encoding and acceptance tests:** awaiting sections
   7–13. The first working version uses a **candidate-path QUBO**, explicitly
   labelled in the UI. Each binary variable selects an entire trajectory from a
   bounded library of contiguous lateral/vertical deviations on the specified
   skeleton. The real matrix contains complexity, one-hot and independently
   computed infeasibility penalties. This is a reduced search space, not the full
   paper formulation and not a certificate of global infeasibility. Exhausting it
   is reported as “no verified candidate” and triggers the visible fallback chain.
2. **ORBIT API:** no SDK/API contract or credentials supplied. Hardware is unavailable;
   selecting it fails explicitly. All live timings are CPU measurements.
3. **Styling and two applications:** the Changi-format Next.js presentation and
   browser reference lab were subsequently added in the root `src/` by the other
   chat. The live Python/Vite app is isolated in `backend/` and `web/`, uses the
   same ORBIT assets and cyan/black direction, and has its own theme tokens. The
   root presentation source files are preserved.
4. **Weather:** analytic synthetic wind is implemented. ERA5 is rejected explicitly
   until its schema and test file are supplied. Forecast error is likewise rejected
   until planned/flown trajectory divergence is implemented and verified.
5. **Verifier:** independent conservative spherical sub-arc envelopes, exact
   occupation times, climb altitude ranges and the real time buffer. This can
   reject safe trajectories; it does not clear an uncertain one. It does not use
   QUBO energies or time quantisation. A separate live position monitor checks
   actual horizontal and vertical separation at every simulation tick.
6. **Determinism:** scenario geometry, candidate construction and sampler random
   streams are seeded separately. Wall-clock-budget truncation and timings can
   change the number of progress events. Byte-identical recordings excluding
   timing fields require a future deterministic fixed-work recording mode.
7. **Replay:** insertion snapshots can be inspected in-session and JSONL records
   can be downloaded. Full recording playback, seeking and CSV export are later
   milestones. The history UI labels inspection explicitly and pauses the live sky.
8. **Director:** the baseline supports `file_flight`, `set_speed`, `pause`,
   `wind_shift` and `highlight`. The worst-case and tight-skeleton YAML files
   exercise analogous geometry; reproducing the paper's exact numerical examples
   requires the missing original trajectories and full edge encoding.
   The tight-skeleton scenario deliberately uses calm, static synthetic wind to
   isolate its fixed-final-edge conflict; the expanded skeleton cannot produce a
   large weather-driven delay, and a ten-minute entry delay admits a verified route.
9. **Unfrozen sky:** a result whose oceanic-entry deadline has passed is held and
   refiled; it cannot become a retroactive clearance. High simulation speeds can
   therefore produce visible holds when solving without the default clock freeze.
10. **Reserved configuration:** the full spec's time-quantisation, DP pruning and
    edge/slack penalty override fields are reserved for that encoding and do not
    change the reduced candidate-path matrix. The initial UI currently uses the
    specified default screen, speed choices and 40-path display cap. Exposing all
    UI configuration dynamically is pending. Track anchor longitudes currently
    use the supplied NAT defaults; configurable anchor/entry/exit geometry is pending.
11. **Initial hero staging:** the default 29-flight verified fleet includes 28
    active flights and one cleared flight awaiting entry, XAT208. This preserves
    enough filing lead time for the scripted crossing. The UI reports the actual
    active and cleared counts separately.

