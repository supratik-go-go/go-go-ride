# GO-GO Ride — Tasks & update checklist

Live: **https://go-goride.com** (API at `/api`, app download page at `/`) · Hostinger Cloud Startup, Node.js web app
Code: GitHub `supratik0000/go-go-ride` and `supratik-go-go/go-go-ride` (every push goes to both)

Tick a box by changing `- [ ]` to `- [x]`, then run `push-to-github.bat`.

---

## Now — owner

- [ ] Admin panel → Local Vehicles: set the right Type (Toto/Auto, Car, Tourist Bus) for listings made before v1.7 — they all start as Car
- [ ] Test the app on a real phone and note problems:
  - [ ] Search Howrah Station → Esplanade, open bus S12
  - [ ] Set an alarm (allow notifications) — does it save and ring?
  - [ ] Phone back button: goes back one screen, closes the app from Home
  - [ ] Nearby Bus Stops with location allowed
  - [ ] Anything cut off, overlapping, slow or confusing
- [ ] Back up the app signing key to USB / Google Drive (NOT GitHub):
  `go-go-ride apk\android\keystore\` and `go-go-ride apk\android\keystore.properties`
- [ ] Back up `deploy-hostinger-cloud\production-secrets.txt` the same way
- [ ] Check both GitHub repos are **Private** (repo → Settings)
- [x] Demo accounts blocked on the live server (2026-11-25); deleted at the MySQL switch
- [x] Live server moved to MySQL (2026-11-25): demo data removed, 1,092 buses from the Excel file loaded
- [ ] Owner: sign in with your own number and your password, check it works, then delete `backend-node\data\YOUR-TEMPORARY-PASSWORD.txt`
- [ ] Change the MySQL password in hPanel → Databases (it was written in a chat), then update `MYSQL_PASSWORD` in Environment variables and in `production-secrets.txt`
- [ ] Local Vehicle has no listings now (the 4 were demo): add real drivers, or ask drivers to list themselves
- [ ] Check the 51 buses in `Downloads\bus-import-check-list.xlsx` (15 were not loaded); fix them in Excel and import again from Admin → Buses → Import
- [ ] Keep the old SQLite file `gogoride-data/gogoride.db` on Hostinger as a backup for a few weeks; don't delete it yet

## Hostinger setup — owner

Auto-deploy is connected to `supratik-go-go/go-go-ride`, branch **main**, root directory **backend-node**. Every push goes live, so only push finished work.

**Never delete the website in hPanel.** Deleting it also deletes `gogoride-data` (uploaded photos and documents, and the old SQLite backup). The live database is MySQL in hPanel → Databases since 2026-11-25.

- [ ] Change `CRON_KEY` in hPanel → Environment variables (the old value appeared in a screenshot). Low risk.
- [ ] Delete the leftover `gogoride-data-empty` folder in File Manager

## Decisions — owner

- [ ] Google Play Store? If yes: create a developer account at play.google.com/console (US$25, identity check takes days)
- [ ] iPhone launch: the project is ready, see `go-go-ride apk\IOS.md`. Needs a Mac and an Apple Developer account (US$99 per year)
- [x] OTP by SMS: decided 2026-11-27 that it must cost GO-GO Ride nothing: the user sends one SMS from their own number to the owner's phone (receiving is free, no daily limit). Asked at sign-up, Forgot password and Change password, not at every login (replaces the 2026-11-25 idea of the owner's phone sending codes)

## App v1.12 — mobile number check by SMS (2026-11-27)

- [ ] Owner: set up the SMS phone (own phone, or a second SIM in it if the personal number should not be shown to users): install "SMS Gateway for Android", allow SMS, switch on Cloud Server and go Online, battery saving off for the app, RCS chats off in Google Messages (RCS messages never reach the app). Then in hPanel add `SMS_GATEWAY_USER`, `SMS_GATEWAY_PASSWORD` (from the app's Cloud Server section) and `SMS_RECEIVE_NUMBER` (that SIM's number), save and redeploy. `/api/health` then shows `"sms":"ok"`; test with Forgot password on a phone
- [ ] Owner: set up Google sign-in (free): Google Cloud project "GO-GO Ride", Google Auth Platform branding + audience External, published; an Android client (package `com.gogoride.app`, SHA-1 of the release key `96:15:D2:5A:25:46:0C:B9:56:B8:68:02:46:81:97:00:74:FA:80:A4`) and a Web application client; put the Web client ID in hPanel as `GOOGLE_CLIENT_ID`. If the app later goes to Google Play with Play App Signing, add Play's SHA-1 too
- [ ] Owner: test v1.12 on a phone (sign-up, Forgot password, Settings > Change Password, the SMS app opens with the message filled in, Continue with Google, Settings > Mobile Number)
- Also in v1.12: Continue with Google on the opening screen and Login, no mobile number needed (owner's choice); the number can be added later in Settings > Mobile Number. A Gmail already on a phone account is refused (sign in with the number)
- Also in v1.12: the opening screen's Bus / Car / Auto / Bike icons are pictures only (they used to open the app without signing in); "Guest Login" now reads "As A Guest"

## App v1.9 and v1.11 — the owner's changes (2026-11-25)

v1.9 released 2026-11-25 (1, 6, 7, 8 and the search-card fixes). v1.10 and v1.11 combined into v1.11 (2, 4, 5, 9).

- [ ] Owner: test both on a real phone (voice search in all three languages, ticket photo with the camera, Allow location)
- [ ] Second names (other spellings, Bengali / Hindi) for busy stops help voice search. Admin editing comes with phase B #9; until then send Claude a list (stop -> other names)

1. Home search box 20% shorter (same layout, tighter spacing)
2. Add Bus Info: choose "Manually" (today's form) or "Upload your ticket photo" (camera or gallery, note, Submit ticket); new admin page "Ticket photos"
3. (no change 3)
4. Emergency Call List: a search box over every number; a "Local police" section; signed-in users add their local police station, shown after an admin approves it
5. Voice search: microphone inside the orange Search Buses button, sound-wave bars while listening; English, Hindi and Bengali ("X to Y", "X থেকে Y", "X से Y" fill From and To; the server matches Bengali/Hindi spellings to stop names)
6. Add Bus Information: Bus Number optional, Bus Name required instead (owner and admin forms too)
7. Live Location: "Allow location" goes straight to Android's permission popup, the phone's Location switch, or the app's permission page; no instruction screen; "While using the app" only
8. Home: remove Popular Routes; add Recent Search (today / yesterday cards, repeat or remove, View All); guests keep theirs on the phone
9. Forgot password with the account's own number proved by SMS; new password + confirm (finished in v1.12, see above)
- Also: search card shows the bus name when there is no bus number, and hides "₹0" when the fare is not known
- Also: update `express-rate-limit` to 8.7.5 (Hostinger security warning, moderate)

## Development backlog — Claude

- [ ] Merge the request-checking code into one module: `validate.js`, `pyfields.js`, `pyvalidate.js`, `services/pydantic.js` and the copy inside `routes/admin.js` (about 1,000 lines). `node scripts/api-check.mjs` guards every message
- [ ] Split the largest route files (`admin.js`, `buses.js`, `network.js`, `cars.js`) into routes (addresses) + services (logic) + data (SQL)
- [ ] Serve the API at `/api/v1` as well as `/api` (installed phones keep using `/api`)
- [ ] Fix whatever the phone test finds
- [ ] Play Store release: signed app bundle (.aab), listing text, screenshots, data-safety answers
- [ ] Computer players for empty seats, so Call Break and 29 can start without 4 people online
- [ ] Bengali language for the whole app (owner to decide how much)
- [ ] How to Use video: owner to record it, then set `VIDEO_URL` in `go-go-ride apk/src/pages/passenger/HowToUse.jsx`
- [ ] Hold the app's first release of a new game until phones have updated: an old app opening a new game's friend code will fail
- [ ] Check the server alarm scheduler: Hostinger stops idle apps, so background timers can miss their time. Phone reminders are not affected
- [ ] When the app moves to Google Play: send the update popup to the Play listing instead of the APK download
- [ ] Running Car shows "Live" when only past rides exist — count future rides only
- [ ] Owners cannot resubmit a rejected bus — move it back to "Under review" when edited
- [ ] Local cars deactivated by an admin disappear from the admin list — show them with a filter
- [ ] Broadcast notifications share one "read" flag for all users — make read state per user
- [ ] Push notifications (Firebase) for bus approvals / booking updates when the app is closed

## Routine — owner

- [ ] Weekly: hPanel → File Manager → `gogoride-data/gogoride.db` → Download (database backup)

---

## How to ship an update

Hostinger deploys automatically from GitHub (`main` branch, folder `backend-node`) on every push. After each deploy, check https://go-goride.com/api/stats still shows your users.

**Backend change** (`backend-node/`):
1. Make the change and test locally.
2. `push-to-github.bat` → describe the change. Hostinger rebuilds and restarts the API by itself (1–3 minutes).
3. Check https://go-goride.com/api/health. Live data in `~/gogoride-data` is never touched.

**App change** (`go-go-ride apk/`): double-click **`release-app.bat`**. It asks for the new version number and one line for users, builds the APK (15–25 minutes), then publishes when you type YES. If the build fails, run it again: it reuses the same version.

What it does, if you ever need to do it by hand:
1. Raise `versionCode` (+1) and `versionName` in `go-go-ride apk\android\app\build.gradle` — phones only accept an update with a higher versionCode.
   Use the same numbers for iPhone in Xcode (General tab) when that version is released.
2. `"go-go-ride apk\build-apk.bat" https://go-goride.com/api` — builds the signed APK and puts it on the download page.
3. Put one line for users in `go-go-ride apk\release-notes.txt`. It appears in the update popup.
4. `push-to-github.bat` → the new APK goes live on go-goride.com, and phones show the update popup next time the app opens.

