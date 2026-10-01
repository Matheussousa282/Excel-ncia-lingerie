// /api/primeiro-acesso.js
// POST { nome, codigo, senha }
// O usuário cria a própria senha usando o código gerado pelo administrador.
// Só funciona para usuários "pendentes" (senha vazia). Após 5 códigos errados
// o código é invalidado e o administrador precisa gerar outro.

import { Pool } from "pg";
import { garantirEstrutura } from "./_acesso.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DATABASE_URL_RH,
  ssl: { rejectUnauthorized: false },
});

const MAX_TENTATIVAS = 5;
const ERRO_GENERICO = "Usuário ou código inválido. Confira com o administrador.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    await garantirEstrutura(pool);

    const nome   = String(req.body.nome   || "").trim();
    const codigo = String(req.body.codigo || "").trim();
    const senha  = String(req.body.senha  || "");

    if (!nome || !codigo || !senha) {
      return res.status(400).json({ error: "Preencha usuário, código e nova senha" });
    }
    if (senha.length < 6) {
      return res.status(400).json({ error: "A senha precisa ter no mínimo 6 caracteres" });
    }

    const r = await pool.query(
      "SELECT id, senha, codigo_primeiro_acesso, tentativas_codigo FROM usuarios WHERE nome = $1",
      [nome]
    );
    const u = r.rows[0];

    // Usuário inexistente, já com senha, ou sem código válido → mesma mensagem genérica
    if (!u || u.senha || !u.codigo_primeiro_acesso) {
      return res.status(400).json({ error: ERRO_GENERICO });
    }

    if (u.codigo_primeiro_acesso !== codigo) {
      const tentativas = (u.tentativas_codigo || 0) + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await pool.query(
          "UPDATE usuarios SET codigo_primeiro_acesso = NULL, tentativas_codigo = 0 WHERE id = $1",
          [u.id]
        );
        return res.status(400).json({ error: "Código bloqueado por excesso de tentativas. Peça um novo ao administrador." });
      }
      await pool.query("UPDATE usuarios SET tentativas_codigo = $1 WHERE id = $2", [tentativas, u.id]);
      return res.status(400).json({ error: ERRO_GENERICO });
    }

    await pool.query(
      "UPDATE usuarios SET senha = $1, codigo_primeiro_acesso = NULL, tentativas_codigo = 0 WHERE id = $2",
      [senha, u.id]
    );

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("ERRO PRIMEIRO ACESSO:", err);
    return res.status(500).json({ error: "Erro no servidor", details: err.message });
  }
}
