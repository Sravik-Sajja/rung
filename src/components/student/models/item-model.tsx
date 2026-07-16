"use client";

// Per-subskill interactive model, inserted between the question and answer zones.
// Leakage-safe: the student chooses their own subdivisions/marks, nothing is
// pre-filled toward the correct answer. Subskills with no mapped model render
// nothing at all (return null) so the card looks exactly like it does today.
import { NumberLineModel } from "./number-line-model";
import { FractionBarModel } from "./fraction-bar-model";

export function ItemModel({
  subskillId,
  disabled,
  onUseAnswer,
}: {
  subskillId: string;
  disabled?: boolean;
  onUseAnswer: (answer: string) => void;
}) {
  let model: React.ReactNode;
  switch (subskillId) {
    case "fraction-number-line":
      model = <NumberLineModel disabled={disabled} onUseAnswer={onUseAnswer} />;
      break;
    case "equivalent-fractions":
      model = <FractionBarModel bars={2} disabled={disabled} onUseAnswer={onUseAnswer} />;
      break;
    case "add-unlike-denominators":
      model = <FractionBarModel bars={2} operation="add" disabled={disabled} onUseAnswer={onUseAnswer} />;
      break;
    case "subtract-unlike-denominators":
      model = <FractionBarModel bars={2} operation="subtract" disabled={disabled} onUseAnswer={onUseAnswer} />;
      break;
    default:
      model = null;
  }

  if (model === null) return null;

  return (
    <div className="border-t border-border p-6 sm:p-8">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-faint">Work it out</p>
      {model}
    </div>
  );
}
