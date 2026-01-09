import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { email, senha } = req.body;

  try {
    const result = await pool.query(
      "SELECT id, nome, email FROM usuarios WHERE email=$1 AND senha=$2 AND ativo=true",
      [email, senha]
    );

    if (result.rowCount === 0) {
      return res.status(401).send("Usuário ou senha inválidos");
    }

    res.status(200).json({
      success: true,
      usuario: result.rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro no login");
  }
}
