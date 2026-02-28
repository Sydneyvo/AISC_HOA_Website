CREATE TABLE properties (
  id                   SERIAL PRIMARY KEY,
  address              VARCHAR(255) NOT NULL,
  owner_name           VARCHAR(255) NOT NULL,
  owner_email          VARCHAR(255) NOT NULL,
  owner_phone          VARCHAR(50),
  resident_since       INTEGER,
  compliance_score     INTEGER DEFAULT 100,

  -- HOA Rules PDF (per-property)
  rules_pdf_url        TEXT,
  rules_text           TEXT,
  rules_pdf_hash       TEXT,
  rules_pdf_updated_at TIMESTAMP,

  created_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE violations (
  id             SERIAL PRIMARY KEY,
  property_id    INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  category       VARCHAR(100) NOT NULL,
  severity       VARCHAR(10)  NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description    TEXT         NOT NULL,
  rule_cited     TEXT,
  remediation    TEXT,
  deadline_days  INTEGER DEFAULT 14,

  status         VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  image_url      TEXT,

  notice_sent_at TIMESTAMP,
  resolved_at    TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Seed data for demo
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since)
VALUES
  ('123 Maple Street', 'John Smith',   'john@example.com',  '555-0101', 2018),
  ('456 Oak Avenue',   'Maria Garcia', 'maria@example.com', '555-0102', 2021),
  ('789 Pine Road',    'David Lee',    'david@example.com', '555-0103', 2015);

INSERT INTO violations (property_id, category, severity, description, rule_cited, remediation, status, created_at)
VALUES
  (1, 'garbage', 'low',    'Trash bins visible from street.',           'Section 4.2', 'Store bins out of view.',       'open',     NOW() - INTERVAL '10 days'),
  (1, 'lawn',    'medium', 'Grass exceeds 6 inches in front yard.',     'Section 3.1', 'Mow lawn to under 6 inches.',   'resolved', NOW() - INTERVAL '60 days'),
  (3, 'parking', 'high',   'Boat on trailer parked in driveway >24hr.', 'Section 5.1', 'Remove or store off-property.', 'open',     NOW() - INTERVAL '3 days');

UPDATE properties SET compliance_score = 95  WHERE id = 1;
UPDATE properties SET compliance_score = 100 WHERE id = 2;
UPDATE properties SET compliance_score = 80  WHERE id = 3;
