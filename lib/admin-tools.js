function removeUserAndData(db, userId) {
  const removeUser = db.transaction(() => {
    db.prepare('DELETE FROM assignments WHERE userId = ? OR recipientId = ?').run(userId, userId);
    db.prepare('DELETE FROM wishlists WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  removeUser();
}

function resetAssignments(db) {
  db.prepare('DELETE FROM assignments').run();
}

module.exports = {
  removeUserAndData,
  resetAssignments,
};
