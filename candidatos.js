import { Pool } from "pg";
import formidable from "formidable";

export const config = {
  api: { bodyParser: false }, // obrigatório para receber arquivos
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Método não permitido");

  // Cria o formulário e ativa upload em memória
  const form = new formidable.IncomingForm({ keepExtensions: true, multiples: false, uploadDir: "/tmp", maxFileSize: 10 * 1024 * 1024 });
  
  // Lê arquivo como buffer em memória
  form.onPart = (part) => {
    if (!part.filename || part.filename === "") {
      form._handlePart(part);
      return;
    }
    // para arquivos, usamos o comportamento padrão do formidable
    form._handlePart(part);
  };

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).send("Erro ao processar formulário: " + err.message);

    try {
      const nome = fields.nome;
      const telefone = fields.telefone || null;
      const email = fields.email;
      const cargo_id = fields.cargo_id;
      const instituicao_id = fields.instituicao_id;
      const unidade_id = fields.unidade_id;
      const apresentacao = fields.apresentacao || null;

      const arquivoFile = files.arquivo;
      if (!arquivoFile) return res.status(400).send("Arquivo é obrigatório");

      // **arquivoFile já tem ._writeStream.data com buffer** (formidable mantém em memória)
      const arquivoBuffer = arquivoFile._writeStream?.data || null;
      if (!arquivoBuffer) return res.status(500).send("Não foi possível ler o arquivo");

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

    } catch (error) {
      console.error("Erro na API:", error);
      res.status(500).send("Erro ao salvar candidato: " + error.message);
    }
  });
}
