-- 已完成待收款：新增 awaiting_payment 團購狀態。
-- 既有流程：open -> closed -> reviewing -> finalized
-- 新流程：open -> closed -> reviewing -> awaiting_payment
-- historical/finalized 保留給已完成的歷史資料。

ALTER TABLE public.group_buys
  DROP CONSTRAINT IF EXISTS group_buys_status_check;

ALTER TABLE public.group_buys
  ADD CONSTRAINT group_buys_status_check
  CHECK (status IN ('open', 'closed', 'reviewing', 'finalized', 'awaiting_payment'));
