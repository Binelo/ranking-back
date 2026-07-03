export function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join('; ') });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Registro duplicado' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
}
