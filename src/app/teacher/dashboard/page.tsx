// Teacher dashboard route; will visualize stored class mastery and suggested groups.
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { demoStudents } from "@/lib/demo-data";

export default function DashboardPage() { return <AppShell><PagePlaceholder title="Ms. Rivera’s fractions class" description="Mastery heatmap placeholder. Labels, not color alone, communicate each status."><div className="mt-4 grid grid-cols-2 gap-2">{demoStudents.map((student) => <div className="rounded border p-3" key={student.id}>{student.displayName}<span className="float-right text-sm text-amber-700">needs support</span></div>)}</div><Link href="/teacher/groups/common-denominators" className="mt-6 inline-block text-indigo-700 underline">View common-denominator group</Link></PagePlaceholder></AppShell>; }
