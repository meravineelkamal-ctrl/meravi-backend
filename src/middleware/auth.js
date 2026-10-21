import { auth, db } from '../firebaseAdmin.js';

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token format' });

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verify failed:', err.code || err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function verifyAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  try {
    const doc = await db.collection('admins').doc(req.user.uid).get();
    if (!doc.exists || doc.data().enabled !== true) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    console.error('Admin check failed:', err.message);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
