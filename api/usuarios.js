// /pages/api/usuarios.js
import { Pool } from "pg";

// Configuração do banco
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necessário no Vercel
});

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // CRIAR USUÁRIO
      const { nome, senha } = req.body;

      if (!nome || !senha) {
        return res.status(400).json({ error: "Dados obrigatórios" });
      }

      // Verifica se usuário já existe
      const existe = await pool.query(
        "SELECT id FROM usuarios WHERE nome = $1",
        [nome]
      );

      if (existe.rows.length > 0) {
        return res.status(400).json({ error: "Usuário já existe" });
      }

      // Insere o usuário (senha sem criptografia)
      await pool.query(
        "INSERT INTO usuarios (nome, senha) VALUES ($1, $2)",
        [nome, senha]
      );

      return res.status(201).json({ success: true });

    } else if (req.method === "GET") {
      // LISTAR TODOS OS USUÁRIOS
      const result = await pool.query(
        "SELECT id, nome, senha, criado_em FROM usuarios ORDER BY id ASC"
      );
      return res.status(200).json(result.rows);

    } else {
      // Métodos não permitidos
      return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (err) {
    console.error("ERRO API USUÁRIOS:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
