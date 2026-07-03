import express, { Router } from 'express';
import {
  createBusiness,
  deleteBusiness,
  getBusiness,
  importBusinesses,
  listBusinesses,
  updateBusiness,
} from './businesses.controller.js';

export const businessesRouter: Router = Router();

// CSV import takes a raw text/csv body (registered before the :id routes).
businessesRouter.post(
  '/import',
  express.text({ type: ['text/csv', 'text/plain'], limit: '10mb' }),
  importBusinesses,
);

businessesRouter.get('/', listBusinesses);
businessesRouter.post('/', createBusiness);
businessesRouter.get('/:id', getBusiness);
businessesRouter.patch('/:id', updateBusiness);
businessesRouter.delete('/:id', deleteBusiness);
