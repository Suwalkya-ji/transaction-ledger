import * as transactionService from '../services/transaction.service.js';

/**
 * Controller to handle POST /api/accounts/:id/transactions
 * Processes both credit and debit transactions for the specified account.
 */
export const createTransactionHandler = async (req, res, next) => {
  try {
    const accountId = req.params.id;
    const { type, amount, description, reference_id } = req.body;

    const result = await transactionService.processTransaction(accountId, {
      type,
      amount,
      description,
      reference_id,
    });

    const actionLabel = type === 'credit' ? 'Credit' : 'Debit';

    return res.status(201).json({
      status: 'success',
      message: `${actionLabel} transaction processed successfully`,
      data: {
        transaction: result.transaction,
        updated_balance: result.updated_balance,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to handle GET /api/accounts/:id/transactions
 * Fetches transactions for an account, sorted by created_at descending.
 * Supports optional ?type=credit or ?type=debit filter.
 */
export const getTransactionsHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    const transactions = await transactionService.getAccountTransactions(id, type);

    return res.status(200).json({
      status: 'success',
      data: {
        account_id: id,
        total: transactions.length,
        filter: type || 'all',
        transactions,
      },
    });
  } catch (error) {
    next(error);
  }
};
