import { Pool } from "pg";
import bcrypt from "bcryptjs";

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
    const result = await pool.query(
      "SELECT id, nome, senha FROM usuarios WHERE nome = $1",
      [nome]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    const usuario = result.rows[0];

    const senhaOk = await bcrypt.compare(senha, usuario.senha);

    if (!senhaOk) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    return res.status(200).json({
      success: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome
      }
    });

  } catch (err) {
    console.error("ERRO LOGIN:", err);
    return res.status(500).json({ error: "Erro interno" });
  }
}
