export const SUGGESTIONS = [
  { title: "Explain a concept", prompt: "Explain quantum computing in simple terms" },
  { title: "Plan my studies", prompt: "Create a one-week study plan for learning React" },
  { title: "Summarize a topic", prompt: "Summarize the main causes of World War I" },
  { title: "Practice questions", prompt: "Give me 5 practice questions on basic calculus" },
] as const;

export const MAX_TEXTAREA_HEIGHT_PX = 160; // ~6 rows
export const AUTOSCROLL_THRESHOLD_PX = 80;

export const GROUPS = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"] as const;
