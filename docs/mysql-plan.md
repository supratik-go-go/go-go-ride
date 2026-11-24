# Move to MySQL: decisions

The owner is deciding the new database structure one feature at a time.
Full list of today's tables and columns: [`database-structure.xlsx`](database-structure.xlsx).

General rules (agreed):
- Names in lowercase with `_` (`users`, `created_at`). Dates and times readable, real times, money in exact rupees, Yes / No as tick boxes.
- Fixed choices (status, role, types) are checked by the database.
- `id` codes stay exactly as they are today.
- The app's API replies stay the same, so installed phones keep working.

## Steps

1. Users and sign-in: **decided**
2. Bus stops and routes: **decided**
3. Buses and timetables: **decided**
4. Passenger tools (alarms, My Bus, recent searches, reviews): **decided**
5. Local Vehicle: **decided**
6. Bookings: **decided**
7. Running Car: **decided**
8. Add Bus / Route Information: **decided**
9. Notifications and Help & Support: **decided**
10. Admin records and app settings: **decided**
11. Games: **decided**

## 1. Users and sign-in (decided 2026-11-19)

| Now | New |
| --- | --- |
| `User` | `users` |
| `RefreshToken` | `sign_in_sessions` |
| `OtpCode` | `otp_codes` |
| `LoginActivity` | `login_history` |

