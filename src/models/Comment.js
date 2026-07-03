import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema(
  {
    rank: { type: mongoose.Schema.Types.ObjectId, ref: 'Rank', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: [true, 'Comentário não pode ser vazio'], trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

export default mongoose.model('Comment', commentSchema);
