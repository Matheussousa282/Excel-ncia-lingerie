import { Pool } from "pg";
import bcrypt from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL || process.env.DATABASE_URL_RH;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { nome, email, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({ error: "Nome e senha são obrigatórios" });
    }

    // verifica se já existe
    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE nome = $1",
      [nome]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1,$2,$3)",
      [nome, email || null, senhaHash]
    );

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error("ERRO /api/usuarios:", err);
    return res.status(500).json({ error: err.message });
  }
}
