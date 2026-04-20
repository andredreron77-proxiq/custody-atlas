export const CUSTODY_GLOSSARY: Record<string, string> = {
  GAL: "Guardian ad Litem — a court-appointed person who represents the child's best interests",
  TRO: "Temporary Restraining Order — an emergency court order",
  motion: "a formal written request asking the court to do something",
  petition: "a formal document that starts a court case or requests court action",
  modification: "a legal request to change an existing court order",
  contempt: "violation of a court order, which can result in fines or jail time",
  stipulation: "a written agreement between both parties that the court approves",
  deposition: "sworn out-of-court testimony recorded for use in court",
  discovery: "the legal process of gathering evidence before trial",
  jurisdiction: "which court has the authority to hear your case",
  "parenting plan": "a detailed document outlining custody and visitation arrangements",
  "legal custody": "the right to make major decisions about your child's life",
  "physical custody": "where the child primarily lives",
  visitation: "scheduled time a non-custodial parent spends with their child",
  "child support": "court-ordered payments from one parent to support the child",
};

export function injectGlossaryDefinitions(
  response: string,
  knowledgeLevel: "beginner" | "intermediate" | "advanced",
): string {
  if (knowledgeLevel !== "beginner") {
    return response;
  }

  return response;
}
