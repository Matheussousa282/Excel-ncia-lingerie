import { IncomingForm } from "formidable";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

export const config = {
  api: { bodyParser: false } // importante para arquivos
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // Cria o formulário
      const form = new IncomingForm();
      form.uploadDir = path.join(process.cwd(), "public/uploads"); // pasta para salvar arquivos
      form.keepExtensions = true; // mantém extensão do arquivo

      // Cria a pasta uploads se não existir
      if (!fs.existsSync(form.uploadDir)) fs.mkdirSync(form.uploadDir, { recursive: true });

      form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: "Erro no upload do arquivo" });

        const { nome, email, telefone, cargo_id, instituicao_id, unidade_id } = fields;
        const arquivo = files.arquivo;

        if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id)
          return res.status(400).json({ error: "Campos obrigatórios faltando" });

        // Caminho do arquivo para salvar no banco
        const arquivoPath = arquivo ? `/uploads/${path.basename(arquivo.filepath)}` : null;

        // Insere no banco
        await pool.query(
          `INSERT INTO candidatos 
          (nome, email, telefone, cargo_id, instituicao_id, unidade_id, arquivo) 
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [nome, email, telefone || "", cargo_id, instituicao_id, unidade_id, arquivoPath]
        );

        res.status(201).json({ success: true });
      });

      return;
    }

    // Listar candidatos (para dashboard)
    if (req.method === "GET") {
      const result = await pool.query(`
        SELECT 
          c.id, c.nome, c.email, c.telefone, c.arquivo, c.data,
          car.nome AS cargo,
          i.nome AS instituicao,
          u.nome AS unidade
        FROM candidatos c
        JOIN cargos car ON car.id = c.cargo_id
        JOIN instituicoes i ON i.id = c.instituicao_id
        JOIN unidades u ON u.id = c.unidade_id
        ORDER BY c.data DESC
      `);

      return res.status(200).json(result.rows);
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (err) {
    console.error("ERRO API CANDIDATOS:", err);
    return res.status(500).json({ error: err.message });
  }
}
