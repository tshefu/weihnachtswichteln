function shuffle(items) {
  const clone = [...items];

  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }

  return clone;
}

function createAssignments(users) {
  const participants = users.filter((user) => !user.isAdmin);

  if (participants.length < 2) {
    return [];
  }

  const randomized = shuffle(participants);
  const assignments = [];

  for (let i = 0; i < randomized.length; i += 1) {
    const giver = randomized[i];
    const recipient = randomized[(i + 1) % randomized.length];

    assignments.push({
      userId: giver.id,
      recipientId: recipient.id,
    });
  }

  return assignments;
}

module.exports = {
  createAssignments,
};
