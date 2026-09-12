import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconChevronDown,
  IconChevronUp,
  IconTrash,
  IconStarFilled,
  IconMusic,
  IconDisc,
  IconUserCircle,
  IconUpload,
  IconHeadphones,
  IconUsers,
  IconPlus,
  IconExternalLink,
  IconSearch,
} from "@tabler/icons-react";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { useGoLogin } from "../hooks/useGoLogin";
import {
  artistApi,
  albumApi,
  manageApi,
  trackApi,
  MAX_IMAGE_BYTES,
  MAX_CLIP_BYTES,
  type TrackDetail,
  type AlbumDetail,
  type ArtistBrief,
  type StudioOverview,
  type StudioTrack,
  type StudioAlbum,
  KIND_RU,
  KIND_OPTIONS,
  type VersionKind,
} from "../lib/api";
import { formatTime, readAudioDuration } from "../lib/tracks";
import SyncEditor from "./SyncEditor";
import SideNav from "./SideNav";
import Select from "./Select";
import Checkbox from "./Checkbox";
import EditableImage from "./EditableImage";
import ArtistAvatar from "./ArtistAvatar";
import StudioUpload from "./StudioUpload";
import { useDialogs } from "./Dialogs";

const ALBUM_TYPE_OPTIONS = [
  { value: "album", label: "альбом" },
  { value: "ep", label: "EP" },
  { value: "single", label: "сингл" },
];

const parseList = (s: string) =>
  s
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 10);

/** Uploaded artwork keeps the same url forever, so a fresh one only shows up
 *  if the query string changes. Every cover write goes through this. */
const bust = (url: string | null | undefined) =>
  url ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : null;

export default function Studio() {
  const { user, loading } = useAuth();
  const goLogin = useGoLogin();
  const [data, setData] = useState<StudioOverview | null>(null);
  const [ready, setReady] = useState(false);
  useTitle("студия");

  useEffect(() => {
    if (!loading && !user) goLogin({ replace: true });
  }, [loading, user, goLogin]);

  const reload = useCallback(() => {
    if (!user) return;
    manageApi
      .overview()
      .then(setData)
      .catch(() => setData({ artist: null }))
      .finally(() => setReady(true));
  }, [user]);
  useEffect(reload, [reload]);

  if (loading || !user) return null;
  // a blank screen while loading is what the old studio did — say something
  if (!ready) return <StudioSkeleton />;

  return (
    <div className="flex animate-fade-up flex-col gap-6">
      <h1 className="font-display text-2xl">студия</h1>
      {data?.artist ? (
        <Dashboard data={data} onChange={reload} />
      ) : (
        <ClaimForm onClaimed={reload} />
      )}
    </div>
  );
}

function StudioSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="shimmer h-8 w-32 animate-shimmer rounded" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer h-20 animate-shimmer rounded-card" />
        ))}
      </div>
      <div className="shimmer h-40 animate-shimmer rounded-card" />
    </div>
  );
}

function ClaimForm({ onClaimed }: { onClaimed: () => void }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const { run } = useDialogs();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await run(
      () => artistApi.claim({ name: name.trim(), bio: bio.trim() || undefined }),
      "профиль артиста создан",
    );
    setBusy(false);
    if (ok) onClaimed();
  };

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-3">
      <p className="text-sm text-muted">
        заведи профиль артиста, чтобы заливать треки. если твой артист уже есть в каталоге —
        открой его страницу и нажми «это я».
      </p>
      <Input value={name} onChange={setName} placeholder="имя артиста" required />
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="био (необязательно)"
        rows={3}
        className="rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-card bg-accent px-4 py-2.5 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        стать артистом
      </button>
    </form>
  );
}

type StudioTab = "upload" | "tracks" | "albums" | "profile";

