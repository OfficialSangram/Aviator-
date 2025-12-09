Aviator Demo - README
=====================

Contents:
- server/  -> Node.js server (SQLite)
- client/  -> React client (simple OTP + wallet + game UI)
- icon.png -> placeholder app icon

Quick local run (PC recommended):
1) Server:
   cd server
   npm install
   node server.js
   Server runs on http://localhost:3001 (OTP printed in console for demo)

2) Client (dev):
   cd client
   npm install
   npm start
   React dev server on http://localhost:3000 (connects to server by default)

Build APK (recommended on PC with Android Studio):
1) From client/ build web assets:
   npm run build
2) Add Capacitor & Android native project (on your PC):
   npm install @capacitor/core @capacitor/cli
   npx cap init Aviator com.example.aviator --web-dir=build
   npx cap add android
   npx cap copy
   npx cap open android
3) In Android Studio: Build > Generate Signed Bundle/APK, follow steps to create signed APK.

You can also deploy server to a VPS and change REACT_APP_API_URL to your server domain before building.

Updates in v2:
- Admin React page (client/src/Admin.jsx) to view users, bets, withdraw requests.
- Withdraw request flow: /api/wallet/withdraw/request (user) and admin approve/reject endpoints.
- New zip created AviatorDemo_v2.zip


Updates in v3:
- Spribe-style red theme and CrashCanvas animation
- Live players & public bet list in client (socket events)
- Transaction history UI and user bets endpoint
- Promo & referral system (admin create promo, user redeem, referral bonus 5%)
- Admin referrals view
- Splash screen and updated icon

Referral bonus fixed at 5% as chosen.
