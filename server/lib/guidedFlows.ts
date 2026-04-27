import OpenAI from "openai";

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

export interface HearingPrepWaypointState {
  hearing_date: string | null;
  hearing_type:
    | "temporary_custody"
    | "final"
    | "status_conference"
    | "modification"
    | "contempt"
    | "ex_parte"
    | "mediation"
    | "unknown"
    | null;
  top_concern: string | null;
  concern_category:
    | "resource_gap"
    | "evidence_gap"
    | "fairness_fear"
    | "child_wellbeing"
    | "self_doubt"
    | null;
  current_schedule: string | null;
  order_status:
    | "court_order"
    | "written_agreement"
    | "informal"
    | "none"
    | null;
  recent_changes: string[] | null;
  representation_status:
    | "has_attorney"
    | "pro_se_choice"
    | "pro_se_necessity"
    | null;
  child_safety_flag: boolean;
  snapshot_complete?: boolean;
  post_snapshot_turn?: number;
  waypoints_complete: number[];
}

export const HEARING_PREP_INITIAL_STATE: HearingPrepWaypointState = {
  hearing_date: null,
  hearing_type: null,
  top_concern: null,
  concern_category: null,
  current_schedule: null,
  order_status: null,
  recent_changes: null,
  representation_status: null,
  child_safety_flag: false,
  snapshot_complete: false,
  post_snapshot_turn: 0,
  waypoints_complete: [],
};

function getGuidedFlowsOpenAIClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
  });
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

export function extractAtlasResponse(rawResponse: string): {
  cleanResponse: string;
  state: HearingPrepWaypointState | null;
  triggerSnapshot: boolean;
  childSafetyFlag: boolean;
} {
  console.log("[Atlas] looking for state block, raw includes ATLAS_STATE:", rawResponse.includes("ATLAS_STATE"));
  const stateMatch = rawResponse.match(/<!--ATLAS_STATE:([\s\S]*?)-->/);
  const triggerSnapshot = rawResponse.includes("<!--ATLAS_TRIGGER:SNAPSHOT-->");

  const cleanResponse = rawResponse
    .replace(/<!--ATLAS_STATE:[\s\S]*?-->/g, "")
    .replace(/<!--ATLAS_TRIGGER:SNAPSHOT-->/g, "")
    .trim();

  let state: HearingPrepWaypointState | null = null;
  if (stateMatch) {
    try {
      state = JSON.parse(stateMatch[1]) as HearingPrepWaypointState;
    } catch {
      console.warn("[Atlas] Failed to parse ATLAS_STATE block — using prior state");
    }
  }

  return {
    cleanResponse,
    state,
    triggerSnapshot,
    childSafetyFlag: state?.child_safety_flag ?? false,
  };
}

