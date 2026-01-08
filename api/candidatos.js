import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const config = {
  api: { bodyParser: false } // permite FormData
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).send("Erro ao processar o arquivo");

    const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;
    const arquivo = files.arquivo;

    if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id)
      return res.status(400).send("Campos obrigatórios faltando");

    let arquivoBuffer = null;
    let arquivoNome = null;

    if (arquivo) {
      arquivoBuffer = await fs.promises.readFile(arquivo.filepath);
      arquivoNome = arquivo.originalFilename;
    }

    const query = `
      INSERT INTO candidatos
      (nome,email,telefone,cargo_id,instituicao_id,unidade_id,apresentacao,arquivo_nome,arquivo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `;

    try {
      await pool.query(query, [
        nome,
        email,
        telefone || "",
        cargo_id,
        instituicao_id,
        unidade_id,
        apresentacao || "",
        arquivoNome,
        arquivoBuffer
      ]);
      res.status(201).json({ success: true });
    } catch (dbErr) {
      console.error("Erro BD:", dbErr);
      res.status(500).send("Erro interno no servidor");
    }
  });
}
