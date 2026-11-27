# GO-GO Ride API

Every address below starts with `https://go-goride.com/api`. Generated from `backend-node/src/routes/` by `npm run docs` (in `backend-node`): do not edit by hand.

Every reply has the same shape: `{ success, message, data, meta }`, and on errors `{ success: false, message, code, details? }`.
Send `Authorization: Bearer <accessToken>` for anything that needs a signed-in user.

## platform (6)

App version, stats, settings, news, public pages. Code: `backend-node/src/routes/platform.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/health` | anyone |
| GET | `/app-version` | anyone |
| GET | `/news` | anyone |
| GET | `/stats` | anyone |
| GET | `/settings` | anyone |
| GET | `/internal/run-alarms` | the server timer (needs the CRON_KEY secret) |

## auth (16)

Sign up, sign in, OTP, tokens, password. Code: `backend-node/src/routes/auth.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| POST | `/auth/register` | anyone |
| POST | `/auth/login` | anyone |
| POST | `/auth/otp/request` | anyone |
| POST | `/auth/otp/verify` | anyone |
| POST | `/auth/password/reset` | anyone |
| POST | `/auth/refresh` | anyone |
| POST | `/auth/logout` | signed in |
| GET | `/auth/me` | signed in |
| POST | `/auth/change-password` | signed in |
| GET | `/auth/phone-check` | anyone |
| POST | `/auth/phone-check/start` | anyone (more if signed in) |
| POST | `/auth/phone-check/status` | anyone |
| POST | `/sms/incoming/:key` | anyone |
| GET | `/auth/google` | anyone |
| POST | `/auth/google` | anyone |
| POST | `/users/me/phone` | signed in |

## profile (11)

Profile, favourites, recent searches, delete account. Code: `backend-node/src/routes/profile.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/users/me` | signed in |
| DELETE | `/users/me` | signed in |
| PATCH | `/users/me` | signed in |
| POST | `/users/me/avatar` | signed in |
| GET | `/users/me/login-activity` | signed in |
| GET | `/users/me/favorites` | signed in |
| POST | `/users/me/favorites` | signed in |
| DELETE | `/users/me/favorites` | signed in |
| GET | `/users/me/recent-searches` | signed in |
| DELETE | `/users/me/recent-searches` | signed in |
| DELETE | `/users/me/recent-searches/:searchId` | signed in |

## buses (12)

Bus search, bus details, reviews, owner bus listings. Code: `backend-node/src/routes/buses.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/buses/search` | anyone (more if signed in) |
| GET | `/buses` | anyone (more if signed in) |
| GET | `/buses/mine/list` | signed in |
| GET | `/buses/:busId` | anyone (more if signed in) |
| POST | `/buses` | signed in |
| PATCH | `/buses/:busId` | signed in |
| DELETE | `/buses/:busId` | signed in |
| POST | `/buses/:busId/documents` | signed in |
| POST | `/buses/:busId/exceptions` | signed in |
| DELETE | `/buses/:busId/exceptions/:exceptionId` | signed in |
| GET | `/buses/:busId/reviews` | anyone |
| POST | `/buses/:busId/reviews` | signed in |

## network (13)

Routes, stops, nearby stops. Code: `backend-node/src/routes/network.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| POST | `/stops/voice-trip` | anyone |
| GET | `/stops` | anyone |
| GET | `/stops/nearby` | anyone |
| GET | `/stops/:stopId` | anyone |
| POST | `/stops` | signed in |
| PATCH | `/stops/:stopId` | signed in |
| DELETE | `/stops/:stopId` | signed in |
| GET | `/routes` | anyone |
| GET | `/routes/popular` | anyone |
| GET | `/routes/:routeId` | anyone |
| POST | `/routes` | signed in |
| PATCH | `/routes/:routeId` | signed in |
| DELETE | `/routes/:routeId` | signed in |

## alarms (4)

Arrival alarms. Code: `backend-node/src/routes/alarms.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/alarms` | signed in |
| POST | `/alarms` | signed in |
| PATCH | `/alarms/:id` | signed in |
| DELETE | `/alarms/:id` | signed in |

## cars (16)

