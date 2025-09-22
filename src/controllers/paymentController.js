const express = require('express');
const router = express.Router();
const LinkController = require('../controllers/linkController');

// Gerar link de pagamento
router.post('/gerar-link', LinkController.generatePaymentLink);

// Página de pagamento (para o frontend acessar)
router.get('/pagamento/:token', LinkController.getPaymentPage);

// Confirmar pagamento
router.post('/confirmar-pagamento', LinkController.confirmPayment);

module.exports = router;