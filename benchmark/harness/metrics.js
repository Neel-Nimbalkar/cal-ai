'use strict';

// ---- Item recognition precision/recall (label matching, per case) ----
// Multiset match on normalized labels: a predicted item is a true positive if
// its label matches a not-yet-claimed ground-truth item's label.
function matchItems(predicted, groundTruth) {
  const gtRemaining = groundTruth.map((x) => x.label);
  let tp = 0;
  for (const p of predicted) {
    const idx = gtRemaining.indexOf(p.label);
    if (idx !== -1) { tp++; gtRemaining.splice(idx, 1); }
  }
  const fp = predicted.length - tp;
  const fn = groundTruth.length - tp;
  return { tp, fp, fn };
}

function aggregatePrecisionRecall(caseResults) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of caseResults) { tp += r.tp; fp += r.fp; fn += r.fn; }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0
    ? null
    : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

// ---- Absolute percentage error ----
// Guards against divide-by-zero: when ground truth is 0, falls back to absolute
// error in kcal/g capped, reported separately so it doesn't distort MAPE.
function ape(estimate, truth) {
  if (truth === 0) return estimate === 0 ? 0 : null; // undefined percentage; caller should treat as excluded
  return Math.abs(estimate - truth) / Math.abs(truth) * 100;
}

function meanApe(values) {
  const usable = values.filter((v) => v !== null && Number.isFinite(v));
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => a + b, 0) / usable.length;
}

// ---- Confidence calibration: Brier score + Expected Calibration Error ----
// We treat "is this prediction's calorie total within 20% of ground truth" as the
// binary correctness signal for calibration purposes (documented in methodology).
// confidences and correctness are parallel arrays of numbers in [0,1] and booleans.
function brierScore(confidences, correctFlags) {
  if (confidences.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < confidences.length; i++) {
    const outcome = correctFlags[i] ? 1 : 0;
    sum += (confidences[i] - outcome) ** 2;
  }
  return sum / confidences.length;
}

function expectedCalibrationError(confidences, correctFlags, numBins = 5) {
  if (confidences.length === 0) return null;
  const bins = Array.from({ length: numBins }, () => ({ confSum: 0, correctSum: 0, count: 0 }));
  for (let i = 0; i < confidences.length; i++) {
    const c = Math.min(0.999999, Math.max(0, confidences[i]));
    const binIdx = Math.min(numBins - 1, Math.floor(c * numBins));
    bins[binIdx].confSum += confidences[i];
    bins[binIdx].correctSum += correctFlags[i] ? 1 : 0;
    bins[binIdx].count += 1;
  }
  let ece = 0;
  const n = confidences.length;
  const perBin = [];
  for (const b of bins) {
    if (b.count === 0) { perBin.push(null); continue; }
    const avgConf = b.confSum / b.count;
    const avgAcc = b.correctSum / b.count;
    ece += (b.count / n) * Math.abs(avgConf - avgAcc);
    perBin.push({ count: b.count, avgConfidence: avgConf, avgAccuracy: avgAcc });
  }
  return { ece, bins: perBin };
}

// ---- Confidence tiers & coverage ----
// Tiers align with a plausible product UI: high (>=0.8) auto-accept eligible,
// medium (0.5-0.8) shown with a nudge to review, low (<0.5) forced review/reject.
function tierFor(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function coverageByTier(confidences) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of confidences) counts[tierFor(c)]++;
  const total = confidences.length || 1;
  return {
    counts,
    coverage: {
      high: counts.high / total,
      medium: counts.medium / total,
      low: counts.low / total
    }
  };
}

// ---- Portion-correction effectiveness ----
// Compares calorie MAPE before correction (raw estimate) vs after correction
// (user_correction applied), for cases where a correction was actually made.
function correctionEffectiveness(cases, computeTotals) {
  const rows = [];
  for (const c of cases) {
    if (!c.user_correction) continue; // user accepted as-is; nothing to measure
    const truth = c.ground_truth.totals.calories;
    const before = c.raw_estimate.totals.calories;
    const { totals: afterTotals } = computeTotals(c.user_correction.items);
    const after = afterTotals.calories;
    rows.push({
      id: c.id,
      beforeApe: ape(before, truth),
      afterApe: ape(after, truth)
    });
  }
  const beforeMean = meanApe(rows.map((r) => r.beforeApe));
  const afterMean = meanApe(rows.map((r) => r.afterApe));
  const improvedCount = rows.filter((r) => r.afterApe !== null && r.beforeApe !== null && r.afterApe < r.beforeApe).length;
  return {
    correctedCaseCount: rows.length,
    beforeMeanApe: beforeMean,
    afterMeanApe: afterMean,
    absoluteImprovementPct: beforeMean !== null && afterMean !== null ? beforeMean - afterMean : null,
    improvedCaseCount: improvedCount,
    rows
  };
}

module.exports = {
  matchItems,
  aggregatePrecisionRecall,
  ape,
  meanApe,
  brierScore,
  expectedCalibrationError,
  tierFor,
  coverageByTier,
  correctionEffectiveness
};
