export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: 'lead' | 'reviewer' | 'contributor';
  clearance: 1 | 2 | 3;
};

export function sortProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => Number(right.project.isDemo) - Number(left.project.isDemo)
      || left.project.name.localeCompare(right.project.name, undefined, { sensitivity: 'base' })
      || left.index - right.index)
    .map(({ project }) => project);
}
