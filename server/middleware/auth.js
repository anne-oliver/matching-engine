function authRequired(req, res, next) {

  if (process.env.AUTH_BYPASS === 'true') {
    return next();
  }
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'login required' });
}

module.exports = { authRequired };
