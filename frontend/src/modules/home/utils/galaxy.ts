/**
 * Procedural spiral galaxy for the home screen, drawn with Canvas 2D.
 *
 * Two layers, each rendered **once** per size change:
 *
 * - **sky** — deep space, a fixed field of foreground stars and grain, exactly viewport-sized.
 * - **disc** — a *face-on* spiral galaxy on transparent black: square, core dead centre, rim faded
 *   to nothing so the layer has no edge to catch the eye.
 *
 * Every frame the disc is tipped away from the camera and turned a little further about its own
 * axis, then added over the sky. Nothing is regenerated while it spins, so an idle home screen
 * costs two `drawImage` calls plus a handful of sprite blits.
 */

const TAU = Math.PI * 2;

/** How far the disc is tipped away from the camera: 0 looks straight down onto it, π/2 is edge-on.
 *  ~70° keeps the arms readable while the foreshortening reads unmistakably as depth. */
const TILT = 1.22;

/** In-plane roll, applied outside the tilt — swings the ellipse's long axis off horizontal. */
const ROLL = -0.3;

/** Where the core sits, as a fraction of the viewport. */
const CORE_X = 0.5;
const CORE_Y = 0.5;

/** Fixed seed — the sky must be identical across reloads and resizes. */
const SEED = 20260731;

/** Milliseconds for one full turn of the disc. Slow enough to read as drift rather than spin. */
const ROTATION_PERIOD = 1_200_000;

/** Disc radius as a fraction of the frame diagonal. Much past 0.45 and the arms run off-frame. */
const DISC_SPAN = 0.44;

/**
 * Device-pixel ceiling for the disc layer's side. The tilt squashes the disc to ~34% of its texture
 * height on screen, so full DPR mostly buys resolution the projection throws away; capping holds it
 * near 35 MB. The sky layer stays at full DPR, and it is the one carrying the crisp pinprick stars.
 */
const MAX_DISC_SIDE = 3000;

/** Tightness of the winding: r = r₀·e^(PITCH·θ). Lower winds tighter. */
const PITCH = 0.26;
/** How far each arm wraps, in radians — a bit over a full turn, so the curve is unmistakable. */
const ARM_SWEEP = 5.6;
/** Where the arms lift off the bulge, as a fraction of the disc radius. Inside the bulge's own
 *  glow, so the arms grow out of it rather than ringing it at a distance. */
const ARM_START = 0.19;
/**
 * `[angle, strength, tStart, tEnd]` — four arms spaced evenly, plus two shorter branches between
 * them.
 *
 * Arms are separated by **angle alone**: log spirals sharing a PITCH are pure rotations of one
 * another, so scaling an arm's radius would only be another way of writing an angle offset — and
 * one that quietly lands two arms on top of each other. That also means no two of these can cross.
 *
 * Each gets its own `tStart`/`tEnd` because arms all launching from one radius draw hard spokes out
 * of the bulge, which is the tell that this came out of a formula.
 */
const ARM_SET: [number, number, number, number][] = [
  [0, 1, 0, 1],
  [Math.PI * 0.5, 0.9, 0.04, 0.97],
  [Math.PI, 1, 0.02, 1],
  [Math.PI * 1.5, 0.86, 0, 0.94],
  [Math.PI * 0.28, 0.42, 0.3, 0.85],
  [Math.PI * 1.26, 0.38, 0.34, 0.9],
];
/** Samples per arm — enough that the puffs overlap into one continuous lane. */
const ARM_STEPS = 260;
/** Total growth in radius across a full sweep — the constant that makes arc-length sampling work. */
const ARM_GROWTH = Math.exp(PITCH * ARM_SWEEP);

/** One star bright enough to be worth re-lighting every frame. */
interface Twinkle {
  x: number;
  y: number;
  /** Sprite size in CSS px. */
  size: number;
  phase: number;
  speed: number;
}

