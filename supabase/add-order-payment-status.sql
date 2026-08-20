-- 已完成待收款：記錄每位團員本次團購的付款時間。
-- NULL = 尚未付款（OFF），有時間 = 已付款（ON）。
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_orders_group_buy_paid_at
  ON public.orders(group_buy_id, paid_at);
