import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const { nome, senha } = req.body;

  if (!nome || !senha) {
    return res.status(400).json({ error: "Nome e senha obrigatórios" });
  }

  try {
    // procura usuário pelo nome e senha exata
    const result = await pool.query(
      "SELECT id, nome FROM usuarios WHERE nome = $1 AND senha = $2",
      [nome, senha]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuário ou senha incorretos" });
    }

    // retorna dados do usuário (pode salvar no localStorage depois)
    return res.status(200).json({ usuario: result.rows[0] });

  } catch (err) {
    console.error("ERRO LOGIN:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
