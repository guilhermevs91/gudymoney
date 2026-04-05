-- Migration: preencher credit_card_invoice_id retroativamente nas transações de cartão
-- Para cada transação EXPENSE de cartão sem invoice vinculada,
-- encontra a fatura cujo período contém a data da transação.

UPDATE transactions t
SET credit_card_invoice_id = inv.id
FROM credit_card_invoices inv
WHERE
  t.credit_card_invoice_id IS NULL
  AND t.credit_card_id IS NOT NULL
  AND t.type = 'EXPENSE'
  AND t.deleted_at IS NULL
  AND inv.credit_card_id = t.credit_card_id
  AND inv.deleted_at IS NULL
  AND t.date >= inv.period_start
  AND t.date <  (inv.period_end + INTERVAL '1 day');