function Dashboard({ data, onChange }: { data: StudioOverview; onChange: () => void }) {
  const artist = data.artist!;
  const stats = data.stats ?? { published: 0, drafts: 0, albums: 0, followers: 0, plays: 0 };
  const albums = data.albums ?? [];
  const tracks = data.tracks ?? [];
  const [tab, setTab] = useState<StudioTab>(tracks.length ? "tracks" : "upload");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-4">
        <ArtistAvatar src={artist.avatar} name={artist.name} size="h-14 w-14" text="text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted">профиль артиста</p>
          <Link
            to={`/artist/${artist.slug}`}
            className="flex items-center gap-1.5 font-display text-xl hover:underline"
          >
            {artist.name}
            <IconExternalLink size={15} className="text-muted" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Stat icon={<IconHeadphones size={14} />} value={stats.plays} label="прослушиваний" />
          <Stat icon={<IconUsers size={14} />} value={stats.followers} label="подписчиков" />
          <Stat icon={<IconMusic size={14} />} value={stats.published} label="опубликовано" />
          {stats.drafts > 0 && (
            <Stat icon={<IconUpload size={14} />} value={stats.drafts} label="черновиков" />
          )}
        </div>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:gap-6">
        <SideNav
          items={[
            { key: "upload", label: "загрузить", icon: <IconUpload size={16} /> },
            { key: "tracks", label: `треки · ${tracks.length}`, icon: <IconMusic size={16} /> },
            { key: "albums", label: `альбомы · ${albums.length}`, icon: <IconDisc size={16} /> },
            { key: "profile", label: "профиль", icon: <IconUserCircle size={16} /> },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="min-w-0 flex-1">
          {tab === "upload" && (
            <StudioUpload
              artistId={artist.id}
              albums={albums}
              onPublished={() => {
                onChange();
                setTab("tracks");
              }}
            />
          )}
          {tab === "tracks" && (
            <TracksSection
              artistId={artist.id}
              tracks={tracks}
              albums={albums}
              onChange={onChange}
              onUpload={() => setTab("upload")}
            />
          )}
          {tab === "albums" && (
            <AlbumsSection artistId={artist.id} albums={albums} onChange={onChange} />
          )}
          {tab === "profile" && <ProfileEditor artist={artist} onChange={onChange} />}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-card border border-border bg-bg px-3 py-1.5">
      <p className="flex items-center gap-1 text-sm font-medium">
        <span className="text-muted">{icon}</span>
        {value}
      </p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function ProfileEditor({
  artist,
  onChange,
}: {
  artist: NonNullable<StudioOverview["artist"]>;
  onChange: () => void;
}) {
  const [name, setName] = useState(artist.name);
  const [bio, setBio] = useState(artist.bio ?? "");
  const [genres, setGenres] = useState(artist.genres.join(", "));
  // one field per link: a comma-separated box mangles any url containing a comma
  const [links, setLinks] = useState<string[]>(artist.links.length ? artist.links : [""]);
  const [avatar, setAvatar] = useState(artist.avatar ?? null);
  const { run, toast } = useDialogs();

  const save = () =>
    run(
      () =>
        artistApi.update(artist.slug, {
          name: name.trim(),
          bio: bio.trim(),
          genres: parseList(genres),
          links: links.map((l) => l.trim()).filter(Boolean),
        }),
      "профиль сохранён",
    ).then((ok) => ok && onChange());

  const uploadAvatar = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return toast("картинка слишком большая", "error");
    const r = await run(() => manageApi.uploadArtistAvatar(artist.id, file), "аватарка обновлена");
    if (r) {
      setAvatar(bust(r.avatar));
      onChange();
    }
  };

  return (
    <section className="flex max-w-md flex-col gap-4">
      <div className="flex items-center gap-3">
        <EditableImage
          src={avatar}
          canEdit
          onPick={uploadAvatar}
          rounded="rounded-full"
          className="h-20 w-20 shrink-0 bg-surface"
          label="сменить аву"
        />
        <span className="text-sm text-muted">аватарка артиста</span>
      </div>
      <Input value={name} onChange={setName} placeholder="имя" />
      <Input value={genres} onChange={setGenres} placeholder="жанры через запятую" />

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">ссылки</span>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={l}
              onChange={(v) => setLinks((ls) => ls.map((x, n) => (n === i ? v : x)))}
              placeholder="t.me/имя, instagram.com/имя…"
            />
            <button
              type="button"
              onClick={() => setLinks((ls) => (ls.length === 1 ? [""] : ls.filter((_, n) => n !== i)))}
              aria-label="убрать ссылку"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-card border border-border text-muted transition-colors hover:text-accent"
            >
              <IconTrash size={15} />
            </button>
          </div>
        ))}
        {links.length < 10 && (
          <button
            type="button"
            onClick={() => setLinks((ls) => [...ls, ""])}
            className="flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-text"
          >
            <IconPlus size={15} /> ещё ссылка
          </button>
        )}
      </div>

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="био"
        rows={3}
        className="rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={() => void save()}
        className="w-fit rounded-card bg-text px-3 py-2 text-sm font-medium text-bg"
      >
        сохранить
      </button>
    </section>
  );
}

