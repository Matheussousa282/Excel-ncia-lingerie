import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const { method } = req;

    // LISTAR
    if (method === "GET") {
      const { instituicao_id } = req.query;

      let query = `
        SELECT 
          u.id,
          u.nome,
          u.ativo,
          u.instituicao_id,
          i.nome AS instituicao
        FROM unidades u
        JOIN instituicoes i ON i.id = u.instituicao_id
      `;

      const params = [];

      if (instituicao_id) {
        query += " WHERE u.instituicao_id = $1";
        params.push(instituicao_id);
      }

      query += " ORDER BY u.nome";

      const result = await pool.query(query, params);
      return res.status(200).json(result.rows);
    }

    // CRIAR
    if (method === "POST") {
      const { nome, instituicao_id } = req.body;

      if (!nome || !instituicao_id) {
        return res.status(400).json({ error: "Nome e instituição obrigatórios" });
      }

      await pool.query(
        "INSERT INTO unidades (nome, instituicao_id) VALUES ($1, $2)",
        [nome, instituicao_id]
      );

      return res.status(201).json({ success: true });
    }

    // EDITAR / ATIVAR / INATIVAR
    if (method === "PUT") {
  const { id, nome, ativo } = req.body;

  if (!id) {
    return res.status(400).json({ error: "ID obrigatório" });
  }

  await pool.query(
    `
    UPDATE unidades
    SET
      nome = COALESCE($1, nome),
      ativo = COALESCE($2, ativo)
    WHERE id = $3
    `,
    [nome, ativo, id]
  );

  return res.json({ success: true });
}

    return res.status(405).json({ error: "Método não permitido" });

  } catch (error) {
    console.error("ERRO API UNIDADES:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      details: error.message
    });
  }
}
