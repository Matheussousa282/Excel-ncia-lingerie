import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: "Dados obrigatórios" });
  }

  try {
    // verifica se usuário já existe
    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE email = $1",
      [email]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    // SALVA A SENHA DO JEITO QUE FOI DIGITADA
    await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3)",
      [nome, email, senha]
    );

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
