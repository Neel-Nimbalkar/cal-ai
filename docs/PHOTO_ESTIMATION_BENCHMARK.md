# Photo-based meal estimation: benchmark methodology & launch gates

Status: benchmark harness and fixtures only. The photo-estimation pipeline itself
(camera capture, vendor call, confidence UI, portion-correction UI) is roadmap item
4 in `docs/PRODUCT_SPEC.md` and is **not implemented in this repository yet**. This
document defines how it will be measured before any provider or UI is shipped, so the
launch gates exist ahead of the implementation rather than being retrofitted.

## Why this exists

CalAI's stated wedge is "photo logging with visible confidence and fast portion
correction" (`docs/PRODUCT_SPEC.md`). That only works if:
1. Confidence scores shown to users are actually calibrated (a 90% confidence answer
   should be right about 90% of the time), not decorative.
2. Portion correction measurably reduces error versus the raw estimate — otherwise
   the UI adds friction for nothing.
3. The flow fails safely and visibly (a stalled/failed estimate must not silently log
   wrong calories), consistent with the safety gates already in the spec (calorie
   floors, no clinician-override, no medical-advice framing).

This benchmark is the reproducible check for those three things, independent of which
vendor or model ends up doing the estimation.

## What's included in this repo

```
benchmark/
  fixtures/
    manifest.json          12 labeled test cases (ground truth + canned raw estimate + optional user correction)
    manifest.schema.json   JSON Schema for the manifest, so new cases can be validated
  harness/
    run.js                 CLI entry point — runs all cases, computes metrics, applies gates
    metrics.js             precision/recall, MAPE, Brier score, ECE, coverage-by-tier, correction effectiveness
    estimator.js            demo vs provider estimator selection
    nutrition.js            per-gram nutrition table derived from foods.js, used to score portion corrections
    gates.js                explicit pass/fail thresholds
    providers/
      example-vendor-adapter.js   template for wiring a real vendor
  results/
    latest.json             most recent run's full output (git-ignored except a checked-in sample, see below)
test/
  benchmark.test.js          unit tests for the metric functions and fixture integrity
```

Run it:
```bash
npm run bench            # demo mode, offline, deterministic
npm test                 # existing app checks + benchmark unit tests
```

## No copyrighted images

Every fixture case has a `photo_ref` — a descriptive string id — instead of an actual
image. This is deliberate: the benchmark's job is to score an estimator's *output*
(items, grams, confidence, latency) against ground truth, and that scoring logic does
not need pixels. Demo mode returns a canned `raw_estimate` recorded per fixture case, so
the whole benchmark runs offline and reproducibly with zero binary assets in the repo.

To benchmark a **real** vendor, implement an adapter (see
`benchmark/harness/providers/example-vendor-adapter.js`) whose `estimate(photoRef, caseId)`
calls your vendor with your own image for that `photo_ref` — kept locally, out of the repo
— and returns output in the documented shape. Point the harness at it:
```bash
node benchmark/harness/run.js --mode provider --provider-module ./my-adapter.js
# or
CALAI_BENCH_MODE=provider CALAI_BENCH_PROVIDER_MODULE=./my-adapter.js npm run bench
```
The ground truth and gates stay identical between demo and provider mode — only where the
`raw_estimate` comes from changes. This is what makes it a fair vendor bake-off (spec
priority 4: "Photo-estimation vendor bake-off").

## Fixture design (12 cases)

Cases are deliberately not all easy:
- `single-*` — one clean, well-lit item (easy case, expect high confidence + low error).
- `mixed-*` / `multi-*` — 2-4 items on a plate, partial occlusion, composite foods
  (tacos, pasta with sauce) where item boundaries are genuinely ambiguous.
- `hard-*` — low light, blurry, dense small items, and one case
  (`hard-010`, blurry chocolate) that specifically encodes **overconfidence**: the canned
  estimate is confidently wrong, to test whether calibration metrics catch it.
- `misid-*` — a visually-plausible wrong label (sweet potato fries mistaken for bread),
  to test that item-level precision/recall catches labeling errors that calorie MAPE
  alone could miss (a wrong label with a coincidentally similar calorie count would pass
  a calorie-only check).
- `error-*` — outright pipeline failure (corrupt upload, `no_items_detected`), required
  so failure rate is measured on purpose rather than cases quietly being skipped.

Each case also carries a `user_correction` (or `null` if the user accepted the estimate
unchanged), used to score portion-correction effectiveness.

Extending the set: add a case to `manifest.json` following `manifest.schema.json`; run
`node test/benchmark.test.js` to confirm it validates.

## Metrics computed

- **Item recognition precision/recall/F1** — multiset label matching between predicted
  and ground-truth items per case, aggregated across cases (`metrics.js:matchItems`,
  `aggregatePrecisionRecall`). This is the metric that catches mislabeling
  (`misid-007`) that a calorie-only view would hide.
- **Calorie & macro absolute percentage error (MAPE)** — `|estimate - truth| / truth`,
  computed on total calories, protein, carbs, fat per case then averaged. Cases where
  ground truth is exactly 0 are excluded from that macro's MAPE (documented in
  `metrics.js:ape`) rather than producing a division-by-zero distortion.
- **Confidence calibration (Brier score + Expected Calibration Error)** — both need a
  binary correctness signal per case; we define "correct" as *calorie total within 20%
  of ground truth* (documented explicitly here because it's a judgment call, not a
  standard). Brier score is the mean squared error between stated confidence and that
  binary outcome. ECE bins predictions into 5 confidence buckets and averages the gap
  between mean stated confidence and mean actual accuracy per bucket, weighted by bucket
  size — the standard ECE formulation. Both are reported so a reviewer can sanity-check
  Brier against ECE (Brier rewards sharp+correct; ECE only cares about calibration gap).
