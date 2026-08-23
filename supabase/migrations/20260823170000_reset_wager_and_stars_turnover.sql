-- Reset lifetime turnover only (NOT balances). Track Stars wager separately.

ALTER TABLE public.gg_wallets
  ADD COLUMN IF NOT EXISTS total_wagered_stars bigint NOT NULL DEFAULT 0
    CHECK (total_wagered_stars >= 0);

UPDATE public.gg_wallets
SET
  total_wagered_cents = 0,
  total_won_cents = 0,
  total_lost_cents = 0,
  total_wagered_stars = 0,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.gg_get_wallet(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'profile_id',              w.profile_id,
    'balance_cents',           w.balance_cents,
    'locked_cents',            w.locked_cents,
    'stars_balance',           w.stars_balance,
    'total_wagered_cents',     w.total_wagered_cents,
    'total_wagered_stars',     w.total_wagered_stars,
    'total_won_cents',         w.total_won_cents,
    'total_lost_cents',        w.total_lost_cents,
    'vip_level',               p.vip_level,
    'vip_xp',                  p.vip_xp,
    'username',                p.username,
    'first_name',              p.first_name,
    'telegram_id',             p.telegram_id,
    'welcome_bonus_available', public.gg_welcome_bonus_is_available(p.welcome_bonus_claimed_at)
  ) INTO v_result
  FROM public.gg_wallets w
  JOIN public.gg_profiles p ON p.id = w.profile_id
  WHERE w.profile_id = p_profile_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.gg_track_stars_wager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF upper(COALESCE(NEW.wallet_asset, 'USD')) = 'STARS'
       AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      UPDATE public.gg_wallets
      SET total_wagered_stars = total_wagered_stars + GREATEST(COALESCE(NEW.bet_cents, 0), 0),
          updated_at = now()
      WHERE profile_id = NEW.profile_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND upper(COALESCE(OLD.wallet_asset, 'USD')) = 'STARS'
     AND OLD.status = 'pending'
     AND NEW.status = 'cancelled' THEN
    UPDATE public.gg_wallets
    SET total_wagered_stars = GREATEST(0, total_wagered_stars - GREATEST(COALESCE(OLD.bet_cents, 0), 0)),
        updated_at = now()
    WHERE profile_id = OLD.profile_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gg_bets_track_stars_wager ON public.gg_bets;
CREATE TRIGGER gg_bets_track_stars_wager
AFTER INSERT OR UPDATE OF status ON public.gg_bets
FOR EACH ROW
EXECUTE FUNCTION public.gg_track_stars_wager();
