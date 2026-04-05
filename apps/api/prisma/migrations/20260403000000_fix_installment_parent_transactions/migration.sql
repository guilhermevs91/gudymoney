-- Remove credit_card_id and credit_card_invoice_id from installment parent transactions
-- so they no longer appear in invoice listings alongside the individual installment parcels.
-- The parent transaction is only an anchor record for the Installment row.

UPDATE transactions t
SET
  credit_card_id         = NULL,
  credit_card_invoice_id = NULL
WHERE t.id IN (
  SELECT parent_transaction_id
  FROM installments
  WHERE deleted_at IS NULL
)
AND t.deleted_at IS NULL;
