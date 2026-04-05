import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import {
  upsertBudgetSchema,
  getBudgetQuerySchema,
  changeScopeSchema,
  createBudgetSchema,
  createBudgetItemSchema,
  updateBudgetItemSchema,
  futureExistsQuerySchema,
  budgetSuggestionsQuerySchema,
} from './budgets.schemas';
import * as controller from './budgets.controller';

const router: Router = Router();

const auth = [authenticateUser, requireTenantAccess] as const;

// GET /budgets?year=&month=
router.get('/', ...auth, validateQuery(getBudgetQuerySchema), controller.getBudget);

// POST /budgets — create empty budget for a period
router.post('/', ...auth, validateBody(createBudgetSchema), controller.createBudget);

// PUT /budgets — full upsert with items
router.put('/', ...auth, validateBody(upsertBudgetSchema), controller.upsertBudget);

// PATCH /budgets/scope — must be declared before /:id to avoid conflicts
router.patch('/scope', ...auth, validateBody(changeScopeSchema), controller.changeBudgetScope);

// GET /budgets/items/future-exists — must be declared before /:id to avoid conflicts
router.get('/items/future-exists', ...auth, validateQuery(futureExistsQuerySchema), controller.checkFutureExists);

// GET /budgets/suggestions — must be declared before /:id to avoid conflicts
router.get('/suggestions', ...auth, validateQuery(budgetSuggestionsQuerySchema), controller.getSuggestions);

// POST /budgets/:id/items
router.post('/:id/items', ...auth, validateBody(createBudgetItemSchema), controller.addItem);

// PATCH /budgets/:id/items/:itemId
router.patch('/:id/items/:itemId', ...auth, validateBody(updateBudgetItemSchema), controller.updateItem);

// DELETE /budgets/:id/items/:itemId
router.delete('/:id/items/:itemId', ...auth, controller.deleteItem);

// GET /budgets/:id/versions
router.get('/:id/versions', ...auth, controller.getBudgetVersions);

export default router;
