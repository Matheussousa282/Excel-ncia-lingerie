import { Pool } from "pg";
import multiparty from "multiparty";
import fs from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  const form = new multiparty.Form();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).send(err.message);

    try {
      const nome = fields.nome[0];
      const telefone = fields.telefone ? fields.telefone[0] : null;
      const email = fields.email[0];
      const cargo_id = fields.cargo_id[0];
      const instituicao_id = fields.instituicao_id[0];
      const unidade_id = fields.unidade_id[0];
      const apresentacao = fields.apresentacao ? fields.apresentacao[0] : null;

      const arquivoFile = files.arquivo[0];
      const arquivoBuffer = fs.readFileSync(arquivoFile.path);
      const arquivo_nome = arquivoFile.originalFilename;

      const query = `
        INSERT INTO candidatos
        (nome, telefone, email, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo, arquivo_nome)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `;

      const result = await pool.query(query, [
        nome, telefone, email, cargo_id, instituicao_id, unidade_id, apresentacao, arquivoBuffer, arquivo_nome
      ]);

      res.status(200).json({ success: true, id: result.rows[0].id });

    } catch (err) {
      console.error(err);
      res.status(500).send("Erro ao salvar candidato");
    }
  });
}
