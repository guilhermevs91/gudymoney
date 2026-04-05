/**
 * Gudy Money — Category Seed
 *
 * This file exports a function to seed the 8 default system categories
 * for a newly created tenant. It is NOT a standalone Prisma seed script
 * (i.e., do not run `prisma db seed`). Instead, call `seedDefaultCategories`
 * from the tenant creation service after the tenant row is committed.
 *
 * Categories are marked `is_system = true` so the UI can distinguish them
 * from user-created categories and prevent accidental deletion.
 */

import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Default category definitions
// ---------------------------------------------------------------------------

interface DefaultCategory {
  name: string;
  icon: string;
  color: string;
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Moradia", icon: "home", color: "#4A90D9" },
  { name: "Alimentação", icon: "utensils", color: "#E67E22" },
  { name: "Transporte", icon: "car", color: "#2ECC71" },
  { name: "Saúde", icon: "heart-pulse", color: "#E74C3C" },
  { name: "Educação", icon: "graduation-cap", color: "#9B59B6" },
  { name: "Lazer", icon: "smile", color: "#F1C40F" },
  { name: "Vestuário", icon: "shirt", color: "#1ABC9C" },
  { name: "Outros", icon: "ellipsis", color: "#95A5A6" },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

/**
 * Seeds the 8 default system categories for a given tenant.
 *
 * @param prisma     - An active PrismaClient instance (or transaction client).
 * @param tenant_id  - The UUID of the newly created tenant.
 * @param created_by - The UUID of the user triggering the creation (optional).
 *
 * @example
 * // Inside the tenant creation service, within the same transaction:
 * await seedDefaultCategories(tx, newTenant.id, currentUser.id);
 */
export async function seedDefaultCategories(
  prisma: PrismaClient,
  tenant_id: string,
  created_by?: string,
): Promise<void> {
  const now = new Date();

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((cat) => ({
      tenant_id,
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      parent_id: null,
      is_system: true,
      created_by: created_by ?? null,
      created_at: now,
      updated_at: now,
    })),
    // Skip if categories already exist for this tenant (idempotent re-runs)
    skipDuplicates: true,
  });
}
