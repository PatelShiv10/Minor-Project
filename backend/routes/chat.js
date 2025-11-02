const express = require('express');
const router = express.Router();
const { getConversation, sendMessage, getLawyerConversations, deleteConversations, deleteMessage } = require('../controllers/chatController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/conversation', protect, getConversation);
router.post('/message', protect, sendMessage);
router.get('/conversations', protect, getLawyerConversations);
router.delete('/conversations', protect, deleteConversations);
router.delete('/message/:messageId', protect, deleteMessage);

module.exports = router;