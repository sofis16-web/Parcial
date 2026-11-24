import { Router } from 'express';
import { config } from '../../shared/config.js';
import { readSessionToken, requireAuth } from './auth.middleware.js';
import { SESSION_COOKIE, login, logout } from './auth.service.js';

// HttpOnly: JavaScript no lee la cookie. SameSite=Strict: no viaja en peticiones cruzadas.
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.cookieSecure,
  path: '/',
} as const;

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  const session = await login(username, password);
  res.cookie(SESSION_COOKIE, session.token, {
    ...cookieOptions,
    maxAge: config.sessionTtlHours * 3_600_000,
  });
  res.json({ user: session.user });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json({ user: res.locals.user });
});

// Cerrar sesión borra la fila: el token queda revocado de inmediato en el servidor.
authRouter.post('/logout', async (req, res) => {
  const token = readSessionToken(req);
  if (token) await logout(token);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});
