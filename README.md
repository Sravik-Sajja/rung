# Rung

Skeleton for a middle-school fractions differentiated-instruction prototype. It follows [architecture.md](./architecture.md): Next.js client routes, server route handlers, deterministic domain utilities, a single AI adapter boundary, and Supabase migrations/seeding.

## Run locally

1. Use Node 20 (`nvm use`) and run `npm install`.
2. Copy `.env.example` to `.env.local` and fill in values when integrating Supabase/OpenAI.
3. Run `npm run seed` once seed persistence is implemented.
4. Run `npm run dev` and open `/demo`.

The current project is intentionally a layout and contract scaffold; it uses static demo data and has no live AI or database calls yet.
