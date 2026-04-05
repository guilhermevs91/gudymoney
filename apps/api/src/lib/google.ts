import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is not configured.');
  }
  if (!client) {
    client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return client;
}

export interface GoogleTokenPayload {
  sub: string;      // Google user ID
  email: string;
  name: string;
  picture?: string;
}

/**
 * Verify a Google ID token issued by the client-side @react-oauth/google (or expo-auth-session).
 * Returns the verified payload on success, throws on failure.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  const oauthClient = getClient();

  const ticket = await oauthClient.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google ID token payload.');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    picture: payload.picture,
  };
}
