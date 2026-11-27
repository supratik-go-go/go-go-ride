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

-- v1.13: 6-digit codes sent by email to reset a forgotten password (free: no SMS, no phone).
CREATE TABLE IF NOT EXISTS reset_codes (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  code_hash  VARCHAR(100) NOT NULL COMMENT 'Scrambled (bcrypt); the code itself is only in the email',
  attempts   INT          NOT NULL DEFAULT 0,
  expires_at DATETIME(3)  NOT NULL,
  used_at    DATETIME(3)  NULL,
  created_at DATETIME(3)  NOT NULL,
  KEY ix_reset_codes_user (user_id, created_at),
  CONSTRAINT fk_reset_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Forgot-password codes sent by email';

-- v1.13: Recent Searches showed "Anywhere -> Anywhere" for searches by picked stops (only their ids
-- were sent, so no names were kept). Those entries can't be repaired, so they go; new ones keep names.
DELETE FROM recent_searches WHERE from_text IS NULL AND to_text IS NULL AND search_text IS NULL;

-- v1.13: Forgot password sends its code only to a confirmed email (one whose code came back), so a
-- stranger's address typed by mistake can't reset the password. Empty = not confirmed; a changed
-- email empties it. The ALTER runs only while the column is missing.
SET @confirm_missing = (SELECT COUNT(*) = 0 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email_confirmed_at');
SET @add_confirm = IF(@confirm_missing, "ALTER TABLE users ADD COLUMN email_confirmed_at DATETIME(3) NULL COMMENT 'When the email was confirmed with a code; empty = not confirmed' AFTER email", 'DO 0');
PREPARE add_confirm FROM @add_confirm;
EXECUTE add_confirm;
DEALLOCATE PREPARE add_confirm;
-- A Gmail that came with a Google sign-in was confirmed by Google.
UPDATE users u JOIN user_logins l ON l.user_id = u.id AND l.provider = 'GOOGLE' SET u.email_confirmed_at = l.created_at WHERE u.email_confirmed_at IS NULL AND u.email = l.email;

-- v1.13: 6-digit codes that confirm an email (Edit Profile). The email confirmed is the one in the row.
CREATE TABLE IF NOT EXISTS email_codes (
  id         VARCHAR(32)  NOT NULL PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  email      VARCHAR(190) NOT NULL COMMENT 'The email the code was sent to',
  code_hash  VARCHAR(100) NOT NULL COMMENT 'Scrambled (bcrypt); the code itself is only in the email',
  attempts   INT          NOT NULL DEFAULT 0,
  expires_at DATETIME(3)  NOT NULL,
  used_at    DATETIME(3)  NULL,
  created_at DATETIME(3)  NOT NULL,
  KEY ix_email_codes_user (user_id, created_at),
  CONSTRAINT fk_email_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Codes that confirm an email';
