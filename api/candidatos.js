import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

// Desativa o bodyParser padrão do Next.js para permitir uploads
export const config = {
  api: { bodyParser: false }
};

// Configura conexão com Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const form = new formidable.IncomingForm({ keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    try {
      const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;

      let arquivoBuffer = null;
      let arquivoNome = null;

      if (files.arquivo) {
        arquivoBuffer = fs.readFileSync(files.arquivo.filepath); // lê o arquivo em memória
        arquivoNome = files.arquivo.originalFilename;
      }

      const query = `
        INSERT INTO candidatos
        (nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo, arquivo_nome)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `;

      await pool.query(query, [
        nome,
        email,
        telefone || "",
        cargo_id,
        instituicao_id,
        unidade_id,
        apresentacao || "",
        arquivoBuffer,
        arquivoNome
      ]);

      return res.status(201).json({ success: true });
    } catch (error) {
      console.error("ERRO API CANDIDATOS:", error);
      return res.status(500).json({ error: "Erro interno no servidor", details: error.message });
    }
  });
}
