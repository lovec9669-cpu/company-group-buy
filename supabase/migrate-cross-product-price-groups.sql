-- 跨商品價格群組：同一群組內的商品，會把「所有員工」的訂購數量合併後決定階梯單價。
-- 未加入任何價格群組的商品，使用自己的固定價格。

CREATE TABLE IF NOT EXISTS public.group_buy_price_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_buy_id uuid NOT NULL REFERENCES public.group_buys(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '價格群組',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_group_id uuid REFERENCES public.group_buy_price_groups(id) ON DELETE SET NULL;

ALTER TABLE public.group_buy_price_tiers
  ADD COLUMN IF NOT EXISTS price_group_id uuid REFERENCES public.group_buy_price_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_group_buy_price_groups_group_buy_id
  ON public.group_buy_price_groups(group_buy_id);

CREATE INDEX IF NOT EXISTS idx_products_price_group_id
  ON public.products(price_group_id);

CREATE INDEX IF NOT EXISTS idx_group_buy_price_tiers_price_group_id
  ON public.group_buy_price_tiers(price_group_id);

-- 新版建立團購會使用 price_group_id。
-- 舊版只使用 group_buy_id 的資料保留不動，方便既有團購繼續查閱。
