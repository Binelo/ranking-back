import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";

const PORT = process.env.PORT || 5000;

// Não bloqueia o start nem mata o processo em serverless (Vercel):
// mongoose enfileira as queries até a conexão abrir.
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Erro ao conectar no MongoDB:", err.message));

app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));

export default app;
