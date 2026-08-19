-- 商品可設定每位團員的最高購買數量。
-- NULL 代表不限購。
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS max_quantity integer;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS unit text;

ALTER TABLE public.products
ADD CONSTRAINT products_max_quantity_positive
CHECK (max_quantity IS NULL OR max_quantity > 0);
