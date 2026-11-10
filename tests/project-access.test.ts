import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRouteMembershipMatches } from '../lib/projects/access';

const membership = { userId: 'user-1', projectId: 'project-1' };

test('project route membership accepts exact user and project', () => {
  assert.equal(projectRouteMembershipMatches('user-1', 'project-1', membership), true);
});

test('project route membership rejects wrong user, wrong project, and missing membership', () => {
  assert.equal(projectRouteMembershipMatches('user-2', 'project-1', membership), false);
  assert.equal(projectRouteMembershipMatches('user-1', 'project-2', membership), false);
  assert.equal(projectRouteMembershipMatches('user-1', 'project-1', null), false);
});
