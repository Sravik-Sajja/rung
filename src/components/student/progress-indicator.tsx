export function ProgressIndicator({ completed, total, label = "Practice progress" }: { completed: number; total: number; label?: string }) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.min(100, Math.max(0, Math.round(completed / safeTotal * 100)));
  return <div aria-label={label} className="space-y-1">
    <div className="flex justify-between text-sm text-slate-600"><span>{label}</span><span>{Math.min(completed, total)} of {total}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={safeTotal} aria-valuenow={Math.min(completed, safeTotal)}>
      <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
    </div>
  </div>;
}
