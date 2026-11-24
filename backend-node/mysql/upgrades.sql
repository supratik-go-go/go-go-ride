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
