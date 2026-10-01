// /pages/api/usuarios.js
// GET  → lista usuários (com tipo de acesso e unidades liberadas)
// POST → cria usuário { nome, senha, acesso_total, unidades:[ids] }
// PUT  → atualiza acesso { id, acesso_total, unidades:[ids], senha? }
// Somente usuários com acesso total podem usar esta API.

import { Pool } from "pg";
import { garantirEstrutura, obterAcesso } from "./_acesso.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necessário no Vercel
});

/* Normaliza lista de ids vinda do front */
function listaIds(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter(Number.isInteger))];
}

async function gravarUnidades(client, usuarioId, total, unidades) {
  await client.query("DELETE FROM usuario_unidades WHERE usuario_id = $1", [usuarioId]);
  if (total) return;
  for (const uid of unidades) {
    await client.query(
      "INSERT INTO usuario_unidades (usuario_id, unidade_id) VALUES ($1, $2)",
      [usuarioId, uid]
    );
  }
}

export default async function handler(req, res) {
  try {
    await garantirEstrutura(pool);

    const acesso = await obterAcesso(pool, req);
    if (!acesso) return res.status(401).json({ error: "Não autenticado" });
    if (!acesso.total) return res.status(403).json({ error: "Sem permissão" });

    // ── LISTAR
    if (req.method === "GET") {
      const result = await pool.query(`
        SELECT u.id, u.nome, u.senha, u.criado_em, u.acesso_total,
               COALESCE(array_agg(uu.unidade_id) FILTER (WHERE uu.unidade_id IS NOT NULL), '{}') AS unidades
        FROM usuarios u
        LEFT JOIN usuario_unidades uu ON uu.usuario_id = u.id
        GROUP BY u.id
        ORDER BY u.id ASC
      `);
      return res.status(200).json(
        result.rows.map(r => ({ ...r, unidades: (r.unidades || []).map(Number) }))
      );
    }

    // ── CRIAR
    if (req.method === "POST") {
      const { nome, senha } = req.body;
      const total    = req.body.acesso_total !== false && req.body.acesso_total !== "false";
      const unidades = listaIds(req.body.unidades);

      if (!nome || !senha) {
        return res.status(400).json({ error: "Dados obrigatórios" });
      }
      if (!total && unidades.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma unidade para este usuário" });
      }

      const existe = await pool.query("SELECT id FROM usuarios WHERE nome = $1", [nome]);
      if (existe.rows.length > 0) {
        return res.status(400).json({ error: "Usuário já existe" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          "INSERT INTO usuarios (nome, senha, acesso_total) VALUES ($1, $2, $3) RETURNING id",
          [nome, senha, total]
        );
        await gravarUnidades(client, ins.rows[0].id, total, unidades);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      return res.status(201).json({ success: true });
    }

    // ── ATUALIZAR ACESSO (e senha, se enviada)
    if (req.method === "PUT") {
      const { id, senha } = req.body;
      const total    = req.body.acesso_total !== false && req.body.acesso_total !== "false";
      const unidades = listaIds(req.body.unidades);

      if (!id) return res.status(400).json({ error: "id é obrigatório" });
      if (!total && unidades.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma unidade para este usuário" });
      }
      // Evita o admin se trancar para fora
      if (Number(id) === acesso.id && !total) {
        return res.status(400).json({ error: "Você não pode restringir o seu próprio acesso" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE usuarios SET acesso_total = $1 WHERE id = $2", [total, id]);
        if (senha) {
          await client.query("UPDATE usuarios SET senha = $1 WHERE id = $2", [senha, id]);
        }
        await gravarUnidades(client, id, total, unidades);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Método não permitido" });

  } catch (err) {
    console.error("ERRO API USUÁRIOS:", err);
    return res.status(500).json({ error: "Erro no servidor" });
  }
}
