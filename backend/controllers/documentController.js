const Document = require('../models/Document');
const User = require('../models/User');
const LawyerClient = require('../models/LawyerClient');
const fs = require('fs').promises;
const path = require('path');
const { validationResult } = require('express-validator');

// @desc Upload a new document
// @route POST /api/documents/upload
// @access Private/Lawyer
const uploadDocument = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { 
      clientId, 
      title, 
      description, 
      documentType = 'other',
      tags = []
    } = req.body;

    const lawyerId = req.user.id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID is required'
      });
    }

    // Verify client relationship exists
    let clientRelationship;
    let actualClientId;
    
    try {
      clientRelationship = await LawyerClient.findOne({
        lawyerId,
        _id: clientId,
        status: { $in: ['active', 'pending'] }
      });
      
      if (clientRelationship) {
        actualClientId = clientRelationship.clientId;
      } else {
        clientRelationship = await LawyerClient.findOne({
          lawyerId,
          clientId: clientId,
          status: { $in: ['active', 'pending'] }
        });
        
        if (clientRelationship) {
          actualClientId = clientId;
        }
      }
      
      if (!clientRelationship) {
        return res.status(404).json({
          success: false,
          message: 'Client relationship not found. Please add this client to your client list first.'
        });
      }
    } catch (error) {
      console.error('Error verifying client relationship:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while verifying client relationship'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { originalname, filename, path: filePath, size, mimetype } = req.file;

    const document = await Document.create({
      lawyerId,
      clientId: actualClientId,
      clientRelationshipId: clientRelationship._id,
      title,
      description,
      fileName: filename,
      originalFileName: originalname,
      filePath,
      fileSize: size,
      mimeType: mimetype,
      documentType,
      tags,
      isPublic: false,
      uploadedBy: lawyerId
    });

    await document.populate('clientId', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document'
    });
  }
};

// @desc Get all documents for a lawyer
// @route GET /api/documents/lawyer
// @access Private/Lawyer
const getLawyerDocuments = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      documentType, 
      clientId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { lawyerId };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (documentType && documentType !== 'all') {
      query.documentType = documentType;
    }

    if (clientId && clientId !== 'all') {
      try {
        const clientRelationship = await LawyerClient.findOne({
          lawyerId,
          _id: clientId
        });
        
        if (clientRelationship) {
          query.clientRelationshipId = clientId;
        } else {
          query.clientId = clientId;
        }
      } catch (error) {
        query.clientId = clientId;
      }
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { originalFileName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const documents = await Document.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('clientId', 'firstName lastName email')
      .populate('uploadedBy', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .lean();

    const total = await Document.countDocuments(query);
    const stats = await Document.getLawyerDocumentStats(lawyerId);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          hasNext: skip + documents.length < total,
          hasPrev: parseInt(page) > 1
        },
        stats
      }
    });

  } catch (error) {
    console.error('Error fetching lawyer documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents'
    });
  }
};