- Column names as suggested in the workbook (`last_login_at`, `phone_verified`, ...), with the owner's changes: `passwordHash` → `password`, `avatarUrl` → `picture_url`.
- Password storage: owner asked for base64; Claude advised against it (anyone with database access could read every password). Default until the owner says otherwise: stays scrambled (bcrypt), plus an admin **Reset password** button for users who forget theirs.
- Gender and date of birth: optional, on Create Account and Edit Profile (default; owner can change).
- New optional columns on `users`: `gender` (MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY) and `date_of_birth` (date). The privacy page mentions them.
- New role `DATA_MANAGER`: manages buses, routes, stops and local vehicles; cannot see user accounts or settings. (Owner had no preference; Claude's recommendation.)
- Automatic clean-up: `login_history` rows and expired or cancelled `sign_in_sessions` older than **30 days** are deleted.

## 2. Bus stops and routes (decided 2026-11-24)

| Now | New |
| --- | --- |
| `BusStop` | `bus_stops` |
| `Route` | `bus_routes` |
| `RouteStop` | `bus_route_stops` |

- Columns as suggested (`route_number`, `distance_km`, `from_stop_id`, `distance_from_start_km`), with `sequence` → `stop_order`.
- Names can be in any language (the database uses utf8mb4, so Bengali and other scripts are stored correctly).
- New optional column `other_name` on `bus_stops` and `bus_routes`: the name in a second language. Search looks at both `name` and `other_name`.

## 3. Buses and timetables (decided 2026-11-24)

| Now | New |
| --- | --- |
| `Bus` | `buses` |
| (new) | `bus_trips` |
| `BusStopage` | `bus_timetable` |
| `BusException` | `bus_off_days` |
| `BusDocument` | `bus_documents` |

- `buses` columns as suggested: `bus_number`, `bus_name`, `owner_id`, `route_id`, `is_ac` (Yes / No instead of AC / NON_AC), `category`, `operator`, `total_seats`, `fare` (exact rupees), `contact_number`, `call_from` / `call_until`, `runs_on`, `picture_url`, `status`, `rejection_reason`, `rating_average`, `rating_count`, `submitted_at`, `reviewed_at`, `reviewed_by`.
- Bus names in any language, plus optional `other_name` (same rule as stops and routes).
- **Bus number is optional** (owner, 2026-11-24): many real buses are known only by name. It stays unique when given. Screens show the bus name when there is no number (app update with the Excel import).
- **Many trips per bus** (bigger change, needs an app update): new table `bus_trips` (one row per trip: which bus, direction / start and end stop, departure time, optional own days). `bus_timetable` rows belong to a trip (`trip_id`, `stop_id`, `stop_order`, `arrival_time`, `departure_time`, `distance_from_start_km`). Each bus's current timetable becomes its first trip. Search, alarms, live tracking, the Excel import (one row per trip) and the owner and admin bus pages change to match.
- `bus_off_days`: `bus_id`, `off_date`, `reason` (applies to all of that bus's trips).
- `bus_documents`: `bus_id`, `document_type`, `file_url`, `original_file_name`, `uploaded_at`.

## 4. Passenger tools (decided 2026-11-24)

Tables keep simple names: `alarms`, `favorites`, `recent_searches`, `reviews`.

- `alarms`: `user_id`, `trip_id` (was busId; alarms point to a trip now), `get_on_stop_id` (the alarm rings before the bus reaches it), `get_off_stop_id`, `travel_date`, `bus_arrives_at`, `remind_minutes_before`, `status`, `rang_at`.
- `favorites`: `user_id`, `item_type` (BUS / ROUTE / STOP / LOCAL_VEHICLE), `item_id`.
- `recent_searches`: `user_id`, `search_type`, `from_text`, `to_text`, `search_text` (was query), `searched_at`. Only the **last 10 per person** are kept; older ones are deleted automatically.
- `reviews`: `user_id`, `bus_id` or `local_vehicle_id`, `rating`, `comment`, plus new `is_hidden` (admin hides a review without deleting it) and `owner_reply` / `replied_at` (the bus owner or driver answers; new screen in the app update).

## 5. Local Vehicle (decided 2026-11-24)

`LocalCar` → `local_vehicles`: `owner_id`, `driver_name`, `phone`, `area`, `vehicle_type` (TOTO_AUTO / CAR / TOURIST_BUS, the 3 categories stay), `vehicle_model`, `vehicle_number`, `picture_url`, `available_from` / `available_until`, `rating_average`, `rating_count`, `is_verified`, `status`.

New (app update: shown on the card and in the List your vehicle form):
- `seats`: how many passengers it carries.
- `rate` (exact rupees) and `rate_per` (KM / TRIP / HOUR / DAY), e.g. ₹15 per km.
- `whatsapp_number`, with a WhatsApp button next to Call Driver.

## 6. Bookings (decided 2026-11-24)

- **Seat booking is removed from the app** (bus, Local Vehicle and Running Car pages lose the Book button; passengers call instead).
- The `bookings` table and its existing rows are kept as history; the admin Bookings page stays, read-only.
- Old app versions still show Book until they update: the server answers "Booking is no longer available, please call the driver".
- Names if it ever returns: `booking_number`, `user_id`, `type`, `trip_id`, `shared_ride_id`, `local_vehicle_id`, `travel_date`, `seats`, `amount`, `payment_method`, `payment_status`, `status`, `cancel_reason`, plus `pickup_point` (owner's choice).

## 7. Running Car (decided 2026-11-24)

- **Running Car is removed** (owner had no preference; Claude's recommendation, since its banner is gone and it depended on booking). The page and its Help link go; `Ride` and `RideWaitlist` are not created in MySQL. Their rows are saved to a backup file during the move, so the feature can come back.
- Old app versions that open Running Car get an empty list with a friendly message.

## 8. Add Bus / Route Information (decided 2026-11-24)

- Sent-in buses stay in `buses` with status PENDING (with their trips and timetable).
- `RouteSubmission` → `bus_route_requests`: `sent_by`, `name`, `route_number`, `notes`, `stops` (list), `status`, `rejection_reason`, `created_route_id`, `reviewed_by`, `reviewed_at`, plus new `photo_url` (sender can attach a photo, e.g. of the route board).
- Approve / reject: ADMIN, SUPER_ADMIN and the new DATA_MANAGER role.
- **Thank-you points**: a user earns points when their bus or route is approved. How many and where they show: settled in step 11 (Games / leaderboard).

## 9. Notifications and Help & Support (decided 2026-11-24)

- `notifications`: `user_id` (empty = everyone), `title`, `message`, `type`, `open_screen` (was link), `is_read`, `read_at`. Deleted automatically after **15 days**.
- New `notification_reads` (`user_id`, `notification_id`, `read_at`): a personal read mark for messages sent to everyone (fixes the shared-read bug).
- `support_tickets`: `ticket_number`, `user_id`, `name`, `phone`, `email`, `category`, `subject`, `status`, `priority`.
- New `support_ticket_messages`: a back-and-forth conversation per ticket (`ticket_id`, `sent_by`, `is_from_team`, `message`, `screenshot_url`, `created_at`), so each reply records who wrote it and when. Existing tickets' question and `response` become the first two messages. Needs new chat screens in the app and admin panel.

## 10. Admin records and app settings (decided 2026-11-24)

- `activity_log`: `done_by`, `action`, `item_type`, `item_id`, `message`, `created_at`, plus new `changes` (before and after values, e.g. fare 15 → 20).
- **Every add, edit and delete** by admins and data managers is logged, shown on a new admin **History** page. Entries older than **1 year** are deleted.
- `app_settings` (one row): `app_name`, `support_email`, `contact_number`, `address`, `updated_at`. `timezone`, `currency`, `date_format`, `time_format` are removed (the app never used them); the admin Settings page loses those 4 boxes.

## 11. Games (decided 2026-11-24)

- `game_rooms` (`game`, `room_code`, `is_public`, `status`, `game_data`, `turn_ends_at`, `version`, `result`), `game_players` (`game_room_id`, `user_id`, `seat`, `points_earned`), `leaderboard` (`points`, `wins`, `draws`, `played`), `arcade_scores` (`game`, `score`, `points`).
- Game points stay: win 10, draw 3, loss 1.
- History is kept forever (who played, result, points); only `game_data` (moves and board) is cleared **3 days** after a game finishes or is cancelled.
- New `helper_points` (`user_id`, `points`, `reason`, `item_type`, `item_id`, `created_at`): **5 points** per approved bus or route request, shown in a separate **Top Helpers** list.

## Final structure: 30 tables

| Area | Tables |
| --- | --- |
| People | `users`, `sign_in_sessions`, `otp_codes`, `login_history` |
| Bus network | `bus_stops`, `bus_routes`, `bus_route_stops` |
| Buses | `buses`, `bus_trips` (new), `bus_timetable`, `bus_off_days`, `bus_documents` |
| Passenger tools | `alarms`, `favorites`, `recent_searches`, `reviews` |
| Local Vehicle | `local_vehicles` |
| History only | `bookings` |
| Contributions | `bus_route_requests` |
| Messages | `notifications`, `notification_reads` (new), `support_tickets`, `support_ticket_messages` (new) |
| Admin | `activity_log`, `app_settings` |
| Games | `game_rooms`, `game_players`, `leaderboard`, `arcade_scores`, `helper_points` (new) |

Removed: `Ride`, `RideWaitlist` (Running Car), saved to a backup file during the move.

## Build order

**Phase A: move to MySQL, app unchanged.** The new tables, names and kinds above, every existing row copied across (each bus's timetable becomes its first trip), automatic clean-ups switched on, MySQL logins for the data managers. The API answers exactly as today: all 727 checks must pass. No app update needed.

**Phase B: new features, one release at a time** (each needs an app update):
1. Admin Reset password, gender and date of birth, DATA_MANAGER role
2. Many trips per bus (search, alarms, timetables, Excel import, owner and admin pages)
3. Local Vehicle seats, rate, WhatsApp button
4. Reviews: admin hide, owner reply
5. Remove booking and Running Car screens
6. Help & Support chat with screenshots
7. Admin History page (every change, before and after)
8. Route request photo, thank-you points, Top Helpers list
9. Second names in search, notification read fix
10. Fares from passengers (owner's idea, 2026-11-25): a passenger can add the fare of a bus that has none, with a short note; after a trip the app asks "Is this fare correct?" and, if not, what the fare is. Admins review the answers before a fare changes.

## Phase A: how it is built

- Design: `backend-node/mysql/schema.sql` (32 tables: the 30 above plus `shared_rides` and `ride_waitlist`, which stay until Running Car's screens are removed in phase B, so phones that have not updated keep working).
- Kept for easy reading and so today's code keeps working: `bus_id` next to `trip_id` in `bus_timetable`, `alarms` and `bookings`. Favorites keep the stored value `LOCAL_CAR`.
- Support: the opening question stays in `support_tickets.message`; replies (today's `response`) go to `support_ticket_messages`.
- Dates and times are stored in India time (`DATETIME(3)`, millisecond precision); date-only values as `DATE`; times of day as `TIME`.
- Local test database on this PC: MariaDB 11.4 in `C:\GoGoTools\mariadb`, data in `C:\GoGoTools\mariadb-data`, port 3307, local only. Start it in the Terminal panel with `& 'C:\GoGoTools\mariadb\bin\mariadbd.exe' --defaults-file='C:\GoGoTools\mariadb-data\my.ini' --console`. Its password is in `backend-node/data/mysql-test.env` (git-ignored).
- Server package: `mysql2`.

### Owner's order (2026-11-24)

1. Finish the move to MySQL, with bus number optional.
2. Then load the owner's Excel file (`bus-import-template_filled.xlsx`: 1,107 buses, about 13,300 stop rows, mostly two trips per bus: out and back; some times unknown, `--:--`). Needs a few data decisions with the owner first.
3. Remove the demo data during the switch, after the owner confirms the exact list (it cannot be undone).

### Excel bus data (decided 2026-11-25)

- File: `C:\Users\Administrator\Downloads\bus-import-ready.xlsx` is the owner's `bus-import-template_filled.xlsx` with the sample Operator, Seats and Fare on its first two rows cleared (owner's choice). Not in git.
- Read by `backend-node/src/services/busTripImport.js` through the normal admin import (Admin > Buses > Import from Excel), which now also takes the Buses + Stops tabs. Tested on the demo copy: 1,092 of 1,107 buses load in about a second (2,180 trips, 13,192 stop times, 689 new stops); importing again updates instead of adding copies.
- Bus numbers 1, 2, 3 only link the two tabs: those buses have no bus number. Real numbers (with letters) are kept.
- Out and back: one bus, two trips. Search, alarms and the stop page use the trip in the passenger's direction; the bus page shows the first trip until the trips app update.
- Unknown (`--:--`) and out-of-order times are worked out from the stops around them and from how long that stretch usually takes other buses, and marked `is_estimated` in `bus_timetable` (2,874 of 13,246). Times written as ranges ("10:30/10:35 AM") use the first time.
- Fare: saved only when the sheet has one (`buses.fare` empty = not known). Missing contact numbers stay empty.
- Stop names typed in different cases ("khatra", "Khatra") become one stop.
- The route column is not stored: routes need a unique route number, and the app already shows each bus's first and last stop.
- 15 buses are not loaded (10 with only one stop per trip, 5 listed twice) and 36 more have notes: `C:\Users\Administrator\Downloads\bus-import-check-list.xlsx` for the owner.
- App update needed (next release): the search card shows "₹0" for an unknown fare; it should hide the fare. Phase B's trips update then shows both trips on the bus page.

### Progress

- [x] Design written and loaded into the test database (32 tables, 301 columns, 53 links; Bengali works)
- [x] Copy script `backend-node/scripts/sqlite-to-mysql.mjs`: every conversion, every row count checked (demo copy 679 rows, fuller test copy 844 rows). Phone columns are 64 long because deleted accounts keep `deleted-<id>` (33 characters)
- [x] Server data layer for MySQL (`src/db.js`, async, camelCase rows, India-time dates); `config.mysql` from MYSQL_* settings
- [x] Every route and service moved to the new names (25 files). The server makes the tables itself on start (`ensureSchema()`) and stops if the MYSQL_* settings are missing
- [x] Automatic clean-ups in `src/services/cleanup.js`, run by the hourly timer: sign-ins 30 days, searches 10 per person, notifications 15 days, game moves 3 days after the game ends, activity log 1 year
- [x] All 727 checks pass against MySQL (`node scripts/api-check.mjs` builds a fresh `gogoride_check` database from the seed on every run). Lists sorted by time keep the old order for items made at the same moment
- [x] CLAUDE.md, README and docs/API.md updated for MySQL
- [x] Owner created the MySQL database in hPanel (2026-11-25): `u189123021_gogoride` on `srv838.hstgr.io`; login in `deploy-hostinger-cloud/production-secrets.txt`
- [x] Demo accounts blocked on the live SQLite server (2026-11-25, release-20261124205616); demo passwords out of git (`backend-node/seed/demo-logins.txt`, git-ignored)
- [x] Switch tool `backend-node/scripts/prepare-switch.mjs`, rehearsed end to end on a stand-in live file: demo data out, owner made super admin, 1,092 Excel buses in, import file 0.4 MB, live-mode server on it, demo login refused
- [ ] Night-time switch (steps below); user count checked

### Switch night

1. Before: the owner has an account in the app (their own phone and password) and the five `MYSQL_*` environment variables are in hPanel (the old server ignores them).
2. Owner: hPanel > File Manager > `gogoride-data` > download `gogoride.db` into `D:\Go-Go-Ride\backend-node\data\`.
3. Claude (MariaDB running): `node scripts/prepare-switch.mjs data/gogoride.db <owner phone> "C:\Users\Administrator\Downloads\bus-import-ready.xlsx"`. It copies, removes the demo data (and anything that pointed at it), makes the owner super admin, loads the Excel buses and writes `data/gogoride-switch.sql.gz`. Check its list of removed accounts before going on.
4. Owner: hPanel > Databases > phpMyAdmin for `u189123021_gogoride` > Import > that file > Import.
5. Claude: merge `mysql-move` into `main`, restore point, push. Check https://go-goride.com/api/stats (real users only, 1,092 buses) and a search.
6. If anything is wrong: `rollback.bat` (the SQLite file on Hostinger is untouched). The server tries `MYSQL_HOST` and then `localhost`, and on the live server it refuses to start on an empty database instead of starting empty.

### Porting rules (for every route and service)

- `src/db.js` is async (mysql2). Every database call gets `await`; every function that calls one becomes `async`, up to the route handler (Express 5 handles async handlers).
- SQL uses the new names without quotes: `"Bus"` → `buses`, `"busNumber"` → `bus_number`. SQLite-only syntax changes: `||` → `CONCAT()`, `IS ?` on yes/no → `= ?`, `INSERT OR IGNORE` → `INSERT IGNORE`, `ON CONFLICT … DO UPDATE` → `ON DUPLICATE KEY UPDATE`, `strftime` → MySQL date functions.
- Rows come back camelCased from the new names, so code uses the new property names below. Dates in raw SQL parameters go through `at(ms)` (date and time) or `day(ms)` (date only); `insert()` / `update()` convert by themselves.
- API replies must not change: `serialize.js` maps the new names back to the old JSON fields.

Property renames (old → new), all others only change from `"camelCase"` columns to snake_case in SQL:

| Table | Renames |
| --- | --- |
| users | passwordHash → password, avatarUrl → pictureUrl |
| bus_route_stops | sequence → stopOrder |
| buses | type ('AC'/'NON_AC') → isAc (1/0), contactStart → callFrom, contactEnd → callUntil, serviceDays → runsOn, imageUrl → pictureUrl, ratingAvg → ratingAverage, reviewedById → reviewedBy |
| bus_timetable (BusStopage) | sequence → stopOrder, distanceKm → distanceFromStartKm, new tripId |
| bus_off_days | date → offDate |
| bus_documents | docType → documentType, originalName → originalFileName |
| local_vehicles | carModel → vehicleModel, carNumber → vehicleNumber, photoUrl → pictureUrl, availableTo → availableUntil, ratingAvg → ratingAverage, verified → isVerified |
| shared_rides | departureAt → departsAt, availableSeats → seatsLeft |
| alarms | boardingStopId → getOnStopId, arrivalStopId → getOffStopId, alarmDate → travelDate, expectedArrival → busArrivesAt, remindBeforeMin → remindMinutesBefore, notifiedAt → rangAt, new tripId |
| recent_searches | query → searchText |
| reviews | localCarId → localVehicleId |
| bookings | bookingRef → bookingNumber, rideId → sharedRideId, localCarId → localVehicleId, paymentMode → paymentMethod, new tripId |
| bus_route_requests | userId → sentBy, routeId → createdRouteId, reviewedById → reviewedBy |
| notifications | link → openScreen |
| support_tickets | ticketRef → ticketNumber; response → latest team row in support_ticket_messages |
| activity_log | actorId → doneBy, entityType → itemType, entityId → itemId |
| app_settings | platformName → appName, platformEmail → supportEmail; timezone, currency, dateFormat, timeFormat removed (replies keep the fixed defaults) |
| game_rooms | code → roomCode, state → gameData, turnDeadline → turnEndsAt |
| game_players | roomId → gameRoomId |

