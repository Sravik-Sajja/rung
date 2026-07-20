// One-off: apply migration 022 (embed_url column) and refresh the five
// video_recommendations rows with the reviewed Khan videos, without running
// the full destructive seed. Deleted after use.
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL is not set");

const videos = [
  { subskillId: "equivalent-fractions", title: "Equivalent fractions with visual models", url: "https://www.khanacademy.org/math/arithmetic-home/arith-review-fractions/visualizing-equiv-frac/v/equivalent-fractions", youtubeId: "U2ovEuEUxXQ", note: "Reviewed: it builds equivalent fractions with visual models and shows why scaling the numerator and denominator together preserves value; fits the equivalent-fractions group." },
  { subskillId: "fraction-number-line", title: "Fractions on a number line", url: "https://www.khanacademy.org/math/cc-third-grade-math/imp-fractions/imp-fractions-on-the-number-line/v/fractions-on-a-number-line", youtubeId: "Z0WsfO-RI8Y", note: "Reviewed: it partitions a number line into equal parts and places a fraction by counting those parts; fits the number-line group." },
  { subskillId: "find-common-denominator", title: "Adding fractions with unlike denominators", url: "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/adding-small-fractions-with-unlike-denominators", youtubeId: "bcCLKACsYJ0", note: "Reviewed: it explicitly teaches finding a common denominator, rewriting equivalent fractions, then adding; it fits the common-denominator and add-unlike groups." },
  { subskillId: "add-unlike-denominators", title: "Adding fractions with unlike denominators", url: "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/adding-small-fractions-with-unlike-denominators", youtubeId: "bcCLKACsYJ0", note: "Reviewed: it explicitly teaches finding a common denominator, rewriting equivalent fractions, then adding; it fits the common-denominator and add-unlike groups." },
  { subskillId: "subtract-unlike-denominators", title: "Subtracting fractions with unlike denominators", url: "https://www.khanacademy.org/math/cc-fifth-grade-math/imp-fractions-3/imp-adding-and-subtracting-fractions-with-unlike-denominators/v/subtracting-small-fractions-with-unlike-denominators", youtubeId: "2DPivVFCdqA", note: "Reviewed: it finds a common denominator, rewrites each fraction, then subtracts; the direct parallel to the adding video, fits the subtract group." },
];

async function run() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("alter table video_recommendations add column if not exists embed_url text");
    for (const v of videos) {
      await client.query(
        `insert into video_recommendations (id, subskill_id, title, provider, url, embed_url, verification_note, is_active)
         values ($1, $2, $3, 'Khan Academy', $4, $5, $6, true)
         on conflict (id) do update set
           subskill_id = excluded.subskill_id, title = excluded.title, provider = excluded.provider,
           url = excluded.url, embed_url = excluded.embed_url, verification_note = excluded.verification_note, is_active = true`,
        [`${v.subskillId}-video`, v.subskillId, v.title, v.url, `https://www.youtube-nocookie.com/embed/${v.youtubeId}`, v.note],
      );
    }
    const { rows } = await client.query("select subskill_id, provider, embed_url is not null as has_embed from video_recommendations order by subskill_id");
    console.table(rows);
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
