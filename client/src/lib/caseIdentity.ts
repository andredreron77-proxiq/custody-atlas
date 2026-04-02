const CASE_ACCENTS = [
  {
    border: "border-l-sky-500 dark:border-l-sky-400",
    bg: "bg-sky-50/80 dark:bg-sky-950/20",
    chip: "border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:bg-sky-950/40",
    dot: "bg-sky-500 dark:bg-sky-400",
    avatar: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  {
    border: "border-l-violet-500 dark:border-l-violet-400",
    bg: "bg-violet-50/80 dark:bg-violet-950/20",
    chip: "border-violet-200 text-violet-700 bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:bg-violet-950/40",
    dot: "bg-violet-500 dark:bg-violet-400",
    avatar: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/20",
    chip: "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40",
    dot: "bg-emerald-500 dark:bg-emerald-400",
    avatar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  {
    border: "border-l-amber-500 dark:border-l-amber-400",
    bg: "bg-amber-50/80 dark:bg-amber-950/20",
    chip: "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/40",
    dot: "bg-amber-500 dark:bg-amber-400",
    avatar: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    border: "border-l-rose-500 dark:border-l-rose-400",
    bg: "bg-rose-50/80 dark:bg-rose-950/20",
    chip: "border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:bg-rose-950/40",
    dot: "bg-rose-500 dark:bg-rose-400",
    avatar: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
] as const;

export function getCaseInitials(caseTitle: string): string {
  const words = caseTitle.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "CA";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? "C"}${words[1][0] ?? "A"}`.toUpperCase();
}

export function getCaseAccent(caseId: string | null | undefined) {
  if (!caseId) {
    return {
      border: "border-l-slate-300 dark:border-l-slate-700",
      bg: "bg-muted/30",
      chip: "border-border text-muted-foreground bg-muted/30",
      dot: "bg-slate-400 dark:bg-slate-500",
      avatar: "bg-muted text-muted-foreground",
    };
  }

  let hash = 0;
  for (let i = 0; i < caseId.length; i += 1) {
    hash = (hash * 31 + caseId.charCodeAt(i)) >>> 0;
  }
  return CASE_ACCENTS[hash % CASE_ACCENTS.length];
}
