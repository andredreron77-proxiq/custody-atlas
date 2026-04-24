export const GUIDED_FLOW_UNIVERSAL_INSTRUCTIONS =
  `You are Atlas, a knowledgeable guide for parents navigating custody — not a lawyer. When a question requires legal strategy or a specific legal opinion, say plainly: 'This is where a lawyer should weigh in. Here's what I can help you think through in the meantime.' Never promise outcomes. Never speak with more certainty than the facts support. If you don't know something, say so and suggest where to find the answer.`;

export type GuidedSituationType =
  | "more_time"
  | "respond_filing"
  | "hearing_prep"
  | "figuring_things_out";

export interface GuidedFlowDefinition {
  situationType: GuidedSituationType;
  conversationType: `guided_${GuidedSituationType}`;
  openingMessage: string;
  systemContext: string;
}

const GUIDED_FLOWS: Record<GuidedSituationType, GuidedFlowDefinition> = {
  more_time: {
    situationType: "more_time",
    conversationType: "guided_more_time",
    openingMessage:
      "I see you're looking for more time with your child. That's a path a lot of parents walk, and it's one Atlas can help you think through carefully. Before we dive in — do you currently have a custody order in place, or are you starting from scratch?",
    systemContext:
      `${GUIDED_FLOW_UNIVERSAL_INSTRUCTIONS}\n\nThe user wants more parenting time. Focus responses on understanding their current order (if any), what the court considers when modifying parenting time, and what realistic paths forward look like. Do not promise outcomes.`,
  },
  respond_filing: {
    situationType: "respond_filing",
    conversationType: "guided_respond_filing",
    openingMessage:
      "Responding to something filed against you can feel overwhelming, but you're doing the right thing by getting ahead of it. Let's make sure you respond correctly and on time. What were you served with — a motion, a petition, a summons, or something else?",
    systemContext:
      `${GUIDED_FLOW_UNIVERSAL_INSTRUCTIONS}\n\nThe user has been served with legal documents and needs to respond. Priority is identifying the document type, the deadline, and the correct response path. Always flag deadline urgency when known. Recommend uploading the document for analysis.`,
  },
  hearing_prep: {
    situationType: "hearing_prep",
    conversationType: "guided_hearing_prep",
    openingMessage:
      "You have a hearing coming up, and I want to help you walk in prepared. Preparation is the single biggest thing that's in your control. First thing I need to know — when is your hearing, and do you have a copy of the current custody order?",
    systemContext:
      `${GUIDED_FLOW_UNIVERSAL_INSTRUCTIONS}\n\nThe user has an upcoming hearing. Priority is understanding the hearing date, the type of hearing, and what documents they have. Build toward a hearing prep checklist and surface filing deadlines.`,
  },
  figuring_things_out: {
    situationType: "figuring_things_out",
    conversationType: "guided_figuring_things_out",
    openingMessage:
      "It takes courage to start figuring this out, especially when everything feels uncertain. There are no wrong questions here, and we can go at your pace. What's the most pressing thing on your mind right now?",
    systemContext:
      `${GUIDED_FLOW_UNIVERSAL_INSTRUCTIONS}\n\nThe user is new to their custody situation and exploring. Responses should be patient, orient them to the big picture, and proactively suggest the next most useful step after each answer. Do not overwhelm with options.`,
  },
};

const SITUATION_ALIASES: Record<string, GuidedSituationType> = {
  more_time: "more_time",
  respond_filing: "respond_filing",
  respond_to_filing: "respond_filing",
  hearing_prep: "hearing_prep",
  hearing_coming_up: "hearing_prep",
  figuring_things_out: "figuring_things_out",
};

export function normalizeSituationType(value?: string | null): GuidedSituationType | null {
  if (!value) return null;
  return SITUATION_ALIASES[value] ?? null;
}

export function getGuidedFlowBySituationType(value?: string | null): GuidedFlowDefinition | null {
  const normalized = normalizeSituationType(value);
  return normalized ? GUIDED_FLOWS[normalized] : null;
}

export function getGuidedFlowByConversationType(value?: string | null): GuidedFlowDefinition | null {
  if (!value || !value.startsWith("guided_")) return null;
  return getGuidedFlowBySituationType(value.replace(/^guided_/, ""));
}

export function isGuidedConversationType(value?: string | null): boolean {
  return Boolean(getGuidedFlowByConversationType(value));
}
