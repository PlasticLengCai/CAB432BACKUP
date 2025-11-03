// middleware/requireOwnerOrAdmin.js
module.exports = function requireOwnerOrAdmin(pickOwner) {
  return (req, res, next) => {
    const groups = req.jwt?.['cognito:groups'];
    const isAdmin = Array.isArray(groups) ? groups.includes('Admin') : groups === 'Admin';
    if (isAdmin) return next();

    const requestOwner = pickOwner?.(req);
    if (!requestOwner) return res.status(403).json({ error: 'forbidden', reason: 'NO_OWNER' });

    req._requireOwnerCheck = requestOwner;
    next();
  };
};