- **Coverage by confidence tier** — fraction of cases the harness would bucket as
  high (>=0.8), medium (0.5-0.79), or low (<0.5) confidence, matching a plausible product
  treatment (high = eligible for auto-accept, medium = shown with a review nudge, low =
  forced review/reject). Reported so product can see, e.g., "only 33% of meals would
  qualify for the frictionless high-confidence path" before committing to that UX.
- **Portion-correction effectiveness** — for every case with a non-null
  `user_correction`, compares calorie MAPE of the raw estimate ("before") against MAPE
  recomputed from the corrected grams ("after"), using the per-gram nutrition table in
  `nutrition.js`. Reports mean before/after and how many cases actually improved —
  correction that doesn't reduce error on average is a signal the correction UI itself
  is broken, not just the estimator.
- **Latency** — mean/p50/p95/max of `latency_ms` reported per case (demo mode uses the
  fixture's recorded value; provider mode should report real wall-clock time from the
  vendor call).
- **Failure rate** — fraction of cases where the estimator returned a `failure` field or
  the harness itself caught an exception calling it. Counted, not dropped from the
  denominator — a provider that silently drops hard cases should not look better than
  one that flags them.

## Launch gates (`benchmark/harness/gates.js`)

| Gate | Threshold | Rationale |
|---|---|---|
| `calorie_mape` | Mean calorie MAPE (raw estimate) ≤ 25% | Loose enough for a first photo model, tight enough that "roughly right" logging is still usable next to the existing manual-search diary. |
| `item_f1` | Item recognition F1 ≥ 0.6 | Catches wrong-label failures that calorie MAPE alone can mask. |
| `calibration_ece` | ECE ≤ 0.15 | Confidence is a core part of the product pitch; loosely calibrated confidence is worse than no confidence UI at all because it actively misleads. |
| `high_tier_precision` | Among "high confidence" (≥0.8) cases, ≥90% land within 20% of true calories | A wrong *high-confidence* answer is the worst UX outcome — it's the one users are told to trust without reviewing. |
| `failure_rate` | ≤ 10% of cases | Aligns with the existing product principle of failing safely; also protects onboarding/logging flow speed. |
| `correction_effectiveness` | Mean MAPE after correction < before, whenever corrections occur | If correcting portions doesn't reduce error, the correction UI is providing false reassurance. |
| `p95_latency` | ≤ 4000ms | Estimation must not stall the logging flow it's meant to speed up. |

Running `npm run bench` prints a PASS/FAIL per gate and an overall verdict; the full
numeric result is written to `benchmark/results/latest.json`. Set
`CALAI_BENCH_STRICT=1` to make the process exit non-zero on any gate failure (for CI
gating once a real provider is wired in).

## Current result (demo mode, this fixture set)

Running the demo estimator (canned outputs already recorded in the fixtures — this is
**not** a real vendor's performance, it's a fixture sanity-check that intentionally
includes hard/failure cases) currently returns **FAIL**, failing `calibration_ece`,
`high_tier_precision`, and `failure_rate` while passing `calorie_mape`, `item_f1`,
`correction_effectiveness`, and `p95_latency`. That is expected and correct: the fixture
set was built to include a deliberately overconfident case (`hard-010`), a
no-detection failure (`hard-005`-adjacent `hard-006`), and a pipeline error
(`error-011`) precisely so the gates have something real to catch. A real vendor
adapter run that also fails these gates should not ship; passing all seven is the bar.

## Limitations

- Fixture ground truth (gram weights, resulting macros) is hand-authored from the same
  30-food nutrition table CalAI already ships (`foods.js`), not measured from real
  photographed meals — it's a stand-in for real-world variance, not a substitute for
  eventually validating against photographed, weighed meals.
- 12 cases is enough to exercise every metric and catch gross regressions, not enough
  for statistically tight confidence intervals on precision/recall or ECE. Before
  launch, this should grow to at least 100-200 real (weighed, consented) meal photos
  per the product's photo-deletion-after-inference privacy commitment.
- The "correct" threshold used for calibration (20% calorie error) is a product
  judgment call, not a physiological constant — revisit it once real user tolerance
  data exists (e.g. from support tickets or in-app correction rates).
- Item matching is label-exact (post-normalization to the 30-food vocabulary); it does
  not yet handle open-vocabulary labels a real vision model would produce (e.g. "grilled
  chicken breast" vs "chicken breast, grilled"). A real integration will need a label
  normalization/synonym layer scored separately, or matching against embeddings.
- Latency in demo mode is a recorded fixture number, not a live measurement — provider
  mode is required to get a genuine p95.
- This harness assumes calorie/macro ground truth is itself correct; it does not
  validate the underlying nutrition-per-gram table beyond what `test/verify.js` and
  `test/benchmark.test.js` already check.

## Relationship to existing safety gates

This benchmark does not re-implement the calorie-floor / clinician-guardrail checks in
`docs/PRODUCT_SPEC.md` (those apply to the target-setting flow, already covered by
`test/verify.js`). It is scoped specifically to the photo-estimation pipeline's
accuracy, calibration, and failure behavior — the risk surface that opens up once photo
logging writes calories into the diary with a confidence score attached. Per the spec's
"delete food photos after inference by default" rule, note that any real provider
adapter must not persist images beyond the inference call; this harness never stores or
transmits image bytes itself since it never receives any.
