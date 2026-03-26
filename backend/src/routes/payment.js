import express from 'express';
import {
	  getClientPayments,
	  initiatePayment,
	  getAllPayments,
	  getRecentPayments,
	  getMyDue,
	  getCompanyPaymentsSummary,
	  approvePayment,
	  declinePayment
	} from '../controllers/paymentController.js';
import { authenticateToken, requireCompany } from '../middleware/auth.js';

const router = express.Router();

// Client routes
router.get('/history', authenticateToken, getClientPayments);
router.get('/due', authenticateToken, getMyDue);
router.post('/initiate', authenticateToken, initiatePayment);

// Admin routes (assuming authenticateToken is sufficient, add admin check if needed)
router.get('/all', authenticateToken, getAllPayments);
router.get('/recent', authenticateToken, getRecentPayments);

// Company routes
router.get('/company/summary', authenticateToken, requireCompany, getCompanyPaymentsSummary);
router.patch('/:id/approve', authenticateToken, requireCompany, approvePayment);
router.patch('/:id/decline', authenticateToken, requireCompany, declinePayment);

export default router;
