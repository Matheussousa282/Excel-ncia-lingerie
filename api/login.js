import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { nome, senha } = req.body;

  if (!nome || !senha) {
    return res.status(400).json({ error: "Dados obrigatórios" });
  }

  try {
    const query = `
      SELECT id, nome, email
      FROM usuarios
      WHERE nome = $1 AND senha = $2
      LIMIT 1
    `;

    const result = await pool.query(query, [nome, senha]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    // Login OK
    const usuario = result.rows[0];

    return res.status(200).json({
      success: true,
      usuario
    });

  } catch (err) {
    console.error("Erro no login:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
}
