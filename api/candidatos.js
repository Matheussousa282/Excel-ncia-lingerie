import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  try {
    const {
      nome,
      telefone,
      email,
      cargo_id,
      instituicao_id,
      unidade_id,
      apresentacao,
      arquivo_base64,
      arquivo_nome
    } = req.body;

    if (!arquivo_base64) return res.status(400).send("Arquivo é obrigatório");

    const arquivoBuffer = Buffer.from(arquivo_base64, "base64");

    const query = `
      INSERT INTO candidatos
      (nome, telefone, email, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo, arquivo_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `;

    const result = await pool.query(query, [
      nome, telefone || null, email, cargo_id, instituicao_id, unidade_id, apresentacao || null, arquivoBuffer, arquivo_nome
    ]);

    res.status(200).json({ success: true, id: result.rows[0].id });

  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao salvar candidato: " + err.message);
  }
}
