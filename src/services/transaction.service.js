import { pool, query } from '../config/db.js';

/**
 * Unified transaction engine to process both credit and debit transactions
 * within an atomic PostgreSQL transaction.
 *
 * Concurrency & Atomicity protection:
 * 1. Checks out a dedicated client from the pool.
 * 2. Issues 'BEGIN' to start transaction isolation.
 * 3. Uses 'SELECT ... FOR UPDATE' to acquire an exclusive row-level lock on the account.
 *    Any concurrent requests for the same account wait until this transaction completes.
 * 4. Checks account existence.
 * 5. For debits: strictly validates that the locked balance >= debit amount.
 * 6. Inserts the immutable audit ledger row into 'transactions'.
 *    - Catches unique violation (code 23505) on (account_id, reference_id) for idempotency.
 * 7. Updates the account balance (+ for credit, - for debit).
 * 8. Issues 'COMMIT' to atomically persist both changes.
 * 9. Issues 'ROLLBACK' on any error to guarantee zero partial state.
 *
 * @param {string} accountId - UUID of the target account
 * @param {object} payload - Validated transaction payload
 * @param {'credit' | 'debit'} payload.type - Transaction direction
 * @param {number} payload.amount - Positive transaction amount
 * @param {string} [payload.description] - Optional description text
 * @param {string} payload.reference_id - Idempotent reference ID
 * @returns {Promise<{ transaction: object, updated_balance: string }>}
 */
export const processTransaction = async (accountId, { type, amount, description, reference_id }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify account exists and acquire exclusive row-level lock with SELECT ... FOR UPDATE
    const accountCheckSql = `
      SELECT id, name, balance
      FROM accounts
      WHERE id = $1
      FOR UPDATE;
    `;
    const accountResult = await client.query(accountCheckSql, [accountId]);

    if (accountResult.rowCount === 0) {
      const error = new Error(`Account with ID '${accountId}' was not found.`);
      error.status = 404;
      throw error;
    }

    const currentBalance = parseFloat(accountResult.rows[0].balance);

    // 2. Insert transaction record (guarded by uq_account_reference unique constraint)
    const insertTransactionSql = `
      INSERT INTO transactions (account_id, type, amount, description, reference_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, account_id, type, amount, description, reference_id, created_at;
    `;

    let transactionResult;
    try {
      transactionResult = await client.query(insertTransactionSql, [
        accountId,
        type,
        amount,
        description || null,
        reference_id,
      ]);
    } catch (dbErr) {
      // 23505 = PostgreSQL unique_violation
      if (dbErr.code === '23505') {
        const error = new Error(
          `Duplicate transaction: A transaction with reference_id '${reference_id}' already exists for this account.`
        );
        error.status = 409;
        throw error;
      }
      throw dbErr;
    }

    // 3. Reject debit if balance is insufficient
    if (type === 'debit' && currentBalance < amount) {
      const error = new Error(
        `Insufficient balance. Current balance is $${currentBalance.toFixed(2)}, cannot debit $${amount.toFixed(2)}.`
      );
      error.status = 400;
      throw error;
    }

    // 4. Update account balance (+ for credit, - for debit)
    const updateBalanceSql = `
      UPDATE accounts
      SET balance = CASE 
        WHEN $1 = 'credit' THEN balance + $2
        WHEN $1 = 'debit' THEN balance - $2
      END
      WHERE id = $3
      RETURNING balance;
    `;
    const updateResult = await client.query(updateBalanceSql, [type, amount, accountId]);
    const updatedBalance = updateResult.rows[0].balance;

    // 5. Commit both operations atomically
    await client.query('COMMIT');

    return {
      transaction: transactionResult.rows[0],
      updated_balance: updatedBalance,
    };
  } catch (err) {
    // If any error occurs, rollback all database changes
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Error during transaction rollback:', rollbackErr);
    }
    throw err;
  } finally {
    // Always return client back to pool
    client.release();
  }
};

/**
 * Fetches transactions for a given account with pagination and optional type filter.
 * Verifies account existence and returns 404 if not found.
 * Orders transactions by created_at in descending order.
 *
 * @param {string} accountId - UUID of the account
 * @param {object} [options] - Query options
 * @param {'credit' | 'debit'} [options.type] - Optional filter by type
 * @param {number} [options.page=1] - Current page number
 * @param {number} [options.limit=10] - Number of items per page
 * @returns {Promise<{ transactions: Array<object>, pagination: object }>}
 */
export const getAccountTransactions = async (accountId, { type, page = 1, limit = 10 } = {}) => {
  // 1. Verify account exists
  const accountCheckSql = 'SELECT id FROM accounts WHERE id = $1;';
  const accountResult = await query(accountCheckSql, [accountId]);

  if (accountResult.rowCount === 0) {
    const error = new Error(`Account with ID '${accountId}' was not found.`);
    error.status = 404;
    throw error;
  }

  // 2. Count total records matching criteria
  let countSql = 'SELECT COUNT(*) AS total FROM transactions WHERE account_id = $1';
  const countParams = [accountId];

  if (type) {
    countSql += ' AND type = $2';
    countParams.push(type);
  }

  const countResult = await query(countSql, countParams);
  const totalRecords = parseInt(countResult.rows[0].total, 10);
  const totalPages = Math.ceil(totalRecords / limit) || 1;
  const offset = (page - 1) * limit;

  // 3. Query paginated transactions
  let dataSql = `
    SELECT id, account_id, type, amount, description, reference_id, created_at
    FROM transactions
    WHERE account_id = $1
  `;
  const dataParams = [accountId];

  if (type) {
    dataSql += ' AND type = $2';
    dataParams.push(type);
  }

  dataSql += ` ORDER BY created_at DESC LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2};`;
  dataParams.push(limit, offset);

  const dataResult = await query(dataSql, dataParams);

  return {
    transactions: dataResult.rows,
    pagination: {
      current_page: page,
      page_size: limit,
      total_records: totalRecords,
      total_pages: totalPages,
    },
  };
};
