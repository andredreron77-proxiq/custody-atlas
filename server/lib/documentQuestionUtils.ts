/** Heuristic detector for direct, document-fact retrieval questions. */
export function isDirectFactQuestion(question: string): boolean {
  const q = question.toLowerCase().trim();
  if (!q) return false;

  const factSignals = [
    "date", "dates", "hearing date", "filed", "when",
    "case number", "docket", "judge name", "court", "address",
    "filing party", "opposing party", "petitioner", "respondent", "deadline",
    "what is", "does it say", "is there", "are there", "listed",
  ];

  return factSignals.some((signal) => q.includes(signal));
}