function AlbumsSection({
  artistId,
  albums,
  onChange,
}: {
  artistId: string;
  albums: StudioAlbum[];
  onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const { run } = useDialogs();

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await run(
      () => albumApi.create({ artistId, title: title.trim() }),
      `альбом «${title.trim()}» создан`,
    );
    if (ok) {
      setTitle("");
      onChange();
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <form onSubmit={create} className="flex max-w-md gap-2">
        <Input value={title} onChange={setTitle} placeholder="название альбома" />
        <button type="submit" className="rounded-card bg-text px-3 py-2 text-sm font-medium text-bg">
          создать
        </button>
      </form>
      {albums.length === 0 ? (
        <p className="text-sm text-muted">альбомов пока нет</p>
      ) : (
        <div className="flex flex-col gap-3">
          {albums.map((a) => (
            <AlbumManageRow key={a.id} album={a} onChange={onChange} />
          ))}
        </div>
      )}
    </section>
  );
}

function AlbumManageRow({ album, onChange }: { album: StudioAlbum; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [cover, setCover] = useState(album.cover);
  const [draft, setDraft] = useState({
    title: album.title,
    type: album.type as string,
    releaseDate: album.releaseDate ?? "",
    genres: "",
    description: "",
    copyright: "",
  });
  const { confirm, run, toast } = useDialogs();

  const load = useCallback(() => {
    albumApi
      .get(album.id)
      .then((al) => {
        setDetail(al);
        setDraft({
          title: al.title,
          type: al.type,
          releaseDate: al.releaseDate ?? "",
          genres: al.genres.join(", "),
          description: al.description ?? "",
          copyright: al.copyright ?? "",
        });
      })
      .catch(() => {});
  }, [album.id]);

  useEffect(() => {
    if (open && !detail) load();
  }, [open, detail, load]);

  const save = async () => {
    const ok = await run(
      () =>
        albumApi.update(album.id, {
          title: draft.title.trim() || undefined,
          type: draft.type as "album" | "ep" | "single",
          releaseDate: draft.releaseDate || null,
          genres: parseList(draft.genres),
          description: draft.description.trim() || null,
          copyright: draft.copyright.trim() || null,
        }),
      "альбом сохранён",
    );
    if (ok) {
      onChange();
      load();
    }
  };

  const uploadCover = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return toast("картинка слишком большая", "error");
    const r = await run(() => albumApi.uploadCover(album.id, file), "обложка обновлена");
    if (r) {
      setCover(bust(r.cover));
      onChange();
    }
  };

  const remove = async () => {
    if (!(await confirm(`удалить альбом «${album.title}»? треки останутся без альбома`, "удалить")))
      return;
    if (await run(() => albumApi.remove(album.id), "альбом удалён")) onChange();
  };

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <EditableImage
          src={cover}
          canEdit
          onPick={uploadCover}
          rounded="rounded-md"
          className="h-12 w-12 shrink-0"
          label="обложка"
        />
        <Link to={`/album/${album.id}`} className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium hover:underline">{album.title}</p>
          <p className="text-xs text-muted">
            {ALBUM_TYPE_OPTIONS.find((t) => t.value === album.type)?.label ?? album.type} ·{" "}
            {album.trackCount} треков
            {album.releaseDate ? ` · ${album.releaseDate.slice(0, 4)}` : ""}
          </p>
        </Link>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
        >
          {open ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />} управление
        </button>
        <button
          onClick={() => void remove()}
          aria-label="удалить альбом"
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted hover:text-accent"
        >
          <IconTrash size={15} />
        </button>
      </div>

      {open && (
        <div className="mt-3 flex max-w-md flex-col gap-3 border-t border-border pt-3">
          <Input
            value={draft.title}
            onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
            placeholder="название"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">тип:</span>
            <Select
              value={draft.type}
              options={ALBUM_TYPE_OPTIONS}
              label="тип альбома"
              onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
            />
            <span className="text-muted">релиз:</span>
            <input
              type="date"
              value={draft.releaseDate}
              onChange={(e) => setDraft((d) => ({ ...d, releaseDate: e.target.value }))}
              className="rounded-card border border-border bg-surface px-3 py-1.5 text-sm outline-none [color-scheme:inherit] focus:border-accent"
            />
          </div>
          <Input
            value={draft.genres}
            onChange={(v) => setDraft((d) => ({ ...d, genres: v }))}
            placeholder="жанры через запятую (hyperpop, cloud rap)"
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="описание альбома"
            rows={3}
            className="rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <Input
            value={draft.copyright}
            onChange={(v) => setDraft((d) => ({ ...d, copyright: v }))}
            placeholder="копирайт (℗ 2026 Артист)"
          />
          {detail && detail.tracks.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted">треки альбома:</span>
              <ol className="flex flex-col gap-0.5 font-mono text-xs text-muted">
                {detail.tracks.map((t, i) => (
                  <li key={t.id} className="truncate">
                    {i + 1}. {t.title}
                    {t.song ? "" : " · черновик"}
                  </li>
                ))}
              </ol>
              <Link to={`/album/${album.id}`} className="w-fit text-xs text-accent hover:underline">
                порядок треков — на странице альбома
              </Link>
            </div>
          )}
          <button
            onClick={() => void save()}
            className="w-fit rounded-card bg-text px-3 py-2 text-sm font-medium text-bg"
          >
            сохранить
          </button>
        </div>
      )}
    </div>
  );
}

