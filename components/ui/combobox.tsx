"use client";

import * as React from "react";

type ComboboxContextType = {
  items: string[];
  multiple?: boolean;
  value: string[];
  onValueChange: (value: string[]) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
};

const ComboboxContext = React.createContext<ComboboxContextType | null>(null);

function useCombobox() {
  const context = React.useContext(ComboboxContext);
  if (!context) throw new Error("Combobox components must be used inside Combobox.");
  return context;
}

export function useComboboxAnchor<T extends HTMLElement = HTMLElement>() {
  return React.useRef<T | null>(null);
}

export function Combobox({
  items,
  multiple,
  value,
  onValueChange,
  defaultValue,
  children,
}: {
  items: string[];
  multiple?: boolean;
  value?: string[];
  onValueChange?: (value: string[]) => void;
  defaultValue?: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [internalValue, setInternalValue] = React.useState<string[]>(defaultValue ?? []);
  const selectedValue = value ?? internalValue;

  const handleValueChange = React.useCallback(
    (next: string[]) => {
      onValueChange?.(next);
      if (value === undefined) setInternalValue(next);
    },
    [onValueChange, value]
  );

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <ComboboxContext.Provider
      value={{
        items,
        multiple,
        value: selectedValue,
        onValueChange: handleValueChange,
        open,
        setOpen,
        search,
        setSearch,
      }}
    >
      <div ref={rootRef} className="relative">{children}</div>
    </ComboboxContext.Provider>
  );
}

export const ComboboxChips = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; className?: string }
>(function ComboboxChips({ children, className = "" }, ref) {
  const { setOpen } = useCombobox();
  return (
    <div
      ref={ref}
      onClick={() => setOpen(true)}
      className={`flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-input bg-input/20 px-3 py-2 ${className}`}
    >
      {children}
    </div>
  );
});

export function ComboboxValue({
  children,
}: {
  children: React.ReactNode | ((values: string[]) => React.ReactNode);
}) {
  const { value } = useCombobox();
  if (typeof children === "function") {
    return <>{children(value)}</>;
  }
  return <>{children}</>;
}

export function ComboboxChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
      {children}
    </span>
  );
}

export function ComboboxChipsInput({ placeholder }: { placeholder?: string }) {
  const { search, setSearch, setOpen } = useCombobox();
  return (
    <input
      value={search}
      onFocus={() => setOpen(true)}
      onChange={(event) => setSearch(event.target.value)}
      placeholder={placeholder}
      className="h-7 min-w-[10rem] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
    />
  );
}

export function ComboboxInput({ placeholder }: { placeholder?: string }) {
  const { search, setSearch, setOpen } = useCombobox();
  return (
    <input
      value={search}
      onFocus={() => setOpen(true)}
      onChange={(event) => setSearch(event.target.value)}
      placeholder={placeholder}
      className="h-11 w-full rounded-md border border-input bg-input/20 px-3 text-sm outline-none placeholder:text-muted-foreground"
    />
  );
}

export function ComboboxContent({
  children,
}: {
  children: React.ReactNode;
  anchor?: React.RefObject<HTMLElement | null>;
}) {
  const { open } = useCombobox();
  if (!open) return null;
  return (
    <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-border bg-popover p-1 shadow-md">
      {children}
    </div>
  );
}

export function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-2 text-sm text-muted-foreground">{children}</div>;
}

export function ComboboxList({
  children,
}: {
  children: (item: string) => React.ReactNode;
}) {
  const { items, search } = useCombobox();
  const filteredItems = items.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase())
  );
  return <div className="space-y-2 m-2">{filteredItems.map((item) => children(item))}</div>;
}

export function ComboboxItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { value: selected, onValueChange, multiple, setOpen } = useCombobox();
  const isSelected = selected.includes(value);

  function onSelect() {
    if (multiple) {
      onValueChange(
        isSelected ? selected.filter((item) => item !== value) : [...selected, value]
      );
      return;
    }
    onValueChange([value]);
    setOpen(false);
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-sm hover:bg-muted ${
        isSelected ? "bg-muted/20" : ""
      }`}
    >
      <span>{children}</span>
      {isSelected ? <span className="text-xs text-primary">Selected</span> : null}
    </button>
  );
}
