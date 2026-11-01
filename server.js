const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const { createAssignments } = require('./lib/gift-exchange');
const { removeUserAndData, resetAssignments } = require('./lib/admin-tools');

const app = express();
const port = process.env.PORT || 3000;
const dbDir = path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'wichteln.db');

const db = new Database(dbPath);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'wichteln-family-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  })
);

app.use((req, res, next) => {
  res.locals.notice = req.session.notice || '';
  delete req.session.notice;
  next();
});

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    displayName TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    isAdmin INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    imageUrl TEXT,
    price TEXT,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE,
    recipientId INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id),
    FOREIGN KEY (recipientId) REFERENCES users(id)
  );
`);

const wishlistColumns = db.prepare('PRAGMA table_info(wishlists)').all().map((column) => column.name);
for (const columnName of ['imageUrl', 'price']) {
  if (!wishlistColumns.includes(columnName)) {
    db.exec(`ALTER TABLE wishlists ADD COLUMN ${columnName} TEXT;`);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  next();
}

function getCurrentUser(req) {
  return db
    .prepare(
      'SELECT id, username, displayName, isAdmin FROM users WHERE id = ?'
    )
    .get(req.session.userId);
}


app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', {
    mode: 'login',
    error: '',
    notice: res.locals.notice,
    adminRegistrationEnabled: Boolean(process.env.ADMIN_REGISTRATION_KEY),
  });
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return res.status(400).render('login', {
      mode: 'login',
      error: 'Bitte Benutzername und Passwort eingeben.',
      notice: res.locals.notice,
      adminRegistrationEnabled: Boolean(process.env.ADMIN_REGISTRATION_KEY),
    });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).render('login', {
      mode: 'login',
      error: 'Benutzername oder Passwort ist falsch.',
      notice: res.locals.notice,
    });
  }

  req.session.userId = user.id;
  return res.redirect('/dashboard');
});

app.get('/register', (req, res) => {
  res.render('login', {
    mode: 'register',
    error: '',
    notice: res.locals.notice,
    adminRegistrationEnabled: Boolean(process.env.ADMIN_REGISTRATION_KEY),
  });
});

app.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const displayName = String(req.body.displayName || '').trim();
  const password = String(req.body.password || '');
  const adminKey = String(req.body.adminKey || '').trim();
  const adminRegistrationEnabled = Boolean(process.env.ADMIN_REGISTRATION_KEY);

  if (!username || !displayName || !password) {
    return res.status(400).render('login', {
      mode: 'register',
      error: 'Bitte Name, Benutzername und Passwort eingeben.',
      notice: res.locals.notice,
      adminRegistrationEnabled,
    });
  }

  if (username.length < 3) {
    return res.status(400).render('login', {
      mode: 'register',
      error: 'Der Benutzername muss mindestens 3 Zeichen lang sein.',
      notice: res.locals.notice,
      adminRegistrationEnabled,
    });
  }

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    return res.status(409).render('login', {
      mode: 'register',
      error: 'Dieser Benutzername ist bereits vergeben.',
      notice: res.locals.notice,
      adminRegistrationEnabled,
    });
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

  if (adminRegistrationEnabled && adminKey && adminKey !== process.env.ADMIN_REGISTRATION_KEY) {
    return res.status(403).render('login', {
      mode: 'register',
      error: 'Der Admin-Schlüssel ist falsch.',
      notice: res.locals.notice,
      adminRegistrationEnabled,
    });
  }

  const isAdmin = userCount === 0 || (adminRegistrationEnabled && adminKey === process.env.ADMIN_REGISTRATION_KEY);
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      'INSERT INTO users (username, displayName, passwordHash, isAdmin) VALUES (?, ?, ?, ?)'
    )
    .run(username, displayName, passwordHash, isAdmin ? 1 : 0);

  req.session.userId = result.lastInsertRowid;
  req.session.notice = 'Registrierung erfolgreich. Dein Konto ist angelegt.';
  return res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/rules', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.redirect('/logout');
  }

  return res.render('rules', {
    user,
    notice: res.locals.notice,
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.redirect('/logout');
  }

  const allUsers = db
    .prepare('SELECT id, displayName, isAdmin FROM users WHERE isAdmin = 0 ORDER BY displayName ASC')
    .all();

  const userWishlist = db
    .prepare(
      'SELECT id, title, link, imageUrl, price FROM wishlists WHERE userId = ? ORDER BY createdAt DESC'
    )
    .all(user.id);

  const allWishlistRows = db
    .prepare(
      `SELECT w.id, w.userId, u.displayName AS ownerName, w.title, w.link, w.imageUrl, w.price
       FROM wishlists w
       JOIN users u ON u.id = w.userId
       ORDER BY u.displayName ASC, w.createdAt DESC`
    )
    .all();

  const wishlistsByUser = {};
  for (const row of allWishlistRows) {
    if (!wishlistsByUser[row.userId]) {
      wishlistsByUser[row.userId] = [];
    }
    wishlistsByUser[row.userId].push({
      id: row.id,
      title: row.title,
      link: row.link,
      imageUrl: row.imageUrl,
      price: row.price,
    });
  }

  const familyWishlists = allUsers.map((member) => ({
    id: member.id,
    name: member.displayName,
    items: wishlistsByUser[member.id] || [],
  }));

  const assignedRecord = db
    .prepare(
      `SELECT u.displayName AS recipientName
       FROM assignments a
       JOIN users u ON u.id = a.recipientId
       WHERE a.userId = ?`
    )
    .get(user.id);

  return res.render('dashboard', {
    user,
    userWishlist,
    familyWishlists,
    myRecipient: assignedRecord ? assignedRecord.recipientName : null,
    canAssign: Boolean(user.isAdmin),
    notice: res.locals.notice,
  });
});

app.get('/user/:id', requireAuth, (req, res) => {
  const memberId = Number(req.params.id);
  const currentUser = getCurrentUser(req);

  if (!currentUser) {
    return res.redirect('/logout');
  }

  const member = db
    .prepare('SELECT id, displayName, isAdmin FROM users WHERE id = ?')
    .get(memberId);

  if (!member || member.isAdmin) {
    req.session.notice = 'Dieser Nutzer ist nicht Teil des Wichtel-Teams.';
    return res.redirect('/dashboard');
  }

  const items = db
    .prepare(
      'SELECT id, title, link, imageUrl, price FROM wishlists WHERE userId = ? ORDER BY createdAt DESC'
    )
    .all(memberId);

  return res.render('user-wishlist', {
    currentUser,
    user: member,
    items,
    notice: res.locals.notice,
  });
});

app.post('/wishlist/add', requireAuth, (req, res) => {
  const title = String(req.body.title || '').trim();
  const link = String(req.body.link || '').trim();
  const imageUrl = String(req.body.imageUrl || '').trim();
  const price = String(req.body.price || '').trim();

  if (!title) {
    req.session.notice = 'Bitte gib einen Wunsch ein.';
    return res.redirect('/dashboard');
  }

  db.prepare(
    'INSERT INTO wishlists (userId, title, link, imageUrl, price) VALUES (?, ?, ?, ?, ?)' 
  ).run(req.session.userId, title, link || null, imageUrl || null, price || null);

  req.session.notice = 'Dein Wunsch wurde hinzugefügt.';
  return res.redirect('/dashboard');
});

app.post('/wishlist/delete/:id', requireAuth, (req, res) => {
  const wishlistId = Number(req.params.id);
  const wishlist = db
    .prepare('SELECT userId FROM wishlists WHERE id = ?')
    .get(wishlistId);

  if (!wishlist || wishlist.userId !== req.session.userId) {
    req.session.notice = 'Dieser Wunsch konnte nicht gefunden werden.';
    return res.redirect('/dashboard');
  }

  db.prepare('DELETE FROM wishlists WHERE id = ?').run(wishlistId);
  req.session.notice = 'Der Wunsch wurde gelöscht.';
  return res.redirect('/dashboard');
});

app.post('/assign', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user || !user.isAdmin) {
    req.session.notice = 'Nur der Admin darf die Zuordnungen erstellen.';
    return res.redirect('/dashboard');
  }

  const users = db
    .prepare('SELECT id, displayName, isAdmin FROM users WHERE isAdmin = 0 ORDER BY displayName ASC')
    .all();

  const assignments = createAssignments(users);

  resetAssignments(db);

  if (assignments.length > 0) {
    const insert = db.prepare(
      'INSERT INTO assignments (userId, recipientId) VALUES (?, ?)'
    );
    for (const assignment of assignments) {
      insert.run(assignment.userId, assignment.recipientId);
    }
  }

  req.session.notice = assignments.length
    ? 'Die geheimen Wichtel-Zuordnungen wurden erstellt.'
    : 'Es sind nicht genug Nutzer für eine Zuordnung vorhanden.';
  return res.redirect('/dashboard');
});

app.post('/admin/delete-user/:id', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user || !user.isAdmin) {
    req.session.notice = 'Nur der Admin darf Nutzer löschen.';
    return res.redirect('/dashboard');
  }

  const targetUserId = Number(req.params.id);
  if (!targetUserId || targetUserId === user.id) {
    req.session.notice = 'Du kannst dein eigenes Konto nicht löschen.';
    return res.redirect('/dashboard');
  }

  const targetUser = db
    .prepare('SELECT id, displayName, isAdmin FROM users WHERE id = ?')
    .get(targetUserId);

  if (!targetUser || targetUser.isAdmin) {
    req.session.notice = 'Dieser Nutzer kann nicht gelöscht werden.';
    return res.redirect('/dashboard');
  }

  removeUserAndData(db, targetUserId);
  req.session.notice = `${targetUser.displayName} wurde aus der Familie entfernt.`;
  return res.redirect('/dashboard');
});

app.post('/admin/reset-assignments', requireAuth, (req, res) => {
  const user = getCurrentUser(req);
  if (!user || !user.isAdmin) {
    req.session.notice = 'Nur der Admin darf die Zuordnungen zurücksetzen.';
    return res.redirect('/dashboard');
  }

  resetAssignments(db);
  req.session.notice = 'Die aktuellen Zuordnungen wurden zurückgesetzt.';
  return res.redirect('/dashboard');
});

app.listen(port, () => {
  console.log(`Wichteln app running at http://localhost:${port}`);
});
