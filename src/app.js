import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import itemRoutes from './routes/items.js';
import rankRoutes from './routes/ranks.js';
import sessionRoutes from './routes/sessions.js';
import commentRoutes from './routes/comments.js';
import statsRoutes from './routes/stats.js';
import uploadRoutes from './routes/upload.js';
import userRoutes from './routes/users.js';
import { errorHandler } from './middleware/error.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/ranks', rankRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/upload', uploadRoutes);

app.use(errorHandler);

export default app;
