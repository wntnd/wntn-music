import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconCheck, IconX, IconSearch, IconId, IconUsers, IconMicrophone2 } from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import SideNav from "./SideNav";
import { useDialogs } from "./Dialogs";
import {
  adminApi,
  type ClaimRequest,
  type AdminUser,
  type AdminArtist,
} from "../lib/api";

type Tab = "claims" | "users" | "artists";

const ROLE_RU: Record<string, string> = { user: "юзер", admin: "админ", root: "root" };

export default function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("claims");
  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const { confirm, toast } = useDialogs();
  useTitle("админка");

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) navigate("/");
  }, [loading, user, navigate]);

  const loadAll = (q?: string) =>
    Promise.allSettled([
      adminApi.claims().then(setClaims),
      adminApi.users(q).then(setUsersList),
      adminApi.artists().then(setArtists),
    ]).then(() => setReady(true));

  useEffect(() => {
    if (user?.isAdmin) void loadAll();
  }, [user]);

  if (loading || !user?.isAdmin || !ready) return null;

  const claimAct = async (id: string, fn: (id: string) => Promise<unknown>) => {
    await fn(id).catch(() => {});
    setClaims((cs) => cs.filter((c) => c.id !== id));
    void adminApi.artists().then(setArtists);
  };

  const userAct = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await loadAll(query || undefined);
    } catch (e) {
      toast(e instanceof Error ? e.message : "ошибка", "error");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl">админка</h1>
      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SideNav
          items={[
            { key: "claims", label: `заявки · ${claims.length}`, icon: <IconId size={16} /> },
            { key: "users", label: `юзеры · ${usersList.length}`, icon: <IconUsers size={16} /> },
            { key: "artists", label: `артисты · ${artists.length}`, icon: <IconMicrophone2 size={16} /> },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
      {tab === "claims" &&
        (claims.length === 0 ? (
          <p className="text-sm text-muted">новых запросов нет</p>
        ) : (
          <div className="flex flex-col gap-3">
            {claims.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link to={`/u/${c.username}`} className="font-medium hover:underline">
                      @{c.username}
                    </Link>{" "}
                    хочет забрать артиста{" "}
                    <Link to={`/artist/${c.artistSlug}`} className="font-medium hover:underline">
                      {c.artistName}
                    </Link>
                  </p>
                  {c.message && (
                    <p className="mt-0.5 font-mono text-xs text-muted">«{c.message}»</p>
                  )}
                </div>
                <button
                  onClick={() => claimAct(c.id, adminApi.approve)}
                  className="flex items-center gap-1 rounded-card bg-text px-3 py-1.5 text-sm font-medium text-bg"
                >
                  <IconCheck size={16} /> одобрить
                </button>
                <button
                  onClick={() => claimAct(c.id, adminApi.reject)}
                  className="flex items-center gap-1 rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
                >
                  <IconX size={16} /> отклонить
                </button>
              </div>
            ))}
          </div>
        ))}

      {tab === "users" && (
        <div className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadAll(query || undefined);
            }}
            className="flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="поиск по нику или почте"
              className="flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-card bg-text px-3 py-2 text-sm font-medium text-bg"
            >
              <IconSearch size={16} /> найти
            </button>
          </form>
          {usersList.map((u) => {
            const isSelf = u.id === user.id;
            const canBan =
              !isSelf &&
              (user.isRoot ? u.role !== "root" : u.role === "user");
            return (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Link to={`/u/${u.username}`} className="font-medium hover:underline">
                      @{u.username}
                    </Link>{" "}
                    <span className="text-xs text-muted">{ROLE_RU[u.role]}</span>
                    {u.bannedAt && (
                      <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
                        бан
                      </span>
                    )}
                  </p>
                  {u.artistSlug && (
                    <p className="text-xs text-muted">
                      артист:{" "}
                      <Link to={`/artist/${u.artistSlug}`} className="hover:underline">
                        {u.artistName}
                      </Link>
                    </p>
                  )}
                </div>
                {user.isRoot && u.role !== "root" && (
                  <button
                    onClick={() =>
                      userAct(() =>
                        adminApi.setRole(u.id, u.role === "admin" ? "user" : "admin"),
                      )
                    }
                    className="rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
                  >
                    {u.role === "admin" ? "снять админку" : "выдать админку"}
                  </button>
                )}
                {canBan &&
                  (u.bannedAt ? (
                    <button
                      onClick={() => userAct(() => adminApi.unban(u.id))}
                      className="rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
                    >
                      разбанить
                    </button>
                  ) : (
                    <button
                      onClick={() => userAct(() => adminApi.ban(u.id))}
                      className="rounded-card bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                    >
                      забанить
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {tab === "artists" &&
        (artists.length === 0 ? (
          <p className="text-sm text-muted">занятых артистов нет</p>
        ) : (
          <div className="flex flex-col gap-3">
            {artists.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                <p className="min-w-0 flex-1 text-sm">
                  <Link to={`/artist/${a.slug}`} className="font-medium hover:underline">
                    {a.name}
                  </Link>{" "}
                  <span className="text-muted">
                    — владелец{" "}
                    <Link to={`/u/${a.ownerUsername}`} className="hover:underline">
                      @{a.ownerUsername}
                    </Link>
                  </span>
                </p>
                <button
                  onClick={async () => {
                    if (await confirm(`снять доступ @${a.ownerUsername} к «${a.name}»?`, "снять"))
                      void userAct(() => adminApi.revokeArtist(a.id));
                  }}
                  className="rounded-card border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
                >
                  снять доступ
                </button>
              </div>
            ))}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
