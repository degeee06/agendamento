const ConfirmacaoLink = require('../models/ConfirmacaoLink');
const { generateToken } = require('../utils/generateToken');

class LinkService {
  static async generatePaymentLink(agendamento_id, expirationHours = 24) {
    // Limpar links expirados
    await ConfirmacaoLink.deleteExpiredLinks();

    const token = generateToken();
    const expira_em = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const link = await ConfirmacaoLink.create({
      agendamento_id,
      token,
      expira_em: expira_em.toISOString()
    });

    const paymentUrl = `${process.env.FRONTEND_URL}/pagamento/${token}`;
    
    return {
      link: paymentUrl,
      expira_em,
      token
    };
  }

  static async validateLink(token) {
    return await ConfirmacaoLink.isValid(token);
  }

  static async getLinkData(token) {
    const link = await ConfirmacaoLink.findByToken(token);
    
    if (!link || link.utilizado || new Date(link.expira_em) < new Date()) {
      return null;
    }

    return link;
  }

  static async markLinkAsUsed(token) {
    return await ConfirmacaoLink.markAsUsed(token);
  }
}

module.exports = LinkService;