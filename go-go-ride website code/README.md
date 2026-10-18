# GO-GO Ride — Web App

The passenger app, public website and admin panel for **GO-GO Ride**, smart local transport for West Bengal.
React 19 + Vite, wired to the FastAPI backend in `../backend-python`. All data comes from the API.

## Quick start

You need **Node 20+** and **Python 3.11+**.

```bash
# 1. backend  (terminal 1)
cd backend-python
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

```bash
# 2. frontend (terminal 2)
cd "go-go-ride website code"
npm install
npm run dev          # http://localhost:5173
```

In development Vite proxies `/api` and `/uploads` to `http://localhost:8000`, so there is nothing to configure and no CORS setup.
API docs: <http://localhost:8000/docs>.

### Demo accounts (seeded)

| Role | Phone | Password | Where |
| --- | --- | --- | --- |
| Passenger | 9123456789 | Rider@123 | `/login` |
| Bus owner | 9876543210 | Owner@123 | `/login` → Profile → My Buses |
| Driver | 9000011223 | Driver@123 | `/login` → Profile → My Car Listings |
| Admin | 9876500002 | Admin@123 | `/admin/login` |
| Super admin | 9876500001 | Admin@123 | `/admin/login` |

OTP sign-in works too: in development the code is printed in the backend console and shown under the code field.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload on :5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build on :4173 (also proxies the API) |
| `npm run lint` | Oxlint |
| `node scripts/check-icons.mjs` | Verify every lucide icon import exists |

## Configuration

Copy `.env.example` to `.env` when you need to change something.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | empty → `/api` | Full API URL for production and the mobile app, e.g. `https://api.gogoride.in/api` |
| `BACKEND_ORIGIN` | `http://localhost:8000` | Where the dev/preview proxy sends `/api` and `/uploads` |
| `VITE_TRACKING_REFRESH_MS` | `5000` | How often live-tracking positions update |

## What's in the app

| Area | Routes |
| --- | --- |
| Website | `/` landing (phone: app splash), `/about`, `/contact` |
| Auth | `/login` (OTP or password), `/register` (passenger / bus owner / driver), `/admin/login` |
| Passenger | `/home`, `/search`, `/bus/:id`, `/bus/:id/alarm`, `/bus/:id/track`, `/stops`, `/stops/:id`, `/routes`, `/routes/:id`, `/running-car`, `/local-cars`, `/local-cars/:id` |
| Account | `/profile`, `/profile/edit`, `/bookings`, `/alarms`, `/favorites`, `/recent-searches`, `/notifications`, `/support`, `/settings` |
| Bus owner / driver | `/owner/buses`, `/owner/buses/new`, `/owner/buses/:id/edit`, `/driver/cars` |
| Admin | `/admin` dashboard, buses, bus requests, routes, stops, live tracking, rides, local cars, users, bookings, reports, notifications, support, settings, profile |

Browsing (search, bus details, stops, routes, local cars) works signed out; alarms, bookings and the profile area ask the user to sign in.

### About "live" tracking

The backend has **no GPS feed** from buses yet. Tracking screens estimate each bus's position from its published timetable
(`src/services/trackingService.js`) and say so on screen. When a GPS source exists, replace `estimate()` there; the map
screens only consume its output.

### Maps

Maps use **Leaflet + OpenStreetMap** — no API key or billing account needed, and it works inside the Android app.

## Project structure

See [CONVENTIONS.md](CONVENTIONS.md) for the module map and coding rules.

```
src/
  api/client.js          fetch wrapper: envelope unwrap, token refresh, ApiError, assetUrl()
  services/              one module per API area + location & tracking
  context/               AuthContext, ToastContext
  hooks/                 useAsync, usePagedQuery, useDebounce, useInterval/useNow, useUnreadCount
  components/ui/         design-system components (Button, Card, Input, Modal, DataTable, ...)
  components/navigation/ Navbar, BottomNavigation, Sidebar, SearchBar/StopInput, UserMenu
  components/map/        MapView + markers
  layouts/               Public / App / Auth / Admin layouts and route guards
  pages/                 public, auth, passenger, account, owner, admin
  styles/global.css      design tokens + utilities
```

## Android app

The Android / Play Store app lives in `../go-go-ride apk` (a copy of this code plus native features).
See its README for building the APK.
