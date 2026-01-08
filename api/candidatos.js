import { IncomingForm } from "formidable";
import fs from "fs";
import { Pool } from "pg";

// Configuração do Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // coloque sua URL do Neon
  ssl: { rejectUnauthorized: false }
});

// Desabilitar bodyParser do Vercel para Formidable
export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const form = new IncomingForm({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Erro ao processar formulário:", err);
      return res.status(500).json({ error: "Erro ao processar formulário" });
    }

    try {
      const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;
      const arquivo = files.arquivo;

      if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id || !arquivo) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }

      // Lê arquivo como buffer
      const fileBuffer = await fs.promises.readFile(arquivo.filepath);
      const fileName = arquivo.originalFilename || "arquivo";

      // Salva no banco
      const query = `
        INSERT INTO candidatos
        (nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo_nome, arquivo_dados)
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
        fileName,
        fileBuffer
      ]);

      return res.status(201).json({ success: true, message: "Currículo enviado com sucesso!" });
    } catch (error) {
      console.error("Erro API:", error);
      return res.status(500).json({ error: "Erro interno no servidor", details: error.message });
    }
  });
}
