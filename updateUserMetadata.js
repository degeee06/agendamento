import { createClient } from "@supabase/supabase-js";

// Service Role Key (tem acesso total)
const supabase = createClient(
  "https://otyxjcxxqwjotnuyrvmc.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90eXhqY3h4cXdqb3RudXlydm1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQzNTkxNCwiZXhwIjoyMDczMDExOTE0fQ.DZ3bWWcgxx69Aj6EUk2raCCU8ltBgEw1Jc3YVt6UCME"
);

const usuarios = [
  { email: "cowla200@gmail.com", cliente_id: "cliente1" },
  { email: "outro@email.com", cliente_id: "cliente2" }
];

async function atualizar() {
  for (const u of usuarios) {
    // Busca o usuário pelo email
    const { data, error: fetchError } = await supabase.auth.admin.listUsers({
      search: u.email
    });

    if (fetchError) {
      console.error("Erro ao buscar usuário:", u.email, fetchError);
      continue;
    }

    if (!data || !data.users || data.users.length === 0) {
      console.error("Usuário não encontrado:", u.email);
      continue;
    }

    const userId = data.users[0].id;

    // Atualiza o user_metadata
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { cliente_id: u.cliente_id }
    });

    if (updateError) console.error("Erro ao atualizar:", u.email, updateError);
    else console.log("Atualizado:", u.email);
  }
}

atualizar();
