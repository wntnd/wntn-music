import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconUserCircle,
  IconLibrary,
  IconMicrophone2,
  IconShieldCheck,
  IconSettings,
  IconLogout,
  IconSun,
  IconMoon,
  IconChevronDown,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";

// Everything account-related lives behind the avatar so the header stays a
// logo and one control, instead of a row of loose icons.
export default function UserMenu({
  dark,
  toggleTheme,
}: {
  dark: boolean;
  toggleTheme: () => void;
}) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user)
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          aria-label="сменить тему"
          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
        <Link
          to="/login"
          className="flex items-center gap-1.5 rounded-card bg-surface px-3 py-1.5 text-sm font-medium transition-all hover:bg-surface-hover active:scale-95"
        >
          <IconUserCircle size={18} /> войти
        </Link>
      </div>
    );

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="меню аккаунта"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-surface-hover"
      >
        {user.avatar ? (
          <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-surface font-medium">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <IconChevronDown
          size={14}
          className={"text-muted transition-transform " + (open ? "rotate-180" : "")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-52 animate-dropdown-in overflow-hidden rounded-card border border-border bg-bg shadow-xl">
          <Link
            to={`/u/${user.username}`}
            viewTransition
            onClick={close}
            className="flex items-center gap-2 border-b border-border px-3 py-2.5 transition-colors hover:bg-surface-hover"
          >
            {user.avatar ? (
              <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <IconUserCircle size={28} className="text-muted" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {user.displayName ?? user.username}
              </span>
              <span className="block truncate text-xs text-muted">@{user.username}</span>
            </span>
          </Link>

          <MenuLink to="/library" onClick={close} icon={<IconLibrary size={17} />}>
            библиотека
          </MenuLink>
          <MenuLink to="/studio" onClick={close} icon={<IconMicrophone2 size={17} />}>
            студия
          </MenuLink>
          <MenuLink to="/settings" onClick={close} icon={<IconSettings size={17} />}>
            настройки
          </MenuLink>
          {user.isAdmin && (
            <MenuLink to="/admin" onClick={close} icon={<IconShieldCheck size={17} />}>
              админка
            </MenuLink>
          )}

          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
          >
            <span className="text-muted">{dark ? <IconSun size={17} /> : <IconMoon size={17} />}</span>
            {dark ? "светлая тема" : "тёмная тема"}
          </button>
          <button
            onClick={() => {
              close();
              void logout();
            }}
            className="flex w-full items-center gap-2.5 border-t border-border px-3 py-2.5 text-left text-sm text-accent transition-colors hover:bg-surface-hover"
          >
            <IconLogout size={17} /> выйти
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon,
  onClick,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      viewTransition
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-surface-hover"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </Link>
  );
}
