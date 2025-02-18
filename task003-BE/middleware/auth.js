const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized - Please login first" });
};

const isNotAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.status(403).json({ error: "Already authenticated" });
};

module.exports = {
  isAuthenticated,
  isNotAuthenticated,
};
