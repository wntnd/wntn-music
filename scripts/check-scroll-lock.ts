// Run: node scripts/check-scroll-lock.ts  (Node strips the TS types)
// The counter is the whole point: two holders, and the page must stay locked
// until the last one lets go.
import assert from "node:assert";

(globalThis as unknown as { document: unknown }).document = {
  body: { style: { overflow: "" } },
};
const style = (globalThis as unknown as { document: { body: { style: { overflow: string } } } })
  .document.body.style;

const { lockScroll } = await import("../src/lib/scroll-lock.ts");

assert.equal(style.overflow, "");

const player = lockScroll();
assert.equal(style.overflow, "hidden", "first hold locks");

const dialog = lockScroll();
assert.equal(style.overflow, "hidden");

dialog();
assert.equal(style.overflow, "hidden", "the player still holds it");

dialog();
assert.equal(style.overflow, "hidden", "releasing twice must not drop someone else's hold");

player();
assert.equal(style.overflow, "", "last one out restores the page");

// and the original value is restored, not blanked
style.overflow = "clip";
const again = lockScroll();
assert.equal(style.overflow, "hidden");
again();
assert.equal(style.overflow, "clip", "restores what was there before");

console.log("scroll-lock: all checks passed");
