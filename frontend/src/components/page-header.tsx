import type React from "react";

/**
 * Consistent page heading: the page title is the document's <h1> (the sidebar
 * brand used to claim it), with an optional description and right-aligned
 * actions that wrap below the title on narrow screens.
 */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}
