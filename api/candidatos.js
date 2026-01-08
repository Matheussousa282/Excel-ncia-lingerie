import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {

  if (req.method === "POST") {
    // === Inserir candidato ===
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

      return res.status(200).json({ success: true, id: result.rows[0].id });

    } catch (err) {
      console.error(err);
      return res.status(500).send("Erro ao salvar candidato: " + err.message);
    }

  } else if (req.method === "GET") {
    // === Listar candidatos ===
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

      return res.status(200).json(curriculos);

    } catch (err) {
      console.error(err);
      return res.status(500).send("Erro ao buscar candidatos: " + err.message);
    }

  } else {
    return res.status(405).send("Método não permitido");
  }
}