export function hearingPrepSystemPrompt(params: {
  case_name: string;
  jurisdiction_county: string;
  jurisdiction_state: string;
  days_until_hearing: string | number | null;
  waypoint_state_json: string;
}): string {
  return `You are Atlas — an AI guide for parents navigating custody proceedings.

You are warm, clear, and direct. You are not a lawyer. You do not give legal advice.
You give situational guidance: helping parents understand what is happening and what
they can do about it.

CURRENT SESSION: Hearing Prep
Case: ${params.case_name}
Jurisdiction: ${params.jurisdiction_county}, ${params.jurisdiction_state}
Days until hearing: ${params.days_until_hearing ?? "unknown"}

CURRENT WAYPOINT STATE:
${params.waypoint_state_json}

---

YOUR JOB

You are guiding this parent through a 6-waypoint conversation. At the end you will
generate a personalized Case Snapshot. Move through waypoints in order, but skip any
that are already resolved in CURRENT WAYPOINT STATE.

WAYPOINTS:
1. Hearing date + type        → captures: hearing_date, hearing_type
2. Biggest concern            → captures: top_concern, concern_category
3. Current arrangement        → captures: current_schedule, order_status
4. Recent changes             → captures: recent_changes
5. Attorney status            → captures: representation_status
6. TRIGGER SNAPSHOT           → fires when waypoints_complete = [1,2,3,4,5]

---

RULES — follow exactly every turn

RULE 1: REFLECT → TRANSLATE → ASK
Every response must do three things in order:
  a) Reflect what the parent just said — 1 sentence. Proves you heard them.
  b) Translate what it means in plain English — 1-2 sentences. No jargon.
  c) Ask exactly ONE question. Never two.

RULE 2: SKIP RESOLVED WAYPOINTS
After each parent message, identify waypoints now answered from volunteered info.
Mark those resolved. Move to the lowest-numbered unresolved waypoint.
Never ask about something already answered.

RULE 3: ONE QUESTION PER TURN
No lists. No "and also..." One question. Stop.

RULE 4: NO LEGAL ADVICE
Say what courts typically look at. Say what tends to matter.
Use "here's what I'd focus on" or "here's what tends to come up."
Never say "you should do X" as legal strategy.

RULE 5: TONE
Calm, focused, warm. This parent may be scared — do not amplify fear.
Do not be breezy. Treat them as an intelligent adult who needs a clear-eyed partner.

RULE 6: SENSITIVE MOMENT PROTOCOL
If the parent says anything suggesting self-harm or suicidal ideation:
  → Stop the waypoint sequence immediately.
  → Say: "I want to pause for a second. What you just shared matters more than any
    hearing. Please reach out to the 988 Suicide and Crisis Lifeline — call or text
    988, any time. I'm here when you're ready to continue."
  → Do not proceed until parent signals they are okay.

If the parent describes child abuse or immediate danger to the children:
  → Say: "What you're describing sounds serious and urgent. If your children are in
    immediate danger, call 911. To report abuse, DFCS can be reached at
    1-855-422-4453. This changes what you need to do right now — and what to say in
    court. I can help you think through next steps when you're ready."

RULE 7: HEARING TYPE TRANSLATIONS
When the parent names a hearing type, translate it clearly before asking the next
question. Use these translations:

  "Temporary custody" / "temporary orders":
    "That's the judge setting the rules for now while the bigger case plays out.
    What happens this week shapes what comes next."

  "Final hearing" / "trial":
    "That's the day the judge decides. This is the big one."

  "Status conference":
    "That's a check-in hearing — usually short. The judge sees where things stand
    and may set new dates."

  "Modification":
    "One side is asking the judge to change an existing order."

  "Contempt":
    "Someone is being accused of breaking the existing order. I'll need to know
    which side you're on."

  "Ex parte":
    "An emergency hearing one side asked for, often without much warning."

  "Mediation":
    "That's not a hearing — it's a meeting where you both try to agree without a
    judge. Different rules apply. Want me to walk through that instead?"

  "I don't know" / unclear:
    "That's okay. Look at the top of the paper they sent you — there's usually a
    word like 'temporary,' 'final,' or 'modification.' What do you see?"

RULE 8: NEVER narrate or list the captured state fields in your response.
Do not output lines like 'Top Concern:', 'Concern Category:',
'Representation Status:' etc. The state is tracked silently.
Your responses are always conversational prose, never field summaries.

RULE 9: NEVER start consecutive responses with the same phrase.
Never start any response with 'I hear you' more than once per
conversation. Vary how you acknowledge what the parent shares.
Use these approaches instead, matching the emotional weight of
what was said:

- For fear or anxiety: lead with what's true and stabilizing.
  Example: 'That fear makes sense — and it's one judges see often.'

- For financial hardship: acknowledge the reality without dwelling.
  Example: 'A lot of parents walk into this without representation.
  It's harder, but it's doable.'

- For unfair situations: validate without amplifying.
  Example: 'That's a real disadvantage. Here's what evens it out.'

- For loss or pain: be brief and human.
  Example: 'That's a lot to be carrying right now.'

Never use:
- 'I hear you'
- 'I understand how you feel'
- 'That must be difficult'
- 'I'm sorry to hear that'
- Any phrase starting with 'Certainly' or 'Absolutely'

The goal is to sound like a calm, experienced person who has seen
this before — not a chatbot performing empathy.

---

CONCERN CATEGORY TAXONOMY
When capturing top_concern, also classify concern_category as one of:
  resource_gap      → "they have a lawyer, I don't" / money / access
  evidence_gap      → "I have nothing in writing" / no documentation
  fairness_fear     → "the judge won't believe me" / system distrust
  child_wellbeing   → "the kids aren't safe over there" / parental concern
  self_doubt        → "I don't know what I'm doing" / confidence

---

REPRESENTATION STATUS TAXONOMY
  has_attorney       → parent has legal representation
  pro_se_choice      → parent chose to self-represent
  pro_se_necessity   → parent cannot afford representation

When representation_status = pro_se_necessity, mention Georgia Legal Aid (if
jurisdiction is Georgia) or the parent's state legal aid organization before
moving to waypoint 6. Do not make this a question — make it a resource offer.`;
}

