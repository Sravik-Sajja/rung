# Rung implementation handoff log

This is the shared factual handoff log for the current prototype. Update it when work merges, when a contract changes, or when a bug is found or resolved. `architecture.md` remains the product and architecture source of truth.

## Current delivery checklist (2026-07-15)

This is the short operational view of what remains. The dated entries below are the detailed factual history. Mark an item complete only after its validation is recorded in a new dated entry.

### Required before a deployable demo

- [ ] **Replace Maya as the primary entry path with a dynamic walkthrough participant.** The visitor enters a first name or nickname, receives a server-generated temporary student identity, and sees their own results in the class dashboard. **Approved fallback:** retain Maya as a secondary “View the prepared Maya walkthrough” link for rehearsals and recovery.
- [ ] **Wire the rendered hint ladder to `/api/tutor/hint`.** The work-help escalation is mounted after a recorded miss -> requested `hint`/`guided_step` -> another miss, and the visible peer gate is removed. The remaining route wiring must replace the component's temporary local hint copy with the item-specific endpoint response.
- [ ] **Unify local demo state during the transition to Supabase.** The active diagnostic/practice path uses `demo-learning-store`; legacy peer unlocks still use `demo-flow`. Scoring, mastery, and the visible work-help condition must resolve from one server-owned state source before deployment.
- [ ] **Run the full Maya rehearsal.** Five-question diagnostic -> evidence-based diagnosis -> selected practice -> safe hint ladder -> recorded miss + work-help response -> deterministic correct answer -> updated mastery visible in the teacher heatmap.
- [ ] **Run a clean production build.** Stop all concurrent `next dev` processes first, then run `npm.cmd run build` against a clean `.next` directory and record the result.
- [ ] **Exercise the real Supabase deployment path.** Apply migrations through `005`, run the deterministic seed, configure auth, test RLS as a student and teacher, and set `DEMO_MODE=false` for the deployed environment.
- [ ] **Verify live AI and failure behavior.** Configure the OpenAI key/model, confirm `ai_runs` logging and cache reads, then rehearse the safe fallback with the model unavailable.

### Recommended after the demo is stable

- [ ] Complete an explicit privacy/consent and deletion review before any real-student work-photo retention is introduced. The current prototype intentionally does not retain work photos.
- [ ] Add more reviewed content packs beyond Maya's primary fractions journey.
- [ ] Add CI for tests, type-checking, a clean build, and the canonical end-to-end rehearsal.

### Completed foundation at a glance

- [x] Fraction normalization/scoring, parametric item generation, and validation tests.
- [x] Canonical Supabase schema/seed, mastery matrix, stable IDs, teacher heatmap/group data.
- [x] Five-question diagnostic, deterministic diagnosis/practice selection, mastery updates, and one-time resurfacing.
- [x] AI adapter contracts, Zod validation, cache/fallback behavior, leakage tests, and `ai_runs` integration.
- [x] Server-only work-help boundary: optional request-only photo analysis, protected-answer leak checks, and safe fallback.
- [x] Reload-safe local diagnostic/practice sessions plus the primary Maya content pack.

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

## 2026-07-14 â€” canonical teacher data and first persisted response path

### Completed

- Extended the canonical seed to the eight-student, five-sub-skill mastery matrix used by the teacher demo, including cached teacher groups, lesson-plan records, and video placeholders. Maya, Diego, and Zara are the `find-common-denominator` needs-support cohort.
- Exported the roster, sub-skill, group, and practice-item identifiers from `src/lib/demo/contracts.ts`; the in-memory teacher fallback now uses the canonical class, number-line, and common-denominator IDs too.
- Added `src/lib/teacher/repository.ts`. Teacher dashboard and group-plan API handlers read Supabase first and fall back deterministically when server credentials or seeded rows are unavailable.
- Added the first persisted student-loop mutation in `src/lib/student/response-service.ts`. `POST /api/responses` now records a response and upserts deterministic mastery when Supabase is configured; local demo scoring remains a clearly bounded fallback.

