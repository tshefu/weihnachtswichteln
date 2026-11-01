# Weihnachtswichteln

A small family website for a secret gift exchange.

Features:
- Registration and login for each family member
- Wishlist management with title and optional link
- Shared overview of everybody's wishes
- Hidden assignment: each person only sees the gift recipient assigned to them
- One admin user can generate the assignments

## Run locally

1. Install dependencies:
   npm install
2. Start the app:
   npm start
3. Open http://localhost:3000

By default, the first registered account becomes the admin user. If you want a dedicated admin account, start the app with an admin key:

ADMIN_REGISTRATION_KEY=mein-geheimes-schluesselwort npm start

Then the admin can register with that exact key on the registration page. Regular family members can register without it.

## Notes

- The app stores data in `data/wichteln.db`
- The assignment is only shown to the person whose gift they are responsible for
- No one else can see the recipient assignment
