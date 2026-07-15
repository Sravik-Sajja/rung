# Rung implementation handoff log

This is the shared factual handoff log for the current prototype. Update it when work merges, when a contract changes, or when a bug is found or resolved. `architecture.md` remains the product and architecture source of truth.

## 2026-07-14 — baseline before Phase 0

### Repository state

- Working tree: clean when this entry was written.
- Latest commit: `c9d878c` (`Added question generation and tutor help`). That commit changes `architecture.md`; the application remains an early scaffold.
- Runtime/dependency declarations: Next.js 15, React 19, TypeScript, Tailwind, Zod, Supabase JavaScript SDK, OpenAI SDK, Vitest, and `tsx` are listed in `package.json`.
- `node_modules` is not present in this workspace. `npm.cmd run build` was attempted on 2026-07-14 and failed before compilation because `next` is not installed/available.

### Currently implemented

- Basic Next.js App Router shell and global Tailwind styling.
- Static demo/student/teacher route placeholders:
  - `/demo`
  - `/student/diagnostic`, `/student/diagnosis`, `/student/practice/[sessionId]`, `/student/mastery`
  - `/teacher/dashboard`, `/teacher/groups/[groupId]`
- Temporary in-memory demo records in `src/lib/demo-data.ts`: four students and one fractions item.
- Shared TypeScript domain types and Zod request schemas for answer submission, tutor hints, and peer attempts.
- `POST /api/responses` validates a request and scores the single in-memory item. It returns `pending-persistence`; it does not write to Supabase.
- `POST /api/tutor/hint` calls the single server-side adapter boundary. The adapter returns seeded nudge/hint/guided-step fallback text only.
- An initial Supabase migration defines the current core curriculum, roster, progress, peer-gate, video, and `ai_runs` tables.
- `supabase/seed.ts` exists as a command entry point but only logs a TODO message; no database data is seeded or reset.

### Known gaps and bugs

- The existing score helper only removes whitespace and checks whether the resulting string is in `answerSpec.accepted`. It does **not** implement the architecture-required fraction equivalence primitive (`1/2`, `2/4`, and `0.5`) and has no tests.
- The diagnosis helper maps a trimmed answer to a tag but is not connected to response persistence, diagnostic completion, prerequisite prioritization, or student-facing evidence.
- There is no deterministic parametric item generator or validator. The current item is hand-authored temporary demo data, so the frozen generated-item requirement is unmet.
- There is no actual Supabase access in the student loop, no canonical seed, and no mastery matrix. The teacher dashboard renders static `needs support` labels rather than `mastery` rows.
- Migration coverage does not yet include `teacher_groups`, `teacher_group_members`, or `lesson_plans`; this is acceptable until teacher features are started, but dashboard grouping is not implementable from persisted records yet.
- The AI adapter has only `getTutorHint`. It has no locked per-feature interface, structured output schemas, OpenAI call, cache, prompt versions, `ai_runs` writes, diagnosis explanation, attempt verification, leakage check, or LLM item wrapping.
- The student routes are placeholder navigation. They do not submit diagnostic answers, show server-derived diagnosis/practice data, enforce attempt gates, or render persisted mastery.
- The architecture API surface in section 11 is not yet represented as shared request/response types or fixtures. Only `/api/responses` and `/api/tutor/hint` exist, and their responses are incomplete relative to the architecture.
- No test files or integration test suite are present. Vitest is declared but not yet configured or exercised.
- No photo-help work has been started. It remains out of scope until the core journey is complete.

### Validation status

| Check | Result | Notes |
| --- | --- | --- |
| Working tree inspection | Pass | No uncommitted repository changes at entry time. |
| Build | Blocked | `npm.cmd run build` fails because dependencies have not been installed (`next` is not recognized). |
| Unit tests | Not run | No test suite is present; dependencies are unavailable. |
| Seed/reset | Not functional | Commands resolve to the skeleton seed script, which does not persist or reset data. |
| Full demo flow | Not functional | Routes are static placeholders and database/model integration is absent. |

