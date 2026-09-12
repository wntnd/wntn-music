import { useState } from "react";

/**
 * Round artist avatar with a letter fallback. Every call site used to render a
 * bare <img> with no onError, so a missing avatar (deleted object, cold cache,
 * a bad key) drew a broken-image sliver instead of the placeholder that already
 * existed one branch away.
 */
export default function ArtistAvatar({
  src,
  name,
  size = "h-24 w-24",
  text = "text-2xl",
  className = "",
}: {
  src: string | null | undefined;
  name: string;
  size?: string;
  text?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed)
    return (
      <span
        aria-hidden
        className={`grid ${size} ${text} shrink-0 place-items-center rounded-full bg-surface font-display ${className}`}
      >
        {(name || "?").slice(0, 1).toUpperCase()}
      </span>
    );

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className={`${size} shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
