// /api/configuracoes.js
// ─────────────────────────────────────────────
// Lê e salva configurações do sistema (Evolution API,
// toggles de notificações, textos das mensagens).
// ─────────────────────────────────────────────

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  try {

    // ── GET: retorna todas as configurações como objeto chave→valor
    if (req.method === "GET") {
      const result = await pool.query("SELECT chave, valor FROM configuracoes ORDER BY chave");
      const config = {};
      result.rows.forEach(r => { config[r.chave] = r.valor; });
      return res.status(200).json(config);
    }

    // ── POST: salva um ou mais pares chave/valor
    // Body: { chave: valor, chave2: valor2, ... }
    if (req.method === "POST") {
      const entries = Object.entries(req.body);
      if (!entries.length) return res.status(400).json({ error: "Nenhum dado enviado" });

      for (const [chave, valor] of entries) {
        await pool.query(
          `INSERT INTO configuracoes (chave, valor, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (chave) DO UPDATE SET valor = $2, updated_at = NOW()`,
          [chave, String(valor)]
        );
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido" });

  } catch (err) {
    console.error("ERRO API CONFIGURACOES:", err);
    return res.status(500).json({ error: "Erro interno", details: err.message });
  }
}
