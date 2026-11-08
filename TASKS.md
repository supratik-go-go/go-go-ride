# GO-GO Ride — Tasks & update checklist

Live: **https://go-goride.com** (API at `/api`, app download page at `/`) · Hostinger Cloud Startup, Node.js web app
Code: GitHub `supratik0000/go-go-ride` and `supratik-go-go/go-go-ride` (every push goes to both)

Tick a box by changing `- [ ]` to `- [x]`, then run `push-to-github.bat`.

---

## Now — owner

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
- [ ] Change the demo admin passwords (9876500001, 9876500002 — `Admin@123`) before sharing the app widely
- [ ] Block/delete the demo passenger, owner and driver accounts when real users join

## Hostinger setup — owner

Auto-deploy is connected to `supratik-go-go/go-go-ride`, branch **main**, root directory **backend-node**. Every push goes live, so only push finished work.

**Never delete the website in hPanel.** Deleting it also deletes `gogoride-data`, the live database. Back it up first if there is ever a reason to.

- [ ] Change `CRON_KEY` in hPanel → Environment variables (the old value appeared in a screenshot). Low risk.
- [ ] Delete the leftover `gogoride-data-empty` folder in File Manager

## Decisions — owner

- [ ] Google Play Store? If yes: create a developer account at play.google.com/console (US$25, identity check takes days)
- [ ] iPhone launch: the project is ready, see `go-go-ride apk\IOS.md`. Needs a Mac and an Apple Developer account (US$99 per year)
- [ ] OTP login by SMS? If yes: account with an SMS provider (e.g. MSG91 / Fast2SMS) + DLT registration, then share the API key

## Development backlog — Claude

- [ ] Fix whatever the phone test finds
- [ ] Play Store release: signed app bundle (.aab), listing text, screenshots, data-safety answers
- [ ] Connect the SMS provider for OTP login (after the decision above)
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
- [ ] Keep `go-go-ride website code` and `go-go-ride apk` in sync for shared screens (or retire the website copy)

## Routine — owner

- [ ] Weekly: hPanel → File Manager → `gogoride-data/gogoride.db` → Download (database backup)

---

## How to ship an update

Hostinger deploys automatically from GitHub (`main` branch, folder `backend-node`) on every push. After each deploy, check https://go-goride.com/api/stats still shows your users.

**Backend change** (`backend-node/`):
1. Make the change and test locally.
2. `push-to-github.bat` → describe the change. Hostinger rebuilds and restarts the API by itself (1–3 minutes).
3. Check https://go-goride.com/api/health. Live data in `~/gogoride-data` is never touched.

**App change** (`go-go-ride apk/`):
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
- [x] App v1.5: new Home tiles (Emergency, SOS, Live Location, My Bus, How to Use), date badge, dark theme, Settings menu, server settings hidden from users
- [x] App v1.4: online Ludo, Call Break, 29 and Carrom; Ping Ball score game
- [x] Hostinger auto-deploy from GitHub (2026-11-03)
- [x] App v1.3: online chess with other users, friend codes, points leaderboard
- [x] App v1.2: iOS project prepared (not built yet), Delete account in Settings, privacy policy at https://go-goride.com/privacy, update popup, rollback.bat, Daily News in English and Bengali (national, international, West Bengal)
