-- Migration: Finance & Scoring enhancements
-- Run once against the database

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS land_area_sqft NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS combined_score  INTEGER DEFAULT 100;

ALTER TABLE violations
  ADD COLUMN IF NOT EXISTS fine_amount NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS monthly_bills (
  id               SERIAL PRIMARY KEY,
  property_id      INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  billing_month    DATE NOT NULL,
  base_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  violation_fines  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date         DATE NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at          TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (property_id, billing_month)
);

-- Seed land areas for existing demo properties
UPDATE properties SET land_area_sqft = 5400 WHERE id = 1 AND land_area_sqft IS NULL;
UPDATE properties SET land_area_sqft = 4200 WHERE id = 2 AND land_area_sqft IS NULL;
UPDATE properties SET land_area_sqft = 6800 WHERE id = 3 AND land_area_sqft IS NULL;

-- Backfill combined_score for all existing properties that don't have it yet
UPDATE properties SET combined_score = compliance_score WHERE combined_score IS NULL;

-- Migration: add pending_review violation status
ALTER TABLE violations DROP CONSTRAINT IF EXISTS violations_status_check;
ALTER TABLE violations ADD CONSTRAINT violations_status_check
  CHECK (status IN ('open', 'pending_review', 'resolved'));

-- Migration: community safety module
CREATE TABLE IF NOT EXISTS community_posts (
  id           SERIAL PRIMARY KEY,
  author_email VARCHAR(255) NOT NULL,
  author_name  VARCHAR(255) NOT NULL,
  author_role  VARCHAR(10)  NOT NULL CHECK (author_role IN ('admin', 'tenant')),
  category     VARCHAR(50)  NOT NULL CHECK (category IN (
                 'safety', 'lost_pet', 'wildlife',
                 'infrastructure', 'hoa_notice', 'general'
               )),
  title        VARCHAR(255) NOT NULL,
  body         TEXT         NOT NULL,
  image_url    TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- Migration: Map & Zones
CREATE TABLE IF NOT EXISTS zones (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',
  geojson    JSONB        NOT NULL,
  created_at TIMESTAMP    DEFAULT NOW()
);

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS zone_id   INTEGER REFERENCES zones(id) ON DELETE SET NULL;

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL;

-- Backfill lat/lng for the original 3 seed properties (idempotent: only runs when NULL)
UPDATE properties SET latitude = 47.6580, longitude = -122.3140
  WHERE owner_email = 'john@example.com'  AND latitude IS NULL;
UPDATE properties SET latitude = 47.6610, longitude = -122.3170
  WHERE owner_email = 'maria@example.com' AND latitude IS NULL;
UPDATE properties SET latitude = 47.6490, longitude = -122.3030
  WHERE owner_email = 'david@example.com' AND latitude IS NULL;

-- Seed additional UW Seattle demo properties (idempotent via WHERE NOT EXISTS)
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '112 NE Boat St, Seattle, WA', 'Sarah Kim', 'sarah@example.com', '555-0103', 2020, 3800, 85, 82, 47.6570, -122.3120
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'sarah@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '360 NE 45th St, Seattle, WA', 'Tom Nguyen', 'tom@example.com', '555-0104', 2019, 6200, 92, 89, 47.6630, -122.3110
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'tom@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '321 E Shelby St, Seattle, WA', 'Priya Patel', 'priya@example.com', '555-0106', 2022, 3200, 55, 50, 47.6460, -122.2990
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'priya@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '248 Fuhrman Ave E, Seattle, WA', 'Carlos Rivera', 'carlos@example.com', '555-0107', 2017, 4900, 79, 74, 47.6440, -122.2960
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'carlos@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '501 Boyer Ave E, Seattle, WA', 'Amy Chen', 'amy@example.com', '555-0108', 2016, 5100, 20, 15, 47.6470, -122.3010
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'amy@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '654 17th Ave NE, Seattle, WA', 'Mike Johnson', 'mike@example.com', '555-0109', 2023, 4400, 30, 25, 47.6520, -122.3090
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'mike@example.com');

INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
SELECT '987 NE 15th Ave, Seattle, WA', 'Lisa Wang', 'lisa@example.com', '555-0110', 2020, 5800, 95, 91, 47.6500, -122.3060
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE owner_email = 'lisa@example.com');

-- Migration: fix photo on violations (tenant uploads proof when flagging as fixed)
ALTER TABLE violations ADD COLUMN IF NOT EXISTS fix_photo_url TEXT;
