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

  if (!nome || !senha) {
    return res.status(400).json({ error: "Nome e senha são obrigatórios" });
  }

  try {
    // verifica se usuário já existe
    const existe = await pool.query(
      "SELECT id FROM usuarios WHERE nome = $1",
      [nome]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    // criptografa senha
    const senhaHash = await bcrypt.hash(senha, 10);

    await pool.query(
  "INSERT INTO usuarios (nome, email, senha) VALUES ($1,$2,$3)",
  [nome, email || null, senha] // senha pura
);

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error("ERRO AO CRIAR USUÁRIO:", err);
    return res.status(500).json({ error: "Erro interno no servidor" });
  }
}
