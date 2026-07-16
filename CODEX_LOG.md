# Codex work log

This is a concise record of Codex-assisted implementation decisions and verification. It complements the factual feature handoff in [IMPLEMENTATION_LOG.md](./IMPLEMENTATION_LOG.md); [architecture.md](./architecture.md) remains the source of truth for product and system decisions.

## 2026-07-16 - durable walkthrough review and implementation

### Review focus

- A GPT-5.6 Sol review identified the seams most likely to break a demo: nondeterministic generated-plan ordering, missing durable support state, temporary learner data falling into local state, and a mismatch between written contracts and browser/API DTOs.
- The implementation kept the visual work isolated where possible. Data/identity propagation was added without replacing the independently evolving student UI composition.

### Decisions implemented

- A visitor starts with a short first name or nickname, not Maya. The server creates a fictional temporary learner and binds it to an opaque httpOnly cookie; the visible ID is only a consistency check. Maya remains the prepared fallback walkthrough.
- Correctness, mastery, practice progression, and eligibility remain deterministic server decisions. GPT-5.6 can explain, hint, propose bounded practice parameters, and coach from work; it cannot score or unlock anything.
- Work help is earned by the server-recorded sequence `miss -> hint/guided_step -> later miss`. Work/photo input remains request-memory only, and a failed AI call releases the one-time claim.
- Durable generated plans carry explicit order and validation provenance. UI order never depends on coincident timestamps.

### Verification performed

- Type check passed: `npx tsc --noEmit`.
- Full test suite passed: 23 files / 135 tests.
- Production build passed: `npm run build`.
- Diff whitespace check passed after documentation edits; it must remain part of the pre-commit check.
- Read-only browser smoke confirmed the temporary learner entry field, disabled-start state, and Maya fallback link.

### Remaining external checks

- Apply migrations `001`–`008` to a real Supabase project, seed it, and rehearse RLS with student and teacher identities.
- Build the production browser sign-in/session and teacher authorization flow.
- Exercise live OpenAI, verified cache, and outage fallback with real server-side credentials.
- Decide and implement scheduled cleanup for expired temporary demo participants before treating the mechanism as anything beyond a fictional non-production walkthrough.
