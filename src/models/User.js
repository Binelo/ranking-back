import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: [true, 'Nome de usuário é obrigatório'], unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: [true, 'Email é obrigatório'], unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rank' }],
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return { _id: this._id, username: this.username, email: this.email, favorites: this.favorites, createdAt: this.createdAt };
};

export default mongoose.model('User', userSchema);
