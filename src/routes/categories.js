import { Router } from 'express';
import Category from '../models/Category.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/categories?search=
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = search ? { name: { $regex: search, $options: 'i' } } : {};
    const categories = await Category.find(filter).sort('name');
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Category.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
    if (existing) return res.json({ category: existing });
    const category = await Category.create({ name });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

export default router;
