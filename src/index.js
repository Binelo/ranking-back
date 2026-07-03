import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./db.js";

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => console.log("MongoDB conectado"))
  .catch((err) => console.error("Erro ao conectar no MongoDB:", err.message));

app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));

export default app;
