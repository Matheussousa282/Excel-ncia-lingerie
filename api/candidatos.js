import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const { method } = req;

    // LISTAR TODOS OS CANDIDATOS
    if (method === "GET") {
      const query = `
        SELECT 
          c.id,
          c.nome,
          c.email,
          c.telefone,
          c.arquivo,
          c.data,
          car.nome AS cargo,
          i.nome AS instituicao,
          u.nome AS unidade
        FROM candidatos c
        JOIN cargos car ON car.id = c.cargo_id
        JOIN instituicoes i ON i.id = c.instituicao_id
        JOIN unidades u ON u.id = c.unidade_id
        ORDER BY c.data DESC
      `;

      const result = await pool.query(query);
      return res.status(200).json(result.rows);
    }

    // CRIAR NOVO CANDIDATO
    if (method === "POST") {
      const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, arquivo } = req.body;

      if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }

      const insertQuery = `
        INSERT INTO candidatos
        (nome, email, telefone, cargo_id, instituicao_id, unidade_id, arquivo)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      await pool.query(insertQuery, [nome, email, telefone || "", cargo_id, instituicao_id, unidade_id, arquivo || ""]);

      return res.status(201).json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido" });

  } catch (err) {
    console.error("ERRO API CANDIDATOS:", err);
    return res.status(500).json({ error: "Erro interno no servidor", details: err.message });
  }
}
