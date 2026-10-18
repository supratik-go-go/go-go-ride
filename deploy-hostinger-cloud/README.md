# Put the GO-GO Ride API on Hostinger Cloud Startup

The Android app talks to the **GO-GO Ride API** (`backend-node`, Node.js). Hostinger's Cloud Startup plan runs it
as a **Node.js Web App** at `https://go-goride.com`. No full website is hosted — only the API the app uses, plus a
one-page **"Download the app"** page at `https://go-goride.com` (from `backend-node/public/index.html`).

What runs where:

| Piece | Where |
| --- | --- |
| API (`backend-node`) | Hostinger Node.js web app on go-goride.com |
| Database + uploaded photos/documents | `~/gogoride-data/` in your Hostinger home folder — **outside** the app folder, so redeploys never wipe them |
| Bus alarm reminders | Timer inside the API (every minute, Asia/Kolkata time) |
| Android app | Phones (APK / Play Store), talking to `https://go-goride.com/api` |
| Admin panel | Inside the app (admin login) |

## 1. Make the package (on this PC)

1. Build the live app first (so the download page offers it):
   `"D:\Go-Go-Ride\go-go-ride apk\build-apk.bat" https://go-goride.com/api`
2. Double-click **`make-api-package.bat`**. It copies today's database (buses, routes, stops, accounts) as the
   starter data, adds `GO-GO-Ride.apk` to the download page (only if it was built for go-goride.com), and creates
   **`gogoride-api.zip`** in this folder.

## 2. Free the domain (only if needed)

Hostinger puts a Node.js app on its *own* website entry. If **go-goride.com** is already attached to another
website in hPanel (e.g. the unpublished "My Site"), remove that website first:
hPanel → **Websites** → that website → **⋯ / Settings** → **Delete website**. (It is empty, so nothing is lost;
deleting cannot be undone.)

## 3. Create the Node.js web app

1. hPanel → **Websites** → **Create Website** (or **Add Website**) → **Web App** / **Node.js web app**.
2. Choose **Upload your website files** and upload **`gogoride-api.zip`**.
3. Build settings: framework **Express.js** (if it says *Other*: **Entry file** `server.js`), Node.js version **24.x**
   (or 22.x). Keep the default install/build (it runs `npm install`).
4. Choose the domain **go-goride.com** when asked, then **Deploy**.

## 4. Settings (Environment Variables)

Open the app's dashboard → **Environment Variables**, and add every line from
**`production-secrets.txt`** (same folder, private — never share or commit it):

`ENVIRONMENT`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `CRON_KEY`.

Then **Restart** the app (or **Settings & Redeploy**).

## 5. Check it

Open **https://go-goride.com/api/health** in a browser → `{"success":true,"status":"ok", …}`.
**https://go-goride.com** shows the download page with live bus/route/stop counts and the **Download for Android**
button. Share that link with people so they can install the app.

Then, straight away: log in to the app with the demo **admin** accounts (`9876500001`, `9876500002`, password
`Admin@123`) → Admin → Profile → **change both passwords**, and block or delete the demo passenger/owner/driver accounts.

## 6. Build the app for the live server

```bat
cd "D:\Go-Go-Ride\go-go-ride apk"
build-apk.bat https://go-goride.com/api
```

## Updating later

Run `make-api-package.bat` again → hPanel → the app → **Settings & Redeploy** → upload the new zip → **Deploy**.
Your live database and uploads are untouched (the starter copy is only used the very first time).

## Backups

hPanel → **File Manager** → `gogoride-data/gogoride.db` → **Download** (do this regularly, e.g. weekly).

## Optional: cron backup for alarms

The API sends alarm reminders by itself every minute. As an extra safety net you can add an hPanel **Cron Job**
(every minute, if offered) that opens:
`https://go-goride.com/api/internal/run-alarms?key=<CRON_KEY>` — e.g. command
`curl -s "https://go-goride.com/api/internal/run-alarms?key=<CRON_KEY>"`.

## Good to know

- **OTP sign-in** needs an SMS provider (e.g. MSG91 / Fast2SMS; India requires DLT registration). Until one is
  connected the live API never reveals codes, so the app uses **password** sign-in.
- The VPS kit in `../deploy-hostinger/` is for the Python backend on a VPS — not needed with this setup.
