import { Pool } from "pg";
import { obterAcesso } from "./_acesso.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    const { method } = req;

    // Sem token = formulário público (lista completa). Com token de gerente
    // restrito: só enxerga instituições das suas unidades e não pode editar.
    const acesso = await obterAcesso(pool, req);
    if (acesso && !acesso.total && method !== "GET") {
      return res.status(403).json({ error: "Sem permissão" });
    }

    // LISTAR TODAS
    if (method === "GET") {
      const restrito = acesso && !acesso.total;
      const result = restrito
        ? await pool.query(
            `SELECT id, nome, ativo FROM instituicoes
             WHERE id IN (SELECT instituicao_id FROM unidades WHERE id = ANY($1::int[]))
             ORDER BY nome`,
            [acesso.unidades]
          )
        : await pool.query("SELECT id, nome, ativo FROM instituicoes ORDER BY nome");
      return res.status(200).json(result.rows);
    }

    // CRIAR
    if (method === "POST") {
      const { nome } = req.body;

      if (!nome) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      await pool.query(
        "INSERT INTO instituicoes (nome) VALUES ($1)",
        [nome]
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
    UPDATE instituicoes
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
    console.error("ERRO API INSTITUICOES:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      details: error.message
    });
  }
}
