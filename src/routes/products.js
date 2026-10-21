import { Router } from 'express';
import { db } from '../firebaseAdmin.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    let snap;
    try {
      snap = await db
        .collection('products')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
    } catch (indexErr) {
      console.warn('Index missing, using fallback:', indexErr.message);
      snap = await db
        .collection('products')
        .where('published', '==', true)
        .limit(100)
        .get();
    }

    const products = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.createdAt?.seconds || 0;
        const bt = b.createdAt?.seconds || 0;
        return bt - at;
      });

    res.json(products);
  } catch (err) {
    console.error('GET /api/products error:', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const snap = await db.collection('products').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Product not found' });

    const data = snap.data();
    if (!data.published) return res.status(404).json({ error: 'Product not available' });

    res.json({ id: snap.id, ...data });
  } catch (err) {
    console.error('GET /api/products/:id error:', err.message);
    res.status(500).json({ error: 'Failed to load product' });
  }
});

export default router;
