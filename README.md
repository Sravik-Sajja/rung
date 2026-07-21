# Rung

Rung is a differentiated-instruction prototype for middle-school math. A learner takes a short check-in, receives a separate focused-practice plan for each skill that needs work, and gets answer-safe AI support. Teachers can view evidence in a heatmap, take a quick action, and open an AI-assisted small-group mini-lesson.

Correctness, scoring, and mastery are deterministic server decisions. GPT-5.6 helps with bounded explanation, tutoring, practice planning, and lesson drafting; it never decides whether an answer is correct or whether a learner has mastered a skill.

## What judges should try

### Student flow

1. Visit `/demo`, enter any name, and start the five-question check-in.
2. Finish the check-in. Rung creates one selectable practice plan for each skill that was not mastered; completed plans remain marked when you return.
3. In a plan, submit one wrong answer. Use the three tutor levels—nudge, hint, and guided step—and then submit again.
4. Finish the plan and open the practice summary. It shows correct answers, first-try successes, total attempts, retries, and the questions that needed another try without revealing answer keys.

Example learner name: `Alex`.

### Teacher flow

1. Visit `/teacher-workspace` and create a workspace with any teacher/class name.
2. Copy its join code or link; open it in an incognito window or separate browser profile.
3. Join as a learner, complete a check-in and some practice, then return to the teacher workspace.
4. Inspect the heatmap, hover a `Needs support`, `Developing`, or `Not started` cell for the available quick action, and open a group mini-lesson.

Example teacher/class: `Ms. Jordan`, `Period 3 fractions`.

The fixed fictional sample heatmap is also available at `/teacher/dashboard`.

## How we used Codex and GPT-5.6

Codex accelerated the project from scaffold through polished demo: it helped establish the Next.js structure, implement API routes and student/teacher flows, refine UI interactions, resolve merges, add tests, and maintain the project documentation. The builders directed and reviewed the product decisions throughout. We kept a running log of the work in [CODEX_LOG.md](./CODEX_LOG.md) and [IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md).

Our approach was to figure out what GPT-5.6 is actually good at and hand it that work, instead of just prompting it for whatever came next.

It's at its best when the target is precisely specified. So we wrote `architecture.md` and `contracts.md` ourselves, and had Codex freeze the typed contracts, seed IDs, and fallback shapes before any feature work started. When the contract was locked, Codex was fast and rarely wrong. When it was vague, we lost the time savings to re-review. Writing the spec up front was the biggest speedup of the whole project, and it also let us run Codex sessions on the server logic, the AI layer, and the student UI in parallel without them stepping on each other.

It's also better than us at precision-heavy code. Exact fraction arithmetic, database migrations, schema changes: the kind of code where a small mistake shows up weeks later as a blank dashboard with no error message. Codex wrote all of it, and caught at least one of those silent failures before it shipped.

It's good at reading everything. When a tester hit a bug we were sure was caching, Codex traced the whole data path and found the actual cause, which was somewhere none of us had looked. It even found and fixed a leak that its own fix introduced. Before the demo we also pointed a GPT-5.6 Sol review at the codebase, and it flagged the seams most likely to break live; we had Codex fix them. And it wrote tests right after implementing each behavior, which is exactly the point where we would have skipped them. The suite ended at 219 tests across 35 files, and we didn't accept a session's output until types, tests, and a production build passed.

That same strength made working as a team easier. We split the project across parallel tracks, so each of us regularly had to pick up code the other had written days earlier. Instead of reading a big merge cold, we'd have Codex walk through what actually changed and how it connected to the contracts before touching anything near it. At one point a 65-file, nine-migration chunk of work landed without a log entry; Codex reconstructed what it did from the migrations and source, wrote the missing log entry after the fact, and flagged a stale function overload the commit had left behind. Catching up on your partner's work went from an afternoon of reading to a short conversation.

We also matched the model variant to the job: Luna for high-volume runtime calls like tutor hints, Terra available for heavier drafts like diagnosis explanations and teacher lessons, and Sol for the code review.

What it's not good at is judgment, so the product decisions stayed with us:

* Keep learning decisions deterministic; the model is never the grader.
* Generate practice only through supported, validated problem formats with server-derived answers.
* Make tutoring progressive and answer-safe rather than providing completed solutions.
* Give teachers immediate actions from evidence, then connect shared gaps to a practical mini-lesson.
* Keep the public walkthrough structurally separate from a teacher workspace's learner evidence.

The running app follows the same idea: GPT-5.6 does the language and planning, deterministic server code decides everything that matters. Its outputs are validated, cached when appropriate, rate-limited, and replaced by safe fallbacks if an API key, network call, or schema check is unavailable.

## How the AI is used

- **GPT-5.6:** diagnosis language, nudge/hint/guided-step tutoring, validated practice-plan parameters, and mini-lesson drafts.
- **Deterministic server code:** answer scoring, mastery updates, practice progression, group membership, and answer-format validation.
- **Safety boundary:** model outputs are schema-validated and answer-leak checked before display. Generated practice is reconstructed and scored from server-derived math data.
- **Caching:** validated teacher lessons and other eligible AI results are stored in `ai_runs`; reopening the same plan uses the cache rather than making another OpenAI call.

## Local setup

### Prerequisites

- Node.js 20 or later
- npm
- Optional: OpenAI API key for live model responses
- Optional locally, required for a durable/shared demo: a Supabase project

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The local walkthrough works with `DEMO_MODE=true` and deterministic fallbacks. It uses process memory, so restarting the server resets local learner and workspace state.

### Environment variables

| Variable | Needed for | Purpose |
| --- | --- | --- |
| `DEMO_MODE=true` | Local demo | Enables temporary learner and teacher-workspace flows. |
| `OPENAI_API_KEY` | Live AI | Enables live GPT-5.6 calls; without it, typed safe fallbacks keep the demo usable. |
| `NEXT_PUBLIC_SUPABASE_URL` | Durable/shared data | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Durable/shared data | Supabase public `anon` key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Durable/shared data | Server-only Supabase service-role key. Never expose this in browser code. |
| `ALLOW_DEMO_IN_PROD=true` | Explicit fictional hosted demo only | Second opt-in alongside `DEMO_MODE=true`; never use it for real students. |

Model overrides and cache configuration are documented in [`.env.example`](./.env.example). The committed default model is `gpt-5.6-luna`; local environment values override it only on your machine.

### Optional Supabase seed

For durable learner/workspace data, set the three Supabase variables above, apply every migration in `supabase/migrations/` (`001`–`022`) in filename order, then run:

```bash
npm run seed
```

This loads the fictional curriculum and sample teacher heatmap and clears temporary demo/runtime data.

## Sample data and access

- No passwords or pre-created accounts are required.
- The public demo and teacher workspace both create temporary, cookie-bound identities from the names you enter.
- All names and curriculum data are fictional.
- A temporary session lasts about eight hours. In the same browser profile, a new tab resumes the same learner; incognito/another browser starts a new learner.

## Tests

```bash
npm test
npx tsc --noEmit
npm run build
```

The production build, TypeScript check, and focused demo/workspace tests pass in the current workspace.

## Known limitations

- The implemented curriculum is currently fractions, even though the product pattern could extend further.
- Teacher workspaces are fictional temporary demo sessions, not production classroom accounts.
- Production sign-in/onboarding and real teacher authorization are not implemented.
- The current live-AI limiter is process-local; a production multi-instance rollout should use a shared store.

For deeper implementation detail, see [architecture.md](./architecture.md), [contracts.md](./contracts.md), and [IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md).
