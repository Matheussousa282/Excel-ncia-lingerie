import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Método não permitido");

  try {
    const query = `
      SELECT 
        c.id,
        c.nome,
        c.email,
        c.telefone,
        c.apresentacao,
        c.arquivo_nome,
        c.arquivo,
        c.criado_em AS data,
        ca.nome AS cargo,
        i.nome AS instituicao,
        u.nome AS unidade
      FROM candidatos c
      JOIN cargos ca ON c.cargo_id = ca.id
      JOIN instituicoes i ON c.instituicao_id = i.id
      JOIN unidades u ON c.unidade_id = u.id
      ORDER BY c.criado_em DESC
    `;

    const result = await pool.query(query);

    // Transformando arquivo BYTEA em Base64 para download
    const curriculos = result.rows.map(c => ({
      id: c.id,
      nome: c.nome,
      email: c.email,
      telefone: c.telefone,
      apresentacao: c.apresentacao,
      cargo: c.cargo,
      instituicao: c.instituicao,
      unidade: c.unidade,
      data: c.data,
      arquivo_nome: c.arquivo_nome,
      arquivo: `data:application/octet-stream;base64,${c.arquivo.toString("base64")}`
    }));

    res.status(200).json(curriculos);

  } catch (err) {
    console.error("Erro ao buscar candidatos:", err);
    res.status(500).send("Erro ao buscar candidatos: " + err.message);
  }
}
