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
    // Nunca deixa o WhatsApp quebrar o fluxo principal
    console.error("[candidatos] WhatsApp silencioso:", err.message);
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
        cargos_pretendidos, maquinas
      } = req.body;

      if (!arquivo_base64) {
        return res.status(400).json({ error: "Arquivo é obrigatório" });
      }

      const arquivoBuffer = Buffer.from(arquivo_base64, "base64");

      const result = await pool.query(
        `INSERT INTO candidatos
           (nome, telefone, email, cargo_id, instituicao_id, unidade_id,
            apresentacao, arquivo, arquivo_nome,
            cargos_pretendidos, maquinas)
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
          cargos_pretendidos || null,
          maquinas || null,
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

      // GET /api/candidatos?arquivados=1  →  lista somente arquivados
      if (req.query.arquivados === "1") {
        const result = await pool.query(`
          SELECT
            c.id, c.nome, c.email, c.telefone,
            c.arquivo_nome, c.aprovado, c.criado_em AS data,
            c.cargos_pretendidos, c.maquinas,
            c.arquivado, c.motivo_arquivamento, c.arquivado_por, c.arquivado_em,
            ca.nome AS cargo, i.nome AS instituicao, u.nome AS unidade
          FROM candidatos c
          JOIN cargos       ca ON ca.id = c.cargo_id
          JOIN instituicoes i  ON i.id  = c.instituicao_id
          JOIN unidades     u  ON u.id  = c.unidade_id
          WHERE c.arquivado = true
          ORDER BY c.arquivado_em DESC
        `);
        return res.status(200).json(result.rows);
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
          c.criado_em AS data,
          c.cargos_pretendidos,
          c.maquinas,
          ca.nome AS cargo,
          i.nome  AS instituicao,
          u.nome  AS unidade
        FROM candidatos c
        JOIN cargos       ca ON ca.id = c.cargo_id
        JOIN instituicoes i  ON i.id  = c.instituicao_id
        JOIN unidades     u  ON u.id  = c.unidade_id
        WHERE (c.arquivado IS NULL OR c.arquivado = false)
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
      const { id, acao, unidade, instituicao, cargo,
              motivo_arquivamento, arquivado_por } = req.body;

      if (!id) {
        return res.status(400).json({ error: "id é obrigatório" });
      }

      // ── Editar: atualiza unidade, instituição e cargo
      if (!acao || acao === "editar") {
        if (!unidade || !instituicao || !cargo) {
          return res.status(400).json({ error: "unidade, instituicao e cargo são obrigatórios" });
        }

        const [resUnidade, resInstituicao, resCargo] = await Promise.all([
          pool.query("SELECT id FROM unidades WHERE nome = $1 LIMIT 1", [unidade]),
          pool.query("SELECT id FROM instituicoes WHERE nome = $1 LIMIT 1", [instituicao]),
          pool.query("SELECT id FROM cargos WHERE nome = $1 LIMIT 1", [cargo]),
        ]);

        const unidade_id = resUnidade.rows[0]?.id
          || (await pool.query("INSERT INTO unidades (nome) VALUES ($1) RETURNING id", [unidade])).rows[0].id;

        const instituicao_id = resInstituicao.rows[0]?.id
          || (await pool.query("INSERT INTO instituicoes (nome) VALUES ($1) RETURNING id", [instituicao])).rows[0].id;

        const cargo_id = resCargo.rows[0]?.id
          || (await pool.query("INSERT INTO cargos (nome) VALUES ($1) RETURNING id", [cargo])).rows[0].id;

        await pool.query(
          `UPDATE candidatos SET unidade_id = $1, instituicao_id = $2, cargo_id = $3 WHERE id = $4`,
          [unidade_id, instituicao_id, cargo_id, id]
        );
        return res.status(200).json({ success: true });
      }

      // ── Selecionado: dispara mensagem WhatsApp etapa 1
      if (acao === "selecionado") {
        const cand = await pool.query(
          "SELECT nome, telefone FROM candidatos WHERE id = $1", [id]
        );
        if (cand.rows.length > 0) {
          const { nome, telefone } = cand.rows[0];
          if (telefone) await notificarSelecionado(nome, telefone);
        }
        return res.status(200).json({ success: true });
      }

      // ── Arquivar: registra motivo e usuário responsável
      if (acao === "arquivar") {
        if (!motivo_arquivamento) {
          return res.status(400).json({ error: "Motivo do arquivamento é obrigatório" });
        }
        await pool.query(
          `UPDATE candidatos
           SET arquivado          = true,
               motivo_arquivamento = $1,
               arquivado_por       = $2,
               arquivado_em        = NOW()
           WHERE id = $3`,
          [motivo_arquivamento, arquivado_por || "Sistema", id]
        );
        return res.status(200).json({ success: true });
      }

      // ── Desfazer aprovação: volta candidato para a fila
      if (acao === "desfazer_aprovacao") {
        await pool.query(
          "UPDATE candidatos SET aprovado = false WHERE id = $1", [id]
        );
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

      // ── Restaurar: remove arquivamento e volta candidato para a fila
      if (acao === "restaurar") {
        await pool.query(
          `UPDATE candidatos
           SET arquivado = false, motivo_arquivamento = NULL,
               arquivado_por = NULL, arquivado_em = NULL
           WHERE id = $1`,
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
