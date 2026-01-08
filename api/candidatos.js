const express = require("express");
const multer = require("multer");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Configurar multer para armazenar arquivo em memória
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexão Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // URL do Neon
  ssl: { rejectUnauthorized: false },
});

// Rota para receber formulário
app.post("/api/candidatos", upload.single("arquivo"), async (req, res) => {
  try {
    const { nome, telefone, email, cargo_id, instituicao_id, unidade_id, apresentacao } = req.body;

    if (!req.file) return res.status(400).send("Arquivo é obrigatório");

    const arquivo = req.file.buffer;       // conteúdo do arquivo em bytes
    const arquivo_nome = req.file.originalname; // nome original

    const query = `
      INSERT INTO candidatos 
      (nome, telefone, email, cargo_id, instituicao_id, unidade_id, apresentacao, arquivo, arquivo_nome)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `;

    const result = await pool.query(query, [
      nome,
      telefone || null,
      email,
      cargo_id,
      instituicao_id,
      unidade_id,
      apresentacao || null,
      arquivo,
      arquivo_nome
    ]);

    res.status(200).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao salvar candidato");
  }
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
