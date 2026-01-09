import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Método não permitido");
  }

  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).send("Dados obrigatórios");
  }

  try {
    await pool.query(
      "INSERT INTO usuarios (nome, email, senha) VALUES ($1,$2,$3)",
      [nome, email, senha]
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao criar usuário");
  }
}
