// Per-gram nutrition derived from foods.js seed data (values there are per typical serving).
// Used to recompute totals for arbitrary gram amounts so gram-level portion errors
// translate into calorie/macro errors consistently across the harness.
'use strict';
const path = require('path');
const { FOODS } = require(path.join(__dirname, '..', '..', 'foods.js'));

// Reference serving grams for each seed food, used to derive a per-gram rate.
// These are reasonable estimates for the label as named (e.g. "Egg, large" ~50g).
const REFERENCE_GRAMS = {
  'Chicken breast, grilled': 100,
  'White rice, cooked': 158,
  'Brown rice, cooked': 195,
  'Egg, large': 50,
  'Banana, medium': 118,
  'Apple, medium': 182,
  'Greek yogurt, plain': 170,
  'Oatmeal, cooked': 234,
  'Almonds, 28g': 28,
  'Peanut butter, 2 tbsp': 32,
  'Salmon, grilled 100g': 100,
  'Broccoli, steamed': 156,
  'Sweet potato, medium': 130,
  'Avocado, half': 100,
  'Whole wheat bread': 28,
  'Milk 2%, cup': 244,
  'Cheddar, 28g': 28,
  'Ground beef 90%, 100g': 100,
  'Pasta, cooked cup': 140,
  'Olive oil, tbsp': 13.5,
  'Protein shake': 300,
  'Black beans, cup': 172,
  'Quinoa, cup': 185,
  'Orange, medium': 131,
  'Tuna, water 100g': 100,
  'Cottage cheese, cup': 226,
  'Strawberries, cup': 152,
  'Dark chocolate, 28g': 28,
  'Hummus, 2 tbsp': 30,
  'Flour tortilla': 45
};

const byLabel = new Map(FOODS.map((f) => [f.name, f]));

function perGram(label) {
  const food = byLabel.get(label);
  if (!food) return null;
  const grams = REFERENCE_GRAMS[label] || 100;
  return {
    calories: food.cal / grams,
    protein: food.protein / grams,
    carbs: food.carbs / grams,
    fat: food.fat / grams
  };
}

// Recompute totals for a list of {label, grams} items using the per-gram table.
// Unknown labels contribute zero and are reported so the caller can flag them.
function totalsForItems(items) {
  let calories = 0, protein = 0, carbs = 0, fat = 0;
  const unknownLabels = [];
  for (const it of items) {
    const rate = perGram(it.label);
    if (!rate) { unknownLabels.push(it.label); continue; }
    calories += rate.calories * it.grams;
    protein += rate.protein * it.grams;
    carbs += rate.carbs * it.grams;
    fat += rate.fat * it.grams;
  }
  return { totals: { calories, protein, carbs, fat }, unknownLabels };
}

module.exports = { perGram, totalsForItems, REFERENCE_GRAMS };
