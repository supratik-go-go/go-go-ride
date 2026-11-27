-- Tables added after the move to MySQL (2026-11-25). The server runs this file on every start
-- (src/db.js ensureSchema), so each statement must be safe to run again: CREATE TABLE IF NOT EXISTS.
-- mysql/schema.sql stays the starting design; new tables only go here.

-- v1.10: local police station numbers sent by users, shown on the Emergency Call List once an admin approves them.
CREATE TABLE IF NOT EXISTS police_numbers (
  id           VARCHAR(32)  NOT NULL PRIMARY KEY,
  station_name VARCHAR(190) NOT NULL COMMENT 'e.g. Howrah Police Station',
  area         VARCHAR(190) NOT NULL COMMENT 'Town or locality people search for',
  phone        VARCHAR(64)  NOT NULL,
  status       ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  sent_by      VARCHAR(32)  NULL,
  reviewed_by  VARCHAR(32)  NULL,
  reviewed_at  DATETIME(3)  NULL,
  created_at   DATETIME(3)  NOT NULL,
  updated_at   DATETIME(3)  NOT NULL,
  KEY ix_police_status (status),
  CONSTRAINT fk_police_sent_by FOREIGN KEY (sent_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_police_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Local police numbers from users, shown after an admin approves';

-- v1.10: second names people say for well-known stops, so voice search finds them ("ধর্মতলা" is
-- Esplanade). Only filled where nobody has set a second name yet.
UPDATE bus_stops SET other_name = 'Dharmatala, ধর্মতলা, धर्मतला, এসপ্ল্যানেড, एस्प्लेनेड' WHERE name = 'Esplanade' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Haora Station, হাওড়া স্টেশন, हावड़ा स्टेशन' WHERE name = 'Howrah Station' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Rabindra Setu, হাওড়া ব্রিজ' WHERE name = 'Howrah Bridge' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Shialdah, শিয়ালদহ, सियालदह' WHERE name = 'Sealdah' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Biman Bandar, বিমানবন্দর, Dum Dum Airport' WHERE name = 'Airport' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Sector Five, সেক্টর ফাইভ' WHERE name = 'Salt Lake Sector V' AND other_name IS NULL;
UPDATE bus_stops SET other_name = 'Tollyganj, টালিগঞ্জ' WHERE name = 'Tollygunge' AND other_name IS NULL;

-- v1.11: bus ticket photos sent from Add Bus Info; an admin reads the ticket and adds the bus.
CREATE TABLE IF NOT EXISTS ticket_photos (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  sent_by     VARCHAR(32)  NULL,
  photo_url   VARCHAR(500) NOT NULL,
  note        TEXT         NULL,
  status      ENUM('NEW','USED','NOT_USEFUL') NOT NULL DEFAULT 'NEW',
  bus_id      VARCHAR(32)  NULL COMMENT 'The bus added from this ticket',
  reviewed_by VARCHAR(32)  NULL,
  reviewed_at DATETIME(3)  NULL,
  created_at  DATETIME(3)  NOT NULL,
  updated_at  DATETIME(3)  NOT NULL,
  KEY ix_ticket_status (status),
  CONSTRAINT fk_ticket_sent_by FOREIGN KEY (sent_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_ticket_bus FOREIGN KEY (bus_id) REFERENCES buses (id) ON DELETE SET NULL,
  CONSTRAINT fk_ticket_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bus ticket photos from users, read by an admin';

-- v1.12: a person proves their mobile number by texting a code from it to the GO-GO Ride phone
-- (SMS_RECEIVE_NUMBER). The phone's "SMS Gateway for Android" app passes each SMS to /api/sms/incoming.
CREATE TABLE IF NOT EXISTS phone_checks (
  id          VARCHAR(32)  NOT NULL PRIMARY KEY,
  phone       VARCHAR(64)  NOT NULL COMMENT 'The number that has to send the SMS',
  purpose     ENUM('REGISTER','RESET','CHANGE') NOT NULL,
  code        CHAR(6)      NOT NULL COMMENT 'Shown in the app; the person texts it',
  token_hash  VARCHAR(100) NOT NULL COMMENT 'Scrambled key the app uses to ask about this check',
  verified_at DATETIME(3)  NULL COMMENT 'When the SMS came from the right number',
  used_at     DATETIME(3)  NULL,
  expires_at  DATETIME(3)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL,
  KEY ix_phone_checks_match (phone, code),
  KEY ix_phone_checks_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mobile number checks: the person sends an SMS with the code';

-- v1.12: people who sign in with Google have no mobile number until they add one, so users.phone may
-- be empty. The ALTER runs only while the column still says NOT NULL (the unique key stays; MySQL
-- allows any number of empty values in it).
SET @phone_required = (SELECT IS_NULLABLE = 'NO' FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone');
SET @make_phone_optional = IF(@phone_required, "ALTER TABLE users MODIFY phone VARCHAR(64) NULL COMMENT 'Empty after a Google sign-in until the person adds it'", 'DO 0');
PREPARE make_phone_optional FROM @make_phone_optional;
EXECUTE make_phone_optional;
DEALLOCATE PREPARE make_phone_optional;

-- v1.12: the Google account each Google sign-in belongs to (Google's account id; no password is kept).
CREATE TABLE IF NOT EXISTS user_logins (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  provider   ENUM('GOOGLE') NOT NULL,
  subject    VARCHAR(190) NOT NULL COMMENT 'The Google account id',
  email      VARCHAR(190) NULL,
  created_at DATETIME(3)  NOT NULL,
  UNIQUE KEY uq_user_logins (provider, subject),
  KEY ix_user_logins_user (user_id),
  CONSTRAINT fk_user_logins_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Google accounts used to sign in';
