// One-off: top up the `items` bank so every sub-skill has at least three active practice
// questions. The original seed only inserted the diagnostic items plus the ones referenced by
// seeded group plans, which left every sub-skill one or two short — so the teacher heatmap's
// "Assign 3Q" action failed with "not enough bank items" for every skill. Additive only: this
// inserts missing rows and never deletes or rewrites existing ones. Safe to re-run. Delete
// after use.
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set");

type SeedItem = {
  id: string;
  subskillId: string;
  prompt: string;
  accepted: string[];
  solutionSteps: string[];
  difficulty: number;
  distractorMap: Record<string, string>;
  visualSpec?: Record<string, unknown>;
};

const items: SeedItem[] = [
  { id: "equivalent-2", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 2/3 with denominator 9.", accepted: ["6/9"], solutionSteps: ["Multiply the numerator and denominator by the same number."], difficulty: 1, distractorMap: { "2/9": "changes_denominator_only" } },
  { id: "equivalent-3", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 1/4 with denominator 12.", accepted: ["3/12"], solutionSteps: ["Multiply the numerator and denominator by the same number."], difficulty: 1, distractorMap: { "1/12": "changes_denominator_only" } },
  { id: "equivalent-4", subskillId: "equivalent-fractions", prompt: "Write a fraction equivalent to 3/5 with denominator 10.", accepted: ["6/10"], solutionSteps: ["Multiply the numerator and denominator by the same number."], difficulty: 2, distractorMap: { "3/10": "changes_denominator_only" } },
  { id: "number-line-2", subskillId: "fraction-number-line", prompt: "What fraction names point A on the number line?", accepted: ["2/5"], solutionSteps: ["Split the line into five equal parts and count two parts from zero."], difficulty: 1, distractorMap: { "5/2": "reverses_numerator_and_denominator" }, visualSpec: { kind: "number_line", denominator: 5, markedNumerator: 2, pointLabel: "A" } },
  { id: "number-line-3", subskillId: "fraction-number-line", prompt: "What fraction names point D on the number line?", accepted: ["5/8"], solutionSteps: ["Split the line into eight equal parts and count five parts from zero."], difficulty: 2, distractorMap: { "8/5": "reverses_numerator_and_denominator" }, visualSpec: { kind: "number_line", denominator: 8, markedNumerator: 5, pointLabel: "D" } },
  { id: "number-line-4", subskillId: "fraction-number-line", prompt: "What fraction names point E on the number line?", accepted: ["5/6"], solutionSteps: ["Split the line into six equal parts and count five parts from zero."], difficulty: 2, distractorMap: { "6/5": "reverses_numerator_and_denominator" }, visualSpec: { kind: "number_line", denominator: 6, markedNumerator: 5, pointLabel: "E" } },
  { id: "common-denominator-3", subskillId: "find-common-denominator", prompt: "What common denominator can you use for 1/2 and 1/5?", accepted: ["10"], solutionSteps: ["Use a number both 2 and 5 divide into evenly."], difficulty: 1, distractorMap: { "7": "adds_denominators" } },
  { id: "common-denominator-4", subskillId: "find-common-denominator", prompt: "What common denominator can you use for 3/4 and 1/6?", accepted: ["12"], solutionSteps: ["Use a number both 4 and 6 divide into evenly."], difficulty: 2, distractorMap: { "10": "adds_denominators" } },
  { id: "add-unlike-3", subskillId: "add-unlike-denominators", prompt: "What is 1/2 + 1/5?", accepted: ["7/10"], solutionSteps: ["Find a common denominator of 10.", "Rewrite the fractions as tenths, then add."], difficulty: 1, distractorMap: { "2/7": "adds_numerators_and_denominators" } },
  { id: "add-unlike-4", subskillId: "add-unlike-denominators", prompt: "What is 3/4 + 1/6?", accepted: ["11/12"], solutionSteps: ["Find a common denominator of 12.", "Rewrite the fractions as twelfths, then add."], difficulty: 2, distractorMap: { "4/10": "adds_numerators_and_denominators" } },
  { id: "subtract-unlike-2", subskillId: "subtract-unlike-denominators", prompt: "What is 5/6 - 1/4?", accepted: ["7/12"], solutionSteps: ["Rewrite both fractions in twelfths before subtracting."], difficulty: 1, distractorMap: { "4/2": "subtracts_numerators_and_denominators" } },
  { id: "subtract-unlike-3", subskillId: "subtract-unlike-denominators", prompt: "What is 4/5 - 1/3?", accepted: ["7/15"], solutionSteps: ["Rewrite both fractions in fifteenths before subtracting."], difficulty: 2, distractorMap: { "3/2": "subtracts_numerators_and_denominators" } },
  { id: "subtract-unlike-4", subskillId: "subtract-unlike-denominators", prompt: "What is 7/8 - 1/3?", accepted: ["13/24"], solutionSteps: ["Rewrite both fractions in twenty-fourths before subtracting."], difficulty: 2, distractorMap: { "6/5": "subtracts_numerators_and_denominators" } },
];

async function run() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const item of items) {
      await client.query(
        `insert into items (id, subskill_id, item_type, prompt, answer_spec, visual_spec, solution_steps, difficulty, is_active, distractor_map)
         values ($1, $2, 'practice', $3, $4, $5, $6, $7, true, $8)
         on conflict (id) do nothing`,
        [
          item.id,
          item.subskillId,
          item.prompt,
          JSON.stringify({ accepted: item.accepted }),
          item.visualSpec ? JSON.stringify(item.visualSpec) : null,
          // solution_steps is jsonb, not a Postgres text[] — pass encoded JSON, not a JS array.
          JSON.stringify(item.solutionSteps),
          item.difficulty,
          JSON.stringify(item.distractorMap),
        ],
      );
    }
    const { rows } = await client.query(
      `select subskill_id, count(*)::int as active_items
       from items where is_active = true and item_type = 'practice'
       group by subskill_id order by subskill_id`,
    );
    console.table(rows);
    const short = rows.filter((row: { active_items: number }) => row.active_items < 3);
    console.log(short.length === 0
      ? "OK: every sub-skill now has at least 3 active practice items."
      : `STILL SHORT: ${short.map((row: { subskill_id: string }) => row.subskill_id).join(", ")}`);
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
