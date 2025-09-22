// Seu serviço existente de PIX - adaptado para trabalhar com links
const { gerarCobrancaPIX, gerarQRCode } = require('./yourExistingPixService');

class PixService {
  static async generatePaymentForLink(agendamento_id, valor, infoCliente) {
    try {
      // Gerar cobrança PIX
      const cobranca = await gerarCobrancaPIX(valor, infoCliente);
      
      // Gerar QR Code
      const qrCode = await gerarQRCode(cobranca.copia_cola);
      
      return {
        qr_code: qrCode,
        pix_copia_cola: cobranca.copia_cola,
        valor: valor,
        expiracao: 3600 // 1 hora em segundos
      };
    } catch (error) {
      throw new Error(`Erro ao gerar pagamento PIX: ${error.message}`);
    }
  }
}

module.exports = PixService;