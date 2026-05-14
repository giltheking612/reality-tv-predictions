-- Shows
CREATE TABLE shows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text UNIQUE NOT NULL,
  name_he    text NOT NULL,
  name_en    text NOT NULL,
  type       text NOT NULL CHECK (type IN ('elimination_score', 'time_trial')),
  created_at timestamptz DEFAULT now()
);

-- Seasons
CREATE TABLE seasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id    uuid NOT NULL REFERENCES shows(id),
  number     int NOT NULL,
  name_he    text NOT NULL,
  status     text NOT NULL DEFAULT 'upcoming'
             CHECK (status IN ('upcoming', 'active', 'completed')),
  start_date date,
  end_date   date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(show_id, number)
);

-- Episodes
CREATE TABLE episodes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id          uuid NOT NULL REFERENCES seasons(id),
  number             int NOT NULL,
  title_he           text,
  scheduled_air_time timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming', 'locked', 'completed')),
  locked_at          timestamptz,
  created_at         timestamptz DEFAULT now(),
  UNIQUE(season_id, number)
);

-- Questions
CREATE TABLE questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id        uuid NOT NULL REFERENCES episodes(id),
  type              text NOT NULL CHECK (type IN ('categorical', 'numeric')),
  text_he           text NOT NULL,
  options           jsonb,
  correct_answer    text,
  entry_fee         int NOT NULL CHECK (entry_fee > 0),
  payout_multiplier numeric(4,2) NOT NULL CHECK (payout_multiplier > 1),
  tolerance_unit    int,
  max_steps         int,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'locked', 'resolved', 'voided')),
  display_order     int NOT NULL DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text UNIQUE,
  avatar_url   text,
  created_at   timestamptz DEFAULT now()
);

-- Season wallets (one per user per season)
CREATE TABLE season_wallets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id  uuid NOT NULL REFERENCES seasons(id),
  balance    int NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, season_id)
);

-- Predictions
CREATE TABLE predictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id   uuid NOT NULL REFERENCES questions(id),
  answer        text NOT NULL,
  fee_paid      int NOT NULL,
  points_earned int,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- Admin audit log
CREATE TABLE admin_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  payload    jsonb,
  created_at timestamptz DEFAULT now()
);

-- Seed shows
INSERT INTO shows (slug, name_he, name_en, type) VALUES
  ('rokdim', 'רוקדים עם כוכבים', 'Rokdim Im Cochavim', 'elimination_score'),
  ('ninja',  'נינג''ה ישראל',      'Ninja Israel',       'time_trial');
