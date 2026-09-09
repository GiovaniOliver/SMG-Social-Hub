-- Stage 2: run after the dedupe-writing application code is live.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.social_hub_comment_opportunities
    WHERE "dedupeKey" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot require dedupeKey while null comment opportunities exist';
  END IF;
END $$;

ALTER TABLE public.social_hub_comment_opportunities
ALTER COLUMN "dedupeKey" SET NOT NULL;
