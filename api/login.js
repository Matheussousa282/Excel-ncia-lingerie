import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_RH;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  try {

    const { nome, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({
        success: false,
        error: "Nome e senha obrigatórios"
      });
    }

    const result = await pool.query(
      "SELECT id, nome FROM usuarios WHERE nome = $1 AND senha = $2",
      [nome, senha]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Usuário ou senha incorretos"
      });
    }

    const usuario = result.rows[0];

    return res.status(200).json({
      success: true,
      usuario
    });

  } catch (err) {

    console.error("ERRO LOGIN:", err);

    return res.status(500).json({
      success: false,
      error: "Erro no servidor"
    });

  }

}