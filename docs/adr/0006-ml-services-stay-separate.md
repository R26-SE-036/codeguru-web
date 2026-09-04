# ADR 0006 — The two ML services stay separate deployables

**Status:** accepted · **Date:** 2026-09-04

## Context

Two components serve a model from a Python process beside a Node or Python API:

- **PairPath** — FastAPI + XGBoost, classifying collaboration state into five
  labels from 15 features.
- **Gamification** — Flask + a RandomForest, choosing Easy / Medium / Hard from
  six features.

Both are small. Both are separate ECS services in the target deployment, which
means seven services rather than five.

## Decision

Keep both as their own deployables.

## Alternatives rejected

**Fold Gamification's model into its Node backend via ONNX.** This is the
tempting one, and it is genuinely clean: the six features are *already* computed
in Node — an aggregation over `gameSessions` in `difficultyService.js` — and only
`model.predict()` happens in Python. Exporting the RandomForest to ONNX and
running it in-process with `onnxruntime-node` would delete a whole deployable
with no duplication of logic.

Rejected because it puts a model-format conversion step between training and
serving, in a project where the model is retrained from a script by hand. A
scikit-learn artefact that must be exported to ONNX before it takes effect is a
step that will be forgotten, and the failure is silent: the service keeps
serving the previous model.

**Fold PairPath's model into its NestJS API.** Rejected outright, and for a
reason the repository documents from experience: feature extraction must stay in
exactly one place. `ml-service/app/features/extractor.py` is the single
implementation *because* two hand-written extractors — one Python, one
TypeScript — had previously drifted apart, and the model was being served
different features than it was trained on. Reimplementing the extractor in
TypeScript recreates precisely that bug.

**Sidecar containers in the same ECS task**, sharing localhost, marked
`essential: false` so a Python crash restarts only that container. This is the
strongest rejected option: it gives one deploy unit per component, no service
discovery, no VPC hop, and the Python stays Python. It was not chosen because
independent scaling is worth more here — the classifier is invoked on a timer
and after every failed run, on a cadence unrelated to API traffic.

## Consequences

Seven ECS services instead of five. Both ML services must stay in private
subnets with security groups admitting only their own API: **neither has any
authentication and both use permissive CORS by design**, on the assumption an
API sits in front. Gamification's `/retrain` is guarded only by a shared secret
header.

The language boundary is preserved, which keeps the feature extractor as one
implementation — the property that matters most for the research validity of
either model.

Both were previously unreachable in practice for unrelated reasons: PairPath's
`ML_SERVICE_URL` defaulted to port 8000, which is Code Coach, and Gamification's
`model.pkl` was gitignored so `/predict` always answered "Model not trained
yet". Both are fixed; the deployment must not reintroduce either.