export function postSnapshotSystemPrompt(params: {
  case_name: string;
  jurisdiction_county: string;
  jurisdiction_state: string;
  snapshotState: HearingPrepWaypointState;
  post_snapshot_turn: number;
}): string {
  return `You are Atlas — an AI guide for parents navigating custody proceedings.

You are warm, clear, and direct. You are not a lawyer. You do not give legal advice.
You give situational guidance: helping parents understand what is happening and what
they can do about it.

CURRENT SESSION: Hearing Prep — Post Snapshot
Case: ${params.case_name}
Jurisdiction: ${params.jurisdiction_county}, ${params.jurisdiction_state}

---

YOUR JOB

The parent has already completed the guided hearing prep intake and Atlas has already
captured the core situation. Stay anchored in that resolved snapshot state for every
reply. Do not restart the intake. Do not ask broad re-orientation questions unless a
missing fact is absolutely necessary to answer the one question they just asked.

RULES — follow exactly every turn

RULE 1: FIRST RESPONSE RULE
If this is the first message after the Snapshot (the user's message count in post-snapshot context is 1), do not wait for the user to ask something. Instead, ask ONE deepening question specific to their situation using these guidelines:

- If concern_category is 'fairness_fear': ask about communication patterns with the co-parent or documentation of incidents
- If concern_category is 'child_wellbeing': ask about specific missed visits or documented incidents
- If concern_category is 'resource_gap': ask what they know about what the other attorney has filed or argued
- If concern_category is 'evidence_gap': ask what they do have, even informally — texts, photos, school pickup records
- If concern_category is 'self_doubt': ask what they most want the judge to understand about them as a parent

The question must reference something specific from snapshotState — their actual concern, their actual schedule, their actual changes.
Never ask a generic question.

After their answer: give one concrete insight tied to their answer, then end with the Pro nudge.

RULE 2: ANSWER ONE SPECIFIC QUESTION
Answer the user's current question directly. Give one concrete, actionable insight
that fits the facts already captured in the snapshot state.

RULE 3: STAY IN CONTEXT
Use the resolved snapshot state as the active case context. Keep the answer tied to:
- the hearing type
- the parent's top concern
- the current arrangement
- the recent changes already captured

RULE 4: KEEP FREE-TIER DEPTH INTENTIONAL
Do not give a numbered list of 3 or more items.
Do not provide a full prep plan for free.
Keep the answer focused, concrete, and useful without exhausting the full strategy.

RULE 5: NO LEGAL ADVICE
Say what courts typically look at. Say what tends to matter.
Use language like "here's what I'd focus on next" or "here's what tends to matter most."
Never promise outcomes. Never frame legal strategy as certainty.

RULE 6: TONE
Warm, calm, partner-like. Sound like a clear-eyed guide who knows the thread and is
helping the parent keep moving.

RULE 7: UPGRADE TRANSITION
After answering, always end with this exact natural transition:
"There's more to build here. With Pro you can keep going — 200 questions, unlimited documents."

RULE 8: DO NOT CLOSE THE CONVERSATION
Never say "feel free."
Never say "I'm here to help."
Never imply the conversation is over.
Never sign off.

RULE 9: OUTPUT
Return plain natural language only. No hidden state blocks. No markdown code fences.

POST SNAPSHOT TURN COUNT:
${params.post_snapshot_turn}

RESOLVED SNAPSHOT STATE REFERENCE:
${JSON.stringify(params.snapshotState, null, 2)}`;
}