### Validation

- `npm.cmd test`: 5 files / 16 tests passed.
- `npx.cmd tsc --noEmit`: passed.
- `git diff --check`: passed.

### Bugs / follow-ups

- The diagnostic-completion, practice-session/requeue, peer-gate, and student mastery routes remain to be wired to the persisted student-loop service.
- Seeded video URLs remain explicit placeholders and must be replaced with reviewed resources before the demo rehearsal.

## 2026-07-14 â€” deployable-MVP decisions, Auth/RLS, and live AI fallback

### Completed

- Updated `architecture.md` and `contracts.md` with the approved deployable-MVP choices: Supabase Auth/RLS, five fixed diagnostic items, deterministic learning decisions, and Option B live GPT-5.6 → verified cache → safe fallback.
- Added `supabase/migrations/004_auth_rls_foundation.sql`, keeping existing seed IDs compatible while establishing profiles, teacher ownership, role-aware RLS policies, and a server/session Supabase client boundary.
- Added the GPT-5.6 adapter runtime: Luna is the routine default, Terra can be selected for diagnosis/teacher work, outputs are Zod-validated, valid calls are logged/cached in `ai_runs`, and no-cache peer verification fails closed.
- Expanded the canonical diagnostic assignment from one item to five stable fraction items and locked their order in shared contracts/tests.

### Validation

- `npm.cmd test`: 6 files / 23 tests passed.
- `npx.cmd tsc --noEmit`: passed.
- `git diff --check`: passed after all changes settled.

### Bugs / follow-ups

- Existing route handlers still need authenticated-session extraction plus actor checks before the new RLS production path is fully enforced.
- `POST /api/tutor/hint` now uses the live/cache/fallback adapter. The diagnostic and peer route handlers still need to be wired to their corresponding adapter methods.
- Existing unrelated uncommitted UI work was preserved and not included in this checkpoint's ownership.

## 2026-07-15 â€” diagnostic-driven practice loop

### Completed

- Added `005_diagnostic_practice_loop.sql`: diagnostic sessions and response-to-session foreign keys make repeated diagnostics and persisted practice runs unambiguous.
- Added deterministic diagnostic evidence, prerequisite-first gap selection, four-item practice selection, one-time requeue, and stable mastery transition rules under `src/lib/student/learning-loop.ts`.
- Added Supabase-backed and local-demo implementations for diagnostic start/submit/complete, practice reads, practice responses, and student mastery reads.
- Added server-owned routes for diagnostics, completion, practice, responses, and mastery. Development defaults to the isolated demo actor; production requires an authenticated student actor.
- Replaced hardcoded diagnostic/practice UI state with route-driven screens. Maya’s common-denominator miss now generates `common-denominator-1`, `common-denominator-2`, `add-unlike-1`, and `add-unlike-2`.
- Expanded the frozen seeded item bank with the missing common-denominator and unlike-denominator practice items.

### Validation

