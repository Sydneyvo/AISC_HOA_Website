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
