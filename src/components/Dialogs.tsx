import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck, IconAlertTriangle, IconX } from "@tabler/icons-react";
import { lockScroll } from "../lib/scroll-lock";

// App-wide styled replacements for window.confirm / window.prompt / window.alert.
// Promise-based: const ok = await confirm("удалить?"); const v = await prompt("название", old);
// toast("сохранено") is the fire-and-forget one — every action that used to fail
// silently now says so.

type ConfirmState = {
  kind: "confirm";
  message: string;
  action?: string;
  resolve: (ok: boolean) => void;
};
type PromptState = {
  kind: "prompt";
  message: string;
  initial: string;
  resolve: (value: string | null) => void;
};
type DialogState = ConfirmState | PromptState;

export type ToastKind = "ok" | "error";
type Toast = { id: number; message: string; kind: ToastKind };

type DialogsApi = {
  confirm: (message: string, action?: string) => Promise<boolean>;
  prompt: (message: string, initial?: string) => Promise<string | null>;
  toast: (message: string, kind?: ToastKind) => void;
  /** Runs fn, toasting the thrown message on failure. Returns null if it threw. */
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>;
};

const Ctx = createContext<DialogsApi | null>(null);

const TOAST_MS = 3200;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback(
    (message: string, action?: string) =>
      new Promise<boolean>((resolve) => setDialog({ kind: "confirm", message, action, resolve })),
    [],
  );
  const prompt = useCallback(
    (message: string, initial = "") =>
      new Promise<string | null>((resolve) =>
        setDialog({ kind: "prompt", message, initial, resolve }),
      ),
    [],
  );

  const toast = useCallback((message: string, kind: ToastKind = "ok") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | null> => {
      try {
        const result = await fn();
        if (ok) toast(ok);
        return result;
      } catch (e) {
        toast(e instanceof Error ? e.message : "что-то пошло не так", "error");
        return null;
      }
    },
    [toast],
  );

  const close = (result: boolean | string | null) => {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(Boolean(result));
    else dialog.resolve(typeof result === "string" ? result : null);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ confirm, prompt, toast, run }}>
      {children}
      {dialog && <DialogCard dialog={dialog} onClose={close} />}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </Ctx.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-kind={t.kind}
          className="pointer-events-auto flex max-w-sm animate-fade-up items-start gap-2 rounded-card border border-border bg-surface px-3 py-2.5 text-sm shadow-xl data-[kind=error]:border-accent/40"
        >
          <span className={t.kind === "error" ? "mt-0.5 text-accent" : "mt-0.5 text-muted"}>
            {t.kind === "error" ? <IconAlertTriangle size={16} /> : <IconCheck size={16} />}
          </span>
          <span className="min-w-0 break-words">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            aria-label="закрыть"
            className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-text"
          >
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function DialogCard({
  dialog,
  onClose,
}: {
  dialog: DialogState;
  onClose: (r: boolean | string | null) => void;
}) {
  const [value, setValue] = useState(dialog.kind === "prompt" ? dialog.initial : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // the page used to keep scrolling behind the card, which on a phone reads
    // as the dialog being stuck to a moving background
    const unlock = lockScroll();
    // focus goes into the dialog and comes back to where it was on close
    const returnTo = document.activeElement as HTMLElement | null;
    (inputRef.current ?? cardRef.current?.querySelector<HTMLElement>("button"))?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose(null);
      if (e.key !== "Tab" || !cardRef.current) return;
      // focus trap: Tab cycles inside the card instead of escaping behind it
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        "button, input, [href], select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
      returnTo?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => onClose(dialog.kind === "prompt" ? value : true);

  return (
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(null);
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialog.message}
        className="w-full max-w-sm animate-scale-in rounded-card border border-border bg-bg p-5 shadow-xl"
      >
        <p className="text-sm">{dialog.message}</p>
        {dialog.kind === "prompt" && (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="mt-3 w-full rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => onClose(null)}
            className="rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            отмена
          </button>
          <button
            onClick={submit}
            className="rounded-card bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {dialog.kind === "confirm" ? (dialog.action ?? "ок") : "сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDialogs(): DialogsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialogs must be used within DialogProvider");
  return ctx;
}
