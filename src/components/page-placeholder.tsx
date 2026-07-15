// Simple titled section used by screens not yet migrated to bespoke layouts. Token-styled so it never looks broken.
import { PageHeader } from "@/components/ui";

export function PagePlaceholder({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <PageHeader title={title} description={description} />
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}
