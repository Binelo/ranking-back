import { Router } from 'express';
import Rank from '../models/Rank.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/ranks?search=&category=&creator=&sort=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { search, category, creator, sort = 'recent', page = 1, limit = 12 } = req.query;
    const filter = {};
    if (search) filter.title = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (category) filter.categories = category;
    if (creator) filter.creator = creator;

    const sortMap = {
      recent: { createdAt: -1 },
      popular: { 'stats.sessionsCount': -1 },
      likes: { likes: -1 },
      title: { title: 1 },
    };

    const ranks = await Rank.find(filter)
      .sort(sortMap[sort] || sortMap.recent)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('creator', 'username')
      .populate('categories', 'name slug');
    const total = await Rank.countDocuments(filter);
    res.json({ ranks, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/ranks/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const rank = await Rank.findById(req.params.id)
      .populate('creator', 'username')
      .populate('categories', 'name slug')
      .populate({ path: 'items', populate: { path: 'categories', select: 'name slug' } });
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });

    const json = rank.toJSON();
    json.likedByMe = req.userId ? rank.likes.some((id) => String(id) === req.userId) : false;
    if (req.userId) {
      const user = await User.findById(req.userId).select('favorites');
      json.favoritedByMe = user?.favorites.some((id) => String(id) === String(rank._id)) || false;
    }
    res.json({ rank: json });
  } catch (err) {
    next(err);
  }
});

// POST /api/ranks
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, description, categories, items } = req.body;
    const rank = await Rank.create({
      title,
      description: description || '',
      categories: categories || [],
      items: items || [],
      creator: req.userId,
    });
    res.status(201).json({ rank });
  } catch (err) {
    next(err);
  }
});

// PUT /api/ranks/:id (apenas criador)
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const rank = await Rank.findById(req.params.id);
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });
    if (String(rank.creator) !== req.userId) return res.status(403).json({ error: 'Apenas o criador pode editar' });

    const { title, description, categories, items } = req.body;
    if (title !== undefined) rank.title = title;
    if (description !== undefined) rank.description = description;
    if (categories !== undefined) rank.categories = categories;
    if (items !== undefined) rank.items = items;
    await rank.save();
    res.json({ rank });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/ranks/:id (apenas criador)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const rank = await Rank.findById(req.params.id);
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });
    if (String(rank.creator) !== req.userId) return res.status(403).json({ error: 'Apenas o criador pode excluir' });
    await rank.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/ranks/:id/like (alterna)
router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const rank = await Rank.findById(req.params.id);
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });
    const idx = rank.likes.findIndex((id) => String(id) === req.userId);
    if (idx >= 0) rank.likes.splice(idx, 1);
    else rank.likes.push(req.userId);
    await rank.save();
    res.json({ liked: idx < 0, likesCount: rank.likes.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/ranks/:id/favorite (alterna)
router.post('/:id/favorite', requireAuth, async (req, res, next) => {
  try {
    const rank = await Rank.findById(req.params.id).select('_id');
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });
    const user = await User.findById(req.userId);
    const idx = user.favorites.findIndex((id) => String(id) === String(rank._id));
    if (idx >= 0) user.favorites.splice(idx, 1);
    else user.favorites.push(rank._id);
    await user.save();
    res.json({ favorited: idx < 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
