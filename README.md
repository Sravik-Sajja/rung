# Rung

Rung is a middle-school fractions prototype for differentiated instruction. A learner completes a five-question diagnostic, receives focused practice and answer-safe tutoring, and generates evidence a teacher can use in a mastery heatmap. Deterministic code scores answers, selects practice, and updates mastery; GPT-5.6 is limited to structured explanations, hints, and work-based coaching behind a server-side safety boundary.

## Local setup

1. Use Node 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `DEMO_MODE=true` for the local walkthrough.
5. Run `npm run dev` and open [http://localhost:3000/demo](http://localhost:3000/demo).

The default local walkthrough works without Supabase: it uses a process-local temporary learner and state resets when the local server restarts. To exercise durable temporary learners and teacher evidence, first apply Supabase migrations `001` through `008`, configure the Supabase URL and service-role key, then run `npm run seed`. Seeding restores the canonical fictional class and removes temporary participant/runtime data from prior rehearsals.

`.env.local` is local-only. Never commit or expose keys in screenshots, logs, browser code, or pull requests.

| Variable | Purpose |
| --- | --- |
| `DEMO_MODE` | Enables the non-production walkthrough. It is always disabled in production, even when set to `true`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL; needed for the durable path. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase key for the future browser auth/session path. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only seed and trusted server operations; never expose it to the browser. |
| `OPENAI_API_KEY` | Enables live GPT-5.6 calls. Without it, typed safe fallbacks keep the demo working. |
| `OPENAI_MODEL` | Default approved model route (the example uses `gpt-5.6-luna`). |
| `OPENAI_MODEL_DIAGNOSIS`, `OPENAI_MODEL_TUTOR_HINT`, `OPENAI_MODEL_WORK_ANALYSIS`, `OPENAI_MODEL_PRACTICE_PLAN`, `OPENAI_MODEL_ITEM_WRAP` | Optional server-only per-feature model overrides. |

## Commands

- `npm test` — run the Vitest suite.
- `npx tsc --noEmit` — type-check the project.
- `npm run build` — build the production bundle.
- `npm run seed` — reset/load the canonical Supabase demo tenant; requires Supabase URL and service-role credentials plus migrations `001`–`008`.
- `npm run reset-demo` — alias for `npm run seed`.

## Current walkthrough

1. On `/demo`, enter a first name or nickname. The server creates a fictional temporary learner and binds it to an opaque httpOnly cookie; the URL's learner ID is only checked for consistency.
2. Complete the diagnostic and choose a generated, validated practice plan. Durable plan ordering is explicit, so retries return the same prerequisite-first order.
3. Answers are deterministically scored. Work-based help is available only after the server records: miss → `hint` or `guided_step` → later miss. A photo is optional, is processed only in request memory, and is never stored.
4. Move to the teacher dashboard to see the temporary learner's stored mastery evidence alongside the seeded fictional class. Maya remains a secondary prepared walkthrough for recovery and rehearsal.

## Known deployment limits

- The production browser sign-in/session UI and authenticated teacher route are not yet complete. Production student handlers require a Supabase Auth access token; do not expose the current demo teacher routes as production routes.
- Migrations, seed behavior, RLS, and the durable temporary-participant flow have not yet been verified against a live Supabase project in this workspace.
- Live OpenAI/cache behavior has not been verified without an `OPENAI_API_KEY`; the tested fallback path remains available.
- Temporary participant cookies expire after eight hours, but expired durable participant rows are not yet removed by a scheduled cleanup job. Run `npm run seed` to clear walkthrough data.

## How AI and Codex are used

Codex accelerated schema, route, test, and contract work. The builders made the product decisions: deterministic scoring controls correctness; only server-owned state may unlock support; raw student work and photos are not retained; and the non-production learner identity cannot become a production auth bypass. GPT-5.6 provides structured diagnosis language, tutor hints, validated practice-plan parameters, and bounded work analysis. It never decides scores, mastery, progress, or unlocks.

See [architecture.md](./architecture.md) for the architecture decisions, [contracts.md](./contracts.md) for the shared DTOs, and [IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md) for the factual handoff history.
