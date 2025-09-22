const supabase = require('../config/supabase');

class ConfirmacaoLink {
  static async create({ agendamento_id, token, expira_em }) {
    const { data, error } = await supabase
      .from('confirmacao_links')
      .insert([
        {
          agendamento_id,
          token,
          expira_em,
          utilizado: false
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async findByToken(token) {
    const { data, error } = await supabase
      .from('confirmacao_links')
      .select('*')
      .eq('token', token)
      .single();

    if (error) return null;
    return data;
  }

  static async markAsUsed(token) {
    const { data, error } = await supabase
      .from('confirmacao_links')
      .update({ 
        utilizado: true,
        updated_at: new Date().toISOString()
      })
      .eq('token', token)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async isValid(token) {
    const link = await this.findByToken(token);
    
    if (!link) return false;
    if (link.utilizado) return false;
    if (new Date(link.expira_em) < new Date()) return false;
    
    return true;
  }

  static async deleteExpiredLinks() {
    const { error } = await supabase
      .from('confirmacao_links')
      .delete()
      .lt('expira_em', new Date().toISOString());

    if (error) console.error('Erro ao deletar links expirados:', error);
  }
}

module.exports = ConfirmacaoLink;