// @desc Get documents for a specific client
// @route GET /api/documents/client/:clientId
// @access Private/Lawyer
const getClientDocuments = async (req, res) => {
  try {
    const { clientId } = req.params;
    const lawyerId = req.user.id;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      documentType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    let clientRelationship;
    let actualClientId;
    
    try {
      clientRelationship = await LawyerClient.findOne({
        lawyerId,
        _id: clientId,
        status: { $in: ['active', 'pending'] }
      });
      
      if (clientRelationship) {
        actualClientId = clientRelationship.clientId;
      } else {
        clientRelationship = await LawyerClient.findOne({
          lawyerId,
          clientId: clientId,
          status: { $in: ['active', 'pending'] }
        });
        
        if (clientRelationship) {
          actualClientId = clientId;
        }
      }
      
      if (!clientRelationship) {
        return res.status(404).json({
          success: false,
          message: 'Client relationship not found. Please add this client to your client list first.'
        });
      }
    } catch (error) {
      console.error('Error verifying client relationship:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while verifying client relationship'
      });
    }

    // Build query using the resolved actual client user ID, but also include
    // documents that may have been indexed by relationship ID in older uploads
    const query = { 
      lawyerId, 
      $or: [
        { clientId: actualClientId },
        { clientRelationshipId: clientRelationship._id }
      ]
    };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (documentType && documentType !== 'all') {
      query.documentType = documentType;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { originalFileName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const documents = await Document.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('clientId', 'firstName lastName email')
      .populate('uploadedBy', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .lean();

    const total = await Document.countDocuments(query);
    const stats = await Document.getClientDocumentStats(lawyerId, actualClientId);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          hasNext: skip + documents.length < total,
          hasPrev: parseInt(page) > 1
        },
        stats,
        clientInfo: {
          relationshipStatus: clientRelationship.status,
          caseType: clientRelationship.caseType,
          caseTitle: clientRelationship.caseTitle
        }
      }
    });

  } catch (error) {
    console.error('Error fetching client documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client documents'
    });
  }
};

// @desc Get document by ID
// @route GET /api/documents/:id
// @access Private/Lawyer
const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const lawyerId = req.user.id;

    const document = await Document.findOne({ _id: id, lawyerId })
      .populate('clientId', 'firstName lastName email')
      .populate('uploadedBy', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    document.lastAccessed = new Date();
    await document.save();

    res.json({
      success: true,
      data: document
    });

  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document'
    });
  }
};

// @desc Update document
// @route PUT /api/documents/:id
// @access Private/Lawyer
const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const lawyerId = req.user.id;
    const { 
      title, 
      description, 
      documentType, 
      status, 
      tags, 
      reviewNotes 
    } = req.body;

    const document = await Document.findOne({ _id: id, lawyerId });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (title !== undefined) document.title = title;
    if (description !== undefined) document.description = description;
    if (documentType !== undefined) document.documentType = documentType;
    if (tags !== undefined) document.tags = tags;

    if (status !== undefined && status !== document.status) {
      document.status = status;
      if (['reviewed', 'approved', 'rejected'].includes(status)) {
        document.reviewedBy = lawyerId;
        document.reviewedAt = new Date();
        if (reviewNotes) {
          document.reviewNotes = reviewNotes;
        }
      }
    }

    await document.save();

    await document.populate('clientId', 'firstName lastName email');
    await document.populate('uploadedBy', 'firstName lastName');
    await document.populate('reviewedBy', 'firstName lastName');

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: document
    });

  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document'
    });
  }
};

// @desc Delete document
// @route DELETE /api/documents/:id
// @access Private/Lawyer
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const lawyerId = req.user.id;

    const document = await Document.findOne({ _id: id, lawyerId });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    try {
      await fs.unlink(document.filePath);
    } catch (fileError) {
      console.error('Error deleting file:', fileError);
    }

    await Document.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document'
    });
  }
};

// @desc Download document
// @route GET /api/documents/:id/download
// @access Private/Lawyer
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const lawyerId = req.user.id;

    const document = await Document.findOne({ _id: id, lawyerId });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    try {
      await fs.access(document.filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    document.downloadCount += 1;
    document.lastAccessed = new Date();
    await document.save();

    res.download(document.filePath, document.originalFileName);

  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document'
    });
  }
};

// @desc Get document statistics
// @route GET /api/documents/stats
// @access Private/Lawyer
const getDocumentStats = async (req, res) => {
  try {
    const lawyerId = req.user.id;
    const { clientId } = req.query;

    let stats;
    if (clientId) {
      stats = await Document.getClientDocumentStats(lawyerId, clientId);
    } else {
      stats = await Document.getLawyerDocumentStats(lawyerId);
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document statistics'
    });
  }
};

module.exports = {
  uploadDocument,
  getLawyerDocuments,
  getClientDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  downloadDocument,
  getDocumentStats
};
