import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, NavLink } from "react-router-dom";
import {
  IconBrandTelegram,
  IconSearch,
  IconHome,
  IconLibrary,
  IconMicrophone2,
} from "@tabler/icons-react";
import Home from "./components/Home";
import ArtistPage from "./components/ArtistPage";
import TrackPage from "./components/TrackPage";
import Player from "./components/Player";
import AuthPage from "./components/AuthPage";
import Library from "./components/Library";
import PlaylistPage from "./components/PlaylistPage";
import Studio from "./components/Studio";
import AdminPage from "./components/AdminPage";
import UserPage from "./components/UserPage";
import AlbumPage from "./components/AlbumPage";
import SearchPage from "./components/SearchPage";
import SettingsPage from "./components/SettingsPage";
import UserMenu from "./components/UserMenu";
import { usePlayer } from "./hooks/usePlayer";
import { useAuth } from "./hooks/useAuth";
import { useTitle } from "./hooks/useTitle";

function useTheme() {
  const [dark, setDark] = useState(
    () => (localStorage.getItem("theme") ?? "dark") !== "light",
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

/** A new route starts at the top — otherwise a deep-scrolled list carries its
 *  offset into the next page and lands you halfway down it. */
function useScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
}

export default function App() {
  const { dark, toggle } = useTheme();
  const { current } = usePlayer();
  useScrollTop();

  return (
    <div
      // room for whatever floats at the bottom: the tab bar (phones) and the
      // mini player when something is loaded — no dead strip when neither is.
      className={
        "min-h-screen " +
        (current ? "pb-[132px] md:pb-28" : "pb-20 md:pb-8")
      }
    >
      <header className="glass sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-xl tracking-tight">
            wntn<span className="text-accent">.</span>music
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/search"
              aria-label="поиск"
              title="поиск"
              className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
            >
              <IconSearch size={18} />
            </Link>
            <a
              href="https://t.me/wntnmusic"
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text sm:grid"
              aria-label="телеграм"
            >
              <IconBrandTelegram size={18} />
            </a>
            <UserMenu dark={dark} toggleTheme={toggle} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/artist/:slug" element={<ArtistPage />} />
          <Route path="/track/:id" element={<TrackPage />} />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/u/:username" element={<UserPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/library" element={<Library />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <Player />
      <MobileNav />
    </div>
  );
}

/** Phone navigation. Library and studio used to hide inside the avatar menu,
 *  which is two taps and a guess away from the things people open most. */
function MobileNav() {
  const { user } = useAuth();
  const items = [
    { to: "/", label: "главная", icon: <IconHome size={20} />, end: true },
    { to: "/search", label: "поиск", icon: <IconSearch size={20} />, end: false },
    { to: "/library", label: "медиа", icon: <IconLibrary size={20} />, end: false },
    { to: "/studio", label: "студия", icon: <IconMicrophone2 size={20} />, end: false },
  ].filter((i) => user || (i.to !== "/library" && i.to !== "/studio"));

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex items-stretch">
        {items.map((i) => (
          <li key={i.to} className="flex-1">
            <NavLink
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors " +
                (isActive ? "text-accent" : "text-muted")
              }
            >
              {i.icon}
              {i.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NotFound() {
  useTitle("страница не найдена");
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="font-mono text-5xl text-muted">404</p>
      <h1 className="font-display text-2xl">такой страницы нет</h1>
      <p className="max-w-sm text-sm text-muted">
        ссылка сломалась или трек удалили. можно вернуться на главную или поискать.
      </p>
      <div className="flex gap-2">
        <Link
          to="/"
          className="rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          на главную
        </Link>
        <Link
          to="/search"
          className="rounded-card border border-border bg-surface px-4 py-2.5 text-sm transition-colors hover:bg-surface-hover"
        >
          поиск
        </Link>
      </div>
    </div>
  );
}