function TracksSection({
  artistId,
  tracks,
  albums,
  onChange,
  onUpload,
}: {
  artistId: string;
  tracks: StudioTrack[];
  albums: StudioAlbum[];
  onChange: () => void;
  onUpload: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? tracks.filter((t) => t.title.toLowerCase().includes(q)) : tracks;
  const drafts = shown.filter((t) => !t.published);
  const live = shown.filter((t) => t.published);

  if (!tracks.length)
    return (
      <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-6">
        <p className="text-sm text-muted">треков пока нет — залей первый</p>
        <button
          onClick={onUpload}
          className="flex items-center gap-2 rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <IconUpload size={16} /> загрузить трек
        </button>
      </section>
    );

  return (
    <section className="flex flex-col gap-4">
      <div className="relative">
        <IconSearch
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="найти свой трек"
          className="w-full rounded-card border border-border bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
        />
      </div>

      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-muted">
            черновики · {drafts.length} — не видны в каталоге, пока нет аудио
          </h2>
          {drafts.map((t) => (
            <TrackManageRow
              key={t.id}
              track={t}
              artistId={artistId}
              albums={albums}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      {live.length > 0 && (
        <div className="flex flex-col gap-2">
          {drafts.length > 0 && (
            <h2 className="text-xs uppercase tracking-wide text-muted">
              опубликованы · {live.length}
            </h2>
          )}
          {live.map((t) => (
            <TrackManageRow
              key={t.id}
              track={t}
              artistId={artistId}
              albums={albums}
              onChange={onChange}
            />
          ))}
        </div>
      )}

      {shown.length === 0 && <p className="text-sm text-muted">ничего не нашлось</p>}
    </section>
  );
}

function TrackManageRow({
  track,
  artistId,
  albums,
  onChange,
}: {
  track: StudioTrack;
  artistId: string;
  albums: StudioAlbum[];
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"about" | "versions" | "lyrics">("about");
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [cover, setCover] = useState(track.cover);
  const [title, setTitle] = useState(track.title);
  const [genres, setGenres] = useState(track.genres.join(", "));
  const [explicit, setExplicit] = useState(track.explicit);
  const [allArtists, setAllArtists] = useState<ArtistBrief[]>([]);
  const { confirm, run, toast } = useDialogs();

  const reloadDetail = useCallback(() => {
    trackApi.get(track.id).then(setDetail).catch(() => {});
  }, [track.id]);

  useEffect(() => {
    if (open && !detail) reloadDetail();
  }, [open, detail, reloadDetail]);

  useEffect(() => {
    if (open && !allArtists.length) artistApi.list().then(setAllArtists).catch(() => {});
  }, [open, allArtists.length]);

  const act = async (fn: () => Promise<unknown>, ok?: string, refreshList = false) => {
    const done = await run(fn, ok);
    if (done === null) return;
    reloadDetail();
    if (refreshList) onChange();
  };

  const removeTrack = async () => {
    if (!(await confirm(`удалить трек «${track.title}» со всеми версиями?`, "удалить"))) return;
    if (await run(() => manageApi.deleteTrack(track.id), "трек удалён")) onChange();
  };

  const uploadCover = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) return toast("картинка слишком большая", "error");
    const r = await run(() => manageApi.uploadCover(track.id, file), "обложка обновлена");
    if (r) {
      setCover(bust(r.cover));
      onChange();
    }
  };

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <EditableImage
          src={cover}
          canEdit
          onPick={uploadCover}
          rounded="rounded-md"
          className="h-12 w-12 shrink-0"
          label="обложка"
        />
        <div className="min-w-0 flex-1">
          <Link to={`/track/${track.id}`} className="truncate text-sm font-medium hover:underline">
            {track.title}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {!track.published && (
              <span className="rounded border border-accent/40 px-1 text-accent">черновик</span>
            )}
            {track.duration ? <span>{formatTime(track.duration)}</span> : null}
            <span className="flex items-center gap-1">
              <IconHeadphones size={12} /> {track.plays}
            </span>
            <span>
              {track.versionCount} {track.versionCount === 1 ? "версия" : "версий"}
            </span>
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
        >
          {open ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />} управление
        </button>
        <button
          onClick={() => void removeTrack()}
          aria-label="удалить трек"
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted hover:text-accent"
        >
          <IconTrash size={15} />
        </button>
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3 md:flex-row md:gap-5">
          <SideNav
            items={[
              { key: "about", label: "о треке" },
              { key: "versions", label: `версии · ${detail?.versions.length ?? 0}` },
              { key: "lyrics", label: "текст" },
            ]}
            active={panel}
            onChange={setPanel}
          />
          <div className="min-w-0 flex-1">
            {panel === "about" && (
              <div className="flex flex-col gap-3">
                <div className="flex max-w-md flex-col gap-2">
                  <Input value={title} onChange={setTitle} placeholder="название" />
                  <Input
                    value={genres}
                    onChange={setGenres}
                    placeholder="жанры через запятую (hyperpop, cloud rap)"
                  />
                  <Checkbox
                    checked={explicit}
                    onChange={setExplicit}
                    label="explicit (ненормативная лексика)"
                    className="w-fit text-muted"
                  />
                  <button
                    onClick={() =>
                      act(
                        () =>
                          manageApi.updateTrack(track.id, {
                            title: title.trim(),
                            genres: parseList(genres),
                            explicit,
                          }),
                        "сохранено",
                        true,
                      )
                    }
                    className="w-fit rounded-md bg-text px-3 py-1.5 text-sm font-medium text-bg"
                  >
                    сохранить
                  </button>
                </div>
                {albums.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">альбом:</span>
                    <Select
                      value={detail?.albumId ?? ""}
                      label="альбом"
                      options={[
                        { value: "", label: "— без альбома —" },
                        ...albums.map((a) => ({ value: a.id, label: a.title })),
                      ]}
                      onChange={(v) =>
                        act(
                          () => manageApi.updateTrack(track.id, { albumId: v || null }),
                          "альбом изменён",
                          true,
                        )
                      }
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm text-muted">фиты:</span>
                  {(detail?.features.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail!.features.map((f) => (
                        <span
                          key={f.id}
                          className="flex items-center gap-1 rounded-card border border-border bg-bg py-1 pl-2.5 pr-1 text-xs"
                        >
                          {f.name}
                          <button
                            onClick={() =>
                              act(() =>
                                manageApi.setFeatures(
                                  track.id,
                                  detail!.features.filter((x) => x.id !== f.id).map((x) => x.id),
                                ),
                              )
                            }
                            aria-label={`убрать ${f.name}`}
                            className="grid h-4 w-4 place-items-center rounded-full text-muted hover:text-accent"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Select
                    value=""
                    placeholder="добавить артиста"
                    label="фиты"
                    options={allArtists
                      .filter(
                        (a) => a.id !== artistId && !detail?.features.some((f) => f.id === a.id),
                      )
                      .map((a) => ({ value: a.id, label: a.name }))}
                    onChange={(v) =>
                      act(() =>
                        manageApi.setFeatures(track.id, [
                          ...(detail?.features.map((f) => f.id) ?? []),
                          v,
                        ]),
                      )
                    }
                  />
                </div>
                <ClipControl detail={detail} trackId={track.id} onDone={reloadDetail} />
              </div>
            )}

            {panel === "versions" && (
              <VersionsPanel
                trackId={track.id}
                detail={detail}
                onChange={act}
                onRefresh={() => {
                  reloadDetail();
                  onChange();
                }}
              />
            )}

            {panel === "lyrics" && <SyncEditor trackId={track.id} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ClipControl({
  detail,
  trackId,
  onDone,
}: {
  detail: TrackDetail | null;
  trackId: string;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const { run, toast } = useDialogs();

  const upload = async (file: File) => {
    if (file.size > MAX_CLIP_BYTES) return toast("видео больше 200 МБ", "error");
    setProgress(0);
    const ok = await run(
      () => manageApi.uploadClip(trackId, file, { onProgress: setProgress }),
      "клип загружен",
    );
    setProgress(null);
    if (ok) onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">клип:</span>
      <FileButton
        label={detail?.clip ? "заменить видео" : "залить видео"}
        accept="video/mp4,video/webm,video/quicktime"
        onPick={(f) => void upload(f)}
      />
      {progress !== null && (
        <span className="font-mono text-xs text-muted">{Math.round(progress * 100)}%</span>
      )}
      {detail?.clip && (
        <button
          onClick={() =>
            void run(() => manageApi.deleteClip(trackId), "клип удалён").then((ok) => ok && onDone())
          }
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-accent"
        >
          удалить
        </button>
      )}
    </div>
  );
}

function VersionsPanel({
  trackId,
  detail,
  onChange,
  onRefresh,
}: {
  trackId: string;
  detail: TrackDetail | null;
  onChange: (fn: () => Promise<unknown>, ok?: string, refreshList?: boolean) => Promise<void>;
  onRefresh: () => void;
}) {
  const [kind, setKind] = useState<VersionKind>("release");
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const { confirm, run, toast } = useDialogs();

  const uploadVersion = async (file: File) => {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|flac|m4a|aac|ogg|opus)$/i.test(file.name))
      return toast("нужен аудиофайл", "error");
    const duration = await readAudioDuration(file);
    setProgress(0);
    const ok = await run(
      () =>
        manageApi.uploadVersion(trackId, file, {
          kind,
          label: label.trim() || undefined,
          makePrimary: !detail?.versions.length,
          duration,
          onProgress: setProgress,
        }),
      "версия залита",
    );
    setProgress(null);
    if (ok) {
      setLabel("");
      onRefresh(); // the first version publishes the track — the list changes too
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {!detail?.versions.length ? (
        <p className="text-sm text-muted">
          версий пока нет — залей аудио, и трек появится в каталоге
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {detail.versions.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg p-2 text-sm"
            >
              {v.isPrimary && <IconStarFilled size={13} className="text-accent" title="основная" />}
              <Select
                value={v.kind}
                options={KIND_OPTIONS}
                label="тип версии"
                onChange={(next) =>
                  onChange(
                    () => manageApi.updateVersion(v.id, { kind: next as VersionKind }),
                    "версия обновлена",
                  )
                }
              />
              <LabelField
                value={v.label ?? ""}
                onSave={(next) =>
                  onChange(
                    () => manageApi.updateVersion(v.id, { label: next || null }),
                    "подпись сохранена",
                  )
                }
              />
              {!v.isPrimary && (
                <button
                  onClick={() =>
                    onChange(() => manageApi.setPrimaryVersion(v.id), "основная версия", true)
                  }
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-hover"
                >
                  сделать основной
                </button>
              )}
              <button
                onClick={async () => {
                  if (await confirm("удалить версию?", "удалить"))
                    void onChange(() => manageApi.deleteVersion(v.id), "версия удалена", true);
                }}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-accent"
              >
                удалить
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Select
          value={kind}
          options={KIND_OPTIONS}
          label="тип новой версии"
          onChange={(v) => setKind(v as VersionKind)}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="подпись (не обязательно)"
          className="w-44 rounded-card border border-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <FileButton label="залить аудио" accept="audio/*" onPick={(f) => void uploadVersion(f)} solid />
        {progress !== null && (
          <span className="font-mono text-xs text-muted">{Math.round(progress * 100)}%</span>
        )}
      </div>
      {detail?.versions.length ? (
        <p className="text-xs text-muted">
          {KIND_RU[detail.versions.find((v) => v.isPrimary)?.kind ?? "release"]} — та версия,
          которая играет в каталоге
        </p>
      ) : null}
    </div>
  );
}

/** Inline text field that only fires a save when the value actually changed. */
function LabelField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft.trim())}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="подпись"
      aria-label="подпись версии"
      className="w-36 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
    />
  );
}

function FileButton({
  label,
  accept,
  onPick,
  solid,
}: {
  label: string;
  accept: string;
  onPick: (f: File) => void;
  solid?: boolean;
}) {
  return (
    <label
      className={
        "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium " +
        (solid ? "bg-text text-bg" : "border border-border hover:bg-surface-hover")
      }
    >
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      required={required}
      className="min-w-0 flex-1 rounded-card border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
    />
  );
}
