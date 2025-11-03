// middleware/requireAnyGroup.js
module.exports = function requireAnyGroup(groupNames = []) {
  const set = new Set(groupNames);
  return (req, res, next) => {
    const g = req.jwt?.['cognito:groups'];
    const list = Array.isArray(g) ? g : (g ? [g] : []);
    const ok = list.some(x => set.has(x));
    if (!ok) return res.status(403).json({ error: 'forbidden', needAnyOf: groupNames });
    next();
  };
};
