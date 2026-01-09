import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { nome, senha } = req.body;

  // Validação
  if (!nome || !senha) {
    return res.status(400).json({ error: "Nome e senha são obrigatórios" });
  }

  try {
    // Verifica se o usuário já existe pelo nome
    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE nome = $1",
      [nome]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    // Insere no banco do jeito que veio
    await pool.query(
      "INSERT INTO usuarios (nome, senha) VALUES ($1, $2)",
      [nome, senha]
    );

    return res.status(201).json({ success: true, usuario: { nome } });

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
