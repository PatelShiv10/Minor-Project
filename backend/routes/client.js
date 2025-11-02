const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const {
  getLawyerClients,
  addClient,
  getClientDetails,
  updateClient,
  markClientComplete,
  deleteClient,
  archiveClient,
  addClientNote,
  getClientStats
} = require('../controllers/clientController');

const { protect, lawyer } = require('../middlewares/authMiddleware');

// Validation helpers
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order')
];

const validateAddClient = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').isLength({ min: 10, max: 15 }).withMessage('Phone must be 10-15 digits'),
  body('hourlyRate').optional().isFloat({ min: 0 }).withMessage('Hourly rate must be >= 0'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority')
];

const validateId = [
  param('id').isMongoId().withMessage('Invalid ID')
];

// List clients for current lawyer
router.get('/lawyer', protect, lawyer, validatePagination, getLawyerClients);

// Stats for current lawyer
router.get('/lawyer/stats', protect, lawyer, getClientStats);

// Add a client manually
router.post('/lawyer/add', protect, lawyer, validateAddClient, addClient);

// Client detail and updates
router.get('/:id', protect, lawyer, validateId, getClientDetails);
router.put('/:id', protect, lawyer, validateId, updateClient);
router.put('/:id/complete', protect, lawyer, validateId, markClientComplete);
router.put('/:id/archive', protect, lawyer, validateId, archiveClient);
router.post('/:id/notes', protect, lawyer, [ ...validateId, body('note').isLength({ min: 1 }).withMessage('Note is required') ], addClientNote);

// Delete relationship
router.delete('/:id', protect, lawyer, validateId, deleteClient);

module.exports = router;