# Rung

Rung is a middle-school fractions prototype for differentiated instruction. A student completes a five-question check-in, chooses focused practice for skills that are not yet mastered, and receives answer-safe AI support. Teachers can create a temporary class workspace, invite students with a join code, view their evidence in a heatmap, and open an AI-assisted mini-lesson for a shared gap.

Correctness, scoring, and mastery decisions are deterministic. GPT-5.6 is used for bounded language and planning tasks around that evidence; it does not decide whether an answer is correct or whether a student has mastered a skill.

## Features to try

- Five-question fractions check-in with per-subskill evidence.
- One selectable practice plan for each assessed skill that is not already mastered; missed skills are listed first.
- Generated practice questions with server-derived answer formats and deterministic scoring.
- Three-level AI tutor support: nudge, hint, and guided step.
- Teacher workspace: create a class, share a join code, and have a student join it.
- Teacher heatmap, grouped needs, quick actions, response evidence, and AI-assisted mini-lessons.

## Local setup

### Prerequisites

- Node.js 20 or later.
- npm.
- Optional: an OpenAI API key for live GPT-5.6 responses.
- Optional: a Supabase project for durable workspace and learner data.

### Install dependencies

```bash
npm install
```

### Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

The default local walkthrough works with only `DEMO_MODE=true`; it uses server-memory state and safe deterministic AI fallbacks. Add the optional OpenAI and Supabase values when you want to exercise those paths.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DEMO_MODE=true` | Yes for the demo | Enables temporary student and teacher-workspace flows. |
| `ALLOW_DEMO_IN_PROD=true` | Yes for the public Vercel demo | Second explicit opt-in required alongside `DEMO_MODE=true` when `NODE_ENV=production`. Use only for this fictional hackathon demo, never real students. |
| `OPENAI_API_KEY` | No | Enables live OpenAI requests. Without it, the app uses typed safe fallbacks. |
| `OPENAI_MODEL` | No | Default model route. The example value is `gpt-5.6-luna`. |
| `OPENAI_MODEL_DIAGNOSIS` | No | Optional diagnosis-model override. The example value is `gpt-5.6-terra`. |
| `OPENAI_MODEL_TUTOR_HINT` | No | Optional tutor-hint model override. |
| `OPENAI_MODEL_ATTEMPT_VERIFICATION` | No | Optional attempt-verification model override. |
| `OPENAI_MODEL_WORK_ANALYSIS` | No | Optional work-analysis model override. |
| `OPENAI_MODEL_PRACTICE_PLAN` | No | Optional practice-plan model override. The example value is `gpt-5.6-terra`. |
| `OPENAI_MODEL_TEACHER_LESSON` | No | Optional teacher-lesson model override. |
| `OPENAI_MODEL_ITEM_WRAP` | No | Optional item-wrapping model override. |
| `OPENAI_CACHE_MODE` | No | Global AI cache-mode override: `cache_first` or `live_first`. |
| `OPENAI_CACHE_MODE_<FEATURE>` | No | Per-feature cache-mode override. Supported features are diagnosis, tutor hint, attempt verification, work analysis, practice plan, teacher lesson, and item wrap. |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Supabase project URL for durable data. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase public key for the browser/auth path. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-only key for seed and trusted server operations. Never expose it in browser code. |
| `RUNG_CURRICULUM_CACHE_SECONDS` | No | In-process curriculum-cache TTL in seconds. Defaults to `3600`; set to `0` while editing seeded curriculum. |
| `RUNG_CURRICULUM_CACHE_MAX_ENTRIES` | No | Maximum number of in-process curriculum-cache entries. Defaults to `500`. |

Do not commit `.env.local` or expose API keys in screenshots, logs, browser code, or the submission.

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Sample data and test access

### Default local demo

No account, password, or external service is required for the default demo.

- Go to `/demo` and enter any first name or nickname.
- The app creates a temporary cookie-bound learner session.
- Local learner, workspace, and AI-cache state are process-local, so restarting the development server clears them.
- The fixed sample teacher dashboard is available at `/teacher/dashboard`. It contains fictional seeded fractions data; public walkthrough learners do not appear in that sample class.

### Teacher-workspace demo

This is the best end-to-end judge flow:

1. Open `/teacher-workspace` and enter any teacher display name and class name.
2. Copy the generated join code or join link.
3. Open the join link in a separate browser profile or incognito window, or go to `/join-class` and enter the code plus any student display name.
4. Complete the student check-in and at least one practice plan.
5. Refresh the teacher workspace to see the joined student, their heatmap evidence, groups, and available actions.

The workspace begins with an empty roster. It fills only with students who join through its generated code. Teacher and student workspace sessions expire after eight hours or when the teacher ends the workspace.

### Test accounts

| Role | Credentials | Notes |
| --- | --- | --- |
| Student | None | Enter any display name in the public demo or class-join form. |
| Teacher | None | Enter any display name and class name at `/teacher-workspace`. |
| Sample teacher dashboard | None | Visit `/teacher/dashboard` to view the fixed fictional class. |

### Example inputs

- Teacher display name: `Ms. Jordan`
- Class name: `Period 3 fractions`
- Student display name: `Alex`
- Class join code: use the three-group code generated by the teacher workspace, such as `A3F9-2B71-C4D8`.

### Optional durable Supabase setup

To persist temporary learner/workspace data across server restarts:

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
2. Apply every SQL migration in `supabase/migrations/` in filename order, currently `001` through `023`.
3. Run:

   ```bash
   npm run seed
   ```

The seed loads the canonical fictional fractions curriculum and sample teacher data, and clears temporary demo/runtime records from prior rehearsals.

## How to test the project

### Student flow

1. Visit `/demo`, enter a name, and start the check-in.
2. Complete all five questions.
3. On the results page, open the plan marked `Recommended from your diagnostic`.
4. Submit an incorrect practice answer, then use the tutor support ladder. Verify that nudge, hint, and guided step become progressively more concrete without exposing the final answer.
5. Complete a plan and return to the results page; its card should show `Completed`.

### Teacher flow

1. Create a workspace at `/teacher-workspace`.
2. Join it as a student using its code, preferably in a separate browser profile.
3. Complete the diagnostic and some practice as that student.
4. Return to the teacher workspace and verify the student appears in the roster and heatmap.
5. Hover a `Needs support`, `Developing`, or `Not started` cell to try the available quick action. Open a group’s mini-lesson to test teacher planning.

### What to look for

- Answer scoring and mastery evidence come from stored student responses, not model-generated claims.
- Practice plans are separated by subskill and use generated, validated items.
- Tutor output is constrained by a three-level support contract and answer-leak checks.
- A teacher sees only evidence generated in their own temporary workspace, not the public walkthrough’s learner data.

## Tests and checks

```bash
npm test
npx tsc --noEmit
npm run build
```

Verified on July 20, 2026:

- `npm test`: 36 test files and 222 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.

## How we used Codex and GPT-5.6

### How Codex accelerated our workflow

Codex accelerated implementation and iteration across the app: establishing the Next.js file layout, building API routes and UI flows, refining the heatmap and teacher workspace, resolving merges, adding tests, updating documentation, and checking type safety and production builds. Product choices and final behavior were reviewed and directed by the builders throughout that process.

### Key product, engineering, and design decisions

- **Deterministic learning decisions:** server code scores answers, records responses, updates mastery, chooses practice targets, and controls progress. The model is not allowed to grade students or declare mastery.
- **Structured, bounded model output:** GPT-5.6 responses are schema-validated and feature-specific. Generated practice is converted into supported item types whose answers are derived and verified by server code.
- **Answer-safe tutoring:** nudge, hint, and guided step have separate prompts and increasing specificity. Output is checked to prevent protected-answer or worked-solution leakage.
- **Evidence-scoped teacher views:** public walkthrough learners are isolated from the sample class. Students who join a teacher workspace receive a class-specific mastery matrix, so that teacher sees only work completed in that workspace.
- **Graceful demo behavior:** each AI feature has a typed deterministic fallback. Valid AI outputs can be reused through the `ai_runs` cache; without an API key or Supabase, the local walkthrough remains usable in server memory.

### How GPT-5.6 contributed to the final result

GPT-5.6 provides structured diagnosis language, tutor hints, practice-plan parameters, teacher mini-lesson drafts, attempt verification, and optional work analysis. The adapter validates each response with Zod and feature-specific safety checks before it reaches the UI. It caches only validated outputs and falls back safely when the model, cache, or schema validation is unavailable.

## Known limitations

- Rung currently demonstrates a middle-school fractions curriculum; the landing-page workflow is broader than the implemented content pack.
- Teacher workspaces are temporary fictional demo sessions, not production authentication or real classroom accounts.
- The production browser sign-in/session UI and authenticated teacher authorization flow are not complete.
- Without Supabase, temporary learner and teacher-workspace data resets when the local server restarts.
- Without `OPENAI_API_KEY`, the app uses deterministic fallbacks instead of live model responses.

## Submission materials

- Demo video: not yet provided in this repository.
- Repository: this repository.
- Live demo: not yet provided in this repository.

For deeper implementation detail, see [architecture.md](./architecture.md), [contracts.md](./contracts.md), and [IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md).
