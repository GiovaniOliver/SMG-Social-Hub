-- Stage 1: keep the column nullable during rollout so the previous production
-- build remains compatible until the new code is live.
ALTER TABLE public.social_hub_comment_opportunities
ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "social_hub_comment_opportunities_dedupeKey_key"
ON public.social_hub_comment_opportunities ("dedupeKey");
