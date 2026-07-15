# Rung

Skeleton for a middle-school fractions differentiated-instruction prototype. It follows [architecture.md](./architecture.md): Next.js client routes, server route handlers, deterministic domain utilities, a single AI adapter boundary, and Supabase migrations/seeding.

## Local setup

1. Use Node 20 (`nvm use` on macOS/Linux, or install the version in `.nvmrc` on Windows).
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run dev` and open [http://localhost:3000/demo](http://localhost:3000/demo).

`.env.local` is local-only and must never be committed. Keep real values out of screenshots, logs, client-side code, and pull requests.

| Variable | Required now | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | No, while fallback-only AI is enabled | Server-side OpenAI access |
| `OPENAI_MODEL` | No | Approved model identifier when live AI is enabled |
| `NEXT_PUBLIC_SUPABASE_URL` | No, while the database is not connected | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No, while the database is not connected | Server-only Supabase access; never expose it to the browser |
| `DEMO_MODE` | Yes | Set to `true` for the seeded demo experience |

## Checks

- `npm test` runs the isolated Vitest suite once.
- `npm run test:watch` runs tests during development.
- `npm run build` verifies the production build after dependencies are installed.
- Run `npm run seed` to upsert the canonical fractions class and mastery matrix after applying Supabase migrations.
- Run `npm run reset-demo` to restore the same canonical seed state before a rehearsal.

The current project is intentionally a layout and contract scaffold. The student-facing math, item-generation, AI-safety, and component modules are being built in isolation before database and dashboard integration.
