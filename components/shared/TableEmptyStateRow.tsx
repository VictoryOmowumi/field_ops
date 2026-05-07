import type { ReactNode } from "react";

import EmptyState from "@/components/shared/EmptyState";

type TableEmptyStateRowProps = {
  colSpan: number;
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
};

export default function TableEmptyStateRow({
  colSpan,
  title,
  description,
  icon,
  className = "",
}: TableEmptyStateRowProps) {
  return (
    <tr className={`border-t border-border ${className}`}>
      <td className="px-4 py-12" colSpan={colSpan}>
        <EmptyState title={title} description={description} icon={icon} />
      </td>
    </tr>
  );
}

