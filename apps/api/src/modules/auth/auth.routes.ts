import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  googleAuthSchema,
  updateProfileSchema,
  changePasswordSchema,
} from './auth.schemas';
import * as controller from './auth.controller';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

/** POST /auth/register — create account + personal tenant */
router.post('/register', validateBody(registerSchema), controller.register);

/** POST /auth/login — email + password authentication */
router.post('/login', validateBody(loginSchema), controller.login);

/** POST /auth/refresh — rotate refresh token pair */
router.post('/refresh', validateBody(refreshTokenSchema), controller.refresh);

/** POST /auth/password-reset/request — initiate password reset */
router.post(
  '/password-reset/request',
  validateBody(passwordResetRequestSchema),
  controller.requestPasswordReset,
);

/** POST /auth/password-reset/confirm — complete password reset */
router.post(
  '/password-reset/confirm',
  validateBody(passwordResetConfirmSchema),
  controller.confirmPasswordReset,
);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

/** POST /auth/logout — revoke the current refresh token */
router.post('/logout', authenticateUser, controller.logout);

/** GET /auth/me — return current user + tenant context */
router.get('/me', authenticateUser, requireTenantAccess, controller.me);

/** PATCH /auth/me — update user display name */
router.patch(
  '/me',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateProfileSchema),
  controller.updateProfile,
);

/** POST /auth/change-password — change own password */
router.post(
  '/change-password',
  authenticateUser,
  validateBody(changePasswordSchema),
  controller.changePassword,
);

// ---------------------------------------------------------------------------
// Google OAuth — SPA "verify ID token" flow
// ---------------------------------------------------------------------------

/** POST /auth/google/verify — accepts a Google credential (id_token) from client */
router.post(
  '/google/verify',
  validateBody(googleAuthSchema),
  controller.googleAuth,
);

export default router;
