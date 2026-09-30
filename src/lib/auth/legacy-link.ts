// Admin-only operation, executed inside a transaction by the CLI.
// Table locks also serialize against normal registration/account creation.
export const legacyLinkSql = `DO $$
DECLARE legacy_id uuid; claimed_id uuid; subject text := current_setting('rationale.auth_subject'); issuer text := current_setting('rationale.auth_issuer');
BEGIN
  LOCK TABLE public.users, public.trading_accounts IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM neon_auth."user" WHERE id::text = subject AND coalesce(banned,false) = false) THEN
    RAISE EXCEPTION 'Unknown or banned provider account';
  END IF;
  SELECT id INTO legacy_id FROM public.users WHERE email = 'dev@rationale-ai.local';
  IF legacy_id IS NULL THEN RAISE EXCEPTION 'Legacy journal owner not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id=legacy_id AND (auth_subject IS NOT NULL OR auth_issuer IS NOT NULL) AND (auth_subject IS DISTINCT FROM subject OR auth_issuer IS DISTINCT FROM issuer)) THEN
    RAISE EXCEPTION 'Legacy journal is already linked to another identity';
  END IF;
  SELECT id INTO claimed_id FROM public.users WHERE auth_subject=subject AND auth_issuer=issuer;
  IF claimed_id IS NOT NULL AND claimed_id <> legacy_id THEN
    IF EXISTS(SELECT 1 FROM public.trading_accounts WHERE user_id=claimed_id) THEN
      RAISE EXCEPTION 'New identity already owns accounts; manual reconciliation required';
    END IF;
    UPDATE public.users SET auth_subject=NULL, auth_issuer=NULL WHERE id=claimed_id;
  END IF;
  UPDATE public.users SET auth_subject=subject, auth_issuer=issuer WHERE id=legacy_id;
END $$`;
