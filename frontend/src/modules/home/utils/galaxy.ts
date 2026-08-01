/**
 * Procedural Milky Way for the home screen, drawn with Canvas 2D.
 *
 * The whole sky — nebula band, dust lanes, stars, grain — is rendered **once** into an offscreen
 * layer, which the per-frame loop then turns very slowly about the galactic core. Nothing is
 * re-generated while it spins, so an idle home screen costs one rotated `drawImage` plus a handful
 * of sprite blits.
 */

const TAU = Math.PI * 2;

/** Tilt of the galactic band: lower-left → upper-right, ~35° above horizontal. */
const BAND_ANGLE = -0.62;

/** Where the band's bright core sits, as a fraction of the viewport. */
const CORE_X = 0.52;
const CORE_Y = 0.55;

/** Fixed seed — the sky must be identical across reloads and resizes. */
const SEED = 20260731;

/** Overall size of the galaxy relative to the frame. Scales the band, the dust and the star field
 *  together, so the whole thing stays in proportion when tuned. */
const GALAXY_SCALE = 0.8;

/** Milliseconds for one full turn of the sky. Slow enough to read as drift rather than spin: at
 *  twelve minutes a star near the frame edge creeps by ~8px/s. */
const ROTATION_PERIOD = 720_000;

/**
 * Device-pixel ceiling for one side of the sky layer. Because the layer has to be the square that
 * covers the viewport at *every* angle, it is 2–3× the viewport's area — at full DPR a 1080p screen
 * would want an 85 MB canvas. Capping the side trades a little sharpness (the layer is upscaled on
 * the way out) for a bounded ~45 MB, and keeps it clear of Safari's canvas-area limit. Rotation
 * resamples the sky anyway, so the softening barely shows.
 */
const MAX_LAYER_SIDE = 3400;

/** One star bright enough to be worth re-lighting every frame. Positioned relative to the core, so
 *  it can be blitted inside the same rotated transform as the sky it belongs to. */
interface Twinkle {
  x: number;
  y: number;
  /** Sprite size in CSS px. */
  size: number;
  phase: number;
  speed: number;
}

