export const SUGGESTIONS = [
  { title: "Explain a concept", prompt: "Explain quantum computing in simple terms" },
  { title: "Plan my studies", prompt: "Create a one-week study plan for learning React" },
  { title: "Summarize a topic", prompt: "Summarize the main causes of World War I" },
  { title: "Practice questions", prompt: "Give me 5 practice questions on basic calculus" },
] as const;

export const MAX_TEXTAREA_HEIGHT_PX = 160; // ~6 rows
export const AUTOSCROLL_THRESHOLD_PX = 80;

/**
 * Smooth-reveal tuning. Tokens arrive from the network in uneven bursts, so instead of painting
 * them as they land we reveal the received text toward the user on a requestAnimationFrame loop,
 * advancing a character cursor each frame. The step is a fraction of the un-revealed backlog, so
 * it speeds up when behind and eases to a readable pace as it catches up — decoupling the reveal
 * from network jitter, the way ChatGPT/Gemini read.
 */
export const STREAM_REVEAL_DIVISOR = 6; // backlog fraction revealed per frame; higher = gentler/slower
export const STREAM_MIN_CHARS_PER_FRAME = 2; // floor so the reveal never stalls on a small backlog

export const GROUPS = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"] as const;
