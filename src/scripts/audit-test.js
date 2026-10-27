import app from '../app.js';
import { pool, query } from '../config/db.js';

const PORT = 3092;

const server = app.listen(PORT, async () => {
  let passed = 0;
  let failed = 0;

  const assert = (condition, description) => {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  };

  try {
    console.log('🚀 Starting Comprehensive Ledger API Audit Test Suite...\n');

    // 1. Health Check
    console.log('1. Health Check Endpoint');
    const healthRes = await fetch(`http://localhost:${PORT}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health returns 200 OK');

    // 2. Account Creation
    console.log('\n2. Account Creation (POST /api/accounts)');
    const acc1Res = await fetch(`http://localhost:${PORT}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Audit User Alpha' }),
    });
    const acc1Data = await acc1Res.json();
    const account1Id = acc1Data.data?.id;
    assert(
      acc1Res.status === 201 &&
        acc1Data.data?.name === 'Audit User Alpha' &&
        acc1Data.data?.balance === '0.00' &&
        Boolean(account1Id),
      'Account created with HTTP 201, balance = 0.00, and valid UUID'
    );

    const tamperRes = await fetch(`http://localhost:${PORT}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker', balance: 1000 }),
    });
    assert(tamperRes.status === 400, 'Client attempt to supply initial balance is rejected with 400');

    const emptyNameRes = await fetch(`http://localhost:${PORT}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    assert(emptyNameRes.status === 400, 'Whitespace/empty name is rejected with 400');

    // 3. Credit Transactions
    console.log('\n3. Credit Transactions');
    const credit1Res = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'credit',
        amount: 250.0,
        description: 'First deposit',
        reference_id: 'AUDIT_CREDIT_01',
      }),
    });
    const credit1Data = await credit1Res.json();
    assert(
      credit1Res.status === 201 && credit1Data.data?.updated_balance === '250.00',
      'Credit transaction creates ledger record and updates balance to 250.00'
    );

    // 4. Debit Transactions & Insufficient Funds
    console.log('\n4. Debit Transactions & Insufficient Funds');
    const debit1Res = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'debit',
        amount: 50.0,
        description: 'Store purchase',
        reference_id: 'AUDIT_DEBIT_01',
      }),
    });
    const debit1Data = await debit1Res.json();
    assert(
      debit1Res.status === 201 && debit1Data.data?.updated_balance === '200.00',
      'Debit transaction decreases balance to 200.00'
    );

    const overdraftRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'debit',
        amount: 999.0,
        description: 'Excessive debit',
        reference_id: 'AUDIT_OVERDRAFT_01',
      }),
    });
    assert(overdraftRes.status === 400, 'Debit exceeding current balance is rejected with 400');

    const subcentRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'credit',
        amount: 10.999,
        reference_id: 'AUDIT_SUBCENT_01',
      }),
    });
    assert(subcentRes.status === 400, 'Sub-cent amount (>2 decimal places) is rejected with 400');

    // 5. Duplicate Transaction Prevention
    console.log('\n5. Duplicate Transaction Prevention');
    const dupRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'credit',
        amount: 100.0,
        reference_id: 'AUDIT_CREDIT_01',
      }),
    });
    assert(dupRes.status === 409, 'Duplicate reference_id on same account returns 409 Conflict');

    // Verify Account B can use the same reference_id
    const acc2Res = await fetch(`http://localhost:${PORT}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Audit User Beta' }),
    });
    const acc2Data = await acc2Res.json();
    const account2Id = acc2Data.data.id;

    const acc2DupRes = await fetch(`http://localhost:${PORT}/api/accounts/${account2Id}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'credit',
        amount: 100.0,
        reference_id: 'AUDIT_CREDIT_01',
      }),
    });
    assert(acc2DupRes.status === 201, 'Same reference_id on different account succeeds (201 Created)');

    // 6. Concurrency Safety
    console.log('\n6. Concurrency Safety (SELECT ... FOR UPDATE)');
    // Account 1 balance is currently $200.00. Fire two concurrent debits of $150.00 (total $300.00).
    const [cResA, cResB] = await Promise.all([
      fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'debit',
          amount: 150.0,
          reference_id: 'AUDIT_CONCURRENT_A',
        }),
      }),
      fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'debit',
          amount: 150.0,
          reference_id: 'AUDIT_CONCURRENT_B',
        }),
      }),
    ]);
    const cStatuses = [cResA.status, cResB.status];
    assert(
      cStatuses.includes(201) && cStatuses.includes(400),
      'Concurrent debits exceeding balance serialize safely: exactly 1 succeeds (201) and 1 fails (400)'
    );

    // 7. Balance API
    console.log('\n7. Balance API (GET /api/accounts/:id/balance)');
    const balRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/balance`);
    const balData = await balRes.json();
    assert(
      balRes.status === 200 && balData.account_id === account1Id && balData.balance === '50.00',
      'GET balance returns exact current balance (50.00)'
    );

    const notFoundBalRes = await fetch(`http://localhost:${PORT}/api/accounts/00000000-0000-0000-0000-000000000000/balance`);
    assert(notFoundBalRes.status === 404, 'Non-existent account balance returns 404');

    // 8. Transaction History
    console.log('\n8. Transaction History (GET /api/accounts/:id/transactions)');
    const allTxRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions`);
    const allTxData = await allTxRes.json();
    assert(
      allTxRes.status === 200 && allTxData.data?.transactions?.length === 3,
      'GET transactions without filter returns all credit and debit records'
    );

    const creditFilterRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions?type=credit`);
    const creditFilterData = await creditFilterRes.json();
    assert(
      creditFilterRes.status === 200 &&
        creditFilterData.data?.transactions?.every((t) => t.type === 'credit'),
      '?type=credit filters to only credit transactions'
    );

    const debitFilterRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions?type=debit`);
    const debitFilterData = await debitFilterRes.json();
    assert(
      debitFilterRes.status === 200 &&
        debitFilterData.data?.transactions?.every((t) => t.type === 'debit'),
      '?type=debit filters to only debit transactions'
    );

    const invalidTypeRes = await fetch(`http://localhost:${PORT}/api/accounts/${account1Id}/transactions?type=invalid`);
    assert(invalidTypeRes.status === 400, 'Invalid ?type query parameter rejected with 400');

    console.log(`\n========================================`);
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    server.close(async () => {
      await pool.end();
      process.exit(failed > 0 ? 1 : 0);
    });
  } catch (err) {
    console.error('Audit run encountered fatal error:', err);
    server.close(async () => {
      await pool.end();
      process.exit(1);
    });
  }
});
