import type { ClaimCategory } from "./types";

const categoryPrompts: Record<ClaimCategory, string> = {
  decision: "What led to this decision, and which alternatives or trade-offs should the next teammate know?",
  ownership: "What does this person own today, and what should the next teammate know to maintain it?",
  blocker: "What is blocking progress, who or what can unblock it, and what has already been tried?",
  risk: "What could go wrong, what warning signs should the next teammate watch, and what mitigation exists?",
  "next-action": "What is the next concrete action, who should take it, and what needs to happen first?",
};

export function interviewPromptFor(category: ClaimCategory): string {
  return categoryPrompts[category];
}
