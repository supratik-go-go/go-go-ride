-- GO-GO Ride database for MySQL / MariaDB, designed with the owner in docs/mysql-plan.md.
-- Names are lowercase with underscores. Dates and times are readable (stored in India time),
-- money is exact, fixed choices are checked by the database. Every table uses utf8mb4,
-- so names can be in Bengali or any other language.
-- Creates an empty database; scripts/sqlite-to-mysql.mjs fills it from the old SQLite file.

SET NAMES utf8mb4;

-- ------------------------------------------------------------------ people

CREATE TABLE users (
  id             VARCHAR(32)  NOT NULL PRIMARY KEY,
  name           VARCHAR(190) NOT NULL,
  phone          VARCHAR(64)  NOT NULL,
  email          VARCHAR(190) NULL,
  password       VARCHAR(100) NULL COMMENT 'Scrambled (bcrypt). The real password is never stored',
  role           ENUM('PASSENGER','BUS_OWNER','DRIVER','DATA_MANAGER','ADMIN','SUPER_ADMIN') NOT NULL,
  picture_url    VARCHAR(500) NULL,
  status         ENUM('ACTIVE','INACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  phone_verified BOOLEAN      NOT NULL DEFAULT FALSE,
  gender         ENUM('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY') NULL,
  date_of_birth  DATE         NULL,
  last_login_at  DATETIME(3)  NULL,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Every account';

CREATE TABLE sign_in_sessions (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  token_hash VARCHAR(100) NOT NULL COMMENT 'Scrambled sign-in key kept by the phone',
  expires_at DATETIME(3)  NOT NULL,
  revoked_at DATETIME(3)  NULL,
  created_at DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY ix_sessions_user (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Keeps a phone signed in';

CREATE TABLE otp_codes (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  phone       VARCHAR(64)  NOT NULL,
  code_hash   VARCHAR(100) NOT NULL,
  purpose     ENUM('LOGIN','REGISTER','RESET') NOT NULL,
  expires_at  DATETIME(3)  NOT NULL,
  consumed_at DATETIME(3)  NULL,
  attempts    INT          NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL,
  KEY ix_otp_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='One-time SMS codes';

CREATE TABLE login_history (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  device     VARCHAR(200) NULL,
  ip_address VARCHAR(64)  NULL,
  location   VARCHAR(200) NULL,
  status     ENUM('SUCCESS','FAILED') NOT NULL,
  created_at DATETIME(3)  NOT NULL,
  KEY ix_login_user (user_id),
  KEY ix_login_created (created_at),
  CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Sign-in attempts, kept 30 days';

-- ------------------------------------------------------------------ bus network

CREATE TABLE bus_stops (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  name       VARCHAR(190) NOT NULL,
  other_name VARCHAR(190) NULL COMMENT 'Name in a second language; search looks at both',
  area       VARCHAR(190) NULL,
  city       VARCHAR(190)  NOT NULL,
  latitude   DOUBLE       NULL,
  longitude  DOUBLE       NULL,
  status     ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3)  NOT NULL,
  updated_at DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_stops_name_city (name, city),
  KEY ix_stops_other_name (other_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Every bus stop';

CREATE TABLE bus_routes (
  id           VARCHAR(32)  NOT NULL PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  other_name   VARCHAR(200) NULL,
  route_number VARCHAR(64)  NOT NULL,
  from_stop_id VARCHAR(32)  NULL,
  to_stop_id   VARCHAR(32)  NULL,
  distance_km  DOUBLE       NOT NULL DEFAULT 0,
  status       ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at   DATETIME(3)  NOT NULL,
  updated_at   DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_routes_number (route_number),
  CONSTRAINT fk_routes_from FOREIGN KEY (from_stop_id) REFERENCES bus_stops (id),
  CONSTRAINT fk_routes_to FOREIGN KEY (to_stop_id) REFERENCES bus_stops (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bus routes such as S12';

CREATE TABLE bus_route_stops (
  id                     VARCHAR(32) NOT NULL PRIMARY KEY,
  route_id               VARCHAR(32) NOT NULL,
  stop_id                VARCHAR(32) NOT NULL,
  stop_order             INT         NOT NULL COMMENT '1 = first stop',
  distance_from_start_km DOUBLE      NOT NULL DEFAULT 0,
  UNIQUE KEY uq_route_stop_order (route_id, stop_order),
  KEY ix_route_stops_stop (stop_id),
  CONSTRAINT fk_route_stops_route FOREIGN KEY (route_id) REFERENCES bus_routes (id) ON DELETE CASCADE,
  CONSTRAINT fk_route_stops_stop FOREIGN KEY (stop_id) REFERENCES bus_stops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stops of each route, in order';

-- ------------------------------------------------------------------ buses

CREATE TABLE buses (
  id               VARCHAR(32)  NOT NULL PRIMARY KEY,
  bus_number       VARCHAR(64)  NULL COMMENT 'Registration number, optional (many buses are known only by name)',
  bus_name         VARCHAR(190) NULL,
  other_name       VARCHAR(190) NULL,
  owner_id         VARCHAR(32)  NOT NULL,
  route_id         VARCHAR(32)  NULL,
  is_ac            BOOLEAN      NOT NULL DEFAULT FALSE,
  category         ENUM('NORMAL','SUPER_FAST','EXPRESS','DELUXE') NOT NULL DEFAULT 'NORMAL',
  operator         VARCHAR(190) NULL,
  total_seats      INT          NOT NULL DEFAULT 0,
  fare             DECIMAL(10,2) NOT NULL DEFAULT 0,
  contact_number   VARCHAR(64)  NULL,
  call_from        TIME         NOT NULL,
  call_until       TIME         NOT NULL,
  runs_on          SET('MON','TUE','WED','THU','FRI','SAT','SUN') NOT NULL,
  picture_url      VARCHAR(500) NULL,
  status           ENUM('PENDING','UNDER_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT         NULL,
  rating_average   DOUBLE       NOT NULL DEFAULT 0,
  rating_count     INT          NOT NULL DEFAULT 0,
  submitted_at     DATETIME(3)  NOT NULL,
  reviewed_at      DATETIME(3)  NULL,
  reviewed_by      VARCHAR(32)  NULL,
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_buses_number (bus_number),
  KEY ix_buses_owner (owner_id),
  KEY ix_buses_status (status),
  CONSTRAINT fk_buses_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_buses_route FOREIGN KEY (route_id) REFERENCES bus_routes (id),
  CONSTRAINT fk_buses_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Every bus';

CREATE TABLE bus_trips (
  id           VARCHAR(32) NOT NULL PRIMARY KEY,
  bus_id       VARCHAR(32) NOT NULL,
  trip_number  INT         NOT NULL COMMENT '1 = first trip of the day',
  from_stop_id VARCHAR(32) NULL,
  to_stop_id   VARCHAR(32) NULL,
  departs_at   TIME        NULL,
  runs_on      SET('MON','TUE','WED','THU','FRI','SAT','SUN') NULL COMMENT 'Empty = same days as the bus',
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL,
  UNIQUE KEY uq_trips_bus_number (bus_id, trip_number),
  CONSTRAINT fk_trips_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE,
  CONSTRAINT fk_trips_from FOREIGN KEY (from_stop_id) REFERENCES bus_stops (id),
  CONSTRAINT fk_trips_to FOREIGN KEY (to_stop_id) REFERENCES bus_stops (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Trips of each bus (one per bus until the trips update)';

CREATE TABLE bus_timetable (
  id                     VARCHAR(32) NOT NULL PRIMARY KEY,
  trip_id                VARCHAR(32) NOT NULL,
  bus_id                 VARCHAR(32) NOT NULL COMMENT 'Same bus as the trip, kept for easy reading',
  stop_id                VARCHAR(32) NOT NULL,
  stop_order             INT         NOT NULL COMMENT '1 = first stop',
  arrival_time           TIME        NOT NULL,
  departure_time         TIME        NOT NULL,
  distance_from_start_km DOUBLE      NOT NULL DEFAULT 0,
  UNIQUE KEY uq_timetable_trip_order (trip_id, stop_order),
  KEY ix_timetable_bus (bus_id),
  KEY ix_timetable_stop (stop_id),
  CONSTRAINT fk_timetable_trip FOREIGN KEY (trip_id) REFERENCES bus_trips (id) ON DELETE CASCADE,
  CONSTRAINT fk_timetable_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE,
  CONSTRAINT fk_timetable_stop FOREIGN KEY (stop_id) REFERENCES bus_stops (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stops and times of each trip';

CREATE TABLE bus_off_days (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  bus_id     VARCHAR(32) NOT NULL,
  off_date   DATE        NOT NULL,
  reason     TEXT        NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_off_days_bus_date (bus_id, off_date),
  CONSTRAINT fk_off_days_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dates a bus does not run';

CREATE TABLE bus_documents (
  id                 VARCHAR(32)  NOT NULL PRIMARY KEY,
  bus_id             VARCHAR(32)  NOT NULL,
  document_type      ENUM('RC_BOOK','ROUTE_PERMIT','INSURANCE','OTHER') NOT NULL,
  file_url           VARCHAR(500) NOT NULL,
  original_file_name VARCHAR(255) NULL,
  uploaded_at        DATETIME(3)  NOT NULL,
  KEY ix_documents_bus (bus_id),
  CONSTRAINT fk_documents_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Papers the owner uploaded';

-- ------------------------------------------------------------------ local vehicles

CREATE TABLE local_vehicles (
  id              VARCHAR(32)   NOT NULL PRIMARY KEY,
  owner_id        VARCHAR(32)   NULL,
  driver_name     VARCHAR(190)   NOT NULL,
  phone           VARCHAR(64)   NOT NULL,
  whatsapp_number VARCHAR(64)   NULL,
  area            VARCHAR(190)   NOT NULL,
  vehicle_type    ENUM('TOTO_AUTO','CAR','TOURIST_BUS') NOT NULL DEFAULT 'CAR',
  vehicle_model   VARCHAR(190)   NULL,
  vehicle_number  VARCHAR(64)   NULL,
  picture_url     VARCHAR(500)  NULL,
  seats           INT           NULL,
  rate            DECIMAL(10,2) NULL,
  rate_per        ENUM('KM','TRIP','HOUR','DAY') NULL,
  available_from  TIME          NOT NULL,
  available_until TIME          NOT NULL,
  rating_average  DOUBLE        NOT NULL DEFAULT 0,
  rating_count    INT           NOT NULL DEFAULT 0,
  is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  status          ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at      DATETIME(3)   NOT NULL,
  updated_at      DATETIME(3)   NOT NULL,
  KEY ix_local_vehicles_area (area),
  KEY ix_local_vehicles_type (vehicle_type),
  CONSTRAINT fk_local_vehicles_owner FOREIGN KEY (owner_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Toto/Auto, Car and Tourist Bus drivers';

-- Running Car: kept until its screens are removed in phase B, then backed up and dropped.
CREATE TABLE shared_rides (
  id            VARCHAR(32)   NOT NULL PRIMARY KEY,
  route_id      VARCHAR(32)   NULL,
  from_stop_id  VARCHAR(32)   NOT NULL,
  to_stop_id    VARCHAR(32)   NOT NULL,
  driver_id     VARCHAR(32)   NULL,
  vehicle_type  ENUM('CAR','AUTO','BIKE') NOT NULL,
  departs_at    DATETIME(3)   NOT NULL,
  total_seats   INT           NOT NULL,
  seats_left    INT           NOT NULL,
  fare_per_seat DECIMAL(10,2) NOT NULL,
  status        ENUM('SCHEDULED','RUNNING','COMPLETED','CANCELLED') NOT NULL,
  created_at    DATETIME(3)   NOT NULL,
  updated_at    DATETIME(3)   NOT NULL,
  KEY ix_rides_departs (departs_at),
  CONSTRAINT fk_rides_route FOREIGN KEY (route_id) REFERENCES bus_routes (id),
  CONSTRAINT fk_rides_from FOREIGN KEY (from_stop_id) REFERENCES bus_stops (id),
  CONSTRAINT fk_rides_to FOREIGN KEY (to_stop_id) REFERENCES bus_stops (id),
  CONSTRAINT fk_rides_driver FOREIGN KEY (driver_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Running Car shared rides (to be removed)';

CREATE TABLE ride_waitlist (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32) NULL,
  phone      VARCHAR(64) NOT NULL,
  area       VARCHAR(190) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_waitlist_phone (phone),
  CONSTRAINT fk_waitlist_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Running Car "Notify me" (to be removed)';

-- ------------------------------------------------------------------ passenger tools

CREATE TABLE alarms (
  id                    VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id               VARCHAR(32) NOT NULL,
  bus_id                VARCHAR(32) NOT NULL,
  trip_id               VARCHAR(32) NULL,
  get_on_stop_id        VARCHAR(32) NOT NULL COMMENT 'The alarm rings before the bus reaches this stop',
  get_off_stop_id       VARCHAR(32) NOT NULL,
  travel_date           DATE        NOT NULL,
  bus_arrives_at        TIME        NOT NULL,
  remind_minutes_before INT         NOT NULL,
  status                ENUM('ACTIVE','TRIGGERED','CANCELLED','EXPIRED') NOT NULL,
  rang_at               DATETIME(3) NULL,
  created_at            DATETIME(3) NOT NULL,
  updated_at            DATETIME(3) NOT NULL,
  KEY ix_alarms_user (user_id),
  KEY ix_alarms_date (travel_date),
  CONSTRAINT fk_alarms_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_alarms_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE,
  CONSTRAINT fk_alarms_trip FOREIGN KEY (trip_id) REFERENCES bus_trips (id) ON DELETE CASCADE,
  CONSTRAINT fk_alarms_get_on FOREIGN KEY (get_on_stop_id) REFERENCES bus_stops (id),
  CONSTRAINT fk_alarms_get_off FOREIGN KEY (get_off_stop_id) REFERENCES bus_stops (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Arrival alarms';

CREATE TABLE favorites (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32) NOT NULL,
  item_type  ENUM('BUS','ROUTE','STOP','LOCAL_CAR') NOT NULL,
  item_id    VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_favorites (user_id, item_type, item_id),
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Saved buses, routes, stops, vehicles (My Bus)';

CREATE TABLE recent_searches (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(32)  NOT NULL,
  search_type ENUM('ROUTE','BUS_NUMBER','BUS_NAME') NOT NULL,
  from_text   VARCHAR(190) NULL,
  to_text     VARCHAR(190) NULL,
  search_text VARCHAR(190) NULL,
  searched_at DATETIME(3)  NOT NULL,
  KEY ix_searches_user (user_id, searched_at),
  CONSTRAINT fk_searches_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Last 10 searches per person';

CREATE TABLE reviews (
  id               VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id          VARCHAR(32) NOT NULL,
  bus_id           VARCHAR(32) NULL,
  local_vehicle_id VARCHAR(32) NULL,
  rating           INT         NOT NULL,
  comment          TEXT        NULL,
  is_hidden        BOOLEAN     NOT NULL DEFAULT FALSE COMMENT 'Hidden by an admin',
  owner_reply      TEXT        NULL,
  replied_at       DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL,
  UNIQUE KEY uq_reviews_user_bus (user_id, bus_id),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_vehicle FOREIGN KEY (local_vehicle_id) REFERENCES local_vehicles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Star ratings';

CREATE TABLE bookings (
  id               VARCHAR(32)   NOT NULL PRIMARY KEY,
  booking_number   VARCHAR(30)   NOT NULL,
  user_id          VARCHAR(32)   NOT NULL,
  type             ENUM('BUS','RIDE','LOCAL_CAR') NOT NULL,
  bus_id           VARCHAR(32)   NULL,
  trip_id          VARCHAR(32)   NULL,
  shared_ride_id   VARCHAR(32)   NULL,
  local_vehicle_id VARCHAR(32)   NULL,
  travel_date      DATE          NOT NULL,
  seats            INT           NOT NULL,
  amount           DECIMAL(10,2) NOT NULL,
  payment_method   ENUM('CASH','UPI','CARD','WALLET') NOT NULL,
  payment_status   ENUM('PENDING','PAID','REFUNDED','FAILED') NOT NULL,
  status           ENUM('PENDING','CONFIRMED','COMPLETED','CANCELLED') NOT NULL,
  cancel_reason    TEXT          NULL,
  pickup_point     VARCHAR(200)  NULL,
  created_at       DATETIME(3)   NOT NULL,
  updated_at       DATETIME(3)   NOT NULL,
  UNIQUE KEY uq_bookings_number (booking_number),
  KEY ix_bookings_user (user_id),
  KEY ix_bookings_date (travel_date),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_bookings_bus FOREIGN KEY (bus_id) REFERENCES buses (id),
  CONSTRAINT fk_bookings_trip FOREIGN KEY (trip_id) REFERENCES bus_trips (id),
  CONSTRAINT fk_bookings_ride FOREIGN KEY (shared_ride_id) REFERENCES shared_rides (id),
  CONSTRAINT fk_bookings_vehicle FOREIGN KEY (local_vehicle_id) REFERENCES local_vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Seat bookings (history; booking is being removed)';

-- ------------------------------------------------------------------ contributions

CREATE TABLE bus_route_requests (
  id               VARCHAR(32)  NOT NULL PRIMARY KEY,
  sent_by          VARCHAR(32)  NOT NULL,
  name             VARCHAR(200) NOT NULL,
  route_number     VARCHAR(64)  NULL,
  notes            VARCHAR(500) NULL,
  stops            LONGTEXT     NOT NULL COMMENT 'The stops they listed, in order (JSON list)',
  photo_url        VARCHAR(500) NULL,
  status           ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  rejection_reason VARCHAR(300) NULL,
  created_route_id VARCHAR(32)  NULL,
  reviewed_by      VARCHAR(32)  NULL,
  reviewed_at      DATETIME(3)  NULL,
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  KEY ix_route_requests_status (status),
  CONSTRAINT fk_route_requests_user FOREIGN KEY (sent_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_route_requests_route FOREIGN KEY (created_route_id) REFERENCES bus_routes (id) ON DELETE SET NULL,
  CONSTRAINT fk_route_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT ck_route_requests_stops CHECK (JSON_VALID(stops))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Add Route Information, waiting for review';

-- ------------------------------------------------------------------ messages

CREATE TABLE notifications (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id     VARCHAR(32)  NULL COMMENT 'Empty = sent to everyone',
  title       VARCHAR(200) NOT NULL,
  message     TEXT         NOT NULL,
  type        ENUM('SYSTEM','USER','PROMO','ALARM') NOT NULL,
  open_screen VARCHAR(500) NULL,
  is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
  read_at     DATETIME(3)  NULL,
  created_at  DATETIME(3)  NOT NULL,
  KEY ix_notifications_user (user_id),
  KEY ix_notifications_created (created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bell messages, kept 15 days';

CREATE TABLE notification_reads (
  user_id         VARCHAR(32) NOT NULL,
  notification_id VARCHAR(32) NOT NULL,
  read_at         DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, notification_id),
  CONSTRAINT fk_reads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_reads_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Personal read marks for messages sent to everyone';

CREATE TABLE support_tickets (
  id            VARCHAR(32)  NOT NULL PRIMARY KEY,
  ticket_number VARCHAR(30)  NOT NULL,
  user_id       VARCHAR(32)  NULL,
  name          VARCHAR(190)  NOT NULL,
  phone         VARCHAR(64)  NOT NULL,
  email         VARCHAR(190) NULL,
  category      ENUM('GENERAL','BUS','BOOKING','PAYMENT','ACCOUNT') NOT NULL,
  subject       VARCHAR(190) NOT NULL,
  message       TEXT         NOT NULL COMMENT 'The opening question',
  status        ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED') NOT NULL,
  priority      ENUM('LOW','NORMAL','HIGH') NOT NULL,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_tickets_number (ticket_number),
  KEY ix_tickets_status (status),
  CONSTRAINT fk_tickets_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Help & Support questions';

CREATE TABLE support_ticket_messages (
  id             VARCHAR(32)  NOT NULL PRIMARY KEY,
  ticket_id      VARCHAR(32)  NOT NULL,
  sent_by        VARCHAR(32)  NULL,
  is_from_team   BOOLEAN      NOT NULL,
  message        TEXT         NOT NULL,
  screenshot_url VARCHAR(500) NULL,
  created_at     DATETIME(3)  NOT NULL,
  KEY ix_ticket_messages_ticket (ticket_id, created_at),
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_messages_user FOREIGN KEY (sent_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Replies on each ticket, from the team or the user';

-- ------------------------------------------------------------------ admin

CREATE TABLE activity_log (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  done_by    VARCHAR(32)  NULL,
  action     VARCHAR(40)  NOT NULL,
  item_type  VARCHAR(30)  NULL,
  item_id    VARCHAR(32)  NULL,
  message    TEXT         NOT NULL,
  changes    LONGTEXT     NULL COMMENT 'Before and after values (JSON)',
  created_at DATETIME(3)  NOT NULL,
  KEY ix_activity_created (created_at),
  KEY ix_activity_item (item_type, item_id),
  CONSTRAINT fk_activity_user FOREIGN KEY (done_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Who changed what, kept 1 year';

CREATE TABLE app_settings (
  id             VARCHAR(32)  NOT NULL PRIMARY KEY,
  app_name       VARCHAR(190)  NOT NULL,
  support_email  VARCHAR(190) NOT NULL,
  contact_number VARCHAR(64)  NOT NULL,
  address        VARCHAR(300) NOT NULL,
  updated_at     DATETIME(3)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='App-wide details (one row)';

-- ------------------------------------------------------------------ games

CREATE TABLE game_rooms (
  id           VARCHAR(32) NOT NULL PRIMARY KEY,
  game         ENUM('chess','ludo','callbreak','twentynine','carrom') NOT NULL,
  room_code    VARCHAR(10) NULL COMMENT 'Code to share for a private game',
  is_public    BOOLEAN     NOT NULL,
  status       ENUM('WAITING','PLAYING','FINISHED','CANCELLED') NOT NULL,
  game_data    LONGTEXT    NULL COMMENT 'Board and moves, cleared 3 days after the game ends',
  turn_ends_at DATETIME(3) NULL,
  version      INT         NOT NULL,
  result       LONGTEXT    NULL,
  created_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL,
  KEY ix_rooms_game_status (game, status),
  KEY ix_rooms_code (room_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Online games';

CREATE TABLE game_players (
  id            VARCHAR(32) NOT NULL PRIMARY KEY,
  game_room_id  VARCHAR(32) NOT NULL,
  user_id       VARCHAR(32) NOT NULL,
  seat          INT         NOT NULL,
  points_earned INT         NOT NULL DEFAULT 0,
  UNIQUE KEY uq_players_seat (game_room_id, seat),
  UNIQUE KEY uq_players_user (game_room_id, user_id),
  KEY ix_players_user (user_id),
  CONSTRAINT fk_players_room FOREIGN KEY (game_room_id) REFERENCES game_rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Who plays in each game';

CREATE TABLE leaderboard (
  user_id    VARCHAR(32) NOT NULL PRIMARY KEY,
  points     INT         NOT NULL DEFAULT 0,
  wins       INT         NOT NULL DEFAULT 0,
  draws      INT         NOT NULL DEFAULT 0,
  played     INT         NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  KEY ix_leaderboard_points (points),
  CONSTRAINT fk_leaderboard_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Game points per player';

CREATE TABLE arcade_scores (
  id         VARCHAR(32) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32) NOT NULL,
  game       VARCHAR(64) NOT NULL,
  score      INT         NOT NULL,
  points     INT         NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_arcade_user_game (user_id, game, created_at),
  CONSTRAINT fk_arcade_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ping Ball scores';

CREATE TABLE helper_points (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  points     INT          NOT NULL,
  reason     VARCHAR(200) NOT NULL,
  item_type  VARCHAR(30)  NULL,
  item_id    VARCHAR(32)  NULL,
  created_at DATETIME(3)  NOT NULL,
  KEY ix_helper_user (user_id),
  CONSTRAINT fk_helper_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Thank-you points for approved buses and routes (Top Helpers)';