### Next work — Phase 0 (blocking foundation)

Keep this phase lean and merge it before parallel tracks begin. Its purpose is to lock the shared seams; it must not expand into live AI or student UI work.

1. Create and test the pure `answer_spec` normalization/equivalence primitive. Make scoring, distractor matching, the parametric generator, and the validator use it.
2. Add deterministic parametric item generation plus validation. Freeze the generated diagnostic/practice item set, its exact answers, and `distractor_map` values for the canonical demo seed. Defer LLM wording/wrapping to the AI track.
3. Complete the Phase-0 migrations and canonical Supabase seed/reset implementation. Seed the topic/subskills, 8–12 students, class enrollment, Maya, diagnostic assignment, items, peer content, cached fallback records, and a believable mastery matrix. Include at least three students with Maya's common-denominator gap.
4. Export and document the immutable shared constants:
   - `MasteryLevel`: `not_started | needs_support | developing | mastered`;
   - canonical IDs for Maya, class, assignment, common-denominator sub-skill, gated item, and misconception tags;
   - heatmap cell: `{ studentId, subskillId, level, evidenceSummary }`.
5. Lock the full AI adapter contract **with concrete signatures and fallback objects** before Track A and Track B split. At minimum define `diagnoseExplanation(...)`, `tutorHint(...)`, `verifyAttempt(...)`, and `wrapItem(...)`, including inputs, validated results, source/status metadata, and failure/fallback behavior.
6. Lock the section-11 server API contracts as shared Zod schemas/types and checked-in example fixtures before Track A and Track C split:
   - `POST /api/responses`;
   - `POST /api/diagnostics/:assignmentId/complete`;
   - `GET /api/practice/:sessionId`;
   - `POST /api/tutor/hint`;
   - `POST /api/peer-attempts` and `GET /api/peer-solutions/:itemId`;
   - teacher dashboard/group-plan reads.
7. Assign the API route handlers/server actions to the domain/API track. That owner wires the locked domain rules to the contracts consumed by the student UI; this layer must not be left unowned.

### Parallel ownership after Phase 0 merges

- **Track A — domain and API:** deterministic scoring, diagnosis tag collection, mastery updates, practice selection/requeue, unlock rules, and API route handlers. It calls the adapter interface only.
- **Track B — AI:** implements the locked adapter: structured output, `ai_runs`, cache/fallback, tutor ladder, runtime leakage check plus leakage evaluation fixtures, verifier, diagnosis explanation, and LLM item wrapping. Re-wrapped items must preserve the Phase-0 `item_id` and `answer_spec`; wrapping is additive and cannot move the target used by Tracks A/C.
- **Track C — student UI:** implements the four student routes using the locked API fixtures/contracts, initially with fallback responses.
- **Phase F owner — integration/tests:** owns cross-track integration tests and rehearsal: reset, Maya journey, mastery-to-heatmap propagation, attempt-gate cache path, and OpenAI-outage fallback.

## Append new handoff entries below

Use this template for every meaningful change:

```md
## YYYY-MM-DD — short change title

### Completed

- Files/features changed:
- Contract or migration impact:

### Validation

- Commands run and result:

### Bugs / follow-ups

- Known issue, owner, and dependency:
```

## 2026-07-14 — parallel-contract plan locked

### Completed

- Updated `architecture.md` with a Phase-0 blocking foundation followed by disjoint Domain/API, AI, and Student UI tracks.
- Created `contracts.md` as the implementation-contract companion to `architecture.md`, with concrete AI adapter method signatures and fallback-result shapes for diagnosis explanation, tutor hints, attempt verification, and item wrapping.
- Locked API DTOs, fixture names, route ownership, canonical seed IDs, and the student-facing response shapes that UI work consumes in `contracts.md`.
- Made `practice_session_items` occurrence-based in the architecture so a missed item can be requeued once without violating a `(session, item)` uniqueness constraint.
- Documented the item-wrap invariant: wrapping may alter wording only and must retain the existing item ID, answer specification, distractor map, operands, skill, and difficulty.

