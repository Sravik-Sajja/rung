// Interactive card linking a suggested small group to its detail/plan route.
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import type { Subskill, TeacherGroup } from "@/lib/types";

export function GroupCard({ group, subskill }: { group: TeacherGroup; subskill: Subskill | undefined }) {
  return (
    <Link className="block rounded-xl" href={`/teacher/groups/${group.id}`}>
      <Card className="!bg-elevated flex h-full flex-col gap-3 p-5" interactive>
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold leading-snug text-ink">{group.label}</p>
          <Badge tone="support">{group.studentIds.length} students</Badge>
        </div>
        <p className="text-sm text-ink-muted">
          Shared gap: <span className="font-medium text-ink">{subskill?.name ?? group.subskillId}</span>
        </p>
        <p className="mt-auto font-mono text-xs uppercase tracking-wider text-accent">View group plan &rarr;</p>
      </Card>
    </Link>
  );
}
