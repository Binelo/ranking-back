import { Router } from 'express';
import User from '../models/User.js';
import Rank from '../models/Rank.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/users/me/favorites
router.get('/me/favorites', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'favorites',
      populate: [
        { path: 'creator', select: 'username' },
        { path: 'categories', select: 'name slug' },
      ],
    });
    res.json({ ranks: user?.favorites || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id — perfil público
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('username createdAt');
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const ranksCount = await Rank.countDocuments({ creator: user._id });
    res.json({ user: { ...user.toJSON(), ranksCount } });
  } catch (err) {
    next(err);
  }
});

export default router;
