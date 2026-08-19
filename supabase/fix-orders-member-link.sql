-- 修正訂單與成員的關聯欄位
-- members.id 才是正式的員工 UUID 關聯。
-- orders.employee_id 是舊欄位，且目前資料庫可能是 uuid 型別，不能存入 5 位數工號。
-- 應由 orders.member_id -> members.id 取得員工資料。

ALTER TABLE public.orders
  ALTER COLUMN employee_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_member_id
  ON public.orders(member_id);

-- 檢查結果：
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'orders'
-- ORDER BY ordinal_position;
