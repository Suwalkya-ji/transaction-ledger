/**
 * Express middleware to validate request data against a given Zod schema.
 * Supports validating 'body', 'params', or 'query' (defaults to 'body').
 *
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 * @param {'body' | 'params' | 'query'} [source='body'] - The request property to validate
 * @returns {import('express').RequestHandler}
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    req[source] = schema.parse(req[source]);
    next();
  } catch (err) {
    if (err.name === 'ZodError') {
      const errors = err.errors.map((e) => ({
        field: e.path.length > 0 ? e.path.join('.') : source,
        message: e.message,
      }));

      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors,
      });
    }
    next(err);
  }
};
