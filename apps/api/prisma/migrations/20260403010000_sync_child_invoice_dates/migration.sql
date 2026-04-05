-- Sync child card invoice dates to match parent card invoice dates.
--
-- The unique constraint on (credit_card_id, period_start) includes soft-deleted rows,
-- so we must handle duplicates carefully:
-- 1. Identify which child invoices need a date change and what their new period_start will be.
-- 2. For each such invoice, if another row already exists at the new period_start for that card,
--    soft-delete the invoice we are trying to update (it is the stale duplicate).
-- 3. Update the survivors.

DO $$
DECLARE
  r RECORD;
  blocking_id UUID;
BEGIN
  -- Loop over every child invoice that needs its dates updated
  FOR r IN
    SELECT
      child_inv.id          AS child_id,
      child_inv.credit_card_id,
      parent_inv.period_start AS new_period_start,
      parent_inv.period_end   AS new_period_end,
      parent_inv.due_date     AS new_due_date
    FROM credit_card_invoices AS child_inv
    JOIN credit_cards AS child_card
      ON child_card.id = child_inv.credit_card_id
     AND child_card.parent_card_id IS NOT NULL
     AND child_card.deleted_at IS NULL
    JOIN credit_card_invoices AS parent_inv
      ON parent_inv.credit_card_id = child_card.parent_card_id
     AND parent_inv.deleted_at IS NULL
     AND parent_inv.period_start <= child_inv.period_end
     AND parent_inv.period_end   >= child_inv.period_start
    WHERE child_inv.deleted_at IS NULL
      -- only process rows that actually need a change
      AND (child_inv.period_start <> parent_inv.period_start
        OR child_inv.period_end   <> parent_inv.period_end
        OR child_inv.due_date     <> parent_inv.due_date)
  LOOP
    -- Check if another non-deleted row already occupies the target (credit_card_id, period_start)
    SELECT id INTO blocking_id
    FROM credit_card_invoices
    WHERE credit_card_id = r.credit_card_id
      AND period_start   = r.new_period_start
      AND deleted_at     IS NULL
      AND id             <> r.child_id
    LIMIT 1;

    IF blocking_id IS NOT NULL THEN
      -- The blocking row is already at the correct dates; soft-delete the stale one instead
      UPDATE credit_card_invoices
         SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = r.child_id;
    ELSE
      -- Safe to update
      UPDATE credit_card_invoices
         SET period_start = r.new_period_start,
             period_end   = r.new_period_end,
             due_date     = r.new_due_date,
             updated_at   = NOW()
       WHERE id = r.child_id;
    END IF;
  END LOOP;
END $$;
