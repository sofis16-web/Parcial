import { pool } from '../../shared/database.js';

export const TABLE_STATUSES = ['available', 'occupied', 'out_of_service'] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];
export interface RestaurantTable {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
}

const COLUMNS = 'id, name, capacity, status';

export async function listTables(): Promise<RestaurantTable[]> {
  const result = await pool.query<RestaurantTable>(
    `SELECT ${COLUMNS} FROM restaurant_tables ORDER BY id`,
  );
  return result.rows;
}

// Devuelve null si el nombre ya existe (cualquier restricción de unicidad).
export async function insertTable(name: string, capacity: number) {
  const result = await pool.query<RestaurantTable>(
    `INSERT INTO restaurant_tables (name, capacity) VALUES ($1, $2)
     ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
    [name, capacity],
  );
  return result.rows[0] ?? null;
}

export async function updateTableStatus(id: number, status: TableStatus) {
  const result = await pool.query<RestaurantTable>(
    `UPDATE restaurant_tables SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}
