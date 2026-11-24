import type { Request, RequestHandler } from 'express';
import { HttpError } from '../../shared/errors.js';
import { SESSION_COOKIE, authenticate } from './auth.service.js';

export function readSessionToken(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return value && value.length <= 200 ? value : undefined;
    }
  }
  return undefined;
}

// La protección real vive aquí, en el servidor: sin sesión válida, 401.
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = readSessionToken(req);
  const user = token ? await authenticate(token) : null;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  res.locals.user = user;
  next();
};
