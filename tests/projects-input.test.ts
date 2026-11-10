import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectSlug, parseCreateProjectInput, projectIdSchema } from '../lib/projects/input';

test('project name trims valid input', () => {
  assert.deepEqual(parseCreateProjectInput({ name: '  Project Chronos  ' }), { name: 'Project Chronos' });
});

test('project name rejects blank, whitespace, extra role fields, and names over 120 characters', () => {
  for (const input of [{ name: '' }, { name: '   ' }, { name: 'valid', role: 'lead' }, { name: 'valid', clearance: 3 }, { name: 'x'.repeat(121) }]) {
    assert.throws(() => parseCreateProjectInput(input));
  }
});

test('project ID accepts UUID and rejects invalid values', () => {
  assert.equal(projectIdSchema.parse('20000000-0000-4000-8000-000000000011'), '20000000-0000-4000-8000-000000000011');
  assert.equal(projectIdSchema.safeParse('not-a-uuid').success, false);
});

test('project slug normalizes punctuation and falls back for non-ASCII names', () => {
  assert.equal(buildProjectSlug('  Hello, World!  ', 'a1b2'), 'hello-world-a1b2');
  assert.equal(buildProjectSlug('東京', 'c3d4'), 'project-c3d4');
});

test('project slug distinguishes repeated names with distinct suffixes', () => {
  assert.notEqual(buildProjectSlug('Project Chronos', 'a1b2'), buildProjectSlug('Project Chronos', 'c3d4'));
});
