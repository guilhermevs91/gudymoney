import { Router } from 'express';
import multer from 'multer';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import { importsController } from './imports.controller';
import {
  reconcileSchema,
  listImportItemsQuerySchema,
  listImportsQuerySchema,
  bradescoImportSchema,
} from './imports.schemas';

const router: Router = Router();

// multer — store in memory; max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/plain', 'text/csv', 'application/octet-stream'];
    const ext = file.originalname.toLowerCase();
    if (
      allowed.includes(file.mimetype) ||
      ext.endsWith('.ofx') ||
      ext.endsWith('.csv') ||
      ext.endsWith('.txt')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Use OFX, CSV ou TXT.'));
    }
  },
});

// POST /imports/bradesco-invoice/preview
router.post(
  '/bradesco-invoice/preview',
  authenticateUser,
  requireTenantAccess,
  upload.single('file'),
  importsController.previewBradescoInvoice,
);

// POST /imports/bradesco-invoice/import
// card_mappings sent as JSON string in the multipart form body
router.post(
  '/bradesco-invoice/import',
  authenticateUser,
  requireTenantAccess,
  upload.single('file'),
  importsController.importBradescoInvoice,
);

// POST /imports/upload
router.post(
  '/upload',
  authenticateUser,
  requireTenantAccess,
  upload.single('file'),
  importsController.uploadImport,
);

// GET /imports
router.get(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateQuery(listImportsQuerySchema),
  importsController.listImports,
);

// GET /imports/:id
router.get(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  importsController.getImport,
);

// GET /imports/:id/items
router.get(
  '/:id/items',
  authenticateUser,
  requireTenantAccess,
  validateQuery(listImportItemsQuerySchema),
  importsController.listImportItems,
);

// GET /imports/:id/transactions
router.get(
  '/:id/transactions',
  authenticateUser,
  requireTenantAccess,
  importsController.listImportTransactions,
);

// GET /imports/:id/items/:itemId/suggestions
router.get(
  '/:id/items/:itemId/suggestions',
  authenticateUser,
  requireTenantAccess,
  importsController.getSuggestions,
);

// DELETE /imports/:id
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  importsController.deleteImport,
);

// POST /imports/:id/items/:itemId/ignore
router.post(
  '/:id/items/:itemId/ignore',
  authenticateUser,
  requireTenantAccess,
  importsController.ignoreImportItem,
);

// POST /imports/reconcile
router.post(
  '/reconcile',
  authenticateUser,
  requireTenantAccess,
  validateBody(reconcileSchema),
  importsController.manualReconcile,
);

// DELETE /imports/reconcile/:reconciliationId
router.delete(
  '/reconcile/:reconciliationId',
  authenticateUser,
  requireTenantAccess,
  importsController.dereconcile,
);

export default router;
