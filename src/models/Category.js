import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Nome é obrigatório'], unique: true, trim: true },
    slug: { type: String, unique: true, index: true },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function (next) {
  if (this.name) {
    this.slug = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

export default mongoose.model('Category', categorySchema);
