/**
 * custodyQuestions.ts
 *
 * Static dataset for SEO-targeted custody question pages at /custody-questions/:slug.
 * Each entry is a fully self-contained page spec: slug, question text, quick answer,
 * expanded explanation, state variation note, related state slugs, and related questions.
 *
 * To add a new question:
 *   1. Add an entry to CUSTODY_QUESTIONS below.
 *   2. Add a footer link in Footer.tsx QUESTION_PAGES array.
 *   3. Done — the dynamic route /custody-questions/:slug handles rendering automatically.
 */

export interface CustodyQuestion {
  slug: string;
  question: string;
  category: string;
  metaDescription: string;
  quickAnswer: string;
  explanation: {
    intro: string;
    keyFactors: { title: string; detail: string }[];
  };
  stateVariation: string;
  relatedStateSlugs: string[];
  relatedQuestionSlugs: string[];
}

export const CUSTODY_QUESTIONS: CustodyQuestion[] = [
  {
    slug: "can-a-child-choose-which-parent-to-live-with",
    question: "Can a Child Choose Which Parent to Live With?",
    category: "Child Preference",
    metaDescription:
      "Learn whether a child can choose which parent to live with and how age and maturity affect what courts consider in custody decisions.",
    quickAnswer:
      "A child cannot simply choose a parent, but courts do consider the child's preference — especially as the child gets older. The weight given to that preference depends on the child's age, maturity, and the reasons behind the choice.",
    explanation: {
      intro:
        "Family courts across the U.S. prioritize the 'best interests of the child' above all else. A child's stated preference is one factor courts weigh, but it is rarely — if ever — the deciding factor on its own.",
      keyFactors: [
        {
          title: "Age and maturity matter most",
          detail:
            "Courts look at whether the child is old enough to form an informed, independent preference. Teenagers typically receive more weight than young children. Some states set a specific age (often 12–14) after which the preference carries significant influence.",
        },
        {
          title: "The reasons behind the preference",
          detail:
            "A judge will probe why the child wants to live with a particular parent. If the preference stems from lenient rules, a new gaming setup, or influence by one parent, it may receive little weight. A preference based on deeper bonds, schooling, or stability carries more.",
        },
        {
          title: "The child is not sworn in or cross-examined",
          detail:
            "Courts usually hear a child's preference through a private in-chambers interview with the judge, a guardian ad litem, or a custody evaluator — not in open court testimony.",
        },
        {
          title: "Best interests always override preference",
          detail:
            "Even a mature child's clear preference can be set aside if the judge determines the preferred home is unsafe, unstable, or otherwise not in the child's best interest.",
        },
      ],
    },
    stateVariation:
      "State rules vary significantly. Georgia and Tennessee, for example, give substantial weight to the preference of children aged 14 and older. California considers the preference of children aged 14 and up but allows younger children to express a preference too. Some states have no fixed age threshold and leave the determination entirely to the judge's discretion.",
    relatedStateSlugs: ["georgia", "california", "texas", "florida", "north-carolina"],
    relatedQuestionSlugs: [
      "how-do-courts-decide-child-custody",
      "can-i-modify-a-custody-order",
      "how-does-joint-custody-work",
    ],
  },

  {
    slug: "can-my-ex-move-out-of-state-with-my-child",
    question: "Can My Ex Move Out of State with My Child?",
    category: "Relocation",
    metaDescription:
      "Understand whether a parent can relocate out of state with a child after divorce and what courts consider when deciding relocation disputes.",
    quickAnswer:
      "Generally no — not without either your agreement or a court order. If there is an existing custody order, a parent typically must give advance written notice and obtain either the other parent's consent or court approval before relocating.",
    explanation: {
      intro:
        "Relocation disputes are among the most complex and emotionally charged in family law. Courts balance the relocating parent's right to move with the non-relocating parent's right to maintain a meaningful relationship with the child.",
      keyFactors: [
        {
          title: "Notice requirements",
          detail:
            "Most states require the relocating parent to provide written notice — often 30 to 90 days in advance. Failure to give proper notice can result in contempt of court and may hurt the relocating parent's credibility with the judge.",
        },
        {
          title: "Good faith vs. bad faith motive",
          detail:
            "Courts ask whether the move is motivated by a legitimate reason (career opportunity, family support, health) or an attempt to interfere with the other parent's relationship with the child. Bad faith motives can defeat a relocation request.",
        },
        {
          title: "Impact on the child's relationship with both parents",
          detail:
            "Judges consider how a move would affect the child's bond with the non-relocating parent, school stability, friendships, and extended family. A proposed visitation schedule that preserves the child's relationship with both parents carries significant weight.",
        },
        {
          title: "Burden of proof",
          detail:
            "In most states, the relocating parent must show the move is in the child's best interests. Some states place the burden on the objecting parent to show harm. The allocation of this burden can determine the outcome of a case.",
        },
      ],
    },
    stateVariation:
      "Florida requires 50+ mile moves to follow the relocation statute. California requires 45 days' notice. Alaska requires 30 days' notice for moves within Alaska and 90 days for out-of-state moves. Some states have no fixed threshold and handle each case on its facts. The UCCJEA (Uniform Child Custody Jurisdiction and Enforcement Act) governs which state has jurisdiction once a move occurs.",
    relatedStateSlugs: ["california", "florida", "texas", "new-york", "washington"],
    relatedQuestionSlugs: [
      "can-i-modify-a-custody-order",
      "what-happens-if-my-ex-violates-the-custody-order",
      "how-do-courts-decide-child-custody",
    ],
  },

  {
    slug: "does-shared-custody-mean-no-child-support",
    question: "Does Shared Custody Mean No Child Support?",
    category: "Child Support",
    metaDescription:
      "Find out whether shared or joint custody eliminates child support obligations and how parenting time affects the amount courts calculate.",
    quickAnswer:
      "Not automatically. Shared custody usually reduces child support, but rarely eliminates it. The amount each parent pays depends on both parents' incomes, how many nights the child spends with each parent, and each state's specific guidelines.",
    explanation: {
      intro:
        "Child support and custody are separate legal issues. A 50/50 parenting time split does not automatically mean zero child support — courts look at the income of each parent alongside parenting time to calculate an appropriate amount.",
      keyFactors: [
        {
          title: "Income disparity drives the calculation",
          detail:
            "If one parent earns significantly more than the other, they may still owe support even in a 50/50 arrangement. The goal is to maintain a similar standard of living for the child in both homes.",
        },
        {
          title: "Parenting time percentage affects support",
          detail:
            "Most states adjust child support based on how many overnights the child spends with each parent. The more time a parent has, the more day-to-day costs they bear directly — which reduces the transfer payment owed to the other parent.",
        },
        {
          title: "Additional expenses are factored in",
          detail:
            "Courts may also factor in health insurance premiums, childcare costs, medical expenses, and educational costs beyond basic support. These can offset or increase the calculated support amount.",
        },
        {
          title: "Support can only be waived by court order",
          detail:
            "Parents cannot simply agree between themselves to skip child support. Any agreement must be approved by a judge and entered as a court order to be enforceable.",
        },
      ],
    },
    stateVariation:
      "States use different models: the Income Shares Model (used in most states, including Georgia, Virginia, and Colorado) considers both parents' income. The Percentage of Income Model (used in Texas, Alaska, Illinois, and New York) is based primarily on the paying parent's income. Some states apply a threshold — for example, support may only be reduced if parenting time exceeds a certain number of nights per year.",
    relatedStateSlugs: ["texas", "georgia", "california", "illinois", "new-york"],
    relatedQuestionSlugs: [
      "how-does-joint-custody-work",
      "can-i-modify-a-custody-order",
      "what-is-a-parenting-plan",
    ],
  },

  {
    slug: "how-do-courts-decide-child-custody",
    question: "How Do Courts Decide Child Custody?",
    category: "Custody Basics",
    metaDescription:
      "Learn how family courts decide custody arrangements and which factors matter most when judges determine the best interests of the child.",
    quickAnswer:
      "Courts apply the 'best interests of the child' standard — a multi-factor test that weighs everything from parental stability and involvement to the child's health, school, and preferences. No single factor is decisive.",
    explanation: {
      intro:
        "Every state in the U.S. uses some version of the 'best interests of the child' standard. While the specific factors vary by state, courts generally evaluate both parents' fitness, the child's needs, and the likely impact of various arrangements on the child's wellbeing.",
      keyFactors: [
        {
          title: "Each parent's ability to provide stability",
          detail:
            "Courts look at employment history, housing stability, mental and physical health, and ability to provide a consistent home environment. A parent with a stable, predictable lifestyle is viewed favorably.",
        },
        {
          title: "Quality of the parent-child relationship",
          detail:
            "Judges examine the emotional bond between each parent and the child, who has historically been the primary caregiver, and how involved each parent has been in school, healthcare, and daily routines.",
        },
        {
          title: "Willingness to support the other parent's relationship",
          detail:
            "Courts favor parents who actively support the child's relationship with the other parent. A parent who is hostile, refuses contact, or attempts to alienate the child from the other parent is viewed negatively.",
        },
        {
          title: "History of domestic violence or abuse",
          detail:
            "Evidence of abuse, neglect, or domestic violence is heavily weighted. Many states presume that awarding custody to an abusive parent is not in the child's best interest.",
        },
        {
          title: "The child's own preference",
          detail:
            "An older, mature child's preference carries real weight, though it is not controlling. Courts typically hear this through a private interview or guardian ad litem rather than open court testimony.",
        },
      ],
    },
    stateVariation:
      "Most states codify their best-interests factors into statute. Florida has 20 statutory factors. California's list emphasizes the health, safety, and welfare of the child. Texas focuses on the child's physical and emotional needs and each parent's ability to meet them. While the core standard is universal, how courts balance these factors — and how much weight each carries — differs meaningfully by jurisdiction.",
    relatedStateSlugs: ["california", "florida", "texas", "new-york", "georgia"],
    relatedQuestionSlugs: [
      "can-a-child-choose-which-parent-to-live-with",
      "does-a-mother-automatically-get-custody",
      "how-does-joint-custody-work",
    ],
  },

  {
    slug: "what-is-the-difference-between-legal-and-physical-custody",
    question: "What Is the Difference Between Legal and Physical Custody?",
    category: "Custody Basics",
    metaDescription:
      "Understand the difference between legal and physical custody and how each type affects parenting rights and daily decision-making.",
    quickAnswer:
      "Legal custody covers the right to make major decisions for your child — school, healthcare, religion. Physical custody determines where the child lives day-to-day. Parents can share one, both, or neither type of custody.",
    explanation: {
      intro:
        "Custody comes in two distinct forms that are determined separately. A parent can have joint legal custody while the other parent has sole physical custody — and many different combinations are possible depending on the family's situation.",
      keyFactors: [
        {
          title: "Legal custody = decision-making authority",
          detail:
            "Legal custody covers major life decisions: which school the child attends, what medical treatment they receive, what religion they are raised in, and major extracurricular commitments. Joint legal custody means both parents must agree on these decisions.",
        },
        {
          title: "Physical custody = where the child sleeps",
          detail:
            "Physical custody determines the child's primary residence and the day-to-day schedule. A parent with primary physical custody has the child most nights; the other parent typically has a visitation schedule.",
        },
        {
          title: "Sole vs. joint (for each type)",
          detail:
            "Both legal and physical custody can be sole (one parent only) or joint (both parents share). Courts often award joint legal custody while granting one parent primary physical custody, with the other having regular parenting time.",
        },
        {
          title: "Joint physical custody vs. equal parenting time",
          detail:
            "'Joint physical custody' does not automatically mean a 50/50 split. It simply means both parents have significant time with the child. Specific percentages — 60/40, 70/30, or 50/50 — are defined in the parenting plan.",
        },
      ],
    },
    stateVariation:
      "Florida uses different terminology — 'parental responsibility' instead of legal custody and 'time-sharing' instead of physical custody, but the concepts are similar. California, New York, and most other states use the legal/physical custody framework. Some states are moving toward presuming joint legal and shared physical custody as the starting point, though this varies significantly.",
    relatedStateSlugs: ["california", "florida", "new-york", "texas", "illinois"],
    relatedQuestionSlugs: [
      "how-does-joint-custody-work",
      "what-is-a-parenting-plan",
      "how-do-courts-decide-child-custody",
    ],
  },

  {
    slug: "can-i-modify-a-custody-order",
    question: "Can I Modify a Custody Order?",
    category: "Modification",
    metaDescription:
      "Learn what it takes to modify a child custody order and what courts require before they will change an existing custody arrangement.",
    quickAnswer:
      "Yes — but you must show that there has been a significant, material change in circumstances since the last order and that the modification you are requesting is in the child's best interests. Courts set a high bar to protect stability for children.",
    explanation: {
      intro:
        "Custody orders are not permanent, but they are not easily changed either. Courts impose a meaningful burden on the party seeking modification to discourage frequent litigation and protect the stability that children need.",
      keyFactors: [
        {
          title: "Material change in circumstances",
          detail:
            "The most critical requirement. Courts look for substantial changes such as a parent relocating, a major change in a parent's work schedule, evidence of neglect or abuse, a new domestic violence situation, or the child's changing developmental needs.",
        },
        {
          title: "Child's best interests — again",
          detail:
            "Even if a material change exists, the modification must still serve the child's best interests. The same multi-factor analysis used in the original order is applied to the proposed modification.",
        },
        {
          title: "How long since the last order",
          detail:
            "Many states impose waiting periods. Alaska, for example, generally requires waiting two years after the last order before seeking a modification unless there is an emergency. Other states have no fixed waiting period but expect circumstances to have genuinely changed.",
        },
        {
          title: "Agreement between parents",
          detail:
            "If both parents agree to a modification, courts will usually approve it as long as the arrangement is reasonable and in the child's best interests. A consent order is faster and less expensive than a contested modification hearing.",
        },
      ],
    },
    stateVariation:
      "Alaska has a general 2-year waiting period for most modifications. Texas requires a 1-year period before most modifications, with exceptions for agreement or danger to the child. California has no fixed waiting period but requires the material-change standard. Some states allow emergency temporary orders immediately if a child is in danger, followed by a full hearing.",
    relatedStateSlugs: ["california", "texas", "florida", "new-york", "ohio"],
    relatedQuestionSlugs: [
      "how-do-courts-decide-child-custody",
      "can-a-child-choose-which-parent-to-live-with",
      "what-happens-if-my-ex-violates-the-custody-order",
    ],
  },

  {
    slug: "what-happens-if-my-ex-violates-the-custody-order",
    question: "What Happens If My Ex Violates the Custody Order?",
    category: "Enforcement",
    metaDescription:
      "Find out what you can do if your ex violates a custody order and what legal remedies courts can order against a parent who ignores court orders.",
    quickAnswer:
      "A parent who violates a custody order can be held in contempt of court, face fines, be ordered to give you makeup parenting time, and in serious cases face criminal charges. Document every violation and report it to the court.",
    explanation: {
      intro:
        "Custody orders are legally binding court orders. Violating them — whether by withholding parenting time, refusing to return the child, or relocating without permission — has real legal consequences.",
      keyFactors: [
        {
          title: "Civil contempt proceedings",
          detail:
            "The most common remedy. You file a contempt motion with the court. If the judge finds a violation, they can impose fines, order makeup parenting time, require the violating parent to pay your attorney fees, or modify custody as a consequence.",
        },
        {
          title: "Makeup parenting time",
          detail:
            "Courts regularly order makeup time for missed parenting time. If your ex denied you five weekends, a judge can order five additional weekends added to your schedule.",
        },
        {
          title: "Modification of custody",
          detail:
            "Repeated or egregious violations can be used as evidence of a material change in circumstances, forming the basis for a modification hearing where you could seek more parenting time or even primary custody.",
        },
        {
          title: "Criminal charges for parental abduction",
          detail:
            "If a parent takes the child across state lines or hides the child in violation of an order, it can constitute parental abduction — a criminal offense. Law enforcement can assist in recovering a child under the UCCJEA.",
        },
        {
          title: "Document everything",
          detail:
            "Keep records of all communication (texts, emails), missed exchanges, and dates. Courts will want evidence. A detailed log of violations greatly strengthens a contempt motion.",
        },
      ],
    },
    stateVariation:
      "All states provide contempt remedies for custody order violations. Some states have specific statutes with defined penalties — for example, Texas has statutory makeup time provisions and attorney fee shifting. Florida courts are known for vigorously enforcing time-sharing orders. California allows courts to modify custody as a consequence of repeated violations. Interstate violations are governed by the UCCJEA.",
    relatedStateSlugs: ["texas", "florida", "california", "ohio", "virginia"],
    relatedQuestionSlugs: [
      "can-i-modify-a-custody-order",
      "can-my-ex-move-out-of-state-with-my-child",
      "how-do-courts-decide-child-custody",
    ],
  },

  {
    slug: "does-a-mother-automatically-get-custody",
    question: "Does a Mother Automatically Get Custody?",
    category: "Parental Rights",
    metaDescription:
      "Learn whether mothers automatically receive custody in divorce cases and how courts actually evaluate both parents equally under modern law.",
    quickAnswer:
      "No. U.S. courts are legally required to evaluate both parents on equal footing. The outdated 'tender years doctrine' that favored mothers for young children has been abolished in all 50 states. Custody is decided on the best interests of the child, not the parent's gender.",
    explanation: {
      intro:
        "For most of the 20th century, courts routinely awarded custody to mothers under the 'tender years doctrine.' That doctrine has been abolished nationwide. Today, both parents have equal standing before the court, and fathers have the same right to seek custody as mothers.",
      keyFactors: [
        {
          title: "Gender-neutral law in all 50 states",
          detail:
            "No state allows a judge to favor a parent based on gender alone. The Equal Protection Clause of the U.S. Constitution prohibits gender-based custody preferences. Courts that show bias toward either parent can be reversed on appeal.",
        },
        {
          title: "Primary caregiver history still matters",
          detail:
            "While gender cannot be considered, which parent has historically been the primary caregiver is a legitimate factor. If one parent — regardless of gender — has been responsible for the child's daily care, medical appointments, and school involvement, that parent may receive more weight.",
        },
        {
          title: "Fathers have strong legal rights",
          detail:
            "Fathers who are involved, present, and engaged in their child's life are frequently awarded joint physical custody or even primary custody. Courts focus on involvement and fitness, not gender.",
        },
        {
          title: "Statistics vs. law",
          detail:
            "Statistics show that mothers still receive primary custody more often than fathers in practice. Courts attribute this largely to the caregiver history factor — many mothers have historically been primary caregivers. As more fathers take equal primary caregiver roles, custody outcomes are evening out.",
        },
      ],
    },
    stateVariation:
      "All states have abolished formal gender preferences. Some states — like Arizona and Nevada — have adopted presumptions favoring joint physical custody as a starting point, which actually tends to produce more equitable outcomes between mothers and fathers. Courts in all states are required by law to treat parents equally regardless of gender.",
    relatedStateSlugs: ["arizona", "nevada", "california", "texas", "florida"],
    relatedQuestionSlugs: [
      "how-do-courts-decide-child-custody",
      "how-does-joint-custody-work",
      "can-i-modify-a-custody-order",
    ],
  },

  {
    slug: "how-does-domestic-violence-affect-custody",
    question: "How Does Domestic Violence Affect Custody?",
    category: "Domestic Violence",
    metaDescription:
      "Learn how a history of domestic violence impacts custody decisions and what protections courts can put in place to keep children safe.",
    quickAnswer:
      "Domestic violence is taken very seriously in custody cases. Courts may presume that awarding custody to an abusive parent is not in the child's best interest, and may impose supervised visitation, protective orders, or deny custody altogether.",
    explanation: {
      intro:
        "Evidence of domestic violence — whether directed at a co-parent or at the children themselves — is one of the most heavily weighted factors in a custody proceeding. Many states have adopted statutory presumptions against granting custody to an abuser.",
      keyFactors: [
        {
          title: "Statutory presumptions against abusers",
          detail:
            "In many states, there is a legal presumption that awarding sole or joint custody to a parent who has committed domestic violence is not in the child's best interests. The abusive parent must overcome this presumption to receive custody.",
        },
        {
          title: "Supervised visitation",
          detail:
            "Courts often order that an abusive parent's time with the child be supervised by a neutral third party — a relative, a professional supervisor, or a social worker. This allows some parenting time while protecting the child and the other parent.",
        },
        {
          title: "Protective orders and safety conditions",
          detail:
            "Courts can issue restraining orders, require batterer's intervention programs, prohibit overnight visits, require neutral exchange locations, and impose drug or alcohol testing as conditions of any custody arrangement.",
        },
        {
          title: "Impact on the child as a witness",
          detail:
            "Exposure to domestic violence — even when not directly harmed — is recognized as harmful to children. Courts treat a child who has witnessed domestic violence as a child who has been affected by it.",
        },
        {
          title: "How to document abuse",
          detail:
            "Police reports, protective orders, medical records, photos of injuries, witness statements, and records of threats (texts, voicemails) are all relevant evidence. An experienced family law attorney can help you preserve and present this evidence effectively.",
        },
      ],
    },
    stateVariation:
      "Louisiana, Nevada, and many other states have explicit statutory presumptions against awarding custody to a parent found to have committed domestic violence. California's Family Code establishes a rebuttable presumption against joint custody when domestic violence is proven. Some states require mandatory reporting and evaluation when domestic violence is alleged in custody cases.",
    relatedStateSlugs: ["california", "nevada", "louisiana", "washington", "colorado"],
    relatedQuestionSlugs: [
      "how-do-courts-decide-child-custody",
      "what-happens-if-my-ex-violates-the-custody-order",
      "can-i-modify-a-custody-order",
    ],
  },

  {
    slug: "what-is-a-parenting-plan",
    question: "What Is a Parenting Plan?",
    category: "Custody Basics",
    metaDescription:
      "Understand what a parenting plan is, what it must include, and how it shapes day-to-day custody and visitation schedules after separation.",
    quickAnswer:
      "A parenting plan (also called a custody agreement or parenting agreement) is a written document that outlines how separated parents will share time with their child and make decisions about the child's upbringing. Courts approve and enforce it as an order.",
    explanation: {
      intro:
        "Most states require parents to submit a parenting plan when resolving custody — whether through agreement or litigation. A detailed plan prevents future disputes by spelling out expectations clearly.",
      keyFactors: [
        {
          title: "Regular parenting time schedule",
          detail:
            "The plan specifies which days and nights the child spends with each parent during a typical week or month. Common arrangements include alternating weeks, a 2-2-3 rotation (2 days with one parent, 2 with the other, 3 with the first), and weekend/weekday splits.",
        },
        {
          title: "Holiday and vacation schedule",
          detail:
            "Parenting plans spell out how holidays (Thanksgiving, winter break, birthdays, Mother's Day, Father's Day) rotate between parents each year. A detailed holiday schedule prevents conflicts over the most emotionally charged times.",
        },
        {
          title: "Decision-making framework",
          detail:
            "The plan defines how major decisions (school choice, medical treatment, religious upbringing) are made. Joint legal custody plans typically require both parents to agree, with a tiebreaker provision for deadlock.",
        },
        {
          title: "Communication and exchange logistics",
          detail:
            "Plans specify where child exchanges happen, how parents communicate about the child, and what tools (co-parenting apps, email, phone) are used. Some plans prohibit face-to-face contact at exchanges to reduce conflict.",
        },
        {
          title: "Dispute resolution",
          detail:
            "Good plans include a process for resolving disagreements — typically first through direct communication, then mediation, and finally court if necessary. This keeps minor conflicts out of the courthouse.",
        },
      ],
    },
    stateVariation:
      "Florida requires a detailed parenting plan in all custody cases — it is a mandatory document under Florida's time-sharing statute. California courts encourage parents to use Judicial Council forms as a starting point. Many states offer parenting plan templates and require them to be filed with the court. The level of detail required varies, but most courts expect the plan to cover at least the regular schedule, holidays, and decision-making.",
    relatedStateSlugs: ["florida", "california", "washington", "colorado", "michigan"],
    relatedQuestionSlugs: [
      "how-does-joint-custody-work",
      "what-is-the-difference-between-legal-and-physical-custody",
      "can-i-modify-a-custody-order",
    ],
  },

  {
    slug: "how-does-joint-custody-work",
    question: "How Does Joint Custody Work?",
    category: "Custody Basics",
    metaDescription:
      "Learn how joint custody works in practice, including how parenting time is divided and how parents make decisions together for their child.",
    quickAnswer:
      "Joint custody means both parents share rights and responsibilities for their child. Joint legal custody means both parents make major decisions together. Joint physical custody means the child spends substantial time with both parents — though not necessarily a 50/50 split.",
    explanation: {
      intro:
        "Joint custody is increasingly the default arrangement in U.S. family courts. Research consistently shows that children benefit from maintaining strong relationships with both parents, and courts have responded by favoring shared arrangements when both parents are fit.",
      keyFactors: [
        {
          title: "Joint legal custody — shared decision-making",
          detail:
            "Both parents have an equal say in major decisions about education, healthcare, religion, and extracurricular activities. This requires communication and cooperation. If parents cannot agree, they may use a mediator or return to court.",
        },
        {
          title: "Joint physical custody — shared time",
          detail:
            "The child spends significant time with both parents. Common schedules include alternating weeks, a 2-2-3 rotation, a 5-2-2-5 pattern, or any arrangement the parents agree to. The schedule is spelled out in the parenting plan.",
        },
        {
          title: "50/50 is not required",
          detail:
            "'Joint physical custody' does not require a perfect equal split. Many families do 60/40 or 70/30 based on work schedules, geography, or the child's needs. Courts care more about consistency and quality of parenting time than exact numerical equality.",
        },
        {
          title: "When joint custody doesn't work",
          detail:
            "Joint custody requires a minimum level of co-parental cooperation. Courts may decline to order joint custody when parents have severe conflict, when one parent has a history of domestic violence or substance abuse, or when the child's special needs require one primary caregiver.",
        },
        {
          title: "Modifying joint custody",
          detail:
            "Like any custody arrangement, a joint custody order can be modified if circumstances change materially. Common reasons include relocation, a parent's remarriage or cohabitation, changes in the child's school or activities, or the child's own evolving needs.",
        },
      ],
    },
    stateVariation:
      "Arizona and Nevada both have statutory presumptions favoring joint physical custody — courts start from an equal time presumption and require evidence to deviate from it. Florida presumes shared parental responsibility (joint legal custody) in most cases. Texas has a 'Standard Possession Order' that is the default when parties cannot agree. California courts frequently award joint legal and joint physical custody when both parents are involved and able to cooperate.",
    relatedStateSlugs: ["arizona", "nevada", "florida", "california", "texas"],
    relatedQuestionSlugs: [
      "what-is-the-difference-between-legal-and-physical-custody",
      "does-shared-custody-mean-no-child-support",
      "what-is-a-parenting-plan",
    ],
  },

  {
    slug: "can-grandparents-get-custody-or-visitation",
    question: "Can Grandparents Get Custody or Visitation?",
    category: "Third-Party Custody",
    metaDescription:
      "Learn whether grandparents can seek custody or court-ordered visitation and what legal standards apply in grandparent rights cases.",
    quickAnswer:
      "Grandparents can petition for visitation or custody in most states, but the legal standard is high. Courts respect parents' constitutional right to make decisions about their children, so grandparent visitation is typically granted only when it clearly serves the child's best interests and there is a substantial existing relationship.",
    explanation: {
      intro:
        "The U.S. Supreme Court's 2000 decision in Troxel v. Granville established that fit parents have a constitutional right to direct their children's lives, including who the child spends time with. This makes grandparent visitation rights cases legally complex.",
      keyFactors: [
        {
          title: "Substantial existing relationship",
          detail:
            "Courts are most likely to grant grandparent visitation when the grandparents have had a significant, ongoing role in the child's life. A close relationship established over many years carries more weight than one that was peripheral.",
        },
        {
          title: "Circumstances that open the door",
          detail:
            "Grandparent visitation is most commonly granted when a parent has died, the parents are divorcing, the child was in the grandparents' care for a significant period, or a parent is preventing all contact without justification.",
        },
        {
          title: "Grandparent custody vs. visitation",
          detail:
            "Grandparent custody (full removal of the child from both parents) requires showing that both parents are unfit or unable to care for the child. It is a significantly higher bar than visitation. Courts treat it similarly to other third-party custody requests.",
        },
        {
          title: "Parental objection carries significant weight",
          detail:
            "A fit parent's objection to grandparent visitation is presumed to be in the child's best interests under Troxel. Grandparents must overcome this presumption with clear evidence that visitation serves the child — not just the grandparents.",
        },
      ],
    },
    stateVariation:
      "Every state has its own grandparent visitation statute, and they vary widely. California's statutes allow grandparent visitation petitions when parents are separated, a parent is absent, or the parents are unmarried. New York allows petitions by grandparents when it is in the child's best interests and where circumstances warrant equity. Texas grandparent statutes are limited — courts must find that denial of access would significantly impair the child's physical health or emotional well-being.",
    relatedStateSlugs: ["california", "new-york", "texas", "florida", "michigan"],
    relatedQuestionSlugs: [
      "how-do-courts-decide-child-custody",
      "can-i-modify-a-custody-order",
      "does-a-mother-automatically-get-custody",
    ],
  },
];

/** Look up a question by its URL slug. Returns undefined if not found. */
export function getQuestionBySlug(slug: string): CustodyQuestion | undefined {
  return CUSTODY_QUESTIONS.find((q) => q.slug === slug);
}

/** Return all question slugs — used by footer links and sitemaps. */
export function getAllQuestionSlugs(): string[] {
  return CUSTODY_QUESTIONS.map((q) => q.slug);
}
