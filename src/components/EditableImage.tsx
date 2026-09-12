import { useRef, useState } from "react";
import { IconCamera, IconLoader2 } from "@tabler/icons-react";

// Artwork that doubles as its own upload control: hover dims it and shows a
// camera, click opens the file picker. Without `canEdit` it is a plain image,
// so the same component works for viewers and owners.
export default function EditableImage({
  src,
  fallback = "/covers/default.jpg",
  alt = "",
  canEdit,
  onPick,
  className = "",
  rounded = "rounded-card",
  label = "сменить изображение",
}: {
  src: string | null;
  fallback?: string;
  alt?: string;
  canEdit?: boolean;
  onPick?: (file: File) => Promise<unknown> | void;
  className?: string;
  rounded?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const img = (
    <img
      src={src || fallback}
      alt={alt}
      className={`h-full w-full object-cover ${rounded}`}
      onError={(e) => {
        const el = e.currentTarget;
        if (!el.src.endsWith(fallback)) el.src = fallback;
      }}
    />
  );

  if (!canEdit) return <div className={`overflow-hidden ${rounded} ${className}`}>{img}</div>;

  const handle = async (file: File) => {
    setBusy(true);
    try {
      await onPick?.(file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      aria-label={label}
      title={label}
      className={`group relative overflow-hidden ${rounded} ${className}`}
    >
      {img}
      <span
        data-busy={busy}
        className={`absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 data-[busy=true]:opacity-100 ${rounded}`}
      >
        {busy ? (
          <IconLoader2 size={22} className="animate-spin" />
        ) : (
          <span className="flex flex-col items-center gap-1">
            <IconCamera size={22} />
            <span className="px-2 text-center text-[11px] font-medium leading-tight">{label}</span>
          </span>
        )}
      </span>
      {/* phones never see the hover scrim above, so the artwork gets a badge
          that says out loud it can be replaced */}
      {!busy && (
        <span
          aria-hidden
          className="touch-only absolute bottom-1 right-1 h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
        >
          <IconCamera size={15} />
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}
