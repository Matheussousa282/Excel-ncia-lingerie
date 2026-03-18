// /api/whatsapp.js
// Envia mensagens via servidor local whatsapp-web.js

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false },
});

export async function enviarWhatsApp({ telefone, mensagem }) {
  const result = await pool.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('whatsapp_ativo','whatsapp_api_url')"
  );
  const cfg = {};
  result.rows.forEach(r => { cfg[r.chave] = r.valor; });

  if (cfg.whatsapp_ativo !== "true") {
    console.log("[WhatsApp] Desativado.");
    return { skipped: true };
  }

  if (!cfg.whatsapp_api_url) {
    console.warn("[WhatsApp] URL não configurada.");
    return { skipped: true };
  }

  const numero = telefone.replace(/\D/g, "");
  const numeroFinal = numero.startsWith("55") ? numero : `55${numero}`;
  const url = `${cfg.whatsapp_api_url.replace(/\/$/, "")}/enviar`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefone: numeroFinal, mensagem }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { success: false, error: body };

  console.log(`[WhatsApp] Enviado para ${numeroFinal}`);
  return { success: true };
}

export function formatarMensagem(template, vars = {}) {
  return template
    .replace(/\{nome\}/g,        vars.nome        || "")
    .replace(/\{data\}/g,        vars.data        || "")
    .replace(/\{hora\}/g,        vars.hora        || "")
    .replace(/\{responsavel\}/g, vars.responsavel || "nosso time")
    .replace(/\{observacoes\}/g, vars.observacoes || "")
    .replace(/\\n/g, "\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método não permitido" });

  try {
    const { telefone, mensagem } = req.body;
    if (!telefone || !mensagem)
      return res.status(400).json({ error: "telefone e mensagem são obrigatórios" });

    const resultado = await enviarWhatsApp({ telefone, mensagem });
    return res.status(200).json(resultado);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
