import { Router } from 'express';
import { changeTableStatus, createTable, listTables } from './tables.service.js';

export const tablesRouter = Router();

tablesRouter.get('/', async (_req, res) => {
  res.json(await listTables());
});

tablesRouter.post('/', async (req, res) => {
  res.status(201).json(await createTable(req.body));
});

tablesRouter.patch('/:id/status', async (req, res) => {
  res.json(await changeTableStatus(req.params.id, req.body));
});
