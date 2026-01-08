import { Pool } from "pg";
import formidable from "formidable";

// Configura a conexão com Neon (PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Desativa o bodyParser padrão do Next.js para aceitar FormData
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const form = formidable({ multiples: false });

      form.parse(req, async (err, fields, files) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Erro ao processar o arquivo");
        }

        const { nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao } = fields;
        const arquivo = files.arquivo;

        if (!nome || !email || !cargo_id || !instituicao_id || !unidade_id) {
          return res.status(400).json({ error: "Campos obrigatórios faltando" });
        }

        // Salva o arquivo como buffer no banco
        let arquivoBuffer = null;
        let arquivoNome = null;
        if (arquivo) {
          arquivoBuffer = await arquivo.filepath ? await fs.promises.readFile(arquivo.filepath) : null;
          arquivoNome = arquivo.originalFilename;
        }

        const query = `
          INSERT INTO candidatos
          (nome, email, telefone, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo_nome, arquivo)
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
          arquivoNome,
          arquivoBuffer
        ]);

        return res.status(201).json({ success: true });
      });
    } else {
      return res.status(405).json({ error: "Método não permitido" });
    }
  } catch (err) {
    console.error("ERRO API CANDIDATOS:", err);
    return res.status(500).send("Erro interno no servidor");
  }
}
