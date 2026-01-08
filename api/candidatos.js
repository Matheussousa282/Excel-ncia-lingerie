import { Pool } from "pg";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false
  }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const form = new formidable.IncomingForm({ keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;

        // Lê arquivo como buffer
        let arquivoBuffer = null;
        let arquivoNome = null;
        if (files.arquivo) {
          arquivoBuffer = fs.readFileSync(files.arquivo.filepath);
          arquivoNome = files.arquivo.originalFilename;
        }

        const query = `
          INSERT INTO candidatos 
          (nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo, arquivo_nome)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `;

        await pool.query(query, [
          nome, email, telefone || "", cargo_id, instituicao_id, unidade_id, apresentacao || "",
          arquivoBuffer, arquivoNome
        ]);

        res.status(201).json({ success: true });
      } catch (error) {
        console.error("ERRO API CANDIDATOS:", error);
        res.status(500).json({ error: "Erro interno no servidor", details: error.message });
      }
    });

  } else {
    res.status(405).json({ error: "Método não permitido" });
  }
}
