# Transaction Ledger API

A high-reliability, ACID-compliant Double-Entry-Ready Transaction Ledger API built with **Node.js**, **Express**, **PostgreSQL (Supabase)**, the native **`pg`** client, and **Zod** schema validation.

---

## Table of Contents
- [Project Overview](#project-overview)
- [Architecture & Design Principles](#architecture--design-principles)
- [Tech Stack](#tech-stack)
- [Database Schema & Constraints](#database-schema--constraints)
- [Environment Variables](#environment-variables)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Automated Testing](#automated-testing)
- [API Documentation](#api-documentation)
- [Postman Testing Checklist](#postman-testing-checklist)
- [Assumptions](#assumptions)

---

## Project Overview

The Transaction Ledger API is engineered for financial accuracy and auditability:
- **Zero Race Conditions**: Employs PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) during all account balance alterations to serialize concurrent requests.
- **Idempotency & Duplicate Prevention**: Backed by a database composite unique constraint on `(account_id, reference_id)` preventing duplicate charges or duplicate credits even under parallel requests.
- **Strict All-or-Nothing Atomicity**: Every transaction update and ledger entry executes within an explicit `BEGIN ... COMMIT / ROLLBACK` block.
- **Exact Fixed-Point Arithmetic**: Uses PostgreSQL `NUMERIC(15, 2)` to eliminate floating-point rounding errors.

---

## Architecture & Design Principles

The project adheres to a clean **Layered Architecture**:

```
Client Request
      │
      ▼
Routes (src/routes/)
  └─ Maps endpoints, attaches Zod validators
      │
      ▼
Middleware (src/middleware/)
  └─ Validates & strips payload (Zod), formats error responses
      │
      ▼
Controllers (src/controllers/)
  └─ Extracts parameters, delegates to service, formats HTTP status
      │
      ▼
Services (src/services/)
  └─ Core business logic, transaction isolation (BEGIN/COMMIT/ROLLBACK), row locking
      │
      ▼
Database (src/config/db.js)
  └─ PostgreSQL Connection Pool (`pg.Pool`), parameterized SQL queries
```

---

## Tech Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime** | Node.js (v18+) | Non-blocking I/O with modern ES Modules (`"type": "module"`) |
| **Framework** | Express.js 4.x | Lightweight, robust HTTP routing and middleware architecture |
| **Database** | PostgreSQL 17 (Supabase) | ACID relational engine with robust constraints and row-level locking |
| **Driver** | `pg` (`node-postgres`) | Direct, high-performance connection pooling via `pg.Pool` without ORM overhead |
| **Validation** | Zod 3.x | Declarative, type-safe runtime schema validation |
| **Dev Tooling** | Nodemon | Hot-reloading development server |

---

## Database Schema & Constraints

Execute the schema definition in `src/db/schema.sql` via the Supabase SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_balance_non_negative CHECK (balance >= 0)
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    reference_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
);

-- Index for date-sorted query performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_id_created_at 
    ON transactions (account_id, created_at DESC);
```

### Constraint Explanations
1. `PRIMARY KEY DEFAULT gen_random_uuid()`: Generates collision-resistant Version 4 UUIDs natively at the database layer.
2. `chk_account_balance_non_negative CHECK (balance >= 0)`: Database-level defense-in-depth guaranteeing an account balance can never drop below zero.
3. `ON DELETE RESTRICT`: Guarantees referential integrity; accounts with existing ledger entries cannot be accidentally dropped.
4. `CHECK (type IN ('credit', 'debit'))`: Restricts transaction types to valid accounting movements.
5. `CHECK (amount > 0)`: Guarantees transaction magnitudes are strictly positive.
6. `CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)`: Enforces idempotency per account. Prevents duplicate charges across network retries.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Application Port and Environment
PORT=3000
NODE_ENV=development

# Database Connection (Supabase PostgreSQL)
# Transaction Pooler (recommended):
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Or Direct Connection:
# DATABASE_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

---

## Installation & Setup

1. **Clone or navigate to the repository**:
   ```bash
   cd transaction-ledger-api
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Verify Database Connectivity**:
   ```bash
   npm run test:db
   ```

---

## Running the Application

- **Development Mode** (with Nodemon hot-reload):
  ```bash
  npm run dev
  ```

- **Production Mode**:
  ```bash
  npm start
  ```

The server binds to `http://localhost:3000`.

---

## Automated Testing

Run the full end-to-end integration and concurrency test suite:

```bash
npm test
```

This verifies:
- Health check endpoints
- Account creation & client balance tampering rejection
- Credit processing & atomic balance increment
- Debit processing, overdraft prevention, and sub-cent precision rejection
- Idempotency via composite unique constraints
- Concurrent duplicate and concurrent debit serialization
- Balance retrieval and transaction history filtering (`credit`, `debit`, all)

---

## API Documentation

### 1. Health Check
- **Endpoint**: `GET /api/health`
- **Response**: `200 OK`
  ```json
  {
    "status": "ok",
    "message": "Transaction Ledger API is running smoothly",
    "timestamp": "2026-10-27T16:00:00.000Z",
    "uptime": 12
  }
  ```

---

### 2. Create Account
- **Endpoint**: `POST /api/accounts`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Dinesh"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "status": "success",
    "message": "Account created successfully",
    "data": {
      "id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
      "name": "Dinesh",
      "balance": "0.00",
      "created_at": "2026-10-27T15:54:19.450Z"
    }
  }
  ```

---

### 3. Credit / Debit Transaction
- **Endpoint**: `POST /api/accounts/:id/transactions`
- **Headers**: `Content-Type: application/json`
- **Request Body (Credit)**:
  ```json
  {
    "type": "credit",
    "amount": 500.00,
    "description": "Salary credit",
    "reference_id": "REF001"
  }
  ```
- **Request Body (Debit)**:
  ```json
  {
    "type": "debit",
    "amount": 200.00,
    "description": "Shopping payment",
    "reference_id": "REF002"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "status": "success",
    "message": "Credit transaction processed successfully",
    "data": {
      "transaction": {
        "id": "f51c7aa2-7711-47fb-89c0-8182d774e1e3",
        "account_id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
        "type": "credit",
        "amount": "500.00",
        "description": "Salary credit",
        "reference_id": "REF001",
        "created_at": "2026-10-27T15:55:00.000Z"
      },
      "updated_balance": "500.00"
    }
  }
  ```

---

### 4. Get Account Balance
- **Endpoint**: `GET /api/accounts/:id/balance`
- **Response**: `200 OK`
  ```json
  {
    "account_id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
    "balance": "300.00"
  }
  ```

---

### 5. Get Transaction History
- **Endpoint**: `GET /api/accounts/:id/transactions`
- **Query Parameters**:
  - `type` (optional): `credit` or `debit`
  - `page` (optional): positive integer, defaults to `1`
  - `limit` (optional): positive integer (max 100), defaults to `10`
- **Response**: `200 OK`
  ```json
  {
    "status": "success",
    "data": {
      "account_id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
      "filter": "all",
      "transactions": [
        {
          "id": "e30e1bb1-3838-4e8c-85a0-9759c869e5d4",
          "account_id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
          "type": "debit",
          "amount": "200.00",
          "description": "Shopping payment",
          "reference_id": "REF002",
          "created_at": "2026-10-27T15:56:00.000Z"
        },
        {
          "id": "f51c7aa2-7711-47fb-89c0-8182d774e1e3",
          "account_id": "5ed8f323-c0e2-4324-93fc-d140a36d4c02",
          "type": "credit",
          "amount": "500.00",
          "description": "Salary credit",
          "reference_id": "REF001",
          "created_at": "2026-10-27T15:55:00.000Z"
        }
      ],
      "pagination": {
        "current_page": 1,
        "page_size": 10,
        "total_records": 2,
        "total_pages": 1
      }
    }
  }
  ```

---

## Postman Testing Checklist

| # | Test Scenario | Method & Endpoint | Payload / Params | Expected Status |
| :-: | :--- | :--- | :--- | :-: |
| 1 | Health Check | `GET /api/health` | None | `200 OK` |
| 2 | Create Account (Happy Path) | `POST /api/accounts` | `{"name": "Alice"}` | `201 Created` |
| 3 | Reject Balance Injection | `POST /api/accounts` | `{"name": "Alice", "balance": 1000}` | `400 Bad Request` |
| 4 | Reject Empty Name | `POST /api/accounts` | `{"name": "   "}` | `400 Bad Request` |
| 5 | Credit Account | `POST /api/accounts/:id/transactions` | `{"type": "credit", "amount": 100, "reference_id": "TX_01"}` | `201 Created` |
| 6 | Reject Duplicate Credit | `POST /api/accounts/:id/transactions` | `{"type": "credit", "amount": 100, "reference_id": "TX_01"}` | `409 Conflict` |
| 7 | Debit Account (Normal) | `POST /api/accounts/:id/transactions` | `{"type": "debit", "amount": 40, "reference_id": "TX_02"}` | `201 Created` |
| 8 | Reject Insufficient Funds | `POST /api/accounts/:id/transactions` | `{"type": "debit", "amount": 999, "reference_id": "TX_03"}` | `400 Bad Request` |
| 9 | Reject Invalid Currency Scale | `POST /api/accounts/:id/transactions` | `{"type": "credit", "amount": 10.999, "reference_id": "TX_04"}` | `400 Bad Request` |
| 10 | Reject Invalid Transaction Type | `POST /api/accounts/:id/transactions` | `{"type": "transfer", "amount": 50, "reference_id": "TX_05"}` | `400 Bad Request` |
| 11 | Cross-Account Reference ID | `POST /api/accounts/:idB/transactions`| `{"type": "credit", "amount": 50, "reference_id": "TX_01"}` | `201 Created` |
| 12 | Get Current Balance | `GET /api/accounts/:id/balance` | None | `200 OK` |
| 13 | Get Balance (Account 404) | `GET /api/accounts/:fakeId/balance` | None | `404 Not Found` |
| 14 | Get All Transactions | `GET /api/accounts/:id/transactions` | None | `200 OK` |
| 15 | Filter Credits Only | `GET /api/accounts/:id/transactions?type=credit` | Query: `type=credit` | `200 OK` |
| 16 | Filter Debits Only | `GET /api/accounts/:id/transactions?type=debit` | Query: `type=debit` | `200 OK` |
| 17 | Paginate Transactions | `GET /api/accounts/:id/transactions?page=1&limit=2` | Query: `page=1&limit=2` | `200 OK` |
| 18 | Reject Invalid Filter Query | `GET /api/accounts/:id/transactions?type=invalid`| Query: `type=invalid` | `400 Bad Request` |

---

## Assumptions

1. **Currency Precision**: All monetary values (`balance` and `amount`) are represented with exact 2-decimal precision (`NUMERIC(15, 2)`). Inputs exceeding two decimal places (fractional cents) are rejected.
2. **Account Balances**: Accounts must maintain a non-negative balance (`balance >= 0`). No overdraft facility is provided beyond rejection of debit transactions exceeding available funds.
3. **Idempotency Scope**: The `reference_id` uniquely identifies a transaction **per account**. The same `reference_id` can be reused by different accounts.
4. **Transaction Immutability**: Once created, transaction records cannot be updated, modified, or deleted through the API.
5. **Pagination Defaults**: If `page` and `limit` query parameters are omitted, pagination defaults to `page=1` and `limit=10` (maximum 100 per page).
6. **Single Currency**: All accounts and transactions operate in a single unified currency (no currency conversion / FX handling required).
7. **Authentication & Authorization**: Per the assignment specification, authentication (e.g. JWT/OAuth) was omitted to focus purely on ledger integrity, database concurrency, and transaction atomicity.
