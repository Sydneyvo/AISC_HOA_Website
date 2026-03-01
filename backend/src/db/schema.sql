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

  status         VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'pending_review', 'resolved')),
  image_url      TEXT,

  notice_sent_at TIMESTAMP,
  resolved_at    TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- Seed data for demo (UW Seattle area)
INSERT INTO properties (address, owner_name, owner_email, owner_phone, resident_since, land_area_sqft, compliance_score, combined_score, latitude, longitude)
VALUES
  ('123 NE Campus Pkwy, Seattle, WA',   'John Smith',    'john@example.com',    '555-0101', 2018, 5400, 42,  38,  47.6580, -122.3140),
  ('456 Brooklyn Ave NE, Seattle, WA',  'Maria Garcia',  'maria@example.com',   '555-0102', 2021, 4200, 71,  68,  47.6610, -122.3170),
  ('112 NE Boat St, Seattle, WA',       'Sarah Kim',     'sarah@example.com',   '555-0103', 2020, 3800, 85,  82,  47.6570, -122.3120),
  ('360 NE 45th St, Seattle, WA',       'Tom Nguyen',    'tom@example.com',     '555-0104', 2019, 6200, 92,  89,  47.6630, -122.3110),
  ('789 Montlake Blvd NE, Seattle, WA', 'David Lee',     'david@example.com',   '555-0105', 2015, 6800, 88,  85,  47.6490, -122.3030),
  ('321 E Shelby St, Seattle, WA',      'Priya Patel',   'priya@example.com',   '555-0106', 2022, 3200, 55,  50,  47.6460, -122.2990),
  ('248 Fuhrman Ave E, Seattle, WA',    'Carlos Rivera', 'carlos@example.com',  '555-0107', 2017, 4900, 79,  74,  47.6440, -122.2960),
  ('501 Boyer Ave E, Seattle, WA',      'Amy Chen',      'amy@example.com',     '555-0108', 2016, 5100, 20,  15,  47.6470, -122.3010),
  ('654 17th Ave NE, Seattle, WA',      'Mike Johnson',  'mike@example.com',    '555-0109', 2023, 4400, 30,  25,  47.6520, -122.3090),
  ('987 NE 15th Ave, Seattle, WA',      'Lisa Wang',     'lisa@example.com',    '555-0110', 2020, 5800, 95,  91,  47.6500, -122.3060);

INSERT INTO violations (property_id, category, severity, description, rule_cited, remediation, status, created_at)
VALUES
  (1, 'garbage', 'high',   'Multiple trash bins visible from street since last week.',    'Section 4.2', 'Store all bins behind fence or in garage.',     'open',     NOW() - INTERVAL '5 days'),
  (1, 'lawn',    'medium', 'Grass exceeds 8 inches in front yard.',                       'Section 3.1', 'Mow lawn to under 6 inches immediately.',       'open',     NOW() - INTERVAL '12 days'),
  (2, 'parking', 'medium', 'Boat trailer parked in driveway for 3 days.',                 'Section 5.1', 'Remove trailer or store off-property.',         'open',     NOW() - INTERVAL '3 days'),
  (5, 'lawn',    'low',    'Minor overgrowth along side fence.',                           'Section 3.1', 'Trim to under 6 inches.',                       'resolved', NOW() - INTERVAL '45 days'),
  (6, 'exterior','medium', 'Peeling paint on front exterior visible from street.',         'Section 6.3', 'Repaint within 30 days.',                       'open',     NOW() - INTERVAL '20 days'),
  (8, 'parking', 'high',   'RV parked in driveway for over 2 weeks.',                     'Section 5.1', 'Remove RV or obtain HOA approval.',             'open',     NOW() - INTERVAL '18 days'),
  (8, 'garbage', 'high',   'Trash overflowing bins at curb for multiple days.',            'Section 4.2', 'Schedule additional pickup and store bins.',    'open',     NOW() - INTERVAL '7 days'),
  (9, 'structure','high',  'Unapproved shed erected in backyard.',                         'Section 7.1', 'Remove structure or submit variance request.',  'open',     NOW() - INTERVAL '30 days'),
  (9, 'lawn',    'medium', 'Dead grass across entire front yard.',                         'Section 3.1', 'Reseed or sod within 21 days.',                 'open',     NOW() - INTERVAL '25 days');
