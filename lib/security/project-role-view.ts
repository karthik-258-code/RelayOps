import type { HandoverState, Role, RoleHandover } from "@/lib/domain/types";

const roleClearance: Record<Role, 1 | 3> = {
  contributor: 1,
  "project-lead": 3,
};

/** Return only information the selected demo role is allowed to render. */
export function projectForRole(project: HandoverState, role: Role): RoleHandover {
  const clearance = roleClearance[role];
  const claims = project.claims
    .filter((claim) => claim.clearance <= clearance)
    .map((claim) => ({
      ...claim,
      citations: claim.citations.filter((citation) => citation.clearance <= clearance),
    }));

  return {
    claims,
    restrictedCount: project.claims.filter((claim) => claim.clearance > clearance).length,
  };
}
