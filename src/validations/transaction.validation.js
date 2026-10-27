import { z } from 'zod';

export const accountParamsSchema = z.object({
  id: z
    .string({
      required_error: 'Account ID is required in URL path',
      invalid_type_error: 'Account ID must be a string',
    })
    .uuid({
      message: 'Invalid account ID format. Must be a valid UUID',
    }),
});

export const createTransactionSchema = z
  .object({
    type: z.enum(['credit', 'debit'], {
      errorMap: () => ({
        message: 'Invalid transaction type. Must be either "credit" or "debit"',
      }),
    }),
    amount: z
      .number({
        required_error: 'Amount is required',
        invalid_type_error: 'Amount must be a numeric value',
      })
      .positive({
        message: 'Amount must be greater than zero',
      })
      .refine((val) => Number(val.toFixed(2)) === val, {
        message: 'Amount cannot have more than 2 decimal places',
      }),
    reference_id: z
      .string({
        required_error: 'reference_id is required',
        invalid_type_error: 'reference_id must be a string',
      })
      .trim()
      .min(1, {
        message: 'reference_id cannot be empty',
      })
      .max(255, {
        message: 'reference_id cannot exceed 255 characters',
      }),
    description: z
      .string({
        invalid_type_error: 'Description must be a string',
      })
      .trim()
      .max(500, {
        message: 'Description cannot exceed 500 characters',
      })
      .optional(),
  })
  .strict({
    message: 'Unrecognized field in transaction payload',
  });

// Query schema for filtering GET /api/accounts/:id/transactions
export const getTransactionsQuerySchema = z
  .object({
    type: z
      .enum(['credit', 'debit'], {
        errorMap: () => ({
          message: 'Invalid transaction type query parameter. Must be either "credit" or "debit"',
        }),
      })
      .optional(),
  })
  .strict({
    message: 'Unrecognized query parameter',
  });

// Backward compatibility alias
export const createCreditTransactionSchema = createTransactionSchema;
