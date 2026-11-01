const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const { removeUserAndData, resetAssignments } = require('../lib/admin-tools');

test('removeUserAndData deletes a user, their wishlist, and related assignments', () => {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      displayName TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      isAdmin INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      link TEXT,
      imageUrl TEXT,
      price TEXT
    );

    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      recipientId INTEGER NOT NULL
    );
  `);

  db.prepare('INSERT INTO users (id, username, displayName, passwordHash, isAdmin) VALUES (?, ?, ?, ?, ?)').run(1, 'anna', 'Anna', 'hash1', 0);
  db.prepare('INSERT INTO users (id, username, displayName, passwordHash, isAdmin) VALUES (?, ?, ?, ?, ?)').run(2, 'ben', 'Ben', 'hash2', 0);
  db.prepare('INSERT INTO users (id, username, displayName, passwordHash, isAdmin) VALUES (?, ?, ?, ?, ?)').run(3, 'carla', 'Carla', 'hash3', 1);

  db.prepare('INSERT INTO wishlists (userId, title) VALUES (?, ?)').run(1, 'Buch');
  db.prepare('INSERT INTO wishlists (userId, title) VALUES (?, ?)').run(2, 'Pokal');

  db.prepare('INSERT INTO assignments (userId, recipientId) VALUES (?, ?)').run(1, 2);
  db.prepare('INSERT INTO assignments (userId, recipientId) VALUES (?, ?)').run(2, 1);

  removeUserAndData(db, 2);

  const remainingUsers = db.prepare('SELECT id FROM users ORDER BY id ASC').all();
  const remainingWishlist = db.prepare('SELECT COUNT(*) AS count FROM wishlists WHERE userId = 2').get();
  const remainingAssignments = db.prepare('SELECT COUNT(*) AS count FROM assignments WHERE userId = 2 OR recipientId = 2').get();

  assert.deepEqual(remainingUsers.map((user) => user.id), [1, 3]);
  assert.equal(remainingWishlist.count, 0);
  assert.equal(remainingAssignments.count, 0);
});

test('resetAssignments clears all current assignments for a fresh start', () => {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      recipientId INTEGER NOT NULL
    );
  `);

  db.prepare('INSERT INTO assignments (userId, recipientId) VALUES (?, ?)').run(1, 2);
  db.prepare('INSERT INTO assignments (userId, recipientId) VALUES (?, ?)').run(2, 1);

  resetAssignments(db);

  const count = db.prepare('SELECT COUNT(*) AS count FROM assignments').get().count;
  assert.equal(count, 0);
});
