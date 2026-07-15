// Matched practice set card: the items assigned alongside the mini-lesson.
import { Card, Eyebrow } from "@/components/ui";
import type { Item } from "@/lib/types";

export function PracticeSetCard({ items }: { items: Item[] }) {
  return (
    <Card className="!bg-elevated flex h-full flex-col p-6">
      <Eyebrow>Matched practice</Eyebrow>
      <h2 className="mt-1 text-lg font-semibold text-ink">Practice set</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {items.map((item, index) => (
          <li className="flex gap-2 rounded-md bg-surface-2 p-3" key={item.id}>
            <span className="font-mono text-xs tabular-nums text-ink-faint">{index + 1}.</span>
            <span className="text-ink">{item.prompt}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
