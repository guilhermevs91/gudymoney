import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';

describe('Auth', () => {
  const email = `test_auth_${Date.now()}@example.com`;
  const password = 'TestPass123!';
  const name = 'Test User Auth';

  let accessToken: string;
  let refreshToken: string;

  describe('POST /auth/register', () => {
    it('creates a user, tenant and returns tokens', async () => {
      const res = await request(app).post('/auth/register').send({ name, email, password });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        user: { name, email },
        access_token: expect.any(String),
        refresh_token: expect.any(String),
      });

      accessToken = res.body.data.access_token as string;
      refreshToken = res.body.data.refresh_token as string;
    });

    it('rejects duplicate email', async () => {
      const res = await request(app).post('/auth/register').send({ name, email, password });
      expect(res.status).toBe(409);
    });

    it('rejects missing fields', async () => {
      const res = await request(app).post('/auth/register').send({ email });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('returns tokens for valid credentials', async () => {
      const res = await request(app).post('/auth/login').send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
    });

    it('rejects wrong password', async () => {
      const res = await request(app).post('/auth/login').send({ email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('rejects unknown email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns a new access token', async () => {
      const res = await request(app).post('/auth/refresh').send({ refresh_token: refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
    });

    it('rejects invalid refresh token', async () => {
      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'invalid-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the refresh token', async () => {
      const loginRes = await request(app).post('/auth/login').send({ email, password });
      const { access_token, refresh_token } = loginRes.body.data as {
        access_token: string;
        refresh_token: string;
      };

      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ refresh_token });

      expect(logoutRes.status).toBe(204);

      // Refresh should now fail
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token });
      expect(refreshRes.status).toBe(401);
    });
  });
});
