import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The whole point of resolveLearnerSessions: a browser can hold BOTH a
// walkthrough participant cookie and a joined-class-student cookie for the
// SAME learner. Reading only one of the two single-cookie resolvers/revokers
// below is exactly the mistake that caused six bugs before this module
// existed. This test makes a new single-cookie call site fail CI instead of
// shipping quietly.
const BANNED_NAMES = [
  "resolveDemoParticipantSessionOnly",
  "resolveTeacherWorkspaceStudentSessionOnly",
  "revokeDemoParticipantSession",
  "revokeTeacherWorkspaceStudentSession",
] as const;

// Forward-slash, repo-relative. These are the only places a single cookie may
// legitimately be read: the two modules that define the resolvers, the one
// reconciliation point that calls both of them, and one route whose actual
// contract is "report the joined side only" (see that file's GET doc comment).
const ALLOWLIST = new Set([
  "src/lib/demo/participant.ts",
  "src/lib/teacher-workspace/student-session.ts",
  "src/lib/auth/learner-session.ts",
  "src/app/api/teacher-workspace/student-session/route.ts",
]);

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC_ROOT = path.resolve(REPO_ROOT, "src");

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/** Names imported via `import { a, b as c } from "..."` clauses in `source`. */
function importedNames(source: string): string[] {
  const names: string[] = [];
  const importClause = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
  let match: RegExpExecArray | null;
  while ((match = importClause.exec(source))) {
    for (const raw of match[1].split(",")) {
      const specifier = raw.trim();
      if (!specifier) continue;
      // "name" or "name as alias" or "type name" — the imported identifier is
      // always the first token.
      const first = specifier.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      names.push(first);
    }
  }
  return names;
}

describe("single-cookie boundary", () => {
  it("only the allowlisted files read a single learner cookie", () => {
    const offenders: string[] = [];
    for (const absolutePath of listSourceFiles(SRC_ROOT)) {
      const relativePath = path.relative(REPO_ROOT, absolutePath).split(path.sep).join("/");
      if (relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) continue;
      if (ALLOWLIST.has(relativePath)) continue;

      const source = fs.readFileSync(absolutePath, "utf8");
      const imported = new Set(importedNames(source));
      const violations = BANNED_NAMES.filter((name) => imported.has(name));
      if (violations.length > 0) {
        offenders.push(
          `${relativePath} imports ${violations.join(", ")}. A browser can hold BOTH a walkthrough ` +
          `participant cookie and a joined-class-student cookie for the same learner — reading or ` +
          `revoking only one of them is exactly the bug this module exists to prevent (it has ` +
          `happened six times). Use resolveLearnerSessions/revokeAllLearnerSessions from ` +
          `@/lib/auth/learner-session instead.`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
