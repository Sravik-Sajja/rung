# Rung Design System

Production UI contract. Every screen is built from these tokens and primitives — no ad-hoc colors, no hardcoded hex, no gradients.

## Identity

Rung is a differentiated-instruction math platform. The visual language is **calm, precise, and a little editorial** — a trustworthy instrument, not a toy. Two motifs: the **ladder/rung** (ordered progress) and a **blueprint** feel (mono labels, hairline rules, exact data).

## Hard rules (avoid AI tells)

- **No gradients.** Flat, considered fills only.
- No indigo/violet, no default Tailwind `slate/indigo/emerald` utility colors. Use tokens.
- No `rounded-lg` on everything — use the radius scale deliberately (`rounded-md` for controls, `rounded-xl` for cards, sharp for data grids).
- No emoji as section markers. No everything-centered layouts. No purple-to-blue anything.
- Color is never the only signal — mastery states always carry a text label too.
- Style through **tokens** (`bg-surface`, `text-ink`, `text-accent`, `border-border`). Never write raw hex or `dark:` variants — the CSS variables flip themes automatically.

## Color tokens

Defined as CSS variables in `globals.css` (light + dark), exposed to Tailwind as named colors.

| Token | Tailwind class | Role |
| --- | --- | --- |
| `--bg` | `bg-bg` | Page ground (warm green-biased off-white / near-black) |
| `--surface` | `bg-surface` | Cards, panels |
| `--surface-2` | `bg-surface-2` | Muted fills, table headers |
| `--border` | `border-border` | Hairline rules |
| `--border-strong` | `border-border-strong` | Emphasis borders |
| `--ink` | `text-ink` | Primary text |
| `--ink-muted` | `text-ink-muted` | Secondary text |
| `--ink-faint` | `text-ink-faint` | Captions, disabled |
| `--accent` | `text-accent` / `bg-accent` | Evergreen — primary action, links, focus |
| `--accent-hover` | `bg-accent-hover` | Hover state of accent fills |
| `--accent-contrast` | `text-accent-contrast` | Text on accent fills |
| `--accent-soft` | `bg-accent-soft` | Tinted accent backgrounds |

### Mastery scale (semantic — separate from accent)

`bg-mastery-{none,support,developing,mastered}` + matching `text-mastery-*-fg`. Grey → clay → amber → green. Always paired with a text label.

## Typography

- **Sans** (`font-sans`, Hanken Grotesk): UI + display. Headings tight (`tracking-tight`), heavy (600–800).
- **Mono** (`font-mono`, IBM Plex Mono): eyebrow labels (uppercase, `tracking-wider`, `text-xs`), data, tabular numbers (`tabular-nums`).
- Scale: display `text-4xl/5xl`, h2 `text-2xl`, h3 `text-lg`, body `text-base`, caption `text-sm`. Body line length ≤ ~68ch.

## Primitives (`src/components/ui/`)

- `Button` — variants: `primary` (accent fill), `secondary` (surface + border), `ghost`. Sizes `sm|md`. Visible focus ring.
- `Card` — surface, border, `rounded-xl`, subtle shadow. Optional `interactive` (hover border/lift).
- `Badge` — small mono/label pill; `tone` prop maps to mastery or neutral.
- `Eyebrow` — uppercase mono kicker.
- `PageHeader` — eyebrow + title + description block.
- `AppShell` — max-width frame, top nav (Rung wordmark + student/teacher switch), prototype notice, theme-aware.

## Layout

- Content max-width ~ `max-w-5xl`; reading columns narrower. Section rhythm via `space-y`/`gap`, not per-element margins.
- Wide content (heatmap) scrolls inside its own `overflow-x-auto` container; page body never scrolls sideways.
- Focus-visible ring on every interactive element. Respect `prefers-reduced-motion`.

## Routes to redesign

Student: `/demo`, `/student/diagnostic`, `/student/diagnosis`, `/student/practice/[sessionId]`, `/student/mastery`.
Teacher: `/teacher/dashboard`, `/teacher/groups/[groupId]`.
Root: `/` landing.

Every screen: real hierarchy, empty/loading/error states considered, accessible labels, and the prototype notice preserved.
