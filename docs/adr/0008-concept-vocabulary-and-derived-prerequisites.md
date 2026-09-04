# ADR 0008 — One concept vocabulary, and prerequisites derived rather than asserted

**Status:** accepted; derivation blocked on data · **Date:** 2026-09-04

## Context

Code Coach speaks two related vocabularies:

- **error types** — `ARRAY_LENGTH_INDEX_MISUSE`, a specific mistake;
- **concept tags** — `array_indexing`, what the student has not understood.

The mapping is many-to-one: `INCORRECT_CONDITIONAL_OPERATOR` and
`DUPLICATE_IF_ELSE_CONDITION` both mean `conditional_logic`.

Study Guider's graph contained `Concept` nodes under **both**, because the quiz
UI posts `concept: errorType` to `/api/progress/update` while struggle detection
uses concept tags. A student's quiz result on array indexing was filed under
`ARRAY_LENGTH_INDEX_MISUSE` and their struggle data under `array_indexing`, and
the two never joined. Progress under-reported, silently, and got worse the more
the quizzes were used.

Separately, Study Guider needs to know which concepts precede which, so it can
send a student to the earliest gap rather than re-teaching the symptom.

## Decision

**Normalise at the write boundary.** `app/core/concepts.py` holds Code Coach's
15-entry mapping and `normalise_concept()` accepts either vocabulary. Every
writer lands on the same node whichever name it knows.

**Derive the prerequisite ordering from real resolution data**, not from an
asserted teaching order. `derive_concept_prerequisites.py` lives in Code Coach,
because Code Coach owns `codeDiagnostics` and Study Guider deliberately cannot
run a cross-student aggregation — every call it makes forwards the student's own
token, which is what makes its authorisation free.

## Alternatives rejected

**Normalise in the frontend.** The frontend is being replaced, and a backend
should not trust its caller to pick the right vocabulary.

**Reject unknown concepts.** `normalise_concept` lowercases and passes through
anything it does not recognise. A concept this service has not heard of is far
more likely to be one Code Coach just added than an attack, and rejecting it
would discard a real quiz result over a vocabulary lag.

**Assert the ordering by hand.** A hand-written prior exists in the source and is
seeded only behind an explicit flag. It is defensible and reviewable, but it is
a pedagogical claim rather than a finding, and the derived version is
strictly better evidence when it becomes possible.

## Consequences

The vocabulary fix is applied. A migration folded a duplicate `Student` node —
the same student existed twice, once keyed on `student_id` holding 12 attempts
and once on a legacy `id` property — merged three error-type-named concepts into
concept tags, and converted two orphaned `MASTERED` / `NEEDS_REVIEW`
relationships into real attempts, preserving their scores. Uniqueness
constraints on `Student.student_id` and `Concept.name` now make all of it
unrepeatable.

**The derivation currently refuses, and that is the correct answer.** Code Coach
holds 98 diagnostics, which sounds adequate until you look at who produced them:
3 users, who resolved an identical 13 concepts, each within a window of between
32 seconds and 3.5 minutes. That is `seed_student.py` running a loop. An
ordering derived from it would recover the seed script's iteration order.

The tool therefore checks three things — user count, median history span, and
whether the cohort was dealt one identical fixture — and reports *all* failing
reasons rather than the first, so fixing one does not look like fixing the
problem. It exits `2`, so it can gate a pipeline.

That failure mode is the one worth engineering against: a plausible graph, from
a real query over real rows, that means nothing. A number with a method behind
it is much harder to disbelieve than an opinion, so the method has to be the
thing that says no.

Because the successful path cannot run until real student history exists, it is
covered by tests instead: against a synthetic 40-learner cohort with
week-spanning histories and 20% out-of-order noise it recovers the true chain
exactly, and transitive reduction collapses 21 raw edges to the 6 direct ones —
without which "what should I study first" returns everything the student has
ever seen.

**Consequence for the platform:** learning paths return empty until there is
data. Neo4j's justification rests on the query being expressible and correct,
not on it currently having edges to traverse.
