/**
 * The bits of physical motion this app needs, in Apple's parameterisation
 * (WWDC "Designing Fluid Interfaces"): a spring you describe by *response* and
 * *damping* rather than mass/stiffness, momentum projection for flicks, and
 * rubber-banding at boundaries. ~60 lines, so no animation library.
 */

/**
 * Capture the pointer so tracking survives leaving the element's bounds.
 * Throws NotFoundError when the pointer is already gone — a real race on a fast
 * release — and an uncaught throw here kills the rest of the gesture.
 */
export function capturePointer(el: Element, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // pointer already released; the gesture still works, just uncaptured
  }
}

/** Where a flick would coast to a stop. Exponential decay, like scroll views. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Progressive resistance past a boundary: the further you drag, the less the
 * element follows. A hard stop reads as frozen; this reads as "nothing there".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (dimension <= 0) return 0;
  return (
    (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
  );
}

export type SpringHandle = {
  /** Retarget mid-flight, carrying the current value and velocity forward. */
  to: (target: number) => void;
  stop: () => void;
  /** Live on-screen value — what a new gesture must start from. */
  value: () => number;
  velocity: () => number;
};

/**
 * Runs a spring on rAF, calling `onFrame` with the live value. Interruptible by
 * design: `to()` moves the target without resetting position or velocity, so
 * grabbing a moving element and throwing it back never jumps or hits a wall.
 *
 * `response` — seconds to approach the target. `damping` — 1 settles without
 * overshoot; ~0.8 gives the small bounce that suits a flick.
 */
export function spring(opts: {
  from: number;
  to: number;
  velocity?: number;
  response?: number;
  damping?: number;
  onFrame: (value: number) => void;
  onRest?: () => void;
}): SpringHandle {
  const { response = 0.4, damping = 1, onFrame, onRest } = opts;
  const omega = (2 * Math.PI) / response;
  const k = omega * omega;
  const c = 2 * damping * omega;

  let x = opts.from;
  let v = opts.velocity ?? 0;
  let target = opts.to;
  let raf = 0;
  let last = 0;

  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30); // cap: a backgrounded tab
    last = now;
    // sub-stepping keeps a stiff spring stable at low frame rates
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -k * (x - target) - c * v;
      v += a * h;
      x += v * h;
    }
    if (Math.abs(x - target) < 0.1 && Math.abs(v) < 0.5) {
      x = target;
      v = 0;
      onFrame(x);
      onRest?.();
      return;
    }
    onFrame(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame((t) => {
    last = t;
    raf = requestAnimationFrame(step);
  });

  return {
    to: (next) => {
      target = next;
    },
    stop: () => cancelAnimationFrame(raf),
    value: () => x,
    velocity: () => v,
  };
}

/**
 * Velocity from a short position history — the last few pointer samples, not
 * just the final delta, so a pause before release doesn't report a phantom
 * flick and a fast flick isn't averaged away.
 */
export class VelocityTracker {
  private samples: { v: number; t: number }[] = [];

  reset() {
    this.samples = [];
  }

  add(value: number, time = performance.now()) {
    this.samples.push({ v: value, t: time });
    if (this.samples.length > 6) this.samples.shift();
  }

  /** px per second. */
  get(): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const first = s[0];
    const last = s[s.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    return ((last.v - first.v) / dt) * 1000;
  }
}
