// Run: node scripts/check-motion.ts  (Node strips the TS types)
import assert from "node:assert";
import { project, rubberband, spring, VelocityTracker } from "../src/lib/motion.ts";

// --- momentum projection -------------------------------------------------
// Apple's exponential-decay form: 0.998 coasts roughly half a metre per m/s.
assert.equal(project(0), 0);
assert.ok(project(1000) > project(500), "faster flick lands further");
assert.ok(project(-1000) < 0, "direction is preserved");
assert.ok(Math.abs(project(1000) - 499) < 1, `expected ~499, got ${project(1000)}`);
// a snappier rate must not overshoot the default one
assert.ok(project(1000, 0.99) < project(1000, 0.998));

// --- rubber-banding ------------------------------------------------------
assert.equal(rubberband(0, 800), 0);
assert.ok(rubberband(100, 800) < 100, "resistance always gives back less than asked");
assert.ok(rubberband(400, 800) > rubberband(100, 800), "still monotonic further out");
// resistance grows: doubling the drag must add less than double the movement
assert.ok(rubberband(200, 800) < 2 * rubberband(100, 800));
assert.ok(rubberband(-100, 800) === -rubberband(100, 800), "symmetric");
assert.equal(rubberband(100, 0), 0, "no dimension, no give");

// --- velocity tracker ----------------------------------------------------
const vt = new VelocityTracker();
assert.equal(vt.get(), 0, "no samples, no velocity");
vt.add(0, 0);
vt.add(100, 100); // 100px in 100ms
// `now` is passed explicitly: the reading is relative to the release, and
// leaving it to the wall clock made this assertion depend on how long the
// process had been up.
assert.ok(Math.abs(vt.get(100, 100) - 1000) < 1, `expected ~1000 px/s, got ${vt.get(100, 100)}`);
// Holding still before letting go is a deliberate stop, not a flick: no
// pointermove fires while the finger rests, so by release the samples are old.
assert.equal(vt.get(100, 500), 0, "a pause before release must not read as a throw");
assert.ok(vt.get(1000, 500) > 0, "the samples are still there, just too old to count");
vt.reset();
assert.equal(vt.get(), 0);
// only the recent window counts: an old sample must fall out of the buffer
for (let i = 0; i <= 10; i++) vt.add(i * 10, i * 10);
assert.ok(vt.get() > 0);

// --- spring --------------------------------------------------------------
// rAF isn't available under bare node; drive it with a fake clock.
let now = 0;
const queue: ((t: number) => void)[] = [];
globalThis.performance ??= { now: () => now } as Performance;
globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
  queue.push(cb);
  return queue.length;
}) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

function run(maxFrames = 600) {
  for (let i = 0; i < maxFrames && queue.length; i++) {
    const cb = queue.shift()!;
    now += 1000 / 60;
    cb(now);
  }
}

// critically damped: settles on the target without ever passing it
let last = 0;
let overshot = false;
let rested = false;
spring({
  from: 0,
  to: 100,
  damping: 1,
  response: 0.3,
  onFrame: (v) => {
    if (v > 100.01) overshot = true;
    last = v;
  },
  onRest: () => {
    rested = true;
  },
});
run();
assert.ok(rested, "spring reaches rest");
assert.equal(last, 100, "and lands exactly on the target");
assert.ok(!overshot, "damping 1 must not overshoot");

// under-damped: the same move is allowed to pass the target and come back
let peak = 0;
spring({
  from: 0,
  to: 100,
  damping: 0.6,
  response: 0.3,
  onFrame: (v) => {
    peak = Math.max(peak, v);
  },
});
run();
assert.ok(peak > 100, `damping 0.6 should overshoot, peaked at ${peak}`);

// release velocity carries into the animation instead of restarting from zero
let firstFrame: number | null = null;
spring({
  from: 0,
  to: 0,
  velocity: 600,
  damping: 1,
  response: 0.4,
  onFrame: (v) => {
    if (firstFrame === null) firstFrame = v;
  },
});
run();
assert.ok((firstFrame ?? 0) > 0, "a throw keeps moving away before it returns");

// retargeting mid-flight is continuous — no jump back to the start
let jumped = false;
let prev = 0;
const h = spring({
  from: 0,
  to: 300,
  damping: 1,
  response: 0.5,
  onFrame: (v) => {
    if (Math.abs(v - prev) > 60) jumped = true;
    prev = v;
  },
});
for (let i = 0; i < 6 && queue.length; i++) {
  const cb = queue.shift()!;
  now += 1000 / 60;
  cb(now);
}
h.to(0); // grabbed and thrown back
run();
assert.ok(!jumped, "interrupting must not teleport the value");
assert.ok(Math.abs(h.value()) < 0.5, "and it settles on the new target");

console.log("motion: all checks passed");
