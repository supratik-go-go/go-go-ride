# GO-GO Ride frontend — developer conventions

React 19 + Vite 8 (JavaScript/JSX), React Router 7, Leaflet maps, Recharts, lucide-react icons.
Everything is wired to the real FastAPI backend — **there is no mock data anywhere**.

## Running

```bash
# backend (terminal 1)
cd backend-python && .venv/Scripts/uvicorn app.main:app --reload --port 8000
# frontend (terminal 2)
cd frontend && npm run dev        # http://localhost:5173
```

Vite proxies `/api` and `/uploads` to `localhost:8000`, so code always calls relative URLs.

## Where things live

| Path | What |
| --- | --- |
| `src/api/client.js` | `api`, `apiPage`, `http.{get,page,post,patch,del}`, `ApiError`, `assetUrl()`, token storage + auto refresh |
| `src/services/*.js` | One module per API area — **always call the API through these** (`import { busService } from '../../services'`) |
| `src/services/locationService.js` | Geolocation, `haversineKm`, `formatDistance`, `stopPoint`, `DEFAULT_CENTER` |
| `src/services/trackingService.js` | Timetable-based bus position `estimate(bus)` — the backend has no GPS feed |
| `src/context/AuthContext.jsx` | `useAuth()` → `user, ready, isAuthenticated, isAdmin, isSuperAdmin, isOwner, isDriver, login, register, loginWithOtp, logout, refreshUser, setUser` |
| `src/context/ToastContext.jsx` | `useToast()` → `toast.success(msg)`, `toast.error(errOrMsg)`, `toast.info`, `toast.warning` |
| `src/hooks/` | `useAsync(loader, deps)`, `usePagedQuery(fetcher, opts)`, `useDebounce`, `useInterval`, `useNow`, `useUnreadCount` + `notifyUnreadChanged()` |
| `src/utils/format.js` | dates (`todayISO`, `addDays`, `formatDate`, `formatDateLong`, `dateParts`, `relativeDayLabel`, `formatDateTime`, `timeAgo`, `to12h`), `formatCurrency`, `formatNumber`, `formatPhone`, `formatContact`, `isValidPhone`, `initials`, `busBadge`, `splitDays`, `LABELS`, `label(group, value)`, `statusTone(value)` |
| `src/utils/csv.js` | `exportCsv(filename, rows, columns)`, `downloadBlob` |
| `src/components/ui` | `Button, IconButton, Card, StatCard, Input, Select, Textarea, optionsFrom, Badge, StatusBadge, RouteBadge, Modal, ConfirmDialog, LoadingSpinner, Spinner, Skeleton, SkeletonList, StatusIndicator, TrackingStatus, EmptyState, ErrorState, DataState, Logo, Avatar, StarRating, PageHeader, SectionHeader, Tabs, Pagination, InfoItem, DataTable, TableToolbar` |
| `src/components/navigation` | `Navbar`, `BottomNavigation`, `Sidebar`, `UserMenu`, `SearchBar`, `StopInput` (stop autocomplete) |
| `src/components/map/MapView.jsx` | `MapView, BusMarker, StopMarker, UserMarker, RouteLine, FitBounds, FollowPoint` |
| `src/layouts` | `PublicLayout`, `AppLayout` (bottom nav on phones), `AuthLayout`, `AdminLayout`; guards `RequireAuth`, `RequireRole`, `GuestOnly` |
| `src/App.jsx` | All routes (lazy-loaded) |
| `src/styles/global.css` | Design tokens + utility classes (`.card`, `.btn-*`, `.badge-*`, `.stack`, `.row`, `.grid-*`, `.alert-*`, `.table`, `.list-item`, `.icon-tile`, `.chip`, `.segmented`, `.soft-panel`, `.text-muted` …) |

## Rules

1. **API through services only.** Never hard-code `localhost`. Never invent data — if the API lacks something, show an honest empty state.
2. **Times:** display the API's `...12h` companions (`departureTime12h`, `arrivalTime12h`, `expectedArrival12h`, `notifyAt12h`, `durationLabel`, `availabilityLabel`). **Dates:** send `YYYY-MM-DD` built with `toISODate`/`todayISO` — never `toISOString()`.
3. **Every data view handles loading, error and empty** (`DataState`, `DataTable`, `EmptyState`, `ErrorState`, skeletons).
4. **Errors:** `ApiError.message` is user-facing; show it with `toast.error(err)`. For forms, map `err.fieldErrors` (`{ field: message }`) onto inputs.
5. **Mobile first.** Phones are the primary target (this becomes the Play Store app). Test at 375 px. `AppLayout` already pads for the bottom nav. Desktop gets wider grids.
6. **Styling:** use CSS variables from `global.css`. Each page area has its own stylesheet (`src/pages/<area>/<area>.css`) imported by its pages; class names are prefixed by area to avoid collisions.
7. **Uploaded files** come back as `/uploads/...` — wrap in `assetUrl()` before using as `src`/`href`.
8. **Role gating** is UI-only (`useAuth().user.role`); the API re-checks every call.
9. **OTP `devCode`** may only be shown when `import.meta.env.DEV` is true.
10. `routeNumber` can be `null` (owner-submitted buses) — use `busBadge(bus)`.
