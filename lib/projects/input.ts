import { z } from 'zod';

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
}).strict();

export const projectIdSchema = z.string().uuid();

export function parseCreateProjectInput(input: unknown): { name: string } {
  return createProjectInputSchema.parse(input);
}

export function buildProjectSlug(name: string, suffix: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
  const hexSuffix = suffix.toLowerCase();
  if (!/^[a-f0-9]+$/.test(hexSuffix)) {
    throw new Error('Project slug suffix must be hexadecimal.');
  }
  return `${base}-${hexSuffix}`;
}
