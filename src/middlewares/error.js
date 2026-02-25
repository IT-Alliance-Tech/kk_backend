export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not Found - ${req.originalUrl}`));
};

export const errorHandler = (err, req, res, _next) => {
  // Prefer err.status / err.statusCode (set by http-errors / createError),
  // fall back to res.statusCode if already set to a non-200 value, else 500.
  const status = err.status || err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  res.status(status).json({
    statusCode: status,
    success: false,
    error: { message: err.message || 'Server Error' },
    message: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