export interface GalaxyScene {
  /** The pre-rendered sky: a `2 × radius` square in CSS px, with the core dead centre. */
  layer: HTMLCanvasElement;
  /** Soft white dot reused for every twinkle highlight. */
  glow: HTMLCanvasElement;
  twinkles: Twinkle[];
  /** Half the layer's side — far enough to reach the viewport's furthest corner from the core. */
  radius: number;
  /** The point the sky turns about, in viewport CSS px. */
  pivotX: number;
  pivotY: number;
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

/**
 * An elliptical radial-gradient blob placed in the band's frame of reference: `u` runs along the
 * band axis, `v` across it, `flat` squashes the circle into the band's proportions, and `tilt`
 * rotates it off the axis (how the dust lanes cut across).
 */
const blob = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  u: number,
  v: number,
  radius: number,
  flat: number,
  tilt: number,
  color: string,
  alpha: number,
) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(BAND_ANGLE);
  ctx.translate(u, v);
  ctx.rotate(tilt);
  ctx.scale(1, flat);

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(0.5, `rgba(${color},${alpha * 0.42})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
};

/**
 * The band, as overlapping blobs stacked additively. The colours are **saturated** on purpose: a
 * broad warm wash sets the hue, brighter tan blobs build the bulge, and only the extreme ends go
 * cool. Stacking near-neutral greys instead — the obvious first guess — sums straight to grey fog
 * and loses the photo entirely, so keep R well clear of B here.
 * `[u, v, radius, flat, rgb, alpha]`, distances as a fraction of the frame diagonal.
 */
const BAND: [number, number, number, number, string, number][] = [
  [0.0, 0.0, 0.5, 0.3, "196,138,84", 0.15],
  [-0.46, 0.005, 0.26, 0.22, "88,108,150", 0.085],
  [-0.24, 0.0, 0.24, 0.24, "176,132,96", 0.16],
  [-0.09, 0.005, 0.2, 0.22, "228,168,106", 0.2],
  [0.0, 0.0, 0.14, 0.26, "246,198,140", 0.22],
  [0.02, 0.005, 0.075, 0.4, "255,226,182", 0.24],
  [0.03, 0.0, 0.035, 0.55, "255,246,226", 0.2],
  [0.19, -0.005, 0.22, 0.24, "182,146,116", 0.16],
  [0.42, 0.0, 0.26, 0.22, "94,112,152", 0.085],
];

/**
 * Dark dust cutting through the band. Hand-placed rather than randomised — these are the specific
 * wisps that give the reference photo its shape, including the near-perpendicular finger left of
 * the core. Browner than the sky behind them, which is what reads as dust rather than a hole.
 * `[u, v, radius, flat, tilt, rgb, alpha]`.
 */
const DUST: [number, number, number, number, number, string, number][] = [
  [-0.12, -0.05, 0.3, 0.1, 0.05, "20,13,11", 0.92],
  [0.13, 0.042, 0.26, 0.085, -0.06, "16,11,10", 0.85],
  [-0.32, 0.018, 0.22, 0.12, 0.1, "26,17,13", 0.72],
  [-0.06, 0.075, 0.17, 0.11, -0.28, "20,13,11", 0.68],
  [-0.07, -0.015, 0.075, 0.3, 1.3, "14,9,9", 0.7],
  [0.06, -0.03, 0.1, 0.24, 0.95, "18,12,11", 0.5],
  [0.3, -0.028, 0.18, 0.1, 0.18, "26,17,13", 0.6],
  [-0.2, 0.05, 0.13, 0.14, 0.35, "16,11,10", 0.55],
];

/** Star colours, blue-white through to amber. Sampled with a heavy blue bias. */
const STAR_COLORS = ["150,182,255", "205,220,255", "255,255,255", "255,238,205", "255,200,142"];

const pickStarColor = (t: number) => {
  if (t < 0.32) return STAR_COLORS[0];
  if (t < 0.62) return STAR_COLORS[1];
  if (t < 0.84) return STAR_COLORS[2];
  if (t < 0.95) return STAR_COLORS[3];
  return STAR_COLORS[4];
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
const drawGrain = (
  ctx: CanvasRenderingContext2D,
  random: () => number,
  deviceWidth: number,
  deviceHeight: number,
) => {
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

/**
 * Render the whole sky into an offscreen layer. Called on mount and on resize only.
 *
 * The layer is a square centred on the galactic core, big enough that the viewport's furthest
 * corner stays inside it however far the sky has turned — so everything below is drawn in *layer*
 * coordinates, with `offsetX/offsetY` mapping the composed-for-the-viewport positions across.
 */
export const buildGalaxy = (width: number, height: number, dpr: number): GalaxyScene => {
  const pivotX = width * CORE_X;
  const pivotY = height * CORE_Y;
  // Furthest corner, plus a hair so the layer's own edge never grazes into view.
  const radius =
    Math.max(
      Math.hypot(pivotX, pivotY),
      Math.hypot(width - pivotX, pivotY),
      Math.hypot(pivotX, height - pivotY),
      Math.hypot(width - pivotX, height - pivotY),
    ) + 4;
  const side = radius * 2;
  const scale = Math.min(dpr, MAX_LAYER_SIDE / side);

  const layer = document.createElement("canvas");
  layer.width = Math.round(side * scale);
  layer.height = Math.round(side * scale);
  const ctx = layer.getContext("2d");
  const twinkles: Twinkle[] = [];
  const scene: GalaxyScene = { layer, glow: buildGlowSprite(), twinkles, radius, pivotX, pivotY };
  if (!ctx) return scene;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const random = makeRandom(SEED);
  const cx = radius;
  const cy = radius;
  const offsetX = radius - pivotX;
  const offsetY = radius - pivotY;
  const diagonal = Math.hypot(width, height);

  // 1. Deep space, with the reference photo's faint blue haze in the lower right.
  ctx.fillStyle = "#020308";
  ctx.fillRect(0, 0, side, side);
  const hazeX = offsetX + width * 0.78;
  const hazeY = offsetY + height * 0.84;
  const haze = ctx.createRadialGradient(hazeX, hazeY, 0, hazeX, hazeY, diagonal * 0.4);
  haze.addColorStop(0, "rgba(26,38,68,0.2)");
  haze.addColorStop(1, "rgba(26,38,68,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, side, side);

  const span = diagonal * GALAXY_SCALE;

  // 2. The band, stacked additively so the overlaps brighten toward the core.
  ctx.globalCompositeOperation = "lighter";
  for (const [u, v, radius, flat, color, alpha] of BAND) {
    blob(ctx, cx, cy, u * span, v * span, radius * span, flat, 0, color, alpha);
  }

  // 3. Dust lanes, painted back over the band.
  ctx.globalCompositeOperation = "source-over";
  for (const [u, v, radius, flat, tilt, color, alpha] of DUST) {
    blob(ctx, cx, cy, u * span, v * span, radius * span, flat, tilt, color, alpha);
  }

  // 4. Stars. Two thirds are drawn from the band (uniform along the axis, Gaussian across it) so
  //    the field thins out naturally toward the corners; the rest fill the whole frame.
  ctx.globalCompositeOperation = "lighter";
  const target = Math.min(24000, Math.round((side * side) / 190));
  const spread = height * 0.34 * GALAXY_SCALE;
  const reach = span * 0.62;
  const cos = Math.cos(BAND_ANGLE);
  const sin = Math.sin(BAND_ANGLE);

  let placed = 0;
  for (let attempt = 0; placed < target && attempt < target * 6; attempt++) {
    let x: number;
    let y: number;
    if (random() < 0.78) {
      const u = (random() * 2 - 1) * reach;
      // three uniforms ≈ a bell curve: dense on the axis, sparse at the band's edges
      const v = ((random() + random() + random()) / 1.5 - 1) * spread;
      x = cx + u * cos - v * sin;
      y = cy + u * sin + v * cos;
    } else {
      x = random() * side;
      y = random() * side;
    }
    if (x < 0 || y < 0 || x > side || y > side) continue;
    placed++;

    const color = pickStarColor(random());
    const alpha = 0.28 + random() * 0.72;
    // steep power law: nearly every star is a pinprick, a handful are large
    const radius = 0.35 + Math.pow(random(), 8) * 2.4;

    if (radius < 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${color})`;
      ctx.fillRect(x, y, radius * 1.5, radius * 1.5);
      continue;
    }

    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
    halo.addColorStop(0, `rgba(${color},${alpha * 0.8})`);
    halo.addColorStop(0.3, `rgba(${color},${alpha * 0.22})`);
    halo.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = Math.min(1, alpha + 0.3);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (radius > 1.8 && twinkles.length < 55 && random() < 0.4) {
      twinkles.push({
        x: x - cx,
        y: y - cy,
        size: 5 + radius * 2.5,
        phase: random() * TAU,
        speed: 0.0006 + random() * 0.0012,
      });
    }
  }
  ctx.globalAlpha = 1;

  // 5. The one conspicuous star upper-left of the core.
  const heroX = offsetX + width * 0.38;
  const heroY = offsetY + height * 0.27;
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
  twinkles.push({ x: heroX - cx, y: heroY - cy, size: 18, phase: 0, speed: 0.0004 });

  // 6. Grain over everything.
  drawGrain(ctx, random, layer.width, layer.height);

  return scene;
};

/**
 * One frame: the sky turned a little further about its core, plus a gentle pulse on the brightest
 * stars. The layer is opaque and always overhangs the viewport, so there is nothing to clear first.
 */
export const drawGalaxyFrame = (ctx: CanvasRenderingContext2D, scene: GalaxyScene, time: number) => {
  const { layer, glow, twinkles, radius, pivotX, pivotY } = scene;

  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(-(time / ROTATION_PERIOD) * TAU); // counter-clockwise, like the northern sky

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, -radius, -radius, radius * 2, radius * 2);

  // Twinkles ride along inside the rotation — their coordinates are already core-relative.
  ctx.globalCompositeOperation = "lighter";
  for (const star of twinkles) {
    ctx.globalAlpha = 0.06 + 0.16 * (0.5 + 0.5 * Math.sin(time * star.speed + star.phase));
    ctx.drawImage(glow, star.x - star.size / 2, star.y - star.size / 2, star.size, star.size);
  }

  ctx.restore();
};
