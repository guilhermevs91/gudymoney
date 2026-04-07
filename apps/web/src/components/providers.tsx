'use client';

import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
import { AppProgressBar } from 'next-nprogress-bar';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        {children}
        <Toaster />
        <AppProgressBar
          height="3px"
          color="hsl(var(--primary))"
          options={{ showSpinner: false }}
          shallowRouting
        />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
