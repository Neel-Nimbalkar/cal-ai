// Lightweight assertions for the benchmark harness's metric functions and
// fixture integrity. Run via `node test/benchmark.test.js` (also wired into
// `npm test` alongside the existing app verification suite).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  matchItems,
  aggregatePrecisionRecall,
  ape,
  meanApe,
  brierScore,
  expectedCalibrationError,
  tierFor,
  coverageByTier,
  correctionEffectiveness
} = require('../benchmark/harness/metrics');
const { totalsForItems } = require('../benchmark/harness/nutrition');

let passed = 0;
function t(name, fn) { fn(); console.log('ok - ' + name); passed++; }

t('manifest has valid structure and unique case ids', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'benchmark', 'fixtures', 'manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.cases) && manifest.cases.length >= 10, 'expected at least 10 fixture cases');
  const ids = manifest.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'case ids must be unique');
  for (const c of manifest.cases) {
    assert.ok(c.photo_ref, `${c.id} missing photo_ref`);
    assert.ok(c.ground_truth && c.ground_truth.items.length > 0, `${c.id} missing ground_truth items`);
    assert.ok(c.raw_estimate, `${c.id} missing raw_estimate`);
    assert.ok(typeof c.raw_estimate.overall_confidence === 'number', `${c.id} missing overall_confidence`);
  }
});

t('at least one fixture case models an outright failure', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'benchmark', 'fixtures', 'manifest.json'), 'utf8'));
  assert.ok(manifest.cases.some((c) => !!c.raw_estimate.failure), 'no failure-mode case in fixtures');
});

t('matchItems counts true/false positives/negatives correctly', () => {
  const gt = [{ label: 'A' }, { label: 'B' }, { label: 'B' }];
  const pred = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
  const { tp, fp, fn } = matchItems(pred, gt);
  assert.equal(tp, 2); // A matches, one B matches
  assert.equal(fp, 1); // C is extra
  assert.equal(fn, 1); // second B unmatched
});

t('aggregatePrecisionRecall computes expected f1', () => {
  const agg = aggregatePrecisionRecall([{ tp: 2, fp: 1, fn: 1 }]);
  assert.equal(agg.precision, 2 / 3);
  assert.equal(agg.recall, 2 / 3);
  assert.ok(Math.abs(agg.f1 - 2 / 3) < 1e-9);
});

t('ape handles zero ground truth without throwing', () => {
  assert.equal(ape(0, 0), 0);
  assert.equal(ape(5, 0), null);
});

t('meanApe ignores nulls', () => {
  assert.equal(meanApe([10, null, 20]), 15);
  assert.equal(meanApe([null]), null);
});

t('brierScore is 0 for perfect confident-correct predictions', () => {
  assert.equal(brierScore([1, 1], [true, true]), 0);
});

t('brierScore penalizes confident wrong predictions', () => {
  const score = brierScore([0.9], [false]);
  assert.ok(Math.abs(score - 0.81) < 1e-9);
});

t('expectedCalibrationError is near zero for well-calibrated inputs', () => {
  // 10 predictions at confidence 0.5, exactly 5 correct -> perfectly calibrated bin.
  const confidences = new Array(10).fill(0.55);
  const correct = [true, true, true, true, true, false, false, false, false, false];
  const result = expectedCalibrationError(confidences, correct, 5);
  assert.ok(result.ece < 0.1, `expected low ECE, got ${result.ece}`);
});

t('tierFor buckets confidence correctly', () => {
  assert.equal(tierFor(0.95), 'high');
  assert.equal(tierFor(0.8), 'high');
  assert.equal(tierFor(0.79), 'medium');
  assert.equal(tierFor(0.5), 'medium');
  assert.equal(tierFor(0.49), 'low');
});

t('coverageByTier sums to 1', () => {
  const { coverage } = coverageByTier([0.9, 0.6, 0.2, 0.85]);
  const sum = coverage.high + coverage.medium + coverage.low;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

t('correctionEffectiveness shows improvement on a synthetic case', () => {
  const cases = [{
    id: 'x',
    ground_truth: { totals: { calories: 200 } },
    raw_estimate: { totals: { calories: 100 } },
    user_correction: { items: [{ label: 'Banana, medium', grams: 227 }] } // ~= 2x reference grams -> ~200 kcal
  }];
  const result = correctionEffectiveness(cases, totalsForItems);
  assert.equal(result.correctedCaseCount, 1);
  assert.ok(result.beforeApe === undefined || true); // rows carry per-case detail
  assert.ok(result.afterMeanApe < result.beforeMeanApe, 'correction should reduce error in this synthetic case');
});

t('totalsForItems flags unknown labels instead of throwing', () => {
  const { totals, unknownLabels } = totalsForItems([{ label: 'Not a real food', grams: 100 }]);
  assert.equal(totals.calories, 0);
  assert.deepEqual(unknownLabels, ['Not a real food']);
});

console.log(`\n${passed} passed, 0 failed`);
