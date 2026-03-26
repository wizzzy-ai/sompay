import express from 'express';
import {
  getDashboardStats,
  getRecentActivities,
  getAllClients,
  updateClientStatus,
	  getAllUsers,
	  removeUserFromCompany,
	  getUserMonthlyDue,
	  setUserMonthlyDue,
	  addUserMonthlyDueAdjustment,
	  getCompanyMonthlyDues,
	  getCompanyJoinRequests,
  approveCompanyJoinRequest,
	rejectCompanyJoinRequest
} from '../controllers/adminController.js';
import { authenticateToken, requireCompany } from '../middleware/auth.js';
import Company from '../models/Company.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireCompany);

// Company dashboard
router.get('/dashboard-stats', getDashboardStats);
router.get('/recent-activities', getRecentActivities);

// Clients
router.get('/clients', getAllClients);
router.put('/clients/:clientId/status', updateClientStatus);

	// Users (assigned to this company)
	router.get('/users', getAllUsers);
	router.delete('/users/:userId', removeUserFromCompany);
	router.get('/users/:userId/monthly-due', getUserMonthlyDue);
	router.post('/users/:userId/monthly-due', setUserMonthlyDue);
	router.post('/users/:userId/monthly-due/adjustments', addUserMonthlyDueAdjustment);
	router.get('/monthly-dues', getCompanyMonthlyDues);

// Join requests
router.get('/join-requests', getCompanyJoinRequests);
router.post('/join-requests/:requestId/approve', approveCompanyJoinRequest);
router.post('/join-requests/:requestId/reject', rejectCompanyJoinRequest);

// Company profile (logo)
router.get('/me', async (req, res) => {
  try {
    const company = await Company.findById(req.user.id).select('name email phone address logoUrl createdAt updatedAt');
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json({
      company: {
        id: company._id,
        name: company.name,
        email: company.email,
        phone: company.phone || '',
        address: company.address || '',
        logoUrl: company.logoUrl || null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

router.put('/me/logo', async (req, res) => {
  try {
    const raw = req.body?.logoUrl ?? req.body?.logoDataUrl ?? null;
    const logoUrl = raw == null ? null : String(raw).trim();

    if (logoUrl && logoUrl.length > 350_000) {
      return res.status(413).json({ error: 'Logo image is too large. Please upload a smaller image.' });
    }

    if (logoUrl && !logoUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid logo format. Please upload an image file.' });
    }

    const company = await Company.findById(req.user.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    company.logoUrl = logoUrl || null;
    await company.save();

    res.json({
      message: 'Company logo updated',
      logoUrl: company.logoUrl || null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update company logo' });
  }
});

export default router;
