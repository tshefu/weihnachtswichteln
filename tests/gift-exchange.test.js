const test = require('node:test');
const assert = require('node:assert/strict');

const { createAssignments } = require('../lib/gift-exchange');

test('creates unique secret-santa assignments without self-assignment', () => {
  const users = [
    { id: 1, name: 'Anna' },
    { id: 2, name: 'Ben' },
    { id: 3, name: 'Clara' },
    { id: 4, name: 'Dora' }
  ];

  const assignments = createAssignments(users);

  assert.equal(assignments.length, users.length);

  for (const user of users) {
    const assignment = assignments.find((item) => item.userId === user.id);
    assert.ok(assignment, `missing assignment for ${user.name}`);
    assert.notEqual(assignment.recipientId, user.id);
  }

  const recipientIds = assignments.map((item) => item.recipientId).sort((a, b) => a - b);
  assert.deepEqual(recipientIds, [1, 2, 3, 4]);
});

test('handles a single user without creating invalid assignments', () => {
  const users = [{ id: 1, name: 'Anna' }];

  const assignments = createAssignments(users);

  assert.deepEqual(assignments, []);
});

test('excludes admin users from the secret-santa draw', () => {
  const users = [
    { id: 1, name: 'Anna', isAdmin: 0 },
    { id: 2, name: 'Ben', isAdmin: 1 },
    { id: 3, name: 'Clara', isAdmin: 0 },
    { id: 4, name: 'Dora', isAdmin: 0 }
  ];

  const assignments = createAssignments(users);

  assert.equal(assignments.length, 3);
  assert.ok(assignments.every((assignment) => assignment.userId !== 2));
  assert.ok(assignments.every((assignment) => assignment.recipientId !== 2));
});
