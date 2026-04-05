import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request body schemas
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(100),
});

export const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

export const googleAuthSchema = z.object({
  id_token: z.string().min(1),
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(100),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
