import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconSun, IconMoon, IconUserCircle } from "@tabler/icons-react";
import { meApi, type PlaybackSync } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { usePlayer } from "../hooks/usePlayer";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import { useDialogs } from "./Dialogs";

const SYNC_OPTIONS: { value: PlaybackSync; label: string; hint: string }[] = [
  { value: "off", label: "выключена", hint: "каждая вкладка играет сама по себе" },
  {
    value: "tabs",
    label: "только вкладки",
    hint: "играет одна вкладка — остальные встают на паузу",
  },
  { value: "full", label: "полная", hint: "во всех вкладках та же очередь, трек и позиция" },
];

// Account preferences. These used to live on the public profile page, where a
// visitor's own settings sat under someone else's name — now they have a home.
export default function SettingsPage() {
  const { user, loading } = useAuth();
  const goLogin = useGoLogin();
  useTitle("настройки");

  useEffect(() => {
    if (!loading && !user) goLogin({ replace: true });
  }, [loading, user, goLogin]);

  if (loading || !user) return null;

  return (
    <div className="flex max-w-lg animate-fade-up flex-col gap-8">
      <h1 className="font-display text-2xl">настройки</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide text-muted">аккаунт</h2>
        <Link
          to={`/u/${user.username}`}
          className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-surface-hover"
        >
          {user.avatar ? (
            <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <IconUserCircle size={40} className="text-muted" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {user.displayName ?? user.username}
            </span>
            <span className="block truncate text-xs text-muted">
              @{user.username} · открыть профиль
            </span>
          </span>
        </Link>
      </section>

      <ThemeSetting />
      <PlaybackSyncSetting />
    </div>
  );
}

function ThemeSetting() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  const pick = (next: boolean) => {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wide text-muted">тема</h2>
      <div className="flex gap-2">
        {[
          { on: false, label: "светлая", icon: <IconSun size={16} /> },
          { on: true, label: "тёмная", icon: <IconMoon size={16} /> },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => pick(o.on)}
            data-active={dark === o.on}
            className="flex flex-1 items-center justify-center gap-2 rounded-card border border-border bg-surface py-2.5 text-sm transition-colors hover:bg-surface-hover data-[active=true]:border-accent data-[active=true]:text-accent"
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PlaybackSyncSetting() {
  const { user } = useAuth();
  const { syncMode, setSyncMode } = usePlayer();
  const { run } = useDialogs();

  // the account value wins over whatever this browser had cached
  useEffect(() => {
    if (user?.playbackSync && user.playbackSync !== syncMode) setSyncMode(user.playbackSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.playbackSync]);

  const pick = (mode: PlaybackSync) => {
    setSyncMode(mode);
    void run(() => meApi.updateSettings({ playbackSync: mode }));
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wide text-muted">
        синхронизация проигрывания
      </h2>
      <div className="flex flex-col gap-1.5">
        {SYNC_OPTIONS.map((o) => (
          <label
            key={o.value}
            data-active={syncMode === o.value}
            className="flex cursor-pointer items-start gap-2.5 rounded-card border border-border bg-surface p-3 text-sm transition-colors hover:bg-surface-hover data-[active=true]:border-accent"
          >
            <input
              type="radio"
              name="playbackSync"
              checked={syncMode === o.value}
              onChange={() => pick(o.value)}
              className="mt-0.5 accent-accent"
            />
            <span>
              {o.label}
              <span className="block text-xs text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
