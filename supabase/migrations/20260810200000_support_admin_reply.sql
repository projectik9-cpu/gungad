-- Support ticket admin reply fields
ALTER TABLE public.gg_support_tickets
  ADD COLUMN IF NOT EXISTS admin_message_id bigint,
  ADD COLUMN IF NOT EXISTS admin_telegram_id bigint,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_text text;

CREATE INDEX IF NOT EXISTS gg_support_tickets_admin_msg_idx
  ON public.gg_support_tickets (admin_message_id)
  WHERE admin_message_id IS NOT NULL;
