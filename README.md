# GO-GO Ride

Local transport for West Bengal: bus search and timetables, arrival alarms, Local Vehicle drivers
(Toto/Auto, Car, Tourist Bus), shared Running Car rides, online games, daily news.
Live at <https://go-goride.com>: the API is at `/api`, the page at `/` offers the Android app download.

## How it fits together

```
 Android app (React inside Capacitor)  --HTTPS + JSON-->  API (Node.js, Express)  -->  MySQL database
 go-go-ride apk/                                          backend-node/                hPanel > Databases on Hostinger
        ^                                                        ^
        |  "Update available" popup reads /api/app-version       |  every push to GitHub main deploys it
        |  the APK is downloaded from /download/GO-GO-Ride.apk   |  (Hostinger, about a minute)
```

The server holds all data and rules; the app only shows screens and calls the API.
Games are turn based and the app asks the server every 2.5 seconds, because the hosting plan
allows no WebSockets, no background work and no memory between requests.

## Folders

| Folder / file | What |
| --- | --- |
| [`backend-node/`](backend-node) | The live API. Express 5, MySQL (`mysql2`), Node 24. Tables: [`backend-node/mysql/schema.sql`](backend-node/mysql/schema.sql) |
| [`docs/mysql-plan.md`](docs/mysql-plan.md) | The database design, decided step by step with the owner, and the move from SQLite |
| [`go-go-ride apk/`](go-go-ride%20apk) | The phone app. React 19, Vite, Capacitor 8. Android is live; iOS is prepared ([`IOS.md`](go-go-ride%20apk/IOS.md)) |
| [`docs/API.md`](docs/API.md) | Every API address and who may call it, generated from the code |
| [`docs/`](docs) | Design mockups, sample API replies, the Excel bus-import template |
| [`deploy-hostinger-cloud/`](deploy-hostinger-cloud) | Manual upload fallback if GitHub auto-deploy is ever off |
| [`TASKS.md`](TASKS.md) | To-do list, backlog, release and rollback steps |
| [`CLAUDE.md`](CLAUDE.md) | Short project summary that Claude reads at the start of every session |
| `*.bat` | One-click tools, see [Everyday tasks](#everyday-tasks) |

## The app: `go-go-ride apk/src`

| Folder | What goes there |
| --- | --- |
| `pages/<area>/` | One file per screen: `passenger`, `account`, `auth`, `owner`, `admin`, `public` |
| `components/ui/` | Shared building blocks: Button, Input, Modal, Badge, cards, tables, loading / empty / error states, the crash screen |
| `components/<area>/` | Pieces used by one area, e.g. `passenger/LocalCarCard.jsx`, `games/`, `map/`, `tracking/` |
| `services/` | All calls to the API, one file per area (`busService`, `localCarService` in `transportService.js`, ...). No screen code |
| `api/client.js` | The single HTTP client: server address, sign-in tokens, turning error replies into `ApiError` |
| `context/` | App-wide state: who is signed in (`AuthContext`), toast messages (`ToastContext`) |
| `hooks/` | Reusable React logic: `useAsync`, `usePagedQuery`, `useDebounce`, `useNow` |
| `layouts/` | Page frames (bottom tab bar, admin sidebar), sign-in guards, a crash screen around every screen |
| `native/` | Android / iOS only: alarm notifications, back button, update popup, server setting |
| `utils/` | Plain helpers: dates and times, labels for codes (`label('localVehicleType', 'CAR')`), theme |
| `styles/` | Global styles and the dark theme (`dark.css`) |

Rules: screens get data through `services/`, never with `fetch` directly. CSS classes start with the
area's prefix (`px-` passenger, `own-` owner, `adm-` admin, `acc-` account, `game-` games).
Icons come from `lucide-react` only. More in [`go-go-ride apk/CONVENTIONS.md`](go-go-ride%20apk/CONVENTIONS.md).

## The server: `backend-node/src`

| File / folder | What it does |
| --- | --- |
| `app.js` | Sets up Express: allowed origins, rate limits, static files, mounts every route file under `/api` |
| `routes/<area>.js` | The addresses for one area: reads and checks the request, checks who may call it, replies |
| `services/` | Logic shared by several routes or too big for one: bus import, bus search, games, news, reports |
| `games/` | One engine per game (`seats`, `start`, `turn`, `view`, `move`); `view` never reveals hidden cards |
| `db.js` | The MySQL connection and helpers (`all`, `get`, `run`, `insert`, `update`, `tx`); makes the tables in an empty database on start |
| `serialize.js` | Turns database rows into the JSON the app receives |
| `auth.js` | Passwords, sign-in tokens and the guards `requireUser`, `requireAdmin`, ... |
| `errors.js` | `ApiError` and the one error handler that shapes every error reply |
| `config.js` | Every setting, read from environment variables with safe local defaults |
| `validate.js`, `pyfields.js`, `pyvalidate.js`, `services/pydantic.js` | Request checking. Four overlapping versions from the move off Python; merging them is the next clean-up |

Database: snake_case tables and columns, dates stored as India time and handed to the code as milliseconds,
0/1 for yes/no. `serialize.js` turns the new names back into the JSON fields the app has always received.
A change to an existing table needs an ALTER step for the live database, not only an edit of `schema.sql`.

The server was copied from an earlier Python server so that the app saw identical replies.
Comments that mention Python explain those choices; the Python code is in git history
(removed after release `release-20261115211303`).

## Settings

Settings live outside the code.

- **Server:** environment variables, listed with explanations in [`backend-node/.env.example`](backend-node/.env.example).
  The live server has exactly ten, set in hPanel: `ENVIRONMENT=production`, `CORS_ORIGINS`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CRON_KEY`, and the database login `MYSQL_HOST`, `MYSQL_PORT`,
  `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`. Their values are only in
  `deploy-hostinger-cloud/production-secrets.txt` (private, never in git). Everything else uses defaults.
  On this PC the test database login is in `backend-node/data/mysql-test.env` (private, never in git).
- **App:** `go-go-ride apk/.env.production` holds the server address baked into the APK
  (`build-apk.bat` writes it). Local runs need no `.env`: the preview forwards `/api` to port 8000.

## Errors

- **Server:** routes `throw ApiError.badRequest(...)`, `.notFound(...)` and so on. One handler in `errors.js`
  turns every error into `{ success: false, message, code, details? }`. Anything unexpected is logged and the
  app gets a plain "Something went wrong" (500). Errors outside a request are logged by `server.js`.
- **App:** `api/client.js` turns error replies and lost connections into `ApiError`. Screens show them with
  `ErrorState` (with a Try again button), form field messages, or a toast. If a screen crashes, the crash
  screen offers Reload and Go to Home instead of a blank page.

## Everyday tasks

| Task | How |
| --- | --- |
| Run everything on this PC | Double-click `start-gogo-ride.bat` (the test database MariaDB from `C:\GoGoTools`, filled with demo data on the first run; API on port 8000; app in a phone-sized window). `start-gogo-ride.bat phone` also prints the address for testing the APK on a phone. Stop with `stop-gogo-ride.bat` |
| Release a new app version | Double-click `release-app.bat`: version number, update note, build (15-25 min), then publish |
| Publish a server-only change | `push-to-github.bat` |
| Undo a release | `rollback.bat` |
| Check the server still answers as before | With the test database running, in `backend-node`: `node scripts/api-check.mjs`. It sends 727 requests to a fresh MySQL test copy and compares the replies with `scripts/api-snapshots/`. For an intended change: `node scripts/api-check.mjs --update` |
| Refresh the API list | In `backend-node`: `node scripts/api-docs.mjs` (rewrites `docs/API.md`) |
| Check app icons | In `go-go-ride apk`: `node scripts/check-icons.mjs` |
