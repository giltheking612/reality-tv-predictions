CREATE OR REPLACE FUNCTION resolve_question(
  p_question_id uuid,
  p_correct_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_question          questions%ROWTYPE;
  v_prediction        predictions%ROWTYPE;
  v_points_returned   int;
  v_net_change        int;
  v_steps_off         int;
  v_decay_factor      numeric;
  v_season_id         uuid;
  v_total_distributed int := 0;
  v_resolved_count    int := 0;
BEGIN
  SELECT * INTO v_question FROM questions WHERE id = p_question_id FOR UPDATE;

  IF v_question.status != 'locked' THEN
    RAISE EXCEPTION 'Question is not in locked state (current: %)', v_question.status;
  END IF;

  UPDATE questions
  SET status = 'resolved', correct_answer = p_correct_answer
  WHERE id = p_question_id;

  SELECT s.id INTO v_season_id
  FROM episodes e
  JOIN seasons s ON e.season_id = s.id
  WHERE e.id = v_question.episode_id;

  FOR v_prediction IN
    SELECT * FROM predictions WHERE question_id = p_question_id FOR UPDATE
  LOOP
    IF v_question.type = 'categorical' THEN
      IF v_prediction.answer = p_correct_answer THEN
        v_points_returned := floor(v_prediction.fee_paid * v_question.payout_multiplier);
      ELSE
        v_points_returned := 0;
      END IF;

    ELSIF v_question.type = 'numeric' THEN
      v_steps_off := CASE
        WHEN v_prediction.answer::numeric = p_correct_answer::numeric THEN 0
        ELSE floor(
          abs(v_prediction.answer::numeric - p_correct_answer::numeric)
          / v_question.tolerance_unit
        ) + 1
      END;

      IF v_steps_off >= v_question.max_steps THEN
        v_points_returned := 0;
      ELSE
        v_decay_factor := 1.0 - (v_steps_off::numeric / v_question.max_steps);
        v_points_returned := floor(v_prediction.fee_paid * v_question.payout_multiplier * v_decay_factor);
      END IF;
    END IF;

    v_net_change := v_points_returned - v_prediction.fee_paid;

    UPDATE predictions
    SET points_earned = v_net_change
    WHERE id = v_prediction.id;

    UPDATE season_wallets
    SET balance = GREATEST(0, balance + v_net_change)
    WHERE user_id = v_prediction.user_id AND season_id = v_season_id;

    v_total_distributed := v_total_distributed + v_points_returned;
    v_resolved_count    := v_resolved_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'resolved', v_resolved_count,
    'total_points_distributed', v_total_distributed
  );
END;
$$;
