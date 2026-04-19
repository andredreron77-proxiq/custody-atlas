export interface UserSignals {
  emotionalState: "distressed" | "frustrated" | "neutral" | "curious" | "confident";
  knowledgeLevel: "beginner" | "intermediate" | "advanced";
  communicationStyle: "casual" | "formal" | "terse" | "detailed";
  needsEmpathyFirst: boolean;
  prefersBullets: boolean;
  hasAskedBefore: boolean;
}

export function analyzeUserSignals(
  userQuestion: string,
  conversationHistory: Array<{ role: string; content: string }>,
): UserSignals {
  const text = userQuestion.toLowerCase();

  const distressedKeywords = [
    "scared",
    "afraid",
    "terrified",
    "worried",
    "desperate",
    "help me",
    "i dont know what to do",
    "don't know what to do",
    "losing my kids",
    "take my kids",
    "never see",
    "crying",
    "depressed",
    "anxiety",
    "panic",
    "emergency",
    "urgent",
  ];

  const frustratedKeywords = [
    "unfair",
    "ridiculous",
    "won't let me",
    "refusing",
    "lying",
    "angry",
    "furious",
    "sick of",
    "tired of",
    "can't believe",
    "violation",
    "ignoring",
    "gets away with",
  ];

  const isDistressed = distressedKeywords.some((keyword) => text.includes(keyword));
  const isFrustrated = frustratedKeywords.some((keyword) => text.includes(keyword));

  const advancedTerms = [
    "motion",
    "petition",
    "affidavit",
    "deposition",
    "subpoena",
    "guardian ad litem",
    "GAL",
    "temporary restraining order",
    "TRO",
    "modification",
    "contempt",
    "jurisdiction",
    "stipulation",
    "parens patriae",
    "in camera",
    "discovery",
    "interrogatories",
  ];

  const advancedTermCount = advancedTerms.filter((term) => text.includes(term.toLowerCase())).length;

  const knowledgeLevel =
    advancedTermCount >= 2 ? "advanced" : advancedTermCount === 1 ? "intermediate" : "beginner";

  const wordCount = userQuestion.split(/\s+/).filter(Boolean).length;
  const isAllLowercase = userQuestion === userQuestion.toLowerCase();
  const hasPunctuation = /[.,;:]/.test(userQuestion);

  const isCasual = isAllLowercase && wordCount < 15 && !hasPunctuation;
  const isDetailed = wordCount > 30 || userQuestion.split("?").length > 2;
  const isTerse = wordCount < 8;

  const communicationStyle = isDetailed
    ? "detailed"
    : isTerse
      ? "terse"
      : isCasual
        ? "casual"
        : "formal";

  const hasAskedBefore = conversationHistory.length > 2;
  const prefersBullets =
    text.includes("\n") || text.includes(" - ") || text.includes("1.") || text.includes("first,");

  return {
    emotionalState: isDistressed ? "distressed" : isFrustrated ? "frustrated" : "neutral",
    knowledgeLevel,
    communicationStyle,
    needsEmpathyFirst: isDistressed || isFrustrated,
    prefersBullets,
    hasAskedBefore,
  };
}