### Bugs / follow-ups

- These are architecture and planning changes only. The current application code still has the gaps recorded in the baseline entry; Phase 0 implementation is not complete.
- Before implementing within-session resurfacing, update the existing SQL migration or add a forward migration so `practice_session_items` has an occurrence-level primary key.
- Before UI integration, add the shared contract modules, Zod schemas, and checked-in fixtures described in architecture sections 10.1 and 11.1.

### Validation

- `git diff --check` passes after the documentation updates.

## 2026-07-14 — isolated student-loop foundations

### Completed

- Added `src/lib/math/rational.ts`: exact rational parsing, reduction, normalization, and equivalence without floating-point comparison.
- Updated `src/lib/math/scoring.ts` to accept equivalent rational answers while preserving its existing public API.
- Added `src/lib/items/fraction-generator.ts`: deterministic fraction addition/subtraction item construction, computed answer keys, `distractor_map` generation, and validation.
- Added fallback-only AI internals in `src/lib/ai/**`: typed/Zod-validated contracts, safe tutor/diagnosis/attempt fallbacks, leakage detection, and tutor-eval fixtures. Existing API routes were not changed.
- Added isolated reusable student components in `src/components/student/**`: answer input, hint ladder, progress indicator, peer gate, and mastery badge. Teacher routes and dashboard code were not changed.
- Added Vitest configuration, a one-shot `npm test` script, watch script, and local environment/test guidance in `README.md`.

### Validation

- `npm test`: 3 files / 8 tests passed (rational normalization, item generation, and leakage checks).
- `git diff --check` passes.

### Bugs / follow-ups

- Local `node_modules` is incomplete in this environment: npm did not create `.bin` shims, and the TypeScript package lacks its standard `lib/*.d.ts` files. The `npm test` script now invokes Vitest's local entry point directly; TypeScript type-checking cannot run until dependencies are repaired/reinstalled in a healthy Node environment.
- No database migrations, seed records, mastery/dashboard contracts, teacher pages, or API route behavior were changed by this work.

## 2026-07-14 — teacher heatmap, groups, and seeded group plans

### Completed

- Expanded temporary demo data to 10 fictional students, five fraction sub-skills, a 50-cell mastery matrix, five validated-bank practice items, and seeded group plans.
- Added deterministic grouping in `src/lib/teacher/grouping.ts`. It groups only `needs_support` mastery records and requires at least two students per group.
- Replaced `/teacher/dashboard` placeholder content with an accessible CSS-grid heatmap. Status is communicated by text and pale color: red for needs support, yellow for developing, green for mastered, and gray for not started.
- Implemented `/teacher/groups/[groupId]` with group members, a timed mini-lesson, materials, check for understanding, matched practice items, and a video-resource placeholder.
- Added `GET /api/classes/:classId/dashboard` and `GET /api/teacher-groups/:groupId/plan`, both backed by the deterministic demo projection.
- Added `supabase/migrations/002_teacher_groups.sql` with `teacher_groups`, `teacher_group_members`, and `lesson_plans` tables.
- Updated `README.md` and `contracts.md` with the current teacher endpoints and response shapes.

### Validation

- `npm run build` passed after the teacher dashboard and group-plan work.
- `git diff --check` passed.

### Bugs / follow-ups

- Teacher mastery, groups, and plans are still in-memory demo data; `supabase/seed.ts` must persist the canonical matrix and plans before the demo is database-backed.
- Group plans are static cached fallback content, not model-generated records; add `ai_runs`, cache metadata, and persisted `lesson_plans` before claiming live AI generation.
- Video records use a clearly labeled placeholder URL. Replace each with a manually reviewed, pre-vetted resource before rehearsal.
