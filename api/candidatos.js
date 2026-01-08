import formidable from "formidable";
import fs from "fs";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const config = {
  api: { bodyParser: false } // necessário para arquivos
};

export default async function handler(req, res) {
  if (req.method === "POST") {
    const form = formidable({
      multiples: false,
      uploadDir: "./public/uploads", // onde o arquivo será salvo
      keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error("Form parse error:", err);
        return res.status(500).send("Erro ao processar o formulário");
      }

      const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;
      const arquivo = files.arquivo?.filepath || "";

      if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id) {
        return res.status(400).json({ error: "Campos obrigatórios faltando" });
      }

      try {
        await pool.query(
          `INSERT INTO candidatos
          (nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [nome, email, telefone || "", cargo_id, instituicao_id, unidade_id, apresentacao || "", arquivo]
        );

        return res.status(201).json({ success: true });
      } catch (dbErr) {
        console.error("DB error:", dbErr);
        return res.status(500).json({ error: "Erro ao salvar no banco", details: dbErr.message });
      }
    });
  } else {
    res.status(405).json({ error: "Método não permitido" });
  }
}
