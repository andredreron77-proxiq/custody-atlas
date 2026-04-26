# Atlas — Hearing Prep: System Prompt + Skip Logic Spec
Generated: April 26, 2026
Feed this to Codex as the implementation source of truth.

---

## 1. SYSTEM PROMPT TEMPLATE

Drop this into `server/lib/guidedFlows.ts` as the `hearingPrepSystemPrompt` builder function.
Template variables (wrapped in `{{}}`) are injected at runtime by the server.

```
You are Atlas — an AI guide for parents navigating custody proceedings.

You are warm, clear, and direct. You are not a lawyer. You do not give legal advice.
You give situational guidance: helping parents understand what is happening and what
they can do about it.

CURRENT SESSION: Hearing Prep
Case: {{case_name}}
Jurisdiction: {{jurisdiction_county}}, {{jurisdiction_state}}
Days until hearing: {{days_until_hearing}}

CURRENT WAYPOINT STATE:
{{waypoint_state_json}}

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
  → Add "child_safety_flag": true to your state block.

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

---

OUTPUT FORMAT — required every turn

After your natural message to the parent, end with this block on its own line.
The server strips it before display. Never mention this block to the parent.

<!--ATLAS_STATE:{"hearing_date":null,"hearing_type":null,"top_concern":null,"concern_category":null,"current_schedule":null,"order_status":null,"recent_changes":null,"representation_status":null,"child_safety_flag":false,"waypoints_complete":[]}-->

Fill values as they resolve. Add waypoint number to waypoints_complete when resolved.

When waypoints_complete contains [1,2,3,4,5], your response must be:
  "Okay. I think I've got the picture. Let me show you what I'm seeing — and what
  I'd do if I were in your shoes this week."
followed by: <!--ATLAS_TRIGGER:SNAPSHOT-->

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
moving to waypoint 6. Do not make this a question — make it a resource offer.
```

---

## 2. WAYPOINT STATE SCHEMA

Add to `server/lib/guidedFlows.ts`:

```typescript
export interface HearingPrepWaypointState {
  hearing_date: string | null;            // ISO date string e.g. "2026-04-28"
  hearing_type:
    | 'temporary_custody'
    | 'final'
    | 'status_conference'
    | 'modification'
    | 'contempt'
    | 'ex_parte'
    | 'mediation'
    | 'unknown'
    | null;
  top_concern: string | null;             // Free text from parent
  concern_category:
    | 'resource_gap'
    | 'evidence_gap'
    | 'fairness_fear'
    | 'child_wellbeing'
    | 'self_doubt'
    | null;
  current_schedule: string | null;        // Free text summary
  order_status:
    | 'court_order'
    | 'written_agreement'
    | 'informal'
    | 'none'
    | null;
  recent_changes: string[] | null;        // Array of change summaries
  representation_status:
    | 'has_attorney'
    | 'pro_se_choice'
    | 'pro_se_necessity'
    | null;
  child_safety_flag: boolean;
  waypoints_complete: number[];           // e.g. [1, 2, 3]
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
  waypoints_complete: [],
};
```

---

## 3. SERVER EXTRACTION PATTERN

Add to `server/lib/guidedFlows.ts`:

```typescript
export function extractAtlasResponse(rawResponse: string): {
  cleanResponse: string;
  state: HearingPrepWaypointState | null;
  triggerSnapshot: boolean;
  childSafetyFlag: boolean;
} {
  const stateMatch = rawResponse.match(/<!--ATLAS_STATE:(.*?)-->/s);
  const triggerSnapshot = rawResponse.includes('<!--ATLAS_TRIGGER:SNAPSHOT-->');

  const cleanResponse = rawResponse
    .replace(/<!--ATLAS_STATE:.*?-->/gs, '')
    .replace(/<!--ATLAS_TRIGGER:SNAPSHOT-->/g, '')
    .trim();

  let state: HearingPrepWaypointState | null = null;
  if (stateMatch) {
    try {
      state = JSON.parse(stateMatch[1]) as HearingPrepWaypointState;
    } catch {
      // Model failed to emit valid JSON — keep previous state, don't crash
      console.warn('[Atlas] Failed to parse ATLAS_STATE block — using prior state');
    }
  }

  return {
    cleanResponse,
    state,
    triggerSnapshot,
    childSafetyFlag: state?.child_safety_flag ?? false,
  };
}
```

---

## 4. ROUTE HANDLER FLOW

In `server/routes.ts`, the guided conversation message handler should:

```
1. Load current waypoint_state from case_memory (or use HEARING_PREP_INITIAL_STATE)
2. Inject state into system prompt via {{waypoint_state_json}} = JSON.stringify(state)
3. Call OpenAI with full conversation history + system prompt
4. Call extractAtlasResponse(rawResponse)
5. If state returned → write updated state to case_memory.memory_summary (or a
   dedicated guided_state JSONB column — see note below)
6. If childSafetyFlag → log to signals table, do NOT block the conversation
7. If triggerSnapshot → call generateCaseSnapshot(state, case) and return snapshot
   card data alongside the clean message
8. Return cleanResponse to client
```

**Note on state storage:** Consider adding a `guided_state` JSONB column to the
`conversations` table rather than using `case_memory.memory_summary` — it keeps
waypoint state separate from the narrative memory summary Atlas writes.

---

## 5. SNAPSHOT GENERATION FUNCTION

```typescript
export function buildHearingPrepSnapshot(
  state: HearingPrepWaypointState,
  caseName: string,
  jurisdiction: { county: string; state: string }
): SnapshotCard {
  const hopeLines: Record<string, string> = {
    has_attorney:
      "You have representation going in. That's more than most parents in your position.",
    pro_se_choice:
      "You're doing this yourself. That takes courage, and preparation is how you make it count.",
    pro_se_necessity:
      "You're here before your hearing and you're paying attention. Most people walk in cold. You won't.",
    default:
      "You're here before your hearing and you're paying attention. That already puts you ahead.",
  };

  const hopeLine =
    hopeLines[state.representation_status ?? 'default'] ?? hopeLines['default'];

  // Actions are generated dynamically — pass state to GPT-4o with a tight prompt
  // (separate low-temperature call, ~200 tokens, 3 actions only)
  // See generateSnapshotActions() below

  return {
    type: 'hearing_prep_snapshot',
    case_name: caseName,
    hearing_date: state.hearing_date,
    jurisdiction: `${jurisdiction.county} County, ${jurisdiction.state}`,
    hearing_type: state.hearing_type,
    top_concern: state.top_concern,
    current_schedule: state.current_schedule,
    recent_changes: state.recent_changes,
    hope_line: hopeLine,
    // actions populated async by generateSnapshotActions()
    actions: [],
    representation_status: state.representation_status,
    disclaimer: 'Situational guidance, not legal advice.',
  };
}
```

---

## 6. CODEX IMPLEMENTATION PROMPT

Use this prompt verbatim when opening Codex:

```
Implement the Atlas guided Hearing Prep flow in the Custody Atlas codebase
(andredreron77-proxiq/custody-atlas).

Source of truth: the spec at [paste path to this file or paste contents].

Tasks:
1. Add HearingPrepWaypointState interface and HEARING_PREP_INITIAL_STATE constant
   to server/lib/guidedFlows.ts

2. Add extractAtlasResponse() function to server/lib/guidedFlows.ts

3. Add a guided_state JSONB column to the conversations table via a Supabase
   migration file (do not modify the database directly). Column: guided_state JSONB,
   nullable, default null.

4. Update the /api/conversations/:id/messages POST handler in server/routes.ts to:
   - Load guided_state from the conversation row when conversation_type starts with 'guided_'
   - Inject it into the system prompt as {{waypoint_state_json}}
   - Call extractAtlasResponse on the raw OpenAI response
   - Write updated state back to conversations.guided_state
   - If triggerSnapshot is true, set a flag in the response body: { triggerSnapshot: true }
   - If childSafetyFlag is true, write a signal to the signals table
     (signal_type: 'child_safety', conversation_id, user_id)

5. Build the hearingPrepSystemPrompt() builder function that accepts:
   { case_name, jurisdiction_county, jurisdiction_state, days_until_hearing,
     waypoint_state_json }
   and returns the system prompt string from the spec.

6. Run full TypeScript and build checks. Zero errors before committing.
```

---

## 7. WHAT'S NOT IN THIS SPEC YET

- `generateSnapshotActions()` — the secondary GPT-4o call that generates the 3 personalized action items from resolved state. To be specced separately.
- Client-side Snapshot card component (ChatBox.tsx) — render logic for the card when server returns `triggerSnapshot: true`.
- The other 3 flow system prompts (Respond to Filing, More Time, Figuring It Out) — same pattern, different waypoints and translations.
- Question-count suppression during guided flow (hide the counter in the header until Snapshot lands).
