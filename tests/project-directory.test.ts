import assert from 'node:assert/strict';
import test from 'node:test';
import { sortProjects, type ProjectSummary } from '../lib/projects/directory';

const project = (id: string, name: string, isDemo = false): ProjectSummary => ({
  id, name, slug: id, isDemo, role: 'lead', clearance: 3,
});

test('project directory ordering puts demos first and sorts names without mutating input', () => {
  const input = [project('z', 'Zulu'), project('b', 'Beta', true), project('a', 'Alpha'), project('a2', 'Alpha', true)];
  const sorted = sortProjects(input);
  assert.deepEqual(sorted.map(({ id }) => id), ['a2', 'b', 'a', 'z']);
  assert.deepEqual(input.map(({ id }) => id), ['z', 'b', 'a', 'a2']);
});

test('project directory ordering preserves stable order for matching names', () => {
  const input = [project('first', 'Same'), project('second', 'Same')];
  assert.deepEqual(sortProjects(input).map(({ id }) => id), ['first', 'second']);
});
