import * as accountService from '../services/account.service.js';

/**
 * Controller to handle POST /api/accounts
 * Expects validated req.body containing { name }
 */
export const createAccountHandler = async (req, res, next) => {
  try {
    const { name } = req.body;
    const account = await accountService.createAccount(name);

    return res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Controller to handle GET /api/accounts/:id/balance
 * Returns the current balance for the given account.
 */
export const getAccountBalanceHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const balanceInfo = await accountService.getAccountBalance(id);

    return res.status(200).json({
      account_id: balanceInfo.account_id,
      balance: balanceInfo.balance,
    });
  } catch (error) {
    next(error);
  }
};
