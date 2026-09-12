import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useTitle(mode === "signup" ? "регистрация" : "вход");
  // sent here from a like button or a private page? go back to it, not /library
  const from = (location.state as { from?: string } | null)?.from;
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signup") await signup(username, email, password);
      else await login(username, password);
      navigate(from && !from.startsWith("/login") ? from : "/library", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-5 pt-8">
      <h1 className="font-display text-2xl">
        {mode === "signup" ? "регистрация" : "вход"}
      </h1>
      {/* key on the message so a repeated failure replays the shake */}
      <form
        onSubmit={submit}
        key={error ?? "ok"}
        className={"flex flex-col gap-3 " + (error ? "animate-shake" : "")}
      >
        <Field
          label={mode === "signup" ? "юзернейм" : "юзернейм или email"}
          value={username}
          onChange={setUsername}
          autoComplete="username"
        />
        {mode === "signup" && (
          <Field
            label="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />
        )}
        <Field
          label="пароль"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {error && <p className="animate-fade-in font-mono text-sm text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-card bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "…" : mode === "signup" ? "создать аккаунт" : "войти"}
        </button>
      </form>
      <p className="text-sm text-muted">
        {mode === "signup" ? (
          <>
            уже есть аккаунт?{" "}
            <Link to="/login" state={{ from }} className="text-accent hover:underline">
              войти
            </Link>
          </>
        ) : (
          <>
            нет аккаунта?{" "}
            <Link to="/signup" state={{ from }} className="text-accent hover:underline">
              регистрация
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
