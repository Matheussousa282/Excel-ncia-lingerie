// /api/candidatos.js
// GET  → lista candidatos (com filtro aprovado)
// POST → cadastra candidato (vindo do index.html)
// PUT  → marca candidato como "selecionado" e dispara WhatsApp

import { Pool } from "pg";
import { enviarWhatsApp, formatarMensagem } from "./whatsapp.js";

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_RH;
if (!connectionString) throw new Error("DATABASE_URL não configurada");

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function notificarSelecionado(nome, telefone) {
  try {
    const cfg = await pool.query(
      "SELECT chave, valor FROM configuracoes WHERE chave IN ('whatsapp_ativo','notif_selecionado','msg_selecionado')"
    );
    const c = {};
    cfg.rows.forEach(r => { c[r.chave] = r.valor; });
    if (c.whatsapp_ativo !== "true" || c.notif_selecionado !== "true") return;
    const msg = formatarMensagem(c.msg_selecionado || "", { nome });
    if (msg && telefone) await enviarWhatsApp({ telefone, mensagem: msg });
  } catch (err) {
    console.error("[candidatos] WhatsApp silencioso:", err.message);
  }
}

export default async function handler(req, res) {

  // ── POST: cadastra candidato (formulário público) ──
  if (req.method === "POST") {
    try {
      const { nome, telefone, email, cargo_id, instituicao_id, unidade_id,
              apresentacao, arquivo_base64, arquivo_nome } = req.body;

      if (!arquivo_base64) return res.status(400).json({ error: "Arquivo é obrigatório" });

      const arquivoBuffer = Buffer.from(arquivo_base64, "base64");

      const result = await pool.query(
        `INSERT INTO candidatos
           (nome,telefone,email,cargo_id,instituicao_id,unidade_id,apresentacao,arquivo,arquivo_nome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [nome, telefone||null, email, cargo_id, instituicao_id, unidade_id,
         apresentacao||null, arquivoBuffer, arquivo_nome]
      );
      return res.status(200).json({ success: true, id: result.rows[0].id });
    } catch (err) {
      console.error("ERRO POST candidato:", err);
      return res.status(500).json({ error: "Erro ao salvar candidato" });
    }
  }

  // ── GET: lista candidatos ──
  if (req.method === "GET") {
    try {
      const result = await pool.query(`
        SELECT c.id, c.nome, c.email, c.telefone, c.apresentacao,
               c.arquivo_nome, c.arquivo, c.aprovado,
               c.criado_em AS data,
               ca.nome AS cargo, i.nome AS instituicao, u.nome AS unidade
        FROM candidatos c
        JOIN cargos ca      ON c.cargo_id       = ca.id
        JOIN instituicoes i ON c.instituicao_id = i.id
        JOIN unidades u     ON c.unidade_id     = u.id
        ORDER BY c.criado_em DESC`
      );

      const lista = result.rows.map(c => ({
        ...c,
        arquivo: c.arquivo
          ? `data:application/octet-stream;base64,${c.arquivo.toString("base64")}`
          : null,
      }));
      return res.status(200).json(lista);
    } catch (err) {
      console.error("ERRO GET candidatos:", err);
      return res.status(500).json({ error: "Erro ao buscar candidatos" });
    }
  }

  // ── PUT: ação sobre candidato (selecionado, desfazer aprovação, etc.) ──
  if (req.method === "PUT") {
    try {
      const { id, acao } = req.body;
      if (!id || !acao) return res.status(400).json({ error: "id e acao são obrigatórios" });

      // Ação: marcar como selecionado (dispara WhatsApp etapa 1)
      if (acao === "selecionado") {
        const cand = await pool.query(
          "SELECT nome, telefone FROM candidatos WHERE id=$1", [id]
        );
        if (cand.rows.length > 0) {
          const { nome, telefone } = cand.rows[0];
          if (telefone) await notificarSelecionado(nome, telefone);
        }
        return res.status(200).json({ success: true });
      }

      // Ação: desfazer aprovação
      if (acao === "desfazer_aprovacao") {
        await pool.query("UPDATE candidatos SET aprovado=false WHERE id=$1", [id]);
        // Reverte status da entrevista mais recente para 'realizada'
        await pool.query(
          `UPDATE entrevistas SET status='realizada'
           WHERE candidato_id=$1 AND status='aprovado'
           ORDER BY data_hora DESC LIMIT 1`, [id]
        );
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: "Ação desconhecida" });
    } catch (err) {
      console.error("ERRO PUT candidato:", err);
      return res.status(500).json({ error: "Erro ao atualizar candidato" });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