Local Vehicle listings and Running Car shared rides. Code: `backend-node/src/routes/cars.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/local-cars` | anyone |
| GET | `/local-cars/mine/list` | signed in |
| GET | `/local-cars/:id` | anyone |
| POST | `/local-cars` | signed in |
| PATCH | `/local-cars/:id` | signed in |
| POST | `/local-cars/:id/photo` | signed in |
| DELETE | `/local-cars/:id` | signed in |
| PATCH | `/local-cars/:id/verify` | signed in |
| POST | `/local-cars/:id/reviews` | signed in |
| GET | `/rides/status` | anyone |
| POST | `/rides/notify-me` | anyone (more if signed in) |
| GET | `/rides` | anyone |
| GET | `/rides/:id` | anyone |
| POST | `/rides` | signed in |
| PATCH | `/rides/:id` | signed in |
| DELETE | `/rides/:id` | signed in |

## bookings (5)

Bookings. Code: `backend-node/src/routes/bookings.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/bookings` | signed in |
| GET | `/bookings/:id` | signed in |
| POST | `/bookings` | signed in |
| PATCH | `/bookings/:id/cancel` | signed in |
| PATCH | `/bookings/:id/status` | signed in |

## messaging (10)

Notifications and support tickets. Code: `backend-node/src/routes/messaging.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/notifications` | signed in |
| GET | `/notifications/unread-count` | signed in |
| PATCH | `/notifications/read-all` | signed in |
| PATCH | `/notifications/:notificationId/read` | signed in |
| DELETE | `/notifications/:notificationId` | signed in |
| POST | `/notifications/broadcast` | signed in |
| POST | `/support/tickets` | anyone (more if signed in) |
| GET | `/support/tickets` | signed in |
| GET | `/support/tickets/:ticketId` | signed in |
| PATCH | `/support/tickets/:ticketId` | signed in |

## admin (14)

Admin panel. Code: `backend-node/src/routes/admin.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/admin/dashboard` | signed in |
| GET | `/admin/activities` | signed in |
| GET | `/admin/bus-requests` | signed in |
| PATCH | `/admin/buses/:busId/status` | signed in |
| GET | `/admin/users` | signed in |
| GET | `/admin/users/:userId` | signed in |
| POST | `/admin/users` | signed in |
| PATCH | `/admin/users/:userId` | signed in |
| DELETE | `/admin/users/:userId` | signed in |
| GET | `/admin/reports` | signed in |
| GET | `/admin/reports/export` | signed in |
| GET | `/admin/settings` | signed in |
| PATCH | `/admin/settings` | signed in |
| POST | `/admin/buses/import` | signed in |

## contributions (4)

Add Bus / Add Route Information from users, admin review. Code: `backend-node/src/routes/contributions.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| POST | `/route-submissions` | signed in |
| GET | `/route-submissions/mine` | signed in |
| GET | `/admin/route-requests` | signed in |
| PATCH | `/admin/route-requests/:id` | signed in |

## games (9)

Online games, Ping Ball, leaderboard. Code: `backend-node/src/routes/games.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/games/leaderboard` | anyone (more if signed in) |
| GET | `/games/pingball/best` | signed in |
| POST | `/games/pingball/score` | signed in |
| POST | `/games/rooms/join` | signed in |
| GET | `/games/rooms/:id` | signed in |
| POST | `/games/rooms/:id/move` | signed in |
| POST | `/games/rooms/:id/leave` | signed in |
| POST | `/games/:game/quick` | signed in |
| POST | `/games/:game/private` | signed in |

## community (8)

Local police numbers and bus ticket photos from users, admin review. Code: `backend-node/src/routes/community.js`

| Method | Path | Who can call it |
| --- | --- | --- |
| GET | `/police-numbers` | anyone |
| POST | `/police-numbers` | signed in |
| GET | `/admin/police-numbers` | signed in |
| PATCH | `/admin/police-numbers/:id` | signed in |
| POST | `/ticket-photos` | signed in |
| GET | `/admin/ticket-photos` | signed in |
| PATCH | `/admin/ticket-photos/:id` | signed in |
| DELETE | `/admin/police-numbers/:id` | signed in |
