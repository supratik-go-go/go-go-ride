# GO-GO Ride

Local transport app for West Bengal: bus search and timetables, arrival alarms, local cars, online games, news.
Live at https://go-goride.com (API at `/api`, app download page at `/`). Android app is live; iPhone is prepared but not built.

The owner is not a developer. Explain in plain words, give click-by-click steps for hPanel, and ask for a screenshot when unsure.
The owner wants a phone app only; no website is hosted. Never paste secrets into the chat.

**Keep this file current.** When a piece of work changes the setup, the version, or what's next, update it before finishing. Keep it short; history belongs in git and `TASKS.md`.

## Folders

| Folder | What |
| --- | --- |
| `backend-node/` | The live server. Express 5, built-in `node:sqlite`, Node 24 |
| `go-go-ride apk/` | The phone app. React 19, Vite 8, Capacitor 8. `android/` is live; `ios/` is prepared, see `IOS.md` |
| `TASKS.md` | Owner to-dos, backlog, release and rollback steps |
| `deploy-hostinger-cloud/` | Manual zip upload fallback. `production-secrets.txt` is private and git-ignored |
| `go-go-ride website code/` | Old website copy. Not hosted, not kept in sync |
| `backend-python/` | Original FastAPI backend. Not deployed; only `start-gogo-ride.bat` uses it locally |
| `deploy-hostinger/` | Old VPS kit, unused |

## Deploying

- Hostinger Cloud Startup, Node.js web app. It **auto-deploys from GitHub** `supratik-go-go/go-go-ride`, branch `main`, root directory `backend-node`, Node 24.x, entry `server.js`. A push goes live in about 30 seconds.
- **Every push to `main` is live for real users.** Push only finished, tested work, and push server changes and the matching APK together.
- `origin` pushes to both GitHub accounts (supratik0000 and supratik-go-go). Push with `GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git push origin main --tags`, after `node "go-go-ride apk/scripts/tag-release.mjs"` saves a restore point. `push-to-github.bat` does all three for the owner.
- Live data lives in `~/gogoride-data` on Hostinger, never in git. **Deleting the website in hPanel deletes it** (this happened on 2026-11-03 and was restored from the owner's backup). A deploy that finds no database silently starts an empty one, so after any deploy check that https://go-goride.com/api/stats still shows the users (19 on 2026-11-03).
- hPanel has exactly 5 environment variables: `ENVIRONMENT=production`, `CORS_ORIGINS`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CRON_KEY`. The values are in `deploy-hostinger-cloud/production-secrets.txt`. Never print or commit them.
- Hosting limits: no inbound WebSockets, idle apps are stopped, one process, 120 seconds per request. So no timers, background work or in-memory state on the server.
- `rollback.bat` (`go-go-ride apk/scripts/rollback.mjs`) goes back to a restore point. An app rollback ships as a new, higher version, because Android won't install a lower one.

## Releasing an app version

1. Raise `versionCode` and `versionName` in `go-go-ride apk/android/app/build.gradle`, and `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`.
2. Write one line for users in `go-go-ride apk/release-notes.txt`. It appears in the update popup.
3. Run `& 'D:\Go-Go-Ride\go-go-ride apk\build-apk.bat' https://go-goride.com/api` in the Terminal panel. It takes 15 to 25 minutes and copies the APK and `app-info.json` into `backend-node/public/downloads/`.
4. Commit, save a restore point, push. Phones on v1.2 or later show **Update available** (`src/native/UpdatePrompt.jsx` reads `/api/app-version`).

The signing key (`go-go-ride apk/android/keystore/`, `android/keystore.properties`) is git-ignored. Never commit it. Losing it means every user has to reinstall.

## Current state (2026-11-08)

- Live app: **v1.4** (versionCode 5). Not yet tested on real phones.
- Features: bus search with a Via stop, alarms, local cars, Add Bus and Add Route Information with admin review, Daily News in English and Bengali, delete account, privacy page at `/privacy`, update popup.
- Online games, turn based and polled every 2.5 seconds: chess, ludo (2 players), callbreak (4), twentynine (4, two teams), carrom (2). Ping Ball is a score game only. Points: win 10, draw 3, loss 1; leaving earns 0; a pair only earns from 5 games together a day.
- Next: see `TASKS.md`. Pending owner decision: computer players for empty seats in Call Break and 29.

## Code

- Server: routes in `src/routes`, logic in `src/services`, game engines in `src/games`. Engine contract: `seats`, `start()`, `turn(state)`, `view(state, seat)`, `move(state, seat, input)`, optional `forfeitWinners(seat)`. All randomness on the server with `node:crypto`; `view()` must never leak hidden cards or trump.
- Database: SQLite with PascalCase tables, camelCase columns, timestamps in milliseconds, 0/1 booleans. New tables go in `ADDED_TABLES` in `src/db.js` (`CREATE TABLE IF NOT EXISTS`). Never change existing columns: the live database already has them.
- Responses use `{ success, message, data, meta }`.
- App: pages in `src/pages`, API calls in `src/services`, Android and iOS code in `src/native`. CSS classes are prefixed per area (`px-`, `own-`, `adm-`, `acc-`, `game-`). Icons come from `lucide-react` only; check them with `node scripts/check-icons.mjs`.
- Match the surrounding code. Comments are sparse and explain why.

## Working on this PC

- Windows. The D: drive is nearly full and slow: builds take 15 to 25 minutes and a git commit can take minutes, so run long commands in the background.
- Claude's Bash sandbox blocks localhost. Run servers and Gradle through the Terminal panel tool. PowerShell scripts are disabled, so use inline commands or `.bat` files.
- Bash heredocs mangle backslashes. Edit Windows paths and regexes with the Edit/Write tools or a Python script file. Many source files use CRLF line endings.
- Local testing: in `backend-node`, run `node server.js` with `PORT=8100`, `DATABASE_PATH=./data/test-8100.db` and `UPLOAD_DIR=./data/uploads-8100` (`data/` is git-ignored). In the app folder, run `node node_modules\vite\bin\vite.js --port 5174`, then set localStorage `gogo.apiBase` to `http://localhost:8100/api`. Demo logins are in `FRONTEND_API_GUIDE.md`; use them on the test database only.
- The built-in browser pane doesn't run `requestAnimationFrame` while hidden, so animations look frozen there.
- Never write to live data while testing. This PC's DNS can cache an old address for go-goride.com; test with `curl --resolve go-goride.com:443:<IP from https://dns.google/resolve?name=go-goride.com>`.
