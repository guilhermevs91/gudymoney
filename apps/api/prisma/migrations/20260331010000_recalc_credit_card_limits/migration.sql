-- Migration: recalcular limit_used e limit_available retroativamente
-- Soma todas as transações EXPENSE ativas (status != CANCELADO, deleted_at IS NULL)
-- agrupadas pelo cartão principal (parent_card_id ?? id)

WITH principal_limits AS (
  SELECT
    COALESCE(cc.parent_card_id, cc.id) AS principal_id,
    SUM(t.amount)                       AS total_used
  FROM transactions t
  JOIN credit_cards cc ON cc.id = t.credit_card_id
  WHERE
    t.type       = 'EXPENSE'
    AND t.status != 'CANCELADO'
    AND t.deleted_at IS NULL
    AND cc.deleted_at IS NULL
  GROUP BY COALESCE(cc.parent_card_id, cc.id)
)
UPDATE credit_cards
SET
  limit_used      = COALESCE(pl.total_used, 0),
  limit_available = credit_cards.limit_total - COALESCE(pl.total_used, 0)
FROM principal_limits pl
WHERE credit_cards.id = pl.principal_id
  AND credit_cards.parent_card_id IS NULL;

-- Cartões principais sem nenhuma transação: zerar limit_used
UPDATE credit_cards
SET
  limit_used      = 0,
  limit_available = limit_total
WHERE
  parent_card_id IS NULL
  AND deleted_at  IS NULL
  AND id NOT IN (
    SELECT COALESCE(cc2.parent_card_id, cc2.id)
    FROM transactions t2
    JOIN credit_cards cc2 ON cc2.id = t2.credit_card_id
    WHERE
      t2.type       = 'EXPENSE'
      AND t2.status != 'CANCELADO'
      AND t2.deleted_at IS NULL
      AND cc2.deleted_at IS NULL
  );
