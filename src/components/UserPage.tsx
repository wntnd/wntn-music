import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { IconUserCircle, IconMicrophone2, IconMusic, IconSettings } from "@tabler/icons-react";
import { userApi, meApi, type UserProfile } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import EditableImage from "./EditableImage";
import { useDialogs } from "./Dialogs";

export default function UserPage() {
  const { username } = useParams();
  const { user } = useAuth();
  const { run } = useDialogs();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTitle(profile ? (profile.displayName ?? `@${profile.username}`) : null);

  useEffect(() => {
    if (!username) return;
    setProfile(null);
    setError(null);
    userApi
      .profile(username)
      .then((p) => {
        setProfile(p);
        setAvatar(p.avatar);
      })
      .catch(() => setError("пользователь не найден"));
  }, [username]);

  const isMe = Boolean(user && profile && user.username === profile.username);

  const uploadAvatar = async (file: File) => {
    const r = await run(() => meApi.uploadAvatar(file), "аватарка обновлена");
    // cache-buster: the url never changes, so the browser would keep the old one
    if (r) setAvatar(`${r.avatar}?t=${Date.now()}`);
  };

  if (error)
    return (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-accent">{error}</p>
        <Link to="/" className="text-sm text-accent hover:underline">← на главную</Link>
      </div>
    );
  if (!profile) return <p className="font-mono text-sm text-muted">загрузка…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {isMe ? (
          <EditableImage
            src={avatar}
            canEdit
            onPick={uploadAvatar}
            rounded="rounded-full"
            className="h-20 w-20 shrink-0"
            label="сменить аву"
          />
        ) : avatar ? (
          <img src={avatar} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <IconUserCircle size={72} className="text-muted" />
        )}
        <div>
          <h1 className="font-display text-2xl">
            {profile.displayName ?? profile.username}
            {profile.banned && (
              <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 align-middle text-xs text-accent">
                бан
              </span>
            )}
          </h1>
          <p className="text-sm text-muted">
            @{profile.username} · с {new Date(profile.createdAt).toLocaleDateString("ru")}
          </p>
          {profile.artist && (
            <Link
              to={`/artist/${profile.artist.slug}`}
              className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <IconMicrophone2 size={14} /> {profile.artist.name}
            </Link>
          )}
          {isMe && (
            <Link
              to="/settings"
              className="mt-2 inline-flex items-center gap-1.5 rounded-card border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover"
            >
              <IconSettings size={15} /> настройки
            </Link>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">публичные плейлисты</h2>
        {profile.playlists.length === 0 ? (
          <p className="text-sm text-muted">пока пусто</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {profile.playlists.map((p) => (
              <Link
                key={p.id}
                to={`/playlist/${p.id}`}
                viewTransition
                className="group flex animate-fade-up flex-col rounded-card bg-surface p-2 transition-all duration-200 hover:-translate-y-1 hover:bg-surface-hover"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-bg">
                  {p.cover ? (
                    <img
                      src={p.cover}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.src.endsWith("/covers/default.jpg"))
                          img.src = "/covers/default.jpg";
                      }}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted">
                      <IconMusic size={32} />
                    </span>
                  )}
                </div>
                <p className="truncate px-1 pt-2 text-sm font-medium group-hover:underline">
                  {p.title}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
