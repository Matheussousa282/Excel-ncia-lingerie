// /api/_acesso.js
// ─────────────────────────────────────────────────────────────
// Controle de acesso por unidade (arquivo auxiliar, não é rota).
//
//  • Cada usuário tem acesso_total (true/false).
//  • Se acesso_total = false, só enxerga as unidades ligadas a ele
//    na tabela usuario_unidades.
//  • O login devolve um token assinado (HMAC). O front envia o token
//    em "Authorization: Bearer ..." e o servidor confere tudo no banco,
//    então o gerente não consegue "burlar" mexendo no localStorage.
// ─────────────────────────────────────────────────────────────

import crypto from "crypto";

const SECRET =
  process.env.AUTH_SECRET ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_RH ||
  "";

let estruturaOk = false;

/* Cria coluna/tabela necessárias (idempotente, roda 1x por instância) */
export async function garantirEstrutura(pool) {
  if (estruturaOk) return;
  await pool.query(
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acesso_total BOOLEAN NOT NULL DEFAULT true"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuario_unidades (
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
      PRIMARY KEY (usuario_id, unidade_id)
    )
  `);
  estruturaOk = true;
}

function assinar(payload) {
  return crypto.createHmac("sha256", SECRET).update(String(payload)).digest("hex");
}

export function gerarToken(usuarioId) {
  return `${usuarioId}.${assinar(usuarioId)}`;
}

function lerUsuarioIdDoToken(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const esperado = assinar(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

/* Carrega as permissões de um usuário direto do banco */
export async function carregarAcesso(pool, usuarioId) {
  await garantirEstrutura(pool);
  const u = await pool.query(
    "SELECT id, nome, acesso_total FROM usuarios WHERE id = $1",
    [usuarioId]
  );
  if (!u.rows.length) return null;

  const total = u.rows[0].acesso_total !== false;
  let unidades = [];
  if (!total) {
    const r = await pool.query(
      "SELECT unidade_id FROM usuario_unidades WHERE usuario_id = $1",
      [usuarioId]
    );
    unidades = r.rows.map(x => Number(x.unidade_id));
  }
  return { id: u.rows[0].id, nome: u.rows[0].nome, total, unidades };
}

/* Lê o token da requisição → { id, nome, total, unidades } ou null */
export async function obterAcesso(pool, req) {
  const id = lerUsuarioIdDoToken(req);
  if (!id) return null;
  return carregarAcesso(pool, id);
}

/* Valor para usar em SQL: null = sem filtro | array = só essas unidades */
export function filtroUnidades(acesso) {
  return acesso.total ? null : acesso.unidades;
}

export function unidadePermitida(acesso, unidadeId) {
  return acesso.total || acesso.unidades.includes(Number(unidadeId));
}

export async function candidatoPermitido(pool, acesso, candidatoId) {
  if (acesso.total) return true;
  const r = await pool.query("SELECT unidade_id FROM candidatos WHERE id = $1", [candidatoId]);
  return r.rows.length > 0 && unidadePermitida(acesso, r.rows[0].unidade_id);
}

export async function entrevistaPermitida(pool, acesso, entrevistaId) {
  if (acesso.total) return true;
  const r = await pool.query(
    `SELECT c.unidade_id FROM entrevistas e
     JOIN candidatos c ON c.id = e.candidato_id WHERE e.id = $1`,
    [entrevistaId]
  );
  return r.rows.length > 0 && unidadePermitida(acesso, r.rows[0].unidade_id);
}
