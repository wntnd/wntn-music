/**
 * Body scroll lock, counted. Two things lock it independently — the expanded
 * player and any dialog — and whoever released last used to unlock the page
 * for both: closing a dialog over the open player left the page scrolling
 * behind it. Counting means the lock lifts only when nobody holds it.
 */
let held = 0;
let previous = "";

export function lockScroll(): () => void {
  if (held === 0) {
    previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  held++;
  let released = false;
  return () => {
    if (released) return; // a double release must not unlock someone else's hold
    released = true;
    held--;
    if (held === 0) document.body.style.overflow = previous;
  };
}
