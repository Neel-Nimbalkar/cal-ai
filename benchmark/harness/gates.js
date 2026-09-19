// Explicit launch gates for shipping the photo-estimation flow to real users.
// These thresholds are deliberately conservative for a first launch: photo
// estimation is a convenience feature layered on top of the existing manual
// search/diary flow (which remains the source of truth), so gates protect
// against silently wrong calorie logging more than they optimize raw accuracy.
'use strict';

const GATES = [
  {
    id: 'calorie_mape',
    description: 'Mean absolute percentage error on total calories (post user-facing raw estimate, before correction) must be <= 25%.',
    check: (r) => r.calorieMapeRaw !== null && r.calorieMapeRaw <= 25,
    valueOf: (r) => r.calorieMapeRaw
  },
  {
    id: 'item_f1',
    description: 'Item recognition F1 (label match) must be >= 0.6.',
    check: (r) => r.itemPrecisionRecall.f1 !== null && r.itemPrecisionRecall.f1 >= 0.6,
    valueOf: (r) => r.itemPrecisionRecall.f1
  },
  {
    id: 'calibration_ece',
    description: 'Expected Calibration Error on the "within 20% of true calories" signal must be <= 0.15.',
    check: (r) => r.calibration.ece !== null && r.calibration.ece <= 0.15,
    valueOf: (r) => r.calibration.ece
  },
  {
    id: 'high_tier_precision',
    description: 'Among cases the model marks "high confidence" (>=0.8), calorie estimate must land within 20% of truth at least 90% of the time — a wrong high-confidence answer is the most damaging UX failure.',
    check: (r) => r.highTierAccuracy === null || r.highTierAccuracy >= 0.9,
    valueOf: (r) => r.highTierAccuracy
  },
  {
    id: 'failure_rate',
    description: 'Outright estimation failures (no_items_detected, estimation_error, timeout) must be <= 10% of cases.',
    check: (r) => r.failureRate <= 0.10,
    valueOf: (r) => r.failureRate
  },
  {
    id: 'correction_effectiveness',
    description: 'When users correct portions, mean calorie MAPE after correction must be lower than before (correction must actually reduce error).',
    check: (r) => r.correction.correctedCaseCount === 0 || (r.correction.afterMeanApe !== null && r.correction.beforeMeanApe !== null && r.correction.afterMeanApe < r.correction.beforeMeanApe),
    valueOf: (r) => r.correction.absoluteImprovementPct
  },
  {
    id: 'p95_latency',
    description: 'p95 end-to-end estimation latency must be <= 4000ms so the flow does not stall onboarding/logging.',
    check: (r) => r.latency.p95 <= 4000,
    valueOf: (r) => r.latency.p95
  }
];

function evaluateGates(results) {
  return GATES.map((g) => ({
    id: g.id,
    description: g.description,
    pass: !!g.check(results),
    value: g.valueOf(results)
  }));
}

module.exports = { GATES, evaluateGates };
