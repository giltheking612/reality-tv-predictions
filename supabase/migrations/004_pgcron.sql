CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'auto-lock-episodes',
  '* * * * *',
  $$
    UPDATE episodes
    SET status = 'locked', locked_at = now()
    WHERE status = 'upcoming' AND scheduled_air_time <= now();

    UPDATE questions
    SET status = 'locked'
    WHERE status = 'open'
      AND episode_id IN (SELECT id FROM episodes WHERE status = 'locked');
  $$
);
