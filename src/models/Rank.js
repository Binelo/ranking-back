import mongoose from 'mongoose';

const rankSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Título é obrigatório'], trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 1000 },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true }],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' }], // apenas referências
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    stats: {
      sessionsCount: { type: Number, default: 0 },
      lastSessionAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

rankSchema.virtual('likesCount').get(function () {
  return this.likes?.length || 0;
});
rankSchema.virtual('itemsCount').get(function () {
  return this.items?.length || 0;
});
rankSchema.set('toJSON', { virtuals: true });
rankSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('Rank', rankSchema);
