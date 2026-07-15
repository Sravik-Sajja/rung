// Deterministic teacher dashboard projection: turns stored mastery evidence into heatmap cells and stable support groups.
import type { MasteryRecord, TeacherDashboard, TeacherGroup } from "@/lib/types";
import { DEMO_CLASS_ID, demoGroupPlans, demoMastery, demoStudents, demoSubskills } from "@/lib/demo-data";

const MINIMUM_GROUP_SIZE = 2;

export function groupStudentsByNeed(mastery: MasteryRecord[], minimumSize = MINIMUM_GROUP_SIZE): TeacherGroup[] {
  const studentsBySubskill = new Map<string, string[]>();

  for (const record of mastery) {
    if (record.level !== "needs_support") continue;
    studentsBySubskill.set(record.subskillId, [...(studentsBySubskill.get(record.subskillId) ?? []), record.studentId]);
  }

  return demoSubskills.flatMap((subskill) => {
    const studentIds = studentsBySubskill.get(subskill.id) ?? [];
    return studentIds.length >= minimumSize ? [{ id: subskill.id, subskillId: subskill.id, label: `${subskill.name} support group`, studentIds }] : [];
  });
}

export function getDemoTeacherDashboard(classId = DEMO_CLASS_ID): TeacherDashboard | null {
  if (classId !== DEMO_CLASS_ID) return null;
  return { classId, students: demoStudents, subskills: demoSubskills, cells: demoMastery, groups: groupStudentsByNeed(demoMastery) };
}

export function getDemoTeacherGroup(groupId: string) {
  return getDemoTeacherDashboard()?.groups.find((group) => group.id === groupId) ?? null;
}

export function getDemoTeacherGroupPlan(groupId: string) {
  return demoGroupPlans[groupId] ?? null;
}
