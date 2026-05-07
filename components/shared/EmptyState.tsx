import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export default function EmptyState({
  title,
  description,
  icon,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`mx-auto flex max-w-sm flex-col items-center gap-4 text-center ${className}`}>
      {icon ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-primary">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

