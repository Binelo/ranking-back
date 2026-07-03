import mongoose from "mongoose";

let cached = null;

export async function connectDB() {
  if (cached) return cached;
  cached = mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });
  try {
    await cached;
  } catch (err) {
    cached = null; // permite nova tentativa na próxima requisição
    throw err;
  }
  return cached;
}
