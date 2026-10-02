// /pages/api/usuarios.js
// GET  → lista usuários (com tipo de acesso e unidades liberadas)
// POST → cria usuário { nome, senha?, acesso_total, unidades:[ids] } (sem senha = gera código de primeiro acesso)
// PUT  → atualiza acesso { id, acesso_total, unidades:[ids], todos_cargos, cargos:[ids], senha? } | { id, redefinir:true }
// Somente usuários com acesso total podem usar esta API.

import crypto from "crypto";
import { Pool } from "pg";
import { garantirEstrutura, obterAcesso } from "./_acesso.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necessário no Vercel
});

/* Código numérico de 6 dígitos para o primeiro acesso */
function gerarCodigo() {
  return String(crypto.randomInt(100000, 1000000));
}

/* Normaliza lista de ids vinda do front */
function listaIds(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter(Number.isInteger))];
}

async function gravarCargos(client, usuarioId, todos, cargos) {
  await client.query("DELETE FROM usuario_cargos WHERE usuario_id = $1", [usuarioId]);
  if (todos) return;
  for (const cid of cargos) {
    await client.query(
      "INSERT INTO usuario_cargos (usuario_id, cargo_id) VALUES ($1, $2)",
      [usuarioId, cid]
    );
  }
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
      // Sem GROUP BY: funciona mesmo se a tabela usuarios não tiver PRIMARY KEY em id
      const result = await pool.query(`
        SELECT u.id, u.nome, u.senha, u.criado_em, u.acesso_total, u.acesso_todos_cargos, u.codigo_primeiro_acesso AS codigo,
               COALESCE(
                 (SELECT array_agg(uu.unidade_id) FROM usuario_unidades uu WHERE uu.usuario_id = u.id),
                 '{}'
               ) AS unidades,
               COALESCE(
                 (SELECT array_agg(uc.cargo_id) FROM usuario_cargos uc WHERE uc.usuario_id = u.id),
                 '{}'
               ) AS cargos
        FROM usuarios u
        ORDER BY u.id ASC
      `);
      return res.status(200).json(
        result.rows.map(r => ({
          ...r,
          pendente: !r.senha,
          codigo: !r.senha ? r.codigo : null,
          todos_cargos: r.acesso_todos_cargos !== false,
          unidades: (r.unidades || []).map(Number),
          cargos: (r.cargos || []).map(Number)
        }))
      );
    }

    // ── CRIAR
    if (req.method === "POST") {
      const { nome, senha } = req.body;
      const total    = req.body.acesso_total !== false && req.body.acesso_total !== "false";
      const unidades = listaIds(req.body.unidades);
      const todosCargos = req.body.todos_cargos !== false && req.body.todos_cargos !== "false";
      const cargos      = listaIds(req.body.cargos);

      if (!nome) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }
      if (!total && unidades.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma unidade para este usuário" });
      }
      if (!todosCargos && cargos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um cargo para este usuário" });
      }

      const existe = await pool.query("SELECT id FROM usuarios WHERE nome = $1", [nome]);
      if (existe.rows.length > 0) {
        return res.status(400).json({ error: "Usuário já existe" });
      }

      // Sem senha informada = usuário "pendente": cria a própria senha no primeiro acesso
      const codigo = senha ? null : gerarCodigo();

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          "INSERT INTO usuarios (nome, senha, acesso_total, acesso_todos_cargos, codigo_primeiro_acesso) VALUES ($1, $2, $3, $4, $5) RETURNING id",
          [nome, senha || "", total, todosCargos, codigo]
        );
        await gravarUnidades(client, ins.rows[0].id, total, unidades);
        await gravarCargos(client, ins.rows[0].id, todosCargos, cargos);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      return res.status(201).json({ success: true, codigo });
    }

    // ── ATUALIZAR ACESSO (e senha, se enviada)
    if (req.method === "PUT") {
      const { id, senha } = req.body;

      // Redefinir senha: apaga a senha atual e gera novo código de primeiro acesso
      if (req.body.redefinir) {
        if (!id) return res.status(400).json({ error: "id é obrigatório" });
        if (Number(id) === acesso.id) {
          return res.status(400).json({ error: "Você não pode redefinir a sua própria senha por aqui" });
        }
        const codigo = gerarCodigo();
        await pool.query(
          "UPDATE usuarios SET senha = '', codigo_primeiro_acesso = $1, tentativas_codigo = 0 WHERE id = $2",
          [codigo, id]
        );
        return res.status(200).json({ success: true, codigo });
      }

      const total    = req.body.acesso_total !== false && req.body.acesso_total !== "false";
      const unidades = listaIds(req.body.unidades);
      const todosCargos = req.body.todos_cargos !== false && req.body.todos_cargos !== "false";
      const cargos      = listaIds(req.body.cargos);

      if (!id) return res.status(400).json({ error: "id é obrigatório" });
      if (!total && unidades.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma unidade para este usuário" });
      }
      if (!todosCargos && cargos.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos um cargo para este usuário" });
      }
      // Evita o admin se trancar para fora
      if (Number(id) === acesso.id && (!total || !todosCargos)) {
        return res.status(400).json({ error: "Você não pode restringir o seu próprio acesso" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE usuarios SET acesso_total = $1, acesso_todos_cargos = $2 WHERE id = $3",
          [total, todosCargos, id]
        );
        if (senha) {
          await client.query(
            "UPDATE usuarios SET senha = $1, codigo_primeiro_acesso = NULL, tentativas_codigo = 0 WHERE id = $2",
            [senha, id]
          );
        }
        await gravarUnidades(client, id, total, unidades);
        await gravarCargos(client, id, todosCargos, cargos);
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
    return res.status(500).json({ error: "Erro no servidor", details: err.message });
  }
}
