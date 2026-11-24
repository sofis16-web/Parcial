import { HttpError } from '../../shared/errors.js';
import * as repository from './tables.repository.js';
import { TABLE_STATUSES, type TableStatus } from './tables.repository.js';

const MAX_PG_INTEGER = 2_147_483_647;
const invalid = (message: string) => new HttpError(400, 'VALIDATION_ERROR', message);
const asObject = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Cuerpo inválido');
  return body as Record<string, unknown>;
};

export const listTables = () => repository.listTables();

export async function createTable(body: unknown) {
  const { name, capacity } = asObject(body);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
    throw invalid('El nombre es obligatorio y admite hasta 80 caracteres');
  }
  if (
    typeof capacity !== 'number' ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 20
  ) {
    throw invalid('La capacidad debe ser un entero entre 1 y 20');
  }
  const created = await repository.insertTable(name.trim(), capacity);
  if (!created) throw new HttpError(409, 'DUPLICATE_TABLE', 'Ya existe una mesa con ese nombre');
  return created;
}

export async function changeTableStatus(rawId: string, body: unknown) {
  // Solo dígitos y dentro del rango de integer: evita NaN y desbordes que serían un 500.
  const id = /^\d+$/.test(rawId) ? Number(rawId) : 0;
  if (!Number.isSafeInteger(id) || id < 1 || id > MAX_PG_INTEGER) throw invalid('ID inválido');
  const { status } = asObject(body);
  if (typeof status !== 'string' || !(TABLE_STATUSES as readonly string[]).includes(status)) {
    throw invalid('Estado inválido');
  }
  const updated = await repository.updateTableStatus(id, status as TableStatus);
  if (!updated) throw new HttpError(404, 'TABLE_NOT_FOUND', 'Mesa no encontrada');
  return updated;
}
