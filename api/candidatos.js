// /api/candidatos.js
// GET  → lista candidatos
// POST → cadastra candidato (formulário público)
// PUT  → ações: "selecionado" (dispara WhatsApp) | "desfazer_aprovacao"

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_RH;
if (!connectionString) throw new Error("DATABASE_URL não configurada");

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

/* ── Import dinâmico do WhatsApp (não quebra se o módulo falhar) ── */
async function notificarSelecionado(nome, telefone) {
  try {
    const { enviarWhatsApp, formatarMensagem } = await import("./whatsapp.js");

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

async function notificarTeste(nome, telefone) {
  try {
    const { enviarWhatsApp, formatarMensagem } = await import("./whatsapp.js");

    const cfg = await pool.query(
      "SELECT chave, valor FROM configuracoes WHERE chave IN ('whatsapp_ativo','notif_teste','msg_teste')"
    );
    const c = {};
    cfg.rows.forEach(r => { c[r.chave] = r.valor; });

    if (c.whatsapp_ativo !== "true" || c.notif_teste !== "true") return;

    const msg = formatarMensagem(
      c.msg_teste || "Olá {nome}! 🧪 Você foi selecionado(a) para a etapa de teste!",
      { nome }
    );
    if (msg && telefone) await enviarWhatsApp({ telefone, mensagem: msg });

  } catch (err) {
    console.error("[candidatos] WhatsApp teste silencioso:", err.message);
  }
}

export default async function handler(req, res) {

  // ════════════════════════════════════════
  // POST — cadastra novo candidato
  // ════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const {
        nome, telefone, email,
        cargo_id, instituicao_id, unidade_id,
        apresentacao, arquivo_base64, arquivo_nome,
        maquinas, cargos_pretendidos
      } = req.body;

      if (!arquivo_base64) {
        return res.status(400).json({ error: "Arquivo é obrigatório" });
      }

      const arquivoBuffer = Buffer.from(arquivo_base64, "base64");

      const result = await pool.query(
        `INSERT INTO candidatos
           (nome, telefone, email, cargo_id, instituicao_id, unidade_id,
            apresentacao, arquivo, arquivo_nome, maquinas, cargos_pretendidos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          nome,
          telefone || null,
          email,
          cargo_id,
          instituicao_id,
          unidade_id,
          apresentacao || null,
          arquivoBuffer,
          arquivo_nome,
          maquinas || null,
          cargos_pretendidos || null,
        ]
      );

      return res.status(200).json({ success: true, id: result.rows[0].id });

    } catch (err) {
      console.error("ERRO POST candidato:", err);
      return res.status(500).json({ error: "Erro ao salvar candidato" });
    }
  }

  // ════════════════════════════════════════
  // GET — lista candidatos ou busca arquivo
  // ════════════════════════════════════════
  if (req.method === "GET") {
    try {
      // GET /api/candidatos?arquivados=1  →  retorna só os arquivados
      if (req.query.arquivados === "1") {
        const r = await pool.query(`
          SELECT
            c.id, c.nome, c.email, c.telefone, c.aprovado,
            c.arquivado, c.motivo_arquivamento, c.arquivado_por, c.arquivado_em,
            ca.nome AS cargo, i.nome AS instituicao, u.nome AS unidade
          FROM candidatos c
          JOIN cargos       ca ON ca.id = c.cargo_id
          JOIN instituicoes i  ON i.id  = c.instituicao_id
          JOIN unidades     u  ON u.id  = c.unidade_id
          WHERE c.arquivado = true
          ORDER BY c.arquivado_em DESC
        `);
        return res.status(200).json(r.rows);
      }

      // GET /api/candidatos?arquivo=ID  →  retorna só o arquivo daquele candidato
      if (req.query.arquivo) {
        const id = Number(req.query.arquivo);
        const r  = await pool.query(
          "SELECT arquivo, arquivo_nome FROM candidatos WHERE id = $1", [id]
        );
        if (!r.rows.length || !r.rows[0].arquivo) {
          return res.status(404).json({ error: "Arquivo não encontrado" });
        }
        const { arquivo, arquivo_nome } = r.rows[0];
        const base64 = Buffer.from(arquivo).toString("base64");
        return res.status(200).json({
          arquivo:      `data:application/octet-stream;base64,${base64}`,
          arquivo_nome: arquivo_nome,
        });
      }

      // GET /api/candidatos  →  lista SEM o campo arquivo (evita RangeError no front)
      const result = await pool.query(`
        SELECT
          c.id,
          c.nome,
          c.email,
          c.telefone,
          c.apresentacao,
          c.arquivo_nome,
          c.aprovado,
          c.em_teste,
          c.selecionado,
          c.maquinas,
          c.cargos_pretendidos,
          c.criado_em AS data,
          ca.nome AS cargo,
          i.nome  AS instituicao,
          u.nome  AS unidade
        FROM candidatos c
        JOIN cargos       ca ON ca.id = c.cargo_id
        JOIN instituicoes i  ON i.id  = c.instituicao_id
        JOIN unidades     u  ON u.id  = c.unidade_id
        WHERE c.arquivado IS NOT TRUE
        ORDER BY c.criado_em DESC
      `);

      // Não inclui o campo "arquivo" na listagem geral
      // O front-end busca o arquivo individualmente via ?arquivo=ID
      return res.status(200).json(result.rows);

    } catch (err) {
      console.error("ERRO GET candidatos:", err);
      return res.status(500).json({ error: "Erro ao buscar candidatos", details: err.message });
    }
  }

  // ════════════════════════════════════════
  // PUT — ações específicas
  // ════════════════════════════════════════
  if (req.method === "PUT") {
    try {
      const { id, acao } = req.body;

      if (!id || !acao) {
        return res.status(400).json({ error: "id e acao são obrigatórios" });
      }

      // ── Editar cargo, instituição e unidade
      if (acao === "editar") {
        const { cargo_id, inst_id, unidade_id } = req.body;

        if (!cargo_id || !inst_id || !unidade_id) {
          return res.status(400).json({ error: "cargo_id, inst_id e unidade_id são obrigatórios" });
        }

        await pool.query(
          `UPDATE candidatos
           SET cargo_id = $1, instituicao_id = $2, unidade_id = $3
           WHERE id = $4`,
          [cargo_id, inst_id, unidade_id, id]
        );
        return res.status(200).json({ success: true });
      }

      // ── Marcar/desmarcar como em teste
      if (acao === "em_teste") {
        const { valor } = req.body;
        const novoValor = valor === true || valor === "true";

        await pool.query(
          "UPDATE candidatos SET em_teste = $1 WHERE id = $2",
          [novoValor, id]
        );

        // Dispara WhatsApp quando MARCA como em teste (não quando desmarca)
        if (novoValor) {
          const cand = await pool.query(
            "SELECT nome, telefone FROM candidatos WHERE id = $1", [id]
          );
          if (cand.rows.length > 0 && cand.rows[0].telefone) {
            await notificarTeste(cand.rows[0].nome, cand.rows[0].telefone);
          }
        }

        return res.status(200).json({ success: true });
      }

      // ── Selecionar / desselecionar candidato (salva no banco)
      if (acao === "selecionado") {
        const { valor } = req.body;
        const novoValor = valor === true || valor === "true";

        await pool.query(
          "UPDATE candidatos SET selecionado = $1 WHERE id = $2",
          [novoValor, id]
        );

        // Dispara WhatsApp apenas quando SELECIONA
        if (novoValor) {
          const cand = await pool.query(
            "SELECT nome, telefone FROM candidatos WHERE id = $1", [id]
          );
          if (cand.rows.length > 0) {
            const { nome, telefone } = cand.rows[0];
            if (telefone) await notificarSelecionado(nome, telefone);
          }
        }

        return res.status(200).json({ success: true });
      }

      // ── Desfazer aprovação: volta candidato para a fila
      if (acao === "desfazer_aprovacao") {
        await pool.query(
          "UPDATE candidatos SET aprovado = false WHERE id = $1", [id]
        );
        // Reverte entrevista mais recente de 'aprovado' para 'realizada'
        await pool.query(
          `UPDATE entrevistas
           SET status = 'realizada'
           WHERE id = (
             SELECT id FROM entrevistas
             WHERE candidato_id = $1 AND status = 'aprovado'
             ORDER BY data_hora DESC
             LIMIT 1
           )`,
          [id]
        );
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: "Ação desconhecida: " + acao });

    } catch (err) {
      console.error("ERRO PUT candidato:", err);
      return res.status(500).json({ error: "Erro ao atualizar candidato", details: err.message });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