export interface GalaxyScene {
  /** Deep space and the fixed foreground stars, exactly viewport-sized in CSS px. */
  sky: HTMLCanvasElement;
  /** The face-on spiral on transparent black — square, core dead centre. */
  disc: HTMLCanvasElement;
  /** Soft white dot reused for every twinkle highlight. */
  glow: HTMLCanvasElement;
  twinkles: Twinkle[];
  /** Half the disc layer's side, in CSS px. */
  discRadius: number;
  /** The point the disc turns about, in viewport CSS px. */
  pivotX: number;
  pivotY: number;
  width: number;
  height: number;
}

/** Tiny deterministic PRNG (mulberry32) — same seed, same sky, every time. */
const makeRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A soft circular puff of light — the building block for arms, bulge and dust. */
const puff = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) => {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(0.45, `rgba(${color},${alpha * 0.38})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
};

/**
 * A point on one logarithmic-spiral arm, relative to the core. `t` runs 0 (just off the bulge) → 1
 * (arm tip); `angle` picks the arm, `radiusScale` pulls a spur in tighter than its parent.
 */
const spiralPoint = (t: number, angle: number, radiusScale: number, discRadius: number) => {
  const theta = t * ARM_SWEEP;
  const r = discRadius * ARM_START * radiusScale * Math.exp(PITCH * theta);
  return [Math.cos(angle + theta) * r, Math.sin(angle + theta) * r];
};

/**
 * A smooth seeded wiggle in roughly [-1, 1]: three sines of incommensurate frequency beaten
 * together, which is enough to spoil the analytic perfection of a log spiral without dragging in a
 * real noise field. Used both to bend an arm off its ideal curve and to make it clumpy along it.
 */
const makeWobble = (random: () => number) => {
  const waves = [1.7, 3.3, 6.1].map((freq) => ({ freq, phase: random() * TAU, amp: 1 / freq }));
  const norm = waves.reduce((sum, wave) => sum + wave.amp, 0);
  return (t: number) => waves.reduce((sum, w) => sum + w.amp * Math.sin(t * w.freq + w.phase), 0) / norm;
};

/**
 * Turn a uniform `u` into a position along an arm that is even in *arc length*. Sampling the spiral
 * parameter directly instead piles points into the tightly-wound inner turn — where arc length per
 * unit parameter is smallest — and that pile-up is what reads as a straight spoke off the bulge.
 */
const alongArm = (u: number) => Math.log(1 + u * (ARM_GROWTH - 1)) / (PITCH * ARM_SWEEP);

/** Star colours, blue-white through to amber. Sampled with a heavy blue bias. */
const STAR_COLORS = ["150,182,255", "205,220,255", "255,255,255", "255,238,205", "255,200,142"];

const pickStarColor = (t: number) => {
  if (t < 0.32) return STAR_COLORS[0];
  if (t < 0.62) return STAR_COLORS[1];
  if (t < 0.84) return STAR_COLORS[2];
  if (t < 0.95) return STAR_COLORS[3];
  return STAR_COLORS[4];
};

/** One star: a bare sub-pixel dot, or — for the rare big ones — a white core inside a halo. */
const plotStar = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number, size: number) => {
  if (size < 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${color})`;
    ctx.fillRect(x, y, size * 1.5, size * 1.5);
    ctx.globalAlpha = 1;
    return;
  }

  const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
  halo.addColorStop(0, `rgba(${color},${alpha * 0.8})`);
  halo.addColorStop(0.3, `rgba(${color},${alpha * 0.22})`);
  halo.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, size * 3, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
};

