import pkg from "pg";
import { carregarAcesso, gerarToken } from "./_acesso.js";

const { Pool } = pkg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_RH;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada");
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido",
    });
  }

  try {

    const { nome, senha } = req.body;

    if (!nome || !senha) {
      return res.status(400).json({
        success: false,
        error: "Nome e senha obrigatórios",
      });
    }

    const result = await pool.query(
      "SELECT id, nome, senha FROM usuarios WHERE nome = $1",
      [nome]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Usuário não encontrado",
      });
    }

    const user = result.rows[0];

    if (!user.senha) {
      return res.status(403).json({
        success: false,
        error: "Senha ainda não criada. Use \"Criar minha senha\" com o código do administrador.",
      });
    }

    if (user.senha !== senha) {
      return res.status(401).json({
        success: false,
        error: "Senha incorreta",
      });
    }

    // Permissões (acesso total ou somente unidades vinculadas)
    const acesso = await carregarAcesso(pool, user.id);

    if (!acesso.total && acesso.unidades.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Seu usuário não tem nenhuma unidade liberada. Fale com o administrador.",
      });
    }

    return res.status(200).json({
      success: true,
      usuario: {
        id: user.id,
        nome: user.nome,
        acesso_total: acesso.total,
        unidades: acesso.unidades,
        token: gerarToken(user.id),
      },
    });

  } catch (err) {

    console.error("ERRO LOGIN:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }

}
