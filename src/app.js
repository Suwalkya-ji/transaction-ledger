import express from 'express';
import apiRouter from './routes/index.js';

const app = express();

// Parse JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount all API endpoints under /api
app.use('/api', apiRouter);

// Catch undefined routes (404 handler)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error('Unhandled server error:', err);
  }

  // Handle invalid JSON body syntax
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid JSON payload in request body',
    });
  }

  // Handle PostgreSQL specific database errors
  if (err.code) {
    // 23505 = Unique violation
    if (err.code === '23505') {
      return res.status(409).json({
        status: 'error',
        message: 'A record with this identifier already exists.',
        detail: err.detail,
      });
    }
    // 23503 = Foreign key violation
    if (err.code === '23503') {
      return res.status(400).json({
        status: 'error',
        message: 'Referenced record does not exist.',
        detail: err.detail,
      });
    }
    // 23514 = Check constraint violation
    if (err.code === '23514') {
      return res.status(400).json({
        status: 'error',
        message: 'Data constraint check failed.',
        detail: err.detail,
      });
    }
  }

  res.status(status).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
});

export default app;
