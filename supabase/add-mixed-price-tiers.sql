-- 同一個團購內，所有商品共用這組價格階梯。
-- 例如 1-9 件 35 元、10-29 件 34 元、30 件以上 32 元。
-- 計算時會把團員在不同商品的數量加總後決定單價。
CREATE TABLE IF NOT EXISTS public.group_buy_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_buy_id uuid NOT NULL REFERENCES public.group_buys(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL CHECK (min_quantity >= 1),
  max_quantity integer,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buy_price_tiers_range_check
    CHECK (max_quantity IS NULL OR max_quantity >= min_quantity)
);

CREATE INDEX IF NOT EXISTS idx_group_buy_price_tiers_group_buy_id
  ON public.group_buy_price_tiers(group_buy_id);