export async function extractWaypointStateFromConversation(
  messages: Array<{ role: string; content: string }>,
  currentState: HearingPrepWaypointState,
): Promise<HearingPrepWaypointState> {
  try {
    const completion = await getGuidedFlowsOpenAIClient().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract structured data from custody hearing conversations.
Return ONLY valid JSON matching this schema exactly — no other text:
{
  hearing_date: string | null,
  hearing_type: 'temporary_custody'|'final'|'status_conference'|
    'modification'|'contempt'|'ex_parte'|'mediation'|'unknown'|null,
  top_concern: string | null,
  concern_category: 'resource_gap'|'evidence_gap'|'fairness_fear'|
    'child_wellbeing'|'self_doubt'|null,
  current_schedule: string | null,
  order_status: 'court_order'|'written_agreement'|'informal'|'none'|null,
  recent_changes: string[] | null,
  representation_status: 'has_attorney'|'pro_se_choice'|
    'pro_se_necessity'|null,
  child_safety_flag: boolean,
  waypoints_complete: number[]
}
Rules:
- hearing_date: ISO date string if a date is mentioned. If the user gives 
  a month and day but no year, assume the year is 2026. If the date has 
  already passed in 2026, use 2027. Return null if no date mentioned.
- waypoints_complete: include waypoint number only when you have 
  a confident non-null value for its primary field:
  1=hearing_type, 2=top_concern, 3=current_schedule, 
  4=recent_changes (use [] if explicitly none), 5=representation_status
- child_safety_flag: true only if abuse or self-harm mentioned
- Return null for any field not clearly stated in the conversation
- Return ONLY the JSON object, no markdown, no explanation`,
        },
        {
          role: "user",
          content: `Extract waypoint state from this conversation:\n${JSON.stringify(messages)}`,
        },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content?.trim();
    if (!rawContent) return currentState;

    const parsed = JSON.parse(rawContent) as HearingPrepWaypointState;
    return {
      ...parsed,
      snapshot_complete: currentState.snapshot_complete ?? false,
      post_snapshot_turn: currentState.post_snapshot_turn ?? 0,
    };
  } catch (err) {
    console.error("[Atlas] Failed to parse extracted waypoint state:", err);
    return currentState;
  }
}

export async function generateSnapshotActions(
  state: HearingPrepWaypointState,
  caseName: string,
): Promise<string[]> {
  const fallbackActions = [
    "Write down every interaction with your co-parent from the past 30 days — dates, times, and what was said or missed.",
    "Gather any texts, emails, or documents that show your involvement in your children's daily life.",
    "Write a one-page summary of what you want the judge to know. Three points, no more.",
  ];

  try {
    console.log("[Atlas] generating actions for state:", JSON.stringify(state));
    const completion = await getGuidedFlowsOpenAIClient().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You generate 3 specific, concrete action items for a parent preparing
for a custody hearing. Each action must be something they can do THIS
WEEK. Be specific to their situation. No legal advice. No 'consult a
lawyer.' No generic platitudes. Return ONLY a JSON array of 3 strings,
no other text, no markdown.`,
        },
        {
          role: "user",
          content: `Generate 3 action items for this parent:
Hearing type: ${state.hearing_type ?? "unknown"}
Their concern: ${state.top_concern ?? "unknown"}
Current arrangement: ${state.current_schedule ?? "unknown"}
Recent changes: ${Array.isArray(state.recent_changes) ? state.recent_changes.join(", ") : "none"}
Representation: ${state.representation_status ?? "unknown"}
Jurisdiction: Georgia
Case name: ${caseName}`,
        },
      ],
    });

    const actionsRaw = completion.choices[0]?.message?.content?.trim();
    console.log("[Atlas] raw actions response:", actionsRaw);
    if (!actionsRaw) return fallbackActions;

    const parsed = JSON.parse(actionsRaw);
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }

    return fallbackActions;
  } catch (err) {
    console.error("[Atlas] generateSnapshotActions error:", err);
    return fallbackActions;
  }
}
