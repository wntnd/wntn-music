import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconUpload,
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconPhoto,
  IconRefresh,
} from "@tabler/icons-react";
import {
  manageApi,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  KIND_OPTIONS,
  type StudioAlbum,
  type VersionKind,
} from "../lib/api";
import { formatTime, readAudioDuration } from "../lib/tracks";
import Select from "./Select";
import { useDialogs } from "./Dialogs";

const AUDIO_EXT = /\.(mp3|wav|flac|m4a|aac|ogg|opus|aiff?|wma)$/i;
const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  const mb = bytes / 1024 / 1024;
  // "60 МБ", not "60.0 МБ" — the decimal only earns its place when it says something
  return `${mb < 10 || mb % 1 >= 0.05 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} МБ`;
};

type RowState = "ready" | "uploading" | "done" | "error";

type Row = {
  key: string;
  file: File;
  title: string;
  kind: VersionKind;
  albumId: string;
  cover: File | null;
  coverUrl: string | null;
  duration: number;
  progress: number;
  state: RowState;
  error?: string;
  trackId?: string;
  abort?: AbortController;
};

/**
 * Publishing a track used to be: create it by title, find it in a list, open a
 * panel, switch to a tab, then upload — with no progress and no way out. Here
 * you drop the files and press one button.
 */
