export async function verifyAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  // 🔥 1. Hardcoded Email Check
  const ADMIN_EMAILS = [
    'meravineelkamal@gmail.com', // <-- Apni Gmail ID yahan daalein
    'admin@meravistore.com'
  ];

  if (ADMIN_EMAILS.includes(req.user.email)) {
    return next(); // Email match ho gayi, aage badhne do
  }

  // 2. Firestore Database Check (Fallback)
  try {
    const doc = await db.collection('admins').doc(req.user.uid).get();
    if (!doc.exists || doc.data().enabled !== true) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
