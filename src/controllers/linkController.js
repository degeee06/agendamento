const LinkService = require('../services/linkService');
const PixService = require('../services/pixService');
const Agendamento = require('../models/Agendamento'); // Seu modelo de agendamento

class LinkController {
  static async generatePaymentLink(req, res) {
    try {
      const { agendamento_id } = req.body;

      // Verificar se o agendamento existe e está pendente
      const agendamento = await Agendamento.findById(agendamento_id);
      
      if (!agendamento) {
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }

      if (agendamento.status_pagamento !== 'pendente') {
        return res.status(400).json({ error: 'Agendamento já foi pago ou cancelado' });
      }

      // Gerar link de pagamento
      const paymentLink = await LinkService.generatePaymentLink(agendamento_id);

      res.json({
        success: true,
        payment_url: paymentLink.link,
        expires_at: paymentLink.expira_em,
        agendamento_id: agendamento_id
      });

    } catch (error) {
      console.error('Erro ao gerar link de pagamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async getPaymentPage(req, res) {
    try {
      const { token } = req.params;

      // Validar token
      const isValid = await LinkService.validateLink(token);
      
      if (!isValid) {
        return res.status(404).json({ error: 'Link inválido ou expirado' });
      }

      // Buscar dados do agendamento
      const linkData = await LinkService.getLinkData(token);
      const agendamento = await Agendamento.findById(linkData.agendamento_id);

      if (!agendamento) {
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }

      // Gerar dados PIX
      const pixData = await PixService.generatePaymentForLink(
        agendamento.id,
        agendamento.valor,
        {
          nome: agendamento.cliente_nome,
          documento: agendamento.cliente_documento
        }
      );

      res.json({
        agendamento: {
          id: agendamento.id,
          servico: agendamento.servico,
          valor: agendamento.valor,
          data_agendamento: agendamento.data_agendamento
        },
        pix: pixData,
        token: token
      });

    } catch (error) {
      console.error('Erro ao carregar página de pagamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  static async confirmPayment(req, res) {
    try {
      const { token } = req.body;

      // Validar token
      const isValid = await LinkService.validateLink(token);
      
      if (!isValid) {
        return res.status(400).json({ error: 'Link inválido ou expirado' });
      }

      // Marcar link como utilizado
      await LinkService.markLinkAsUsed(token);

      // Buscar agendamento e atualizar status
      const linkData = await LinkService.getLinkData(token);
      await Agendamento.updatePaymentStatus(linkData.agendamento_id, 'pago');

      res.json({
        success: true,
        message: 'Pagamento confirmado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao confirmar pagamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}

module.exports = LinkController;