- `npm.cmd test`: 8 files / 29 tests passed.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run build`: passed.
- Local API rehearsal: Maya’s diagnostic selected `find-common-denominator`; a correct first practice answer advanced to `common-denominator-2` and updated mastery to `developing`.

### Bugs / follow-ups

- Peer-attempt persistence/verification and optional photo analysis are still separate work; the photo UI is not stored or analyzed by this practice-loop change.
- Production deployment requires applying migrations through `005`, seeding Supabase, setting `DEMO_MODE=false`, and adding the sign-in UI that supplies Supabase bearer tokens.

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

- Expanded temporary demo data to the canonical eight fictional students, five fraction sub-skills, a 40-cell mastery matrix, five validated-bank practice items, and seeded group plans.
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
## 2026-07-14 — teacher-data foundation handoff

### Completed

- Added `supabase/migrations/002_partner_heatmap_foundation.sql` with a constrained mastery level, `evidence_summary`, occurrence-capable practice session items, supporting indexes, and the `class_mastery_heatmap` view.
- Added `src/lib/demo/contracts.ts` with canonical IDs for the demo class, Maya, the fractions topic, and `find-common-denominator`, plus the shared mastery enum and heatmap-cell shape.
- Replaced the seed placeholder with deterministic, idempotent Supabase upserts for an eight-student fractions class, skill hierarchy, diagnostic/practice items, and a complete 8 × 5 mastery matrix.
- Seed data includes Maya plus Diego and Zara as `needs_support` on `find-common-denominator`, and includes every mastery level in the class data.
- Added the isolated teacher heatmap normalizer/fixture and tests in `src/lib/teacher/`.

### Validation

- `npm test`: 5 files / 14 tests passed.
- Seed command transpiles successfully and stops with the expected missing-credentials message until `.env.local` is configured.

### Partner handoff

- Query `class_mastery_heatmap` filtered by `class_id = 'fractions-demo-class'`.
- Consume rows as `{ studentId, subskillId, level, evidenceSummary }` through `src/lib/teacher/heatmap.ts`.
- Use `src/lib/demo/contracts.ts` for the canonical IDs and mastery-level enum; do not duplicate them in dashboard code.

## 2026-07-15 — Track A student-flow API and UI foundation

### Completed

#### API and state

- Added the previously missing API handlers: diagnostic completion, practice retrieval, peer-attempt submission, and gated peer-solution retrieval.
- Added `src/lib/student/demo-flow.ts`, a deterministic local fallback that records submitted answers, derives Maya's supported common-denominator diagnosis, creates ordered practice sessions, requeues a missed item once, and enforces peer unlock state.
- Updated `POST /api/responses` so its local fallback state is updated even when a configured Supabase response write succeeds; downstream routes can consume the same response during the transition to full persistence.

#### Student UI

- Replaced the diagnostic placeholder with a client flow that submits Maya’s response, completes the diagnostic, saves the returned diagnosis locally for display, and follows the returned practice-session ID.
- Connected `/student/diagnosis` to the server-derived diagnosis result and `/student/practice/[sessionId]` to practice-session retrieval.
- Connected answer submission, tutor hints, meaningful-attempt verification, and gated peer-solution display on the practice screen.
- Corrected local practice requeue handling so a requeued occurrence—not the original missed occurrence—is marked when the student retries it.

#### Tests

- Added student-flow tests covering diagnostic-to-practice creation, session recovery, poor-attempt rejection, approach-only unlock, and full-solution unlock after a deterministic correct score.

### Validation

- `npm test`: 6 files / 20 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

### Bugs / follow-ups

- The student experience is intentionally basic and only demonstrates Maya’s one-item diagnostic. Add the full 4–5 item diagnostic progression after the persistence layer is complete.
- The flow still relies on shared process-local demo state and browser session storage; replace both with durable Supabase-backed state for deployment.

## 2026-07-15 â€” reload-safe demo sessions and primary Maya content pack

### Completed

- Added `src/lib/student/demo-session-state.ts`, a `globalThis`-backed registry for local diagnostic and practice runs. It keeps a browser's demo session valid across Next.js development module reloads/hot reloads instead of losing the in-memory `Map`.
- Updated `src/lib/student/demo-learning-store.ts` to use that registry for diagnostic creation, response submission, completion, practice reads, and practice responses. Added a test that simulates a fresh module evaluation and submits against the original diagnostic session ID.
- Added `src/lib/content/maya-fractions.ts` as the reviewed primary content pack for Maya's journey:
  - item-specific nudge, hint, and guided-step text for four primary practice items;
  - deterministic, student-friendly explanation copy for `adds_denominators` and `adds_numerators_and_denominators`;
  - three fictional, reviewed peer examples that keep an answer-safe first approach separate from the answer-bearing full solution.
- Connected the content pack to AI fallbacks in `src/lib/ai/adapter.ts` and `src/lib/ai/runtime.ts`; live/cache/fallback contracts remain unchanged, but fallback content now matches the selected item and supported misconception tag.
- Connected reviewed peer examples to the local peer-solution fallback without changing the deterministic unlock rule.
- Replaced the primary common-denominator teacher-video placeholder in both `src/lib/demo-data.ts` and `supabase/seed.ts` with a reviewed Khan Academy resource.
- Added a diagnostic-page fetch-error guard. If the local server is unavailable, the learner sees an actionable message instead of an uncaught browser fetch error.

### Validation

- `npm.cmd test`: 10 files / 40 tests passed.
- `npx.cmd tsc --noEmit`: passed.
- Local API rehearsal: created a fresh Maya diagnostic; submitted all five answers; received the `adds_denominators` diagnosis; created the four-item focused practice session; submitted `12` for the first item and advanced to `common-denominator-2`.
- Local server check after the browser fetch failure: restarted `npm run dev` on port 3000 and verified a fresh diagnostic request and answer submission return successfully.

### Bugs / follow-ups

- **Demo-state boundary:** `globalThis` fixes Next development reloads, but a full Node/Next server restart still clears demo-only sessions. After a restart, refresh the page and begin a new diagnostic. Durable Supabase sessions remain the deployment fix.
- **Build validation:** `npm.cmd run build` compiled and type-checked successfully, then failed while collecting `/_not-found` because another active Next development server was sharing the workspace `.next` directory. Stop concurrent dev servers and retry the production build before deployment; no source-code build failure is currently indicated.
- **Content/UI handoff:** the server/API fallbacks now expose item-specific Maya hints and reviewed peer content. Keep the rendered student UI wired to `/api/tutor/hint` and the peer endpoints rather than duplicating generic hint or worked-solution text in components.

## 2026-07-15 — work-based help boundary (peer gate retired from the intended flow)

### Completed

- Added `POST /api/work-help`, which accepts required typed work and an optional JPEG/PNG/WebP photo (maximum 5 MiB) after actor and item validation. The route validates the image signature and keeps accepted image bytes only in request memory long enough to make the model call.
- Added the `analyzeWork` GPT-5.6 Luna adapter feature, with `OPENAI_MODEL_WORK_ANALYSIS` as an optional server-only override. It returns exactly one observation, one next step, one check question, and an image-read signal.
- Preserved the trust boundary: GPT-5.6 never scores, updates mastery, changes practice selection, unlocks content, or supplies a final answer/worked solution. `answer_spec` remains the only correctness authority.
- Added protected-answer, protected-solution-step, generic-answer-phrase, and short standalone-answer leakage checks. A rejected or unavailable model result becomes an answer-safe deterministic fallback.
- `ai_runs` receives only a one-way hash plus safe structured output/metadata. It never receives raw typed work, image bytes, or a photo data URL.
- Added the isolated `WorkHelpCard`, including camera-capable optional upload controls, request-only privacy copy, response rendering, and client-side 5 MiB validation.
- Updated `architecture.md` and `contracts.md`: the intended student flow is now hint -> still stuck -> work-based help, while old peer routes/data are legacy compatibility only.

### Validation

- `npm.cmd test`: 11 test files / 52 tests passed, including 7 work-help-route tests and 12 AI-runtime tests.
- `npx.cmd tsc --noEmit`: passed.
- `git diff --check`: passed.
- Browser smoke test: a fresh five-question diagnostic selected common-denominator practice; the work-help card was absent after the first miss and after selecting a hint, appeared only after the next miss, and rendered the safe fallback response after typed work was submitted.
- Live provider validation is still pending an environment with `OPENAI_API_KEY`; the live/cache/fallback behavior is covered through the injected client tests.

### Bugs / follow-ups

- **Hint-route handoff:** `src/components/student/persisted-practice-loop.tsx` now mounts `WorkHelpCard` only after a recorded miss, a requested `hint`/`guided_step`, and another missed response. Its existing hint text is still temporary local copy; wire it to `/api/tutor/hint` before the deployable rehearsal.
- **No retention by design:** this prototype processes work photos in memory. Do not add database or Storage persistence without a separate consent, retention, deletion, and access-control decision.
