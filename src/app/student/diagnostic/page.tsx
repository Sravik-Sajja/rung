// Student diagnostic route; will present and submit one assessment item at a time.
import { AppShell } from "@/components/app-shell";
import { PagePlaceholder } from "@/components/page-placeholder";
import { DiagnosticFlow } from "@/components/student/diagnostic-flow";

export default function DiagnosticPage() { return <AppShell><PagePlaceholder title="Fractions check-in" description="Answer the diagnostic item. Your response is scored on the server before the next step is chosen."><DiagnosticFlow /></PagePlaceholder></AppShell>; }