export function buildAdaptiveSystemPrompt(
  basePrompt: string,
  signals: UserSignals,
  _jurisdiction: { state: string; county: string },
): string {
  const adaptations: string[] = [];

  adaptations.push(
    "LEGAL SAFEGUARD — ALWAYS FOLLOW THESE RULES: " +
      "(1) Never recommend a specific legal strategy or tell the " +
      "user what they should do in their case. Instead explain " +
      "what courts generally consider or what options exist. " +
      "(2) Never predict the outcome of their case. " +
      "(3) Never tell them they will win or lose. " +
      "(4) Always recommend consulting a licensed family law " +
      "attorney for decisions specific to their situation. " +
      "(5) Provide information about what the law says and how " +
      "courts typically approach issues — not what the user " +
      "specifically should do. " +
      '(6) The distinction is: "Georgia courts consider X factor" ' +
      'is acceptable. "You should file a motion for X" is not.',
  );

  if (signals.emotionalState === "distressed") {
    adaptations.push(
      "This parent is clearly distressed. Lead your response with " +
        "a brief, warm acknowledgment of their situation before providing " +
        'information. Use "I understand this is scary" or similar. ' +
        "Keep your tone calm, reassuring, and human. Never lead with bullets.",
    );
  } else if (signals.emotionalState === "frustrated") {
    adaptations.push(
      "This parent seems frustrated. Acknowledge their situation briefly " +
        "before diving into information. Validate that their concern is " +
        "understandable. Stay calm and factual.",
    );
  }

  if (signals.knowledgeLevel === "beginner") {
    adaptations.push(
      "This parent appears to be new to the legal process. " +
        "Explain any legal terms you use in plain English immediately " +
        "after using them. Avoid jargon where possible. " +
        "Use simple sentence structure and relatable analogies.",
    );
  } else if (signals.knowledgeLevel === "advanced") {
    adaptations.push(
      "CRITICAL: This user is legally sophisticated. They used " +
        "advanced legal terminology. You MUST respond differently: " +
        "(1) Cite specific Georgia statutes by code — O.C.G.A. § 19-9-3 " +
        "for custody modifications, O.C.G.A. § 19-6-15 for child support, etc. " +
        "(2) Use precise legal terminology — do NOT define basic terms " +
        "like motion, petition, best interests, or modification. " +
        "(3) Reference the specific legal standard and burden of proof. " +
        "(4) Mention relevant procedural steps at a high level. " +
        "(5) Do NOT give a simplified explanation — match their " +
        'sophistication level. A response that defines "motion" to ' +
        "this user is a failure.",
    );
    adaptations.push(
      "Even though this parent is sophisticated, end your response " +
        'with a brief note such as: "As always, I can provide general ' +
        "legal information but recommend confirming strategy with a " +
        "licensed Georgia family law attorney for your specific " +
        'situation." Keep it brief — one sentence at the end.',
    );
  }

  if (signals.communicationStyle === "casual") {
    adaptations.push(
      "Match the parent's casual communication style. " +
        "Write conversationally, not formally. Shorter sentences. " +
        'Avoid starting with "Certainly!" or stiff corporate language.',
    );
  } else if (signals.communicationStyle === "terse") {
    adaptations.push(
      "The parent asked a brief question — give a focused, " +
        "concise answer. Do not pad with unnecessary context. " +
        "Get to the point quickly.",
    );
  } else if (signals.communicationStyle === "detailed") {
    adaptations.push(
      "The parent provided detailed context. Match their depth " +
        "with a thorough response that addresses all aspects they raised.",
    );
  }

  if (signals.hasAskedBefore) {
    adaptations.push(
      "This parent has asked questions before in this conversation. " +
        "Build on what has already been discussed. Do not re-explain " +
        "concepts already covered.",
    );
  }

  if (!signals.needsEmpathyFirst && signals.prefersBullets) {
    adaptations.push("Use bullet points to organize information clearly.");
  } else if (signals.needsEmpathyFirst) {
    adaptations.push(
      "Use flowing prose paragraphs, not bullet points. " +
        "Bullets feel cold when someone is distressed.",
    );
  }

  if (adaptations.length === 0) {
    return basePrompt;
  }

  return `ADAPTIVE RESPONSE GUIDELINES FOR THIS MESSAGE:
${adaptations.map((adaptation, index) => `${index + 1}. ${adaptation}`).join("\n")}

${basePrompt}`;
}

export function containsLegalAdvice(response: string): boolean {
  const legalAdvicePhrases = [
    "you should file",
    "i recommend you",
    "your best strategy",
    "you will win",
    "you will lose",
    "i advise you to",
    "you must file",
    "you need to file",
    "your case will",
  ];
  const lower = response.toLowerCase();
  return legalAdvicePhrases.some((phrase) => lower.includes(phrase));
}

export function addLegalDisclaimer(response: string): string {
  const disclaimer =
    "\n\n*This is general legal information for educational purposes only, not legal advice for your specific situation. Please consult a licensed family law attorney before making any legal decisions.*";

  if (containsLegalAdvice(response)) {
    return response + disclaimer;
  }
  return response;
}
