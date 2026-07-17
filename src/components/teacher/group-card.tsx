"use client";

// Suggested group card with the two teacher actions needed from the dashboard:
// open the ready-to-teach lesson or assign a compact follow-up set.
import Link from "next/link";
import { Badge, Card, buttonClasses } from "@/components/ui";
import type { Subskill, TeacherGroup } from "@/lib/types";

export function GroupCard({
  group,
  subskill,
  followUpAssigned,
  onAssignFollowUp,
}: {
  group: TeacherGroup;
  subskill: Subskill | undefined;
  followUpAssigned?: boolean;
  onAssignFollowUp?: () => void;
}) {
  return (
    <Card className="!bg-elevated flex h-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-snug text-ink">{group.label}</p>
        <Badge tone="support">{group.studentIds.length} students</Badge>
      </div>
      <p className="text-sm text-ink-muted">
        Shared gap: <span className="font-medium text-ink">{subskill?.name ?? group.subskillId}</span>
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link className={buttonClasses("focus", "sm")} href={`/teacher/groups/${group.id}`}>
          Start mini-lesson
        </Link>
        {onAssignFollowUp ? (
          <button className={buttonClasses("secondary", "sm")} onClick={onAssignFollowUp} type="button">
            {followUpAssigned ? "Follow-up assigned" : "Assign 3 questions"}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