/** Four fading spikes through a point — the diffraction cross on the brightest stars. */
const drawSpikes = (ctx: CanvasRenderingContext2D, x: number, y: number, length: number, alpha: number) => {
  ctx.save();
  ctx.translate(x, y);
  for (const [angle, scale] of [
    [0, 1],
    [Math.PI / 2, 1],
    [Math.PI / 4, 0.45],
    [-Math.PI / 4, 0.45],
  ]) {
    const reach = length * scale;
    ctx.save();
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(-reach, 0, reach, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.5, `rgba(255,255,255,${alpha * scale})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-reach, 0);
    ctx.lineTo(reach, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
};

/** A 64px white dot that fades to nothing — scaled and dimmed by alpha at draw time. */
const buildGlowSprite = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.16, "rgba(255,255,255,0.45)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
};

/**
 * Photographic grain. Drawn in device pixels (transform reset) so it stays 1:1 crisp on HiDPI
 * instead of being stretched by the DPR scale.
 */
const drawGrain = (ctx: CanvasRenderingContext2D, random: () => number, deviceWidth: number, deviceHeight: number) => {
  const tile = document.createElement("canvas");
  tile.width = 128;
  tile.height = 128;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return;

  const image = tileCtx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = random() * 40;
    image.data[i] = value;
    image.data[i + 1] = value * 0.95;
    image.data[i + 2] = value * 0.9;
    image.data[i + 3] = 255;
  }
  tileCtx.putImageData(image, 0, 0);

  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, deviceWidth, deviceHeight);
  ctx.restore();
};

/** The still backdrop: deep space and the foreground stars the disc turns behind. */
const buildSky = (width: number, height: number, dpr: number, random: () => number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const twinkles: Twinkle[] = [];
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, twinkles };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const diagonal = Math.hypot(width, height);

  // Deep space, with a faint blue haze low and to the right.
  ctx.fillStyle = "#020308";
  ctx.fillRect(0, 0, width, height);
  const hazeX = width * 0.78;
  const hazeY = height * 0.84;
  const haze = ctx.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, diagonal * 0.4);
  haze.addColorStop(0, "rgba(26,38,68,0.2)");
  haze.addColorStop(1, "rgba(26,38,68,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  // Foreground stars, spread evenly and kept sparser than the disc's own so the galaxy stays the
  // densest thing on screen. These never move — they are what the spin is measured against.
  ctx.globalCompositeOperation = "lighter";
  const target = Math.min(9000, Math.round((width * height) / 320));
  for (let i = 0; i < target; i++) {
    const x = random() * width;
    const y = random() * height;
    const alpha = 0.28 + random() * 0.72;
    // steep power law: nearly every star is a pinprick, a handful are large
    const size = 0.35 + Math.pow(random(), 8) * 2.4;
    plotStar(ctx, x, y, pickStarColor(random()), alpha, size);

    if (size > 1.8 && twinkles.length < 40 && random() < 0.4) {
      twinkles.push({
        x,
        y,
        size: 5 + size * 2.5,
        phase: random() * TAU,
        speed: 0.0006 + random() * 0.0012,
      });
    }
  }

  // One conspicuous star, placed clear of the disc so its spikes stay legible.
  const heroX = width * 0.16;
  const heroY = height * 0.2;
  const bloom = ctx.createRadialGradient(heroX, heroY, 0, heroX, heroY, 24);
  bloom.addColorStop(0, "rgba(255,255,255,0.95)");
  bloom.addColorStop(0.12, "rgba(226,236,255,0.45)");
  bloom.addColorStop(0.4, "rgba(190,212,255,0.1)");
  bloom.addColorStop(1, "rgba(190,212,255,0)");
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(heroX, heroY, 24, 0, TAU);
  ctx.fill();
  drawSpikes(ctx, heroX, heroY, 32, 0.7);
  twinkles.push({ x: heroX, y: heroY, size: 18, phase: 0, speed: 0.0004 });

  drawGrain(ctx, random, canvas.width, canvas.height);
  return { canvas, twinkles };
};

/**
 * The galaxy itself, drawn face-on into a transparent square so the projection at draw time is
 * free to tip it wherever it likes. Everything is additive light; the dust lanes and the rim
 * falloff are cut back out with `destination-out`, which leaves the sky showing through rather
 * than smearing an opaque black square over it.
 */
const buildDisc = (discRadius: number, dpr: number, random: () => number) => {
  const side = discRadius * 2;
  const scale = Math.min(dpr, MAX_DISC_SIDE / side);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(side * scale);
  canvas.height = Math.round(side * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const cx = discRadius;
  const cy = discRadius;

  // Each arm carries its own pair of wobbles: `drift` bends it off the ideal spiral, `patchy`
  // breaks it into brighter and fainter stretches. Both the light and the stars read from these,
  // so the stars follow the arm they belong to rather than a curve it no longer sits on.
  const arms = ARM_SET.map(([angle, strength, tStart, tEnd]) => ({
    angle,
    strength,
    tStart,
    tEnd,
    drift: makeWobble(random),
    patchy: makeWobble(random),
  }));
  type Arm = (typeof arms)[number];

  /** How far the arm has wandered off its ideal spiral at `t`, as a multiplier on its radius. */
  const armDrift = (arm: Arm, t: number) => 1 + 0.09 * arm.drift(t * 4);

  /** A point on the wobbled arm. `local` runs 0 → 1 across that arm's own stretch of the sweep. */
  const armPoint = (arm: Arm, local: number) => {
    const t = arm.tStart + (arm.tEnd - arm.tStart) * local;
    return spiralPoint(t, arm.angle, armDrift(arm, t), discRadius);
  };

  /**
   * Arm brightness along its length: up fast out of the bulge, held, then trailing away at the tip.
   * Deliberately **asymmetric** — fading at both ends leaves the arms floating as a detached ring
   * with the core stranded in the hole. The short ramp-in lands inside the bulge's glow, so the
   * junction is hidden rather than drawn.
   */
  const taper = (local: number) => {
    const ease = (x: number) => x * x * (3 - 2 * x);
    const rise = ease(Math.min(1, local / 0.12));
    const fall = ease(Math.min(1, (1 - local) / 0.45));
    return rise * fall;
  };

  // 1. A broad haze filling the disc, so the arms sit in something rather than float in a void.
  ctx.globalCompositeOperation = "lighter";
  puff(ctx, cx, cy, discRadius * 0.9, "78,96,150", 0.09);

  // 2. Arms. Overlapping puffs walked along a logarithmic spiral — warm and tight near the bulge,
  //    wide and blue by the tip, where the young stars are.
  for (const arm of arms) {
    for (let i = 0; i <= ARM_STEPS; i++) {
      const local = i / ARM_STEPS;
      const t = arm.tStart + (arm.tEnd - arm.tStart) * local;
      const [x, y] = armPoint(arm, local);
      const clump = 0.55 + 0.45 * (0.5 + 0.5 * arm.patchy(t * 9));
      const width = discRadius * (0.04 + 0.075 * t) * (0.8 + random() * 0.4);
      const color = t < 0.32 ? "255,206,152" : t < 0.66 ? "216,208,226" : "150,186,255";
      puff(ctx, cx + x, cy + y, width, color, 0.04 * arm.strength * taper(local) * clump);
    }
  }

  // 3. Star-forming knots along the arms — the bright blue clumps that stop an arm from reading as
  //    one evenly painted stroke.
  for (const arm of arms) {
    for (let i = 0; i < 14; i++) {
      const local = 0.12 + random() * 0.76;
      const [x, y] = armPoint(arm, local);
      const jitter = discRadius * 0.022;
      puff(
        ctx,
        cx + x + (random() - 0.5) * jitter,
        cy + y + (random() - 0.5) * jitter,
        discRadius * (0.016 + random() * 0.03),
        "170,200,255",
        0.09 * arm.strength * taper(local),
      );
    }
  }

  // 4. The bulge, stacked warm to white. The widest puff reaches past ARM_START so the core and the
  //    arm roots run into one another instead of leaving a gap for the eye to catch.
  puff(ctx, cx, cy, discRadius * 0.52, "204,156,108", 0.1);
  puff(ctx, cx, cy, discRadius * 0.34, "236,176,110", 0.16);
  puff(ctx, cx, cy, discRadius * 0.17, "255,214,158", 0.24);
  puff(ctx, cx, cy, discRadius * 0.075, "255,240,214", 0.34);
  puff(ctx, cx, cy, discRadius * 0.028, "255,252,244", 0.5);

  // 5. Stars, mostly clustered onto the arms — these are what make the rotation legible.
  const target = Math.min(11000, Math.round((discRadius * discRadius) / 74));
  for (let i = 0; i < target; i++) {
    let x: number;
    let y: number;
    if (random() < 0.62) {
      const arm = arms[Math.floor(random() * arms.length)];
      const local = alongArm(random());
      // thin out toward both ends, matching the light so stars never outrun their own arm
      if (random() > taper(local)) continue;
      const t = arm.tStart + (arm.tEnd - arm.tStart) * local;
      const [ax, ay] = armPoint(arm, local);
      // three uniforms ≈ a bell curve: dense on the arm, sparse either side of it
      const spread = discRadius * (0.035 + 0.07 * t);
      x = ax + ((random() + random() + random()) / 1.5 - 1) * spread;
      y = ay + ((random() + random() + random()) / 1.5 - 1) * spread;
    } else {
      const angle = random() * TAU;
      const r = discRadius * 0.92 * Math.pow(random(), 0.75);
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r;
    }

    const alpha = 0.28 + random() * 0.72;
    const size = 0.35 + Math.pow(random(), 8) * 2.2;
    plotStar(ctx, cx + x, cy + y, pickStarColor(random()), alpha, size);
  }

  // 6. Dust riding the inner edge of each grand-design arm — the dark rim that makes an arm read
  //    as an arm rather than a smear. It has to share the arm's own drift, or it cuts straight
  //    across the thing it is supposed to hug.
  ctx.globalCompositeOperation = "destination-out";
  for (const arm of arms.slice(0, 4)) {
    for (let i = 0; i <= ARM_STEPS; i++) {
      const local = i / ARM_STEPS;
      const t = arm.tStart + (arm.tEnd - arm.tStart) * local;
      // 0.9 sets the lane a tenth of a radius inside the arm — right on its inner edge, given the
      // arm is about that wide.
      const [x, y] = spiralPoint(t, arm.angle, 0.9 * armDrift(arm, t), discRadius);
      puff(ctx, cx + x, cy + y, discRadius * (0.022 + 0.035 * t), "0,0,0", 0.05 * taper(local));
    }
  }

  // 7. Erase the rim, so the square never shows a corner or an edge as it turns. Held out to 0.84
  //    so it clips the spurs — which reach ~0.95 — rather than the grand-design arms.
  const rim = ctx.createRadialGradient(cx, cy, discRadius * 0.84, cx, cy, discRadius);
  rim.addColorStop(0, "rgba(0,0,0,0)");
  rim.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, side, side);

  return canvas;
};

/** Render both layers. Called on mount and on resize only. */
export const buildGalaxy = (width: number, height: number, dpr: number): GalaxyScene => {
  const discRadius = Math.hypot(width, height) * DISC_SPAN;
  const sky = buildSky(width, height, dpr, makeRandom(SEED));

  return {
    sky: sky.canvas,
    disc: buildDisc(discRadius, dpr, makeRandom(SEED + 1)),
    glow: buildGlowSprite(),
    twinkles: sky.twinkles,
    discRadius,
    pivotX: width * CORE_X,
    pivotY: height * CORE_Y,
    width,
    height,
  };
};

/** One frame: the still sky, the disc turned a little further, then a pulse on the brightest stars. */
export const drawGalaxyFrame = (ctx: CanvasRenderingContext2D, scene: GalaxyScene, time: number) => {
  const { sky, disc, glow, twinkles, discRadius, pivotX, pivotY, width, height } = scene;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(sky, 0, 0, width, height);

  // The disc texture is face-on, so `scale(1, cos TILT)` is the orthographic projection of it
  // tipped away from the camera: points on it sweep along ellipses, quickly across the near rim
  // and slowly across the far one, which is the parallax that reads as depth. `rotate` runs inside
  // that squash (the disc turning on its own axis); ROLL runs outside it (the camera's head tilt).
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(ROLL);
  ctx.scale(1, Math.cos(TILT));
  ctx.rotate(-(time / ROTATION_PERIOD) * TAU);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(disc, -discRadius, -discRadius, discRadius * 2, discRadius * 2);
  ctx.restore();

  ctx.globalCompositeOperation = "lighter";
  for (const star of twinkles) {
    ctx.globalAlpha = 0.06 + 0.16 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));
    ctx.drawImage(glow, star.x - star.size / 2, star.y - star.size / 2, star.size, star.size);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
};