Manual fallback (if auto-deploy is ever off): `deploy-hostinger-cloud\make-api-package.bat`, then hPanel → the app → Settings & Redeploy → upload `gogoride-api.zip`.

## How to roll back

Every `push-to-github.bat` saves a restore point. If an update goes wrong, run `rollback.bat`, pick a restore point, and type YES.

- **Server:** goes back as soon as the push is deployed.
- **Phone app:** Android can't install a lower version over a higher one, so the old code is built as a new, higher version. Phones get it through the update popup.
- **Data:** users, bookings and other live data are never changed.
- If auto-deploy isn't connected, upload `gogoride-api.zip` afterwards, as in the manual fallback above.

## Done

- [x] App v1.8 + clean-up: crash screen on every screen, server crash logging, 727 automatic server checks (`node scripts/api-check.mjs`), API list in `docs/API.md`, architecture guide in `README.md`, old website copy / Python server / VPS kit removed, dead code removed, `start-gogo-ride.bat` now runs the Node server, `release-app.bat` for one-click releases
- [x] Website + Android app built from the design PDF (React + Vite + Capacitor)
- [x] Node.js backend for Hostinger Cloud Startup (688/688 checks identical to the Python backend)
- [x] Privacy: bus owners' phone/email/documents hidden from the public
- [x] Admin protection: only a super admin can change admin accounts
- [x] Deployed to https://go-goride.com with app download page (2026-10-18)
- [x] Signed release APK v1.0
- [x] Code on two GitHub accounts
- [x] Repo ready for Hostinger auto-deploy (APK + download page committed)
- [x] App v1.1: Guest Login / Create Account on the first screen, Via stop in bus search, bottom bar now Home · Local Cars · Game · Daily News · Profile (Running Car stays on the Home screen), "Service Coming Soon.." in place of not-found messages
- [x] Add Bus Information / Add Route Information for any signed-in user, checked by admins in Bus Requests / Route Requests
- [x] App v1.7: Local Vehicle with Toto/Auto, Car and Tourist Bus categories (Home section and bottom tab), Running Car banner removed from Home, green Live sign on the Live Location Track tile
- [x] App v1.6: bus import from Excel for admins, app version on Profile and login, Server settings hidden unless the phone really uses a different server
- [x] App v1.5: new Home tiles (Emergency, SOS, Live Location, My Bus, How to Use), date badge, dark theme, Settings menu, server settings hidden from users
- [x] App v1.4: online Ludo, Call Break, 29 and Carrom; Ping Ball score game
- [x] Hostinger auto-deploy from GitHub (2026-11-03)
- [x] App v1.3: online chess with other users, friend codes, points leaderboard
- [x] App v1.2: iOS project prepared (not built yet), Delete account in Settings, privacy policy at https://go-goride.com/privacy, update popup, rollback.bat, Daily News in English and Bengali (national, international, West Bengal)
