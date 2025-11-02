const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');

exports.getConversation = async (req, res) => {
  try {
    const { lawyerId, userId } = req.query;
    if (!lawyerId || !userId) {
      return res.status(400).json({ success: false, message: 'lawyerId and userId are required' });
    }

    const isLawyerValid = await User.findById(lawyerId).select('role');
    if (!isLawyerValid || isLawyerValid.role !== 'lawyer') {
      return res.status(404).json({ success: false, message: 'Lawyer not found' });
    }

    const reqUser = req.user; // may be undefined if public; require auth for privacy
    if (!reqUser) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const isRequesterLawyer = reqUser.role === 'lawyer';
    if (isRequesterLawyer && reqUser.id !== lawyerId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!isRequesterLawyer && reqUser.id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Mark user's messages as read when lawyer fetches the conversation
    if (reqUser.role === 'lawyer' && reqUser.id === lawyerId) {
      await Message.updateMany({ lawyerId, userId, sender: 'user', readAt: { $exists: false } }, { $set: { readAt: new Date() } });
    }

    const messages = await Message.find({ lawyerId, userId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversation' });
  }
};
exports.deleteConversations = async (req, res) => {
  try {
    // Check if user is a lawyer
    if (!req.user || req.user.role !== 'lawyer') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    const lawyerId = req.user.id;
    const { userIds } = req.body;
    
    // Validate userIds
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide at least one valid userId to delete' 
      });
    }
    
    // Convert userIds to ObjectId
    const userObjectIds = userIds.map(id => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch (e) {
        return null;
      }
    }).filter(id => id !== null);
    
    if (userObjectIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid userIds provided' 
      });
    }
    
    // Delete all messages between the lawyer and the specified users
    const result = await Message.deleteMany({
      lawyerId: lawyerId,
      userId: { $in: userObjectIds }
    });
    
    res.json({ 
      success: true, 
      message: `Successfully deleted ${result.deletedCount} messages from ${userObjectIds.length} conversations`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting conversations:', error);
    res.status(500).json({ success: false, message: 'Failed to delete conversations' });
  }
};

// Using exports directly, no need for module.exports at the end


exports.sendMessage = async (req, res) => {
  try {
    const { lawyerId, userId, text } = req.body;
    if (!lawyerId || !userId || !text) {
      return res.status(400).json({ success: false, message: 'lawyerId, userId and text are required' });
    }

    const reqUser = req.user;
    if (!reqUser) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const lawyer = await User.findById(lawyerId).select('role');
    if (!lawyer || lawyer.role !== 'lawyer') {
      return res.status(404).json({ success: false, message: 'Lawyer not found' });
    }

    let sender;
    if (reqUser.role === 'lawyer' && reqUser.id === lawyerId) sender = 'lawyer';
    else if (reqUser.role === 'user' && reqUser.id === userId) sender = 'user';
    else return res.status(403).json({ success: false, message: 'Forbidden' });

    const msg = await Message.create({ lawyerId, userId, sender, text });

    // Simple notification: when a user sends a message, mark a new notification for the lawyer (in-memory flag)
    try {
      if (sender === 'user') {
        await User.findByIdAndUpdate(lawyerId, { $set: { __hasNewMessages: true } });
      }
    } catch {}

    res.status(201).json({ success: true, data: msg });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

exports.getLawyerConversations = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'lawyer') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const lawyerId = req.user.id;

    const pipeline = [
      { $match: { lawyerId: new mongoose.Types.ObjectId(lawyerId) } },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: '$userId',
          lastMessage: { $first: '$text' },
          lastTime: { $first: '$createdAt' },
          unread: { $sum: { $cond: [{ $and: [ { $eq: ['$sender', 'user'] }, { $or: [ { $eq: ['$readAt', null] }, { $not: ['$readAt'] } ] } ] }, 1, 0] } }
        }
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: {
          userId: '$_id',
          _id: 0,
          name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          lastMessage: 1,
          lastTime: 1,
          unread: 1
        }
      },
      { $sort: { lastTime: -1 } }
    ];

    const list = await Message.aggregate(pipeline);
    res.json({ success: true, data: list });
  } catch (e) {
    console.error('Error fetching conversations:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const { messageId } = req.params;

    if (!messageId || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid messageId to delete' });
    }

    // Determine ownership scope based on role
    let ownershipFilter;
    if (req.user.role === 'lawyer') {
      ownershipFilter = { lawyerId: req.user.id };
    } else if (req.user.role === 'user') {
      ownershipFilter = { userId: req.user.id };
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const message = await Message.findOne({ _id: messageId, ...ownershipFilter });
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found or you do not have permission to delete it' });
    }

    const result = await Message.deleteOne({ _id: messageId });
    if (result.deletedCount === 0) {
      return res.status(500).json({ success: false, message: 'Failed to delete message' });
    }

    return res.status(200).json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete message' });
  }
};