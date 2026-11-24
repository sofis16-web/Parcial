import { createHash, randomBytes } from 'node:crypto';
import { config } from '../../shared/config.js';
import { HttpError } from '../../shared/errors.js';
import { hashPassword, verifyPassword } from './auth.password.js';
import * as repository from './auth.repository.js';
import type { PublicUser } from './auth.repository.js';

export const SESSION_COOKIE = 'reservet_session';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
// Hash falso para gastar el mismo tiempo cuando el usuario no existe.
const dummyHash = hashPassword('contraseña-inexistente');

export async function login(username: unknown, password: unknown) {
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    username.length > 64 ||
    !password ||
    password.length > 200
  ) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Usuario y contraseña son obligatorios');
  }
  const user = await repository.findUserWithHash(username.trim().toLowerCase());
  const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) {
    // Mismo mensaje para usuario inexistente y contraseña incorrecta.
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
  }
  await repository.deleteExpiredSessions();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3_600_000);
  await repository.createSession(hashToken(token), user.id, expiresAt);
  return { token, user: { id: user.id, username: user.username } satisfies PublicUser };
}

export const authenticate = (token: string) => repository.findUserBySession(hashToken(token));
export const logout = (token: string) => repository.deleteSession(hashToken(token));
