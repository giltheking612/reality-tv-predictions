-- Enable RLS on all tables
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_wallets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log   ENABLE ROW LEVEL SECURITY;

-- profiles: any authenticated user can read; only own row to update
CREATE POLICY "profiles_read"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- season_wallets: any authenticated user can read (for leaderboard); no user writes
CREATE POLICY "wallets_read" ON season_wallets FOR SELECT TO authenticated USING (true);

-- predictions: before lock → own only; after lock → all; users write own
CREATE POLICY "predictions_read" ON predictions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM questions q
      JOIN episodes e ON q.episode_id = e.id
      WHERE q.id = question_id AND e.status IN ('locked', 'completed')
    )
  );
CREATE POLICY "predictions_insert" ON predictions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "predictions_update" ON predictions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "predictions_delete" ON predictions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- questions, episodes, seasons, shows: read-only for authenticated users
CREATE POLICY "questions_read" ON questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "episodes_read"  ON episodes  FOR SELECT TO authenticated USING (true);
CREATE POLICY "seasons_read"   ON seasons   FOR SELECT TO authenticated USING (true);
CREATE POLICY "shows_read"     ON shows     FOR SELECT TO authenticated USING (true);

-- admin_audit_log: no user access (service role only)
