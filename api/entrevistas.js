// /api/entrevistas.js
// Dispara WhatsApp automaticamente em cada mudança de status.

import { Pool } from "pg";
import { enviarWhatsApp, formatarMensagem } from "./whatsapp.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false },
});

async function lerConfigs(chaves) {

/* Extrai data/hora da string ISO sem converter fuso */
function parseDateLocal(str) {
  const m = str.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(str);
  return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5]));
}

async function lerConfigs(chaves) {
  const r = await pool.query(
    "SELECT chave, valor FROM configuracoes WHERE chave = ANY($1)", [chaves]
  );
  const cfg = {};
  r.rows.forEach(row => { cfg[row.chave] = row.valor; });
  return cfg;
}

async function notificar({ notifKey, msgKey, telefone, vars }) {
  try {
    const cfg = await lerConfigs(["whatsapp_ativo", notifKey, msgKey]);
    if (cfg.whatsapp_ativo !== "true" || cfg[notifKey] !== "true") return;
    const mensagem = formatarMensagem(cfg[msgKey] || "", vars);
    if (mensagem && telefone) await enviarWhatsApp({ telefone, mensagem });
  } catch (err) {
    console.error("[notificar] WhatsApp silencioso:", err.message);
  }
}

export default async function handler(req, res) {
  try {
    const { method } = req;

    if (method === "GET") {
      const { mes, ano, candidato_id, status } = req.query;
      let q = `
        SELECT e.id, e.candidato_id, e.data_hora, e.hora_local, e.responsavel,
               e.status, e.observacoes, e.criado_em,
               c.nome AS candidato_nome, c.telefone AS candidato_telefone,
               ca.nome AS cargo, i.nome AS instituicao, u.nome AS unidade
        FROM entrevistas e
        JOIN candidatos c   ON c.id  = e.candidato_id
        JOIN cargos ca      ON ca.id = c.cargo_id
        JOIN instituicoes i ON i.id  = c.instituicao_id
        JOIN unidades u     ON u.id  = c.unidade_id
        WHERE 1=1`;
      const params = [];
      if (status) { params.push(status); q += ` AND e.status=$${params.length}`; }
      if (mes && ano) {
        params.push(Number(ano), Number(mes));
        q += ` AND EXTRACT(YEAR FROM e.data_hora)=$${params.length-1}
               AND EXTRACT(MONTH FROM e.data_hora)=$${params.length}`;
      }
      if (candidato_id) { params.push(Number(candidato_id)); q += ` AND e.candidato_id=$${params.length}`; }
      q += " ORDER BY e.data_hora DESC";
      const result = await pool.query(q, params);
      return res.status(200).json(result.rows);
    }

    if (method === "POST") {
      const { candidato_id, data_hora, responsavel, observacoes } = req.body;
      if (!candidato_id || !data_hora)
        return res.status(400).json({ error: "candidato_id e data_hora são obrigatórios" });

      // Extrai a hora do string enviado pelo front (ex: "2026-03-20T10:30:00") 
      const hora_local = data_hora.substring(11, 16); // "10:30"
      const data_local = data_hora.substring(0, 10);  // "2026-03-20"

      const conflito = await pool.query(
        "SELECT id FROM entrevistas WHERE data_hora=$1 AND status!='reprovado'", [data_hora]
      );
      if (conflito.rows.length > 0)
        return res.status(409).json({ error: "Já existe uma entrevista agendada neste horário." });

      const ins = await pool.query(
        "INSERT INTO entrevistas(candidato_id,data_hora,hora_local,responsavel,observacoes) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [candidato_id, data_hora, hora_local, responsavel||null, observacoes||null]
      );

      // WhatsApp: entrevista agendada
      const cand = await pool.query("SELECT nome, telefone FROM candidatos WHERE id=$1", [candidato_id]);
      if (cand.rows.length > 0 && cand.rows[0].telefone) {
        const dt = parseDateLocal(data_hora);
        await notificar({
          notifKey: "notif_agendado", msgKey: "msg_agendado",
          telefone: cand.rows[0].telefone,
          vars: {
            nome: cand.rows[0].nome,
            data: dt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}),
            hora: hora_local,
            responsavel: responsavel || "nossa equipe",
            observacoes: observacoes || "",
          },
        });
      }
      return res.status(201).json({ success: true, id: ins.rows[0].id });
    }

    if (method === "PUT") {
      const { id, status, observacoes, data_hora, responsavel } = req.body;
      if (!id) return res.status(400).json({ error: "id é obrigatório" });

      const hora_local = data_hora ? data_hora.substring(11, 16) : null;

      await pool.query(
        `UPDATE entrevistas SET
           status=COALESCE($1,status), observacoes=COALESCE($2,observacoes),
           data_hora=COALESCE($3,data_hora), responsavel=COALESCE($4,responsavel),
           hora_local=COALESCE($5,hora_local)
         WHERE id=$6`,
        [status||null, observacoes||null, data_hora||null, responsavel||null, hora_local||null, id]
      );

      if (status === "aprovado") {
        const e = await pool.query("SELECT candidato_id FROM entrevistas WHERE id=$1", [id]);
        if (e.rows.length) await pool.query("UPDATE candidatos SET aprovado=true WHERE id=$1", [e.rows[0].candidato_id]);
      }

      // WhatsApp por status
      if (status) {
        const row = await pool.query(
          `SELECT c.nome, c.telefone, e.data_hora, e.hora_local, e.observacoes, e.responsavel
           FROM entrevistas e JOIN candidatos c ON c.id=e.candidato_id WHERE e.id=$1`, [id]
        );
        if (row.rows.length && row.rows[0].telefone) {
          const { nome, telefone, data_hora: dtHr, hora_local: hl, observacoes: obs, responsavel: resp } = row.rows[0];
          const dt = parseDateLocal(dtHr);
          const mapa = {
            realizada: { notifKey:"notif_realizado", msgKey:"msg_realizado" },
            aprovado:  { notifKey:"notif_aprovado",  msgKey:"msg_aprovado"  },
            reprovado: { notifKey:"notif_reprovado", msgKey:"msg_reprovado" },
          };
          if (mapa[status]) await notificar({
            ...mapa[status], telefone,
            vars: {
              nome,
              data: dt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"}),
              hora: hl || dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
              responsavel: resp || "nossa equipe",
              observacoes: obs || "",
            },
          });
        }
      }
      return res.json({ success: true });
    }

    if (method === "DELETE") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id é obrigatório" });
      await pool.query("DELETE FROM entrevistas WHERE id=$1", [id]);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (err) {
    console.error("ERRO API ENTREVISTAS:", err);
    return res.status(500).json({ error: "Erro interno", details: err.message });
  }
}
