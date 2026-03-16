// /api/whatsapp.js
// ─────────────────────────────────────────────
// Envia mensagens WhatsApp via Evolution API.
//
// Endpoint interno chamado pelos outros handlers
// (entrevistas.js, candidatos.js) — não exposto
// diretamente ao front-end.
//
// Também pode ser chamado via POST diretamente:
// POST /api/whatsapp
// Body: { telefone, mensagem }
// ─────────────────────────────────────────────

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false },
});

/* ════════════════════════════════════════════
   Função principal — importável por outros handlers
════════════════════════════════════════════ */
export async function enviarWhatsApp({ telefone, mensagem }) {
  // 1. Lê configurações do banco
  const result = await pool.query(
    "SELECT chave, valor FROM configuracoes WHERE chave IN ('whatsapp_ativo','whatsapp_api_url','whatsapp_api_key','whatsapp_instance')"
  );
  const cfg = {};
  result.rows.forEach(r => { cfg[r.chave] = r.valor; });

  // 2. Verifica se WhatsApp está ativo
  if (cfg.whatsapp_ativo !== "true") {
    console.log("[WhatsApp] Notificações desativadas. Mensagem não enviada.");
    return { skipped: true, reason: "WhatsApp desativado nas configurações" };
  }

  if (!cfg.whatsapp_api_url || !cfg.whatsapp_api_key || !cfg.whatsapp_instance) {
    console.warn("[WhatsApp] Configurações incompletas (URL, Key ou Instance ausentes).");
    return { skipped: true, reason: "Configurações incompletas" };
  }

  // 3. Formata número: remove tudo exceto dígitos, garante DDI 55
  const numeroLimpo = telefone.replace(/\D/g, "");
  const numeroFinal = numeroLimpo.startsWith("55") ? numeroLimpo : `55${numeroLimpo}`;

  // 4. Chama a Evolution API
  // Endpoint padrão da Evolution API v2: POST /message/sendText/{instance}
  const url = `${cfg.whatsapp_api_url.replace(/\/$/, "")}/message/sendText/${cfg.whatsapp_instance}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": cfg.whatsapp_api_key,
    },
    body: JSON.stringify({
      number: numeroFinal,
      text: mensagem,
      // delay opcional (ms) — evita bloqueio por envio muito rápido
      delay: 1000,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[WhatsApp] Erro ao enviar:", body);
    return { success: false, error: body };
  }

  console.log(`[WhatsApp] Mensagem enviada para ${numeroFinal}`);
  return { success: true, data: body };
}

/* ════════════════════════════════════════════
   Substitui variáveis na mensagem template
   {nome}, {data}, {hora}, {responsavel}
════════════════════════════════════════════ */
export function formatarMensagem(template, vars = {}) {
  return template
    .replace(/\{nome\}/g,        vars.nome        || "")
    .replace(/\{data\}/g,        vars.data        || "")
    .replace(/\{hora\}/g,        vars.hora        || "")
    .replace(/\{responsavel\}/g, vars.responsavel || "nosso time")
    .replace(/\\n/g, "\n");
}

/* ════════════════════════════════════════════
   Handler HTTP — chamada direta ao endpoint
════════════════════════════════════════════ */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const { telefone, mensagem } = req.body;

    if (!telefone || !mensagem) {
      return res.status(400).json({ error: "telefone e mensagem são obrigatórios" });
    }

    const resultado = await enviarWhatsApp({ telefone, mensagem });
    return res.status(200).json(resultado);

  } catch (err) {
    console.error("ERRO API WHATSAPP:", err);
    return res.status(500).json({ error: "Erro ao enviar mensagem", details: err.message });
  }
}
