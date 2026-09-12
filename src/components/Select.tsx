import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";
import { useDropUp } from "../hooks/useDropUp";

// Styled replacement for the native <select> — our borders, radius, hover — with
// the keyboard behaviour and roles the native element would have given us free.
export default function Select({
  value,
  options,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { anchorRef, placement } = useDropUp<HTMLDivElement>(open, 40 * options.length + 16);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // keep the highlighted option in view when arrowing through a long list
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const current = options.find((o) => o.value === value);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      return setOpen(true);
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[cursor]) pick(options[cursor].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div ref={anchorRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={onKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover active:scale-[0.98]"
        >
          <span className={current ? "" : "text-muted"}>{current?.label ?? placeholder ?? "—"}</span>
          <IconChevronDown
            size={14}
            className={"text-muted transition-transform " + (open ? "rotate-180" : "")}
          />
        </button>
      </div>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={label}
          className={`absolute left-0 z-30 max-h-64 min-w-full animate-dropdown-in overflow-y-auto rounded-card border border-border bg-bg shadow-xl ${placement}`}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-i={i}
              data-cursor={i === cursor}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o.value)}
              onKeyDown={onKeyDown}
              className="flex w-full items-center justify-between gap-3 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover data-[cursor=true]:bg-surface-hover"
            >
              {o.label}
              {o.value === value && <IconCheck size={14} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
