# GO-GO Ride

Smart local transport for West Bengal: bus search and timetables, arrival alarms, estimated live tracking,
shared "Running Car" rides, local car drivers, bus-owner listings with admin verification.

| Folder | What |
| --- | --- |
| [`backend-python/`](backend-python) | FastAPI REST API (93 endpoints), SQLite, JWT auth, alarm scheduler — used by both the website and the app |
| [`go-go-ride website code/`](go-go-ride%20website%20code) | The website: public site, passenger web app, bus-owner area, admin panel (React + Vite) |
| [`go-go-ride apk/`](go-go-ride%20apk) | The Android app (same screens packaged with Capacitor + phone alarms, back button, app icon) |
| [`TASKS.md`](TASKS.md) | To-do list, backlog and the step-by-step update checklist |
| [`deploy-hostinger/`](deploy-hostinger) | One-click packaging + install scripts to put the website and API on a Hostinger VPS (HTTPS included) |
| [`FRONTEND_API_GUIDE.md`](FRONTEND_API_GUIDE.md) | API integration guide |
| [`docs/design/`](docs/design) | Design mockups the UI follows |
| [`docs/api-samples/`](docs/api-samples) | Real API responses + endpoint list |

## Run the website

**Windows, one click:** double-click `start-gogo-ride.bat`. On first run it creates the Python environment and
installs packages; then it starts the API and the website in two windows and opens <http://localhost:5173>.
Stop with `stop-gogo-ride.bat` (or close the two windows). Demo logins are printed in the launcher window.

To test the **Android app** against this PC, start it in phone mode instead: `start-gogo-ride.bat phone`.

Manually:

```bash
# terminal 1 - API on :8000
cd backend-python
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2 - website on :5173
cd "go-go-ride website code"
npm install
npm run dev
```

## Build the Android app

See [`go-go-ride apk/README.md`](go-go-ride%20apk/README.md) — in short: install Android Studio once, then run
`go-go-ride apk\build-apk.bat`, which produces `GO-GO-Ride.apk`.

## Put it online (Hostinger VPS)

See [`deploy-hostinger/README.md`](deploy-hostinger/README.md): `1-make-package.bat`, then `2-upload-and-install.bat`.

## Before deploying

- Keep the API server on India Standard Time (Windows time zone, or `TZ=Asia/Kolkata` on Linux): the alarm
  scheduler compares the server's local clock with Kolkata timetable times, so a UTC server fires alarms 5½ hours late.
- Set real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` and `ENVIRONMENT=production` (this also stops OTP codes being echoed).
- Serve the API over HTTPS and keep `https://localhost` in `CORS_ORIGINS` (that is the Android app's origin).
