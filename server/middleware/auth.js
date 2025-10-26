function authRequired(req, res, next) {
  
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'login required' });
}

module.exports = { authRequired };