CREATE TABLE "category_rules" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "deleted_at"  TIMESTAMPTZ,
  "tenant_id"   TEXT         NOT NULL,
  "pattern"     TEXT         NOT NULL,
  "category_id" TEXT         NOT NULL,

  CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "category_rules_tenant_id_pattern_key" UNIQUE ("tenant_id", "pattern"),
  CONSTRAINT "category_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "category_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "category_rules_tenant_id_idx" ON "category_rules"("tenant_id");
