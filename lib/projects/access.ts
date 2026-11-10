export type ProjectRouteMembership = { userId: string; projectId: string };

export function projectRouteMembershipMatches(
  userId: string,
  projectId: string,
  membership: ProjectRouteMembership | null,
): boolean {
  return membership?.userId === userId && membership.projectId === projectId;
}
