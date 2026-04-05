-- Recalcula total_amount de todas as faturas a partir das transações reais
-- Corrige inconsistências causadas por importações duplicadas ou backfill anterior

UPDATE credit_card_invoices cci
SET total_amount = COALESCE((
  SELECT SUM(t.amount)
  FROM transactions t
  WHERE t.credit_card_invoice_id = cci.id
    AND t.deleted_at IS NULL
    AND t.status <> 'CANCELADO'
), 0)
WHERE cci.deleted_at IS NULL;
