# CalAI product direction

CalAI serves busy adults who abandoned calorie trackers because logging was too slow. Its wedge is photo logging with visible confidence and fast portion correction. The current validation build proves onboarding, targets, food search, diary, progress, local persistence and waitlist demand.

## Production priorities
1. Real double-opt-in waitlist and analytics.
2. Auth, Postgres sync, export and deletion.
3. USDA/Open Food Facts search and quick add.
4. Photo-estimation vendor bake-off, confidence UI and portion correction.
5. Weight trends, reminders, subscriptions and beta hardening.

## Safety gates
Never calculate below 1,200 kcal/day for women or 1,500 for men. Disable targets when a clinician has advised against calorie tracking. Do not target minors or sell food/weight data. Delete food photos after inference by default. CalAI is not medical advice.