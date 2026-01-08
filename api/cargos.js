import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const { method } = req;

    // LISTAR (ativos)
    if (method === "GET") {
      const result = await pool.query(
        "SELECT id, nome, ativo FROM cargos WHERE ativo = true ORDER BY nome"
      );
      return res.status(200).json(result.rows);
    }

    // CRIAR
    if (method === "POST") {
      const { nome } = req.body;

      if (!nome) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      await pool.query(
        "INSERT INTO cargos (nome) VALUES ($1)",
        [nome]
      );

      return res.status(201).json({ success: true });
    }

    // EDITAR
    if (method === "PUT") {
      const { id, nome, ativo } = req.body;

      await pool.query(
        "UPDATE cargos SET nome = $1, ativo = $2 WHERE id = $3",
        [nome, ativo, id]
      );

      return res.json({ success: true });
    }

    // INATIVAR
    if (method === "DELETE") {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "ID obrigatório" });
  }

  await pool.query(
    "UPDATE cargos SET ativo = false WHERE id = $1",
    [id]
  );

  return res.json({ success: true });
}


    return res.status(405).json({ error: "Método não permitido" });

  } catch (error) {
    console.error("ERRO API CARGOS:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      details: error.message
    });
  }
}
