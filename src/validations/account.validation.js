import { z } from 'zod';

export const createAccountSchema = z
  .object({
    name: z
      .string({
        required_error: 'Name is required',
        invalid_type_error: 'Name must be a string',
      })
      .trim()
      .min(1, 'Name cannot be empty')
      .max(255, 'Name cannot exceed 255 characters'),
  })
  .strict({
    message: 'Unrecognized field. Only "name" is permitted when creating an account',
  });
