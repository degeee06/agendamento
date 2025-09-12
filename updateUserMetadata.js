import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Use a service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const usuarios = [
  { email: "amorimmm60@gmail.com", cliente_id: "cliente1" },
];

async function atualizar() {
  for (const u of usuarios) {
    // Busca o usuário pelo email
    const { data, error } = await supabase.auth.admin.listUsers({ email: u.email });

    if (error || !data.users?.length) {
      console.error("Usuário não encontrado:", u.email, error?.message);
      continue;
    }

    const user = data.users[0];
    const userId = user.id;

    console.log(`Antes -> ${u.email}:`, user.user_metadata);

    // Atualiza o user_metadata
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...user.user_metadata, cliente_id: u.cliente_id }
    });

    if (updateError) console.error("Erro ao atualizar:", u.email, updateError.message);
    else console.log(`Atualizado -> ${u.email}: cliente_id = ${u.cliente_id}`);
  }
}

atualizar();
