import { Router } from 'express';
import RankItem, { ITEM_TYPES } from '../models/RankItem.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/items?search=&type=&category=&sort=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { search, type, category, sort = 'recent', page = 1, limit = 24 } = req.query;
    const filter = {};
    if (search) filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (type) filter.type = type;
    if (category) filter.categories = category;

    const sortMap = {
      recent: { createdAt: -1 },
      name: { name: 1 },
      champions: { 'stats.winCount': -1 },
      mostUsed: { 'stats.timesRanked': -1 },
    };

    const items = await RankItem.find(filter)
      .sort(sortMap[sort] || sortMap.recent)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('categories', 'name slug');
    const total = await RankItem.countDocuments(filter);
    res.json({ items, total, types: ITEM_TYPES });
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id
router.get('/:id', async (req, res, next) => {
  try {
    const item = await RankItem.findById(req.params.id).populate('categories', 'name slug');
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

// POST /api/items
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, image, type, categories, metadata } = req.body;
    const item = await RankItem.create({
      name,
      image: image || '',
      type: type || 'outro',
      categories: categories || [],
      metadata: metadata || {},
      createdBy: req.userId,
    });
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
});

// PUT /api/items/:id (apenas criador)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const item = await RankItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    if (String(item.createdBy) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });

    const { name, image, type, categories, metadata } = req.body;
    if (name !== undefined) item.name = name;
    if (image !== undefined) item.image = image;
    if (type !== undefined) item.type = type;
    if (categories !== undefined) item.categories = categories;
    if (metadata !== undefined) item.metadata = metadata;
    await item.save();
    res.json({ item });
  } catch (err) {
    next(err);
  }
});

export default router;
