import { Router } from 'express';
import {
  createAccountHandler,
  getAccountBalanceHandler,
} from '../controllers/account.controller.js';
import {
  createTransactionHandler,
  getTransactionsHandler,
} from '../controllers/transaction.controller.js';
import { validate } from '../middleware/validate.js';
import { createAccountSchema } from '../validations/account.validation.js';
import {
  accountParamsSchema,
  createTransactionSchema,
  getTransactionsQuerySchema,
} from '../validations/transaction.validation.js';

const router = Router();

// POST /api/accounts - Create a new account
router.post('/', validate(createAccountSchema), createAccountHandler);

// GET /api/accounts/:id/balance - Fetch current account balance
router.get(
  '/:id/balance',
  validate(accountParamsSchema, 'params'),
  getAccountBalanceHandler
);

// POST /api/accounts/:id/transactions - Process a transaction (credit or debit)
router.post(
  '/:id/transactions',
  validate(accountParamsSchema, 'params'),
  validate(createTransactionSchema, 'body'),
  createTransactionHandler
);

// GET /api/accounts/:id/transactions - Fetch all transactions with optional ?type=credit|debit filter
router.get(
  '/:id/transactions',
  validate(accountParamsSchema, 'params'),
  validate(getTransactionsQuerySchema, 'query'),
  getTransactionsHandler
);

export default router;
