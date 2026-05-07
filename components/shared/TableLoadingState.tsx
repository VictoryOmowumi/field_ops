import React from "react";

type TableLoadingStateProps = {
  colSpan: number;
  title?: string;
  description?: string;
};

const TableLoadingState = ({
  colSpan,
  title = "Loading...",
  description,
}: TableLoadingStateProps) => {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-12" colSpan={colSpan}>
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-center text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
          <p>{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </td>
    </tr>
  );
};

export default TableLoadingState;
