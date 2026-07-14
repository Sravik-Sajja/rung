// Reusable basic card layout for skeleton screens until feature-specific UI is built.
export function PagePlaceholder({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-slate-600">{description}</p>{children && <div className="mt-6">{children}</div>}</section>;
}
