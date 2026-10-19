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

## Decisions — owner

- [ ] Google Play Store? If yes: create a developer account at play.google.com/console (US$25, identity check takes days)
- [ ] OTP login by SMS? If yes: account with an SMS provider (e.g. MSG91 / Fast2SMS) + DLT registration, then share the API key

## Development backlog — Claude

- [ ] Fix whatever the phone test finds
- [ ] Privacy policy page on go-goride.com (required for Play Store)
- [ ] Play Store release: signed app bundle (.aab), listing text, screenshots, data-safety answers
- [ ] Connect the SMS provider for OTP login (after the decision above)
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

**Backend change** (`backend-node/`):
1. Make the change and test locally.
2. `push-to-github.bat` → describe the change (saves it to both GitHub accounts).
3. `deploy-hostinger-cloud\make-api-package.bat` → creates `gogoride-api.zip`.
4. hPanel → Websites → Web Apps → go-goride.com → **Settings & Redeploy** → upload the zip → Deploy.
   Live data in `~/gogoride-data` is never touched.
5. Check https://go-goride.com/api/health.

**App change** (`go-go-ride apk/`):
1. Raise `versionCode` (+1) and `versionName` in `go-go-ride apk\android\app\build.gradle` — phones only accept an update with a higher versionCode.
2. `"go-go-ride apk\build-apk.bat" https://go-goride.com/api` (signed with the release key).
3. `push-to-github.bat`.
4. `make-api-package.bat` + redeploy (steps 3–4 above) so the download page offers the new APK.

## Done

- [x] Website + Android app built from the design PDF (React + Vite + Capacitor)
- [x] Node.js backend for Hostinger Cloud Startup (688/688 checks identical to the Python backend)
- [x] Privacy: bus owners' phone/email/documents hidden from the public
- [x] Admin protection: only a super admin can change admin accounts
- [x] Deployed to https://go-goride.com with app download page (2026-10-18)
- [x] Signed release APK v1.0
- [x] Code on two GitHub accounts
