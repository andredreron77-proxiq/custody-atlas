/**
 * AI Entry Funnel — centralized system for triggering contextual AI questions
 * from any button or CTA across Custody Atlas.
 *
 * Usage:
 *   triggerAIEntry({ topic: "child_support", state: "Texas", county: "Harris" })
 *   → if a ChatBox is mounted: submits directly and scrolls into view
 *   → if no ChatBox: returns false so the caller can navigate to /ask
 *
 * Adding a new topic:
 *   1. Add an entry to AI_ENTRY_TOPICS below.
 *   2. Render a button that calls triggerAIEntry with your topic key.
 *   That's it — no other changes needed.
 */

// ── Extensible topic → question template map ─────────────────────────────────

/**
 * Map of topic keys to natural-language question templates.
 * Use {state} and {county} as placeholders — they are filled at runtime.
 * Add new entries here to support new AI entry points anywhere in the app.
 */
export const AI_ENTRY_TOPICS: Record<string, string> = {
  child_support:
    "How does child support work in {state}, and how is it affected by custody arrangements?",
  relocation:
    "What are the rules for relocating out of state with my child in {state}?",
  joint_custody:
    "How does joint custody work in {state}, and what factors do courts consider when granting it?",
  custody_modification:
    "How do I modify an existing custody order in {state}, and what grounds do courts typically require?",
  visitation:
    "What are my visitation rights if I'm not the primary custodial parent in {state}?",
  domestic_violence:
    "How does a history of domestic violence affect custody decisions in {state}?",
  grandparent_rights:
    "Do grandparents have any custody or visitation rights in {state}?",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIEntryParams {
  /**
   * Key from AI_ENTRY_TOPICS, or any custom string if questionTemplate is provided.
   * Used for analytics and thread labeling.
   */
  topic: string;
  /** State name (e.g. "Texas") — replaces {state} in the template. */
  state?: string;
  /** County name — replaces {county} in the template (optional). */
  county?: string;
  /**
   * Override the default template for this topic.
   * If omitted, the template from AI_ENTRY_TOPICS[topic] is used.
   */
  questionTemplate?: string;
  /**
   * Whether to auto-submit the question immediately.
   * Set to false to populate the chat input without submitting.
   * Default: true.
   */
  autoSubmit?: boolean;
}

// ── Question builder ──────────────────────────────────────────────────────────

/** Builds the final natural-language question from an AIEntryParams object. */
export function buildAIEntryQuestion(params: AIEntryParams): string {
  const template =
    params.questionTemplate ??
    AI_ENTRY_TOPICS[params.topic] ??
    `Tell me about ${params.topic.replace(/_/g, " ")} custody law in {state}.`;

  return template
    .replace(/\{state\}/g, params.state ?? "my state")
    .replace(/\{county\}/g, params.county ?? "");
}

// ── Module-level handler registry ─────────────────────────────────────────────
//
// At most one ChatBox is active at a time. It registers on mount and
// unregisters on unmount. This keeps the design simple — no React context
// or Zustand needed.

type SubmitFn = (question: string) => void;
type ScrollFn = () => void;

let _submitHandler: SubmitFn | null = null;
let _scrollHandler: ScrollFn | null = null;

/** Called by ChatBox on mount to register itself as the active handler. */
export function registerChatBoxHandler(submitFn: SubmitFn, scrollFn: ScrollFn): void {
  _submitHandler = submitFn;
  _scrollHandler = scrollFn;
}

/** Called by ChatBox on unmount. */
export function unregisterChatBoxHandler(): void {
  _submitHandler = null;
  _scrollHandler = null;
}

// ── Primary trigger ───────────────────────────────────────────────────────────

/**
 * Trigger an AI entry point.
 *
 * @returns `true` if a ChatBox was active and handled the request.
 *          `false` if no ChatBox is mounted — the caller should navigate to /ask.
 */
export function triggerAIEntry(params: AIEntryParams): boolean {
  _logAIEntry(params);

  if (!_submitHandler) return false;

  const question = buildAIEntryQuestion(params);

  // Scroll the ChatBox into view first so the transition feels smooth.
  if (_scrollHandler) _scrollHandler();

  if (params.autoSubmit !== false) {
    // Small delay so the scroll animation starts before the loading state renders.
    setTimeout(() => _submitHandler?.(question), 150);
  }

  return true;
}

/**
 * Build the fallback /ask URL including the pre-filled question and topic.
 * Used when triggerAIEntry returns false (no ChatBox mounted on the current page).
 */
export function buildAskURL(params: AIEntryParams): string {
  const base = "/ask";
  const q = buildAIEntryQuestion(params);
  const parts: string[] = [];
  if (params.state) parts.push(`state=${encodeURIComponent(params.state)}`);
  if (params.county) parts.push(`county=${encodeURIComponent(params.county)}`);
  parts.push(`q=${encodeURIComponent(q)}`);
  parts.push(`topic=${encodeURIComponent(params.topic)}`);
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}

// ── Analytics (lightweight) ───────────────────────────────────────────────────

interface AIEntryLogEntry {
  topic: string;
  state: string | null;
  timestamp: string;
}

function _logAIEntry(params: AIEntryParams): void {
  const entry: AIEntryLogEntry = {
    topic: params.topic,
    state: params.state ?? null,
    timestamp: new Date().toISOString(),
  };
  console.log("[AIEntry]", entry);
  try {
    const raw = localStorage.getItem("_ai_entry_log");
    const log: AIEntryLogEntry[] = raw ? (JSON.parse(raw) as AIEntryLogEntry[]) : [];
    log.push(entry);
    // Keep last 100 entries to avoid unbounded growth.
    localStorage.setItem("_ai_entry_log", JSON.stringify(log.slice(-100)));
  } catch {
    // Ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
}
