import 'express';
import type { BudgetScope, PlanType } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        role: 'ADMIN' | 'MEMBER';
      };
      superadmin?: {
        superadminId: string;
      };
      tenant?: {
        id: string;
        plan: PlanType;
        budget_scope: BudgetScope;
      };
    }
  }
}
