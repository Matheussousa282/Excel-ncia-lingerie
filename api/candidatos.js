import { IncomingForm } from "formidable";
import fs from "fs";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export const config = { api: { bodyParser: false } };

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método não permitido"});

  const form = new IncomingForm({ uploadDir:"./public/uploads", keepExtensions:true });
  form.parse(req, async (err, fields, files)=>{
    if(err) return res.status(500).json({error:"Erro ao processar arquivo"});
    
    const { nome,email,telefone,cargo_id,instituicao_id,unidade_id,apresentacao } = fields;
    const arquivo = files.arquivo?.filepath.replace(/^\.\/public/,"") || "";

    if(!nome||!email||!cargo_id||!instituicao_id||!unidade_id)
      return res.status(400).json({error:"Campos obrigatórios faltando"});

    try{
      await pool.query(
        `INSERT INTO candidatos (nome,email,telefone,cargo_id,instituicao_id,unidade_id,apresentacao,arquivo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [nome,email,telefone||"",cargo_id,instituicao_id,unidade_id,apresentacao||"",arquivo]
      );
      return res.status(201).json({success:true});
    }catch(error){
      console.error(error);
      return res.status(500).json({error:"Erro ao salvar no banco"});
    }
  });
}