export default function StudioUpload({
  artistId,
  albums,
  onPublished,
}: {
  artistId: string;
  albums: StudioAlbum[];
  onPublished: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useDialogs();

  // object urls for cover previews are ours to clean up
  useEffect(
    () => () => rows.forEach((r) => r.coverUrl && URL.revokeObjectURL(r.coverUrl)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const patch = (key: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const addFiles = async (files: FileList | File[]) => {
    const picked: Row[] = [];
    for (const file of Array.from(files)) {
      const looksAudio = file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
      if (!looksAudio) {
        toast(`${file.name}: это не аудио`, "error");
        continue;
      }
      // refuse locally: the server caps the body at 60MB and would 413 you only
      // after the whole file had gone up the wire
      if (file.size > MAX_AUDIO_BYTES) {
        toast(`${file.name}: больше ${formatSize(MAX_AUDIO_BYTES)}`, "error");
        continue;
      }
      picked.push({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        title: file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim(),
        kind: "release",
        albumId: "",
        cover: null,
        coverUrl: null,
        duration: 0,
        progress: 0,
        state: "ready",
      });
    }
    if (!picked.length) return;
    setRows((rs) => [...rs, ...picked]);
    // durations resolve one by one; the row is usable before they land
    for (const row of picked) {
      const duration = await readAudioDuration(row.file);
      patch(row.key, { duration });
    }
  };

  const setCover = (key: string, file: File | null) => {
    if (file && file.size > MAX_IMAGE_BYTES) {
      toast(`обложка больше ${formatSize(MAX_IMAGE_BYTES)}`, "error");
      return;
    }
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        if (r.coverUrl) URL.revokeObjectURL(r.coverUrl);
        return { ...r, cover: file, coverUrl: file ? URL.createObjectURL(file) : null };
      }),
    );
  };

  const publish = async (row: Row) => {
    if (!row.title.trim()) {
      patch(row.key, { state: "error", error: "нужно название" });
      return false;
    }
    const abort = new AbortController();
    patch(row.key, { state: "uploading", progress: 0, error: undefined, abort });
    try {
      const { id } = await manageApi.createTrack({
        title: row.title.trim(),
        artistId,
        albumId: row.albumId || undefined,
      });
      await manageApi.uploadVersion(id, row.file, {
        kind: row.kind,
        makePrimary: true,
        duration: row.duration,
        signal: abort.signal,
        onProgress: (p) => patch(row.key, { progress: p }),
      });
      if (row.cover) await manageApi.uploadCover(id, row.cover);
      patch(row.key, { state: "done", progress: 1, trackId: id, abort: undefined });
      return true;
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      patch(row.key, {
        state: aborted ? "ready" : "error",
        progress: 0,
        error: aborted ? undefined : e instanceof Error ? e.message : "ошибка",
        abort: undefined,
      });
      return false;
    }
  };

  const publishAll = async () => {
    // one at a time: parallel uploads of 60MB files just starve each other
    let ok = 0;
    for (const row of rows.filter((r) => r.state === "ready" || r.state === "error")) {
      if (await publish(row)) ok++;
    }
    if (ok) {
      toast(ok === 1 ? "трек опубликован" : `опубликовано треков: ${ok}`);
      onPublished();
    }
  };

  const remove = (key: string) => {
    setRows((rs) => {
      const row = rs.find((r) => r.key === key);
      row?.abort?.abort();
      if (row?.coverUrl) URL.revokeObjectURL(row.coverUrl);
      return rs.filter((r) => r.key !== key);
    });
  };

  const pending = rows.filter((r) => r.state === "ready" || r.state === "error").length;
  const busy = rows.some((r) => r.state === "uploading");

  return (
    <section className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        data-dragging={dragging}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:bg-surface-hover data-[dragging=true]:border-accent data-[dragging=true]:bg-surface-hover"
      >
        <IconUpload size={28} className="text-muted" />
        <p className="text-sm font-medium">перетащи сюда mp3 — можно сразу несколько</p>
        <p className="text-xs text-muted">
          или нажми, чтобы выбрать · до {formatSize(MAX_AUDIO_BYTES)} на файл
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((row) => (
              <UploadRow
                key={row.key}
                row={row}
                albums={albums}
                onChange={(next) => patch(row.key, next)}
                onCover={(f) => setCover(row.key, f)}
                onRemove={() => remove(row.key)}
                onPublish={() => void publish(row)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void publishAll()}
              disabled={!pending || busy}
              className="rounded-card bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? "заливаю…" : `опубликовать · ${pending}`}
            </button>
            {rows.some((r) => r.state === "done") && (
              <button
                onClick={() => setRows((rs) => rs.filter((r) => r.state !== "done"))}
                className="rounded-card border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-hover"
              >
                убрать готовые
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function UploadRow({
  row,
  albums,
  onChange,
  onCover,
  onRemove,
  onPublish,
}: {
  row: Row;
  albums: StudioAlbum[];
  onChange: (next: Partial<Row>) => void;
  onCover: (file: File | null) => void;
  onRemove: () => void;
  onPublish: () => void;
}) {
  const locked = row.state === "uploading" || row.state === "done";

  return (
    <div
      data-state={row.state}
      className="relative overflow-hidden rounded-card border border-border bg-surface p-3 data-[state=done]:border-accent/30 data-[state=error]:border-accent/50"
    >
      {/* progress fills the card itself rather than a thin bar off to the side */}
      {row.state === "uploading" && (
        <div
          className="absolute inset-y-0 left-0 bg-accent/10 transition-[width] duration-150"
          style={{ width: `${row.progress * 100}%` }}
        />
      )}

      <div className="relative flex flex-wrap items-start gap-3">
        <label
          className={
            "group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-bg text-muted " +
            (locked ? "" : "cursor-pointer hover:text-text")
          }
          title="обложка"
        >
          {row.coverUrl ? (
            <img src={row.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <IconPhoto size={20} />
          )}
          {!locked && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                onCover(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          )}
        </label>

        <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
          <input
            value={row.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={locked}
            placeholder="название трека"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
          />
          <p className="truncate font-mono text-xs text-muted">
            {row.file.name} · {formatSize(row.file.size)}
            {row.duration > 0 && ` · ${formatTime(row.duration)}`}
          </p>
          {!locked && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={row.kind}
                options={KIND_OPTIONS}
                label="тип версии"
                onChange={(v) => onChange({ kind: v as VersionKind })}
              />
              {albums.length > 0 && (
                <Select
                  value={row.albumId}
                  label="альбом"
                  options={[
                    { value: "", label: "— без альбома —" },
                    ...albums.map((a) => ({ value: a.id, label: a.title })),
                  ]}
                  onChange={(v) => onChange({ albumId: v })}
                />
              )}
            </div>
          )}
          {row.state === "error" && (
            <p className="flex items-center gap-1.5 font-mono text-xs text-accent">
              <IconAlertTriangle size={14} /> {row.error}
            </p>
          )}
          {row.state === "done" && row.trackId && (
            <Link
              to={`/track/${row.trackId}`}
              className="flex w-fit items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <IconCheck size={14} /> опубликован — открыть
            </Link>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {row.state === "uploading" && (
            <>
              <span className="font-mono text-xs text-muted">
                {Math.round(row.progress * 100)}%
              </span>
              <button
                onClick={() => row.abort?.abort()}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-accent"
              >
                отменить
              </button>
            </>
          )}
          {row.state === "error" && (
            <button
              onClick={onPublish}
              aria-label="повторить"
              title="повторить"
              className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted transition-colors hover:text-text"
            >
              <IconRefresh size={15} />
            </button>
          )}
          {row.state !== "uploading" && (
            <button
              onClick={onRemove}
              aria-label="убрать из списка"
              className="grid h-8 w-8 place-items-center rounded-md border border-border text-muted transition-colors hover:text-accent"
            >
              <IconX size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
