import type { RiskSignal } from "./riskEngine";

const ACTIONS_BY_RISK: Record<string, string> = {
  upcoming_hearing_14_days: "Get ready for your court date. Review your papers and plan what to say.",
  deadline_7_days: "Work on your deadline now. Finish and file your paperwork as soon as you can.",
  court_order_obligations: "Follow what the court ordered. Make a checklist and complete each item on time.",
  motion_without_response: "Check if a response is needed. Ask the court clerk or your lawyer about response timing.",
  relocation_mentioned: "Gather details about the possible move. Track dates, addresses, and how parenting time may change.",
  supervised_visitation: "Review the supervision terms carefully. Make sure visits follow the court’s rules.",
  no_activity_30_days: "Review your case status now. Confirm whether any filing or update is needed.",
  missing_hearing_details: "Find your hearing details now. Confirm the date, time, and courtroom from court records.",
};

export interface GeneratedAction {
  risk_id: string;
  action: string;
}

export function generateActionsForRisks(risks: RiskSignal[]): GeneratedAction[] {
  return risks.map((risk) => ({
    risk_id: risk.id,
    action: ACTIONS_BY_RISK[risk.id] ?? "Review this issue and take the next clear step as soon as possible.",
  }));
}
