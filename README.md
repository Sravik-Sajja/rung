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

Codex accelerated the project from scaffold through polished demo: it helped establish the Next.js structure, implement API routes and student/teacher flows, refine UI interactions, resolve merges, add tests, and maintain the project documentation. The builders directed and reviewed the product decisions throughout.

Key decisions made by the builders:

- Keep learning decisions deterministic; the model is never the grader.
- Generate practice only through supported, validated problem formats with server-derived answers.
- Make tutoring progressive and answer-safe rather than providing completed solutions.
- Give teachers immediate actions from evidence, then connect shared gaps to a practical mini-lesson.
- Keep the public walkthrough structurally separate from a teacher workspace's learner evidence.

GPT-5.6 contributes structured language and planning around those constraints. Its outputs are validated, cached when appropriate, rate-limited, and replaced by safe fallbacks if an API key, network call, or schema check is unavailable.

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
