const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Use existing auth middleware pattern (matching other routes in your project)
const { protect } = require('../middlewares/authMiddleware');

// DocumentQA Service URL
const DOCUMENTQA_SERVICE_URL = process.env.DOCUMENTQA_SERVICE_URL || 'http://localhost:8001';

// Configure multer for file uploads (using same pattern as document.js)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/documentqa');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow specific file types for document Q&A
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, TXT, and images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
  fileFilter: fileFilter
});

// Helper function to convert file to base64
const fileToBase64 = (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return fileBuffer.toString('base64');
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
};

// Helper function to call DocumentQA service with proper error handling
const callDocumentQAService = async (endpoint, data, method = 'POST') => {
  try {
    const config = {
      method: method,
      url: `${DOCUMENTQA_SERVICE_URL}${endpoint}`,
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (method === 'POST') {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`DocumentQA Service Error (${endpoint}):`, error.message);

    if (error.code === 'ECONNREFUSED') {
      throw new Error('DocumentQA service is not available. Please ensure it is running on port 8001.');
    }
    if (error.response) {
      const errorMsg = error.response.data?.detail || error.response.data?.message || 'DocumentQA service error';
      throw new Error(errorMsg);
    }
    throw new Error(`Service communication error: ${error.message}`);
  }
};

// @desc Upload document for Q&A
// @route POST /api/documentqa/upload
// @access Private
const uploadDocument = async (req, res) => {
  try {
    // Debug logging
    console.log('Upload request received:', {
      hasFile: !!req.file,
      bodyKeys: Object.keys(req.body || {}),
      contentType: req.headers['content-type']
    });

    // Handle both multipart file upload and base64 JSON upload
    let uploadData;
    
    if (req.file) {
      // Handle multipart file upload
      const filePath = req.file.path;
      
      try {
        // Convert file to base64
        const base64Content = fileToBase64(filePath);

        // Prepare data for DocumentQA service
        uploadData = {
          content: base64Content,
          filename: req.file.originalname,
          content_type: req.file.mimetype
        };

        console.log(`Processing document upload: ${req.file.originalname} (${req.file.size} bytes)`);

      } finally {
        // Clean up uploaded file
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupError) {
          console.warn('Failed to cleanup uploaded file:', cleanupError.message);
        }
      }
    } else if (req.body && req.body.content && req.body.filename) {
      // Handle base64 JSON upload (from frontend)
      uploadData = {
        content: req.body.content,
        filename: req.body.filename,
        content_type: req.body.content_type || 'application/pdf'
      };

      console.log(`Processing document upload: ${req.body.filename} (base64 format)`);
    } else {
      console.log('Upload failed - missing data:', {
        hasBody: !!req.body,
        hasContent: !!(req.body && req.body.content),
        hasFilename: !!(req.body && req.body.filename),
        bodyContent: req.body
      });
      
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please provide either a file upload or base64 content.'
      });
    }

    // Try to call DocumentQA service, but provide fallback if not available
    try {
      const result = await callDocumentQAService('/upload', uploadData);

      // Add user context
      if (result.success) {
        result.userId = req.user.id;
        result.uploadedBy = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
      }

      res.json({
        success: true,
        message: 'Document uploaded and processed successfully',
        document_id: result.document_id || result.id,
        data: result
      });
    } catch (serviceError) {
      // Fallback: return success without AI processing if service is unavailable
      console.warn('DocumentQA service unavailable, using fallback:', serviceError.message);
      
      const fallbackDocumentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      res.json({
        success: true,
        message: 'Document uploaded successfully. AI processing is currently unavailable.',
        document_id: fallbackDocumentId,
        data: {
          document_id: fallbackDocumentId,
          filename: uploadData.filename,
          status: 'uploaded',
          ai_processing: false,
          message: 'Document uploaded but AI analysis is temporarily unavailable'
        }
      });
    }

  } catch (error) {
    console.error('Error uploading document:', error);
    
    // Provide more specific error messages
    let errorMessage = error.message || 'Failed to upload document';
    let statusCode = 500;
    
    if (error.message.includes('DocumentQA service is not available')) {
      statusCode = 503;
      errorMessage = 'Document processing service is currently unavailable. Please try again later or contact support.';
    } else if (error.message.includes('ECONNREFUSED')) {
      statusCode = 503;
      errorMessage = 'Document processing service is not running. Please contact support.';
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage
    });
  }
};

// @desc Ask question about document
// @route POST /api/documentqa/question
// @access Private
const askQuestion = async (req, res) => {
  try {
    const { question, document_id, context } = req.body;

    // Validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    if (!document_id) {
      return res.status(400).json({
        success: false,
        message: 'Document ID is required'
      });
    }

    if (question.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Question too long (maximum 500 characters)'
      });
    }

    // Prepare data for DocumentQA service
    const questionData = {
      question: question.trim(),
      document_id,
      context: context || ''
    };

    console.log(`Processing question for document: ${document_id}`);

    // Call DocumentQA service
    const result = await callDocumentQAService('/question', questionData);

    // Add user context
    if (result.success) {
      result.askedBy = req.user.id;
      result.timestamp = new Date().toISOString();
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process question'
    });
  }
};

// @desc Analyze document
// @route POST /api/documentqa/analyze
// @access Private
const analyzeDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded for analysis'
      });
    }

    const { analysis_type = 'summary' } = req.body;
    const filePath = req.file.path;

    // Validate analysis type
    const validTypes = ['summary', 'key_points', 'legal_issues'];
    if (!validTypes.includes(analysis_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid analysis type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    try {
      // Convert file to base64
      const base64Content = fileToBase64(filePath);

      // Prepare data for DocumentQA service
      const analysisData = {
        content: base64Content,
        filename: req.file.originalname,
        content_type: req.file.mimetype,
        analysis_type: analysis_type
      };

      console.log(`Analyzing document: ${req.file.originalname} (type: ${analysis_type})`);

      // Call DocumentQA service
      const result = await callDocumentQAService('/analyze', analysisData);

      // Add user context
      if (result.success) {
        result.analyzedBy = req.user.id;
        result.timestamp = new Date().toISOString();
      }

      res.json({
        success: true,
        message: 'Document analyzed successfully',
        data: result
      });

    } finally {
      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup uploaded file:', cleanupError.message);
      }
    }

  } catch (error) {
    console.error('Error analyzing document:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze document'
    });
  }
};

// @desc Get list of documents
// @route GET /api/documentqa/documents
// @access Private
const getDocuments = async (req, res) => {
  try {
    console.log(`Fetching documents for user: ${req.user.id}`);

    // Call DocumentQA service
    const result = await callDocumentQAService('/documents', {}, 'GET');

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents'
    });
  }
};

// @desc Delete document
// @route DELETE /api/documentqa/documents/:documentId
// @access Private
const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        message: 'Document ID is required'
      });
    }

    console.log(`Deleting document: ${documentId} for user: ${req.user.id}`);

    // Call DocumentQA service
    const response = await axios.delete(`${DOCUMENTQA_SERVICE_URL}/documents/${documentId}`, {
      timeout: 30000
    });

    const result = response.data;

    res.json({
      success: true,
      message: result.message || 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);

    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
};

// @desc Check DocumentQA service health
// @route GET /api/documentqa/health
// @access Public (no auth required for health check)
const checkHealth = async (req, res) => {
  try {
    const response = await axios.get(`${DOCUMENTQA_SERVICE_URL}/health`, {
      timeout: 5000
    });

    res.json({
      success: true,
      service: 'DocumentQA Backend Integration',
      ai_service: response.data
    });

  } catch (error) {
    console.error('DocumentQA service health check failed:', error.message);
    res.status(503).json({
      success: false,
      message: 'DocumentQA service unavailable',
      error: error.message,
      service_url: DOCUMENTQA_SERVICE_URL
    });
  }
};

// Error handling middleware for multer errors
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 15MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    });
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next(error);
};

// Routes - Using same auth pattern as other routes in your project
router.get('/health', checkHealth); // Public health check
router.post('/upload', protect, uploadDocument);
router.post('/question', protect, askQuestion);
router.post('/analyze', protect, upload.single('document'), handleMulterError, analyzeDocument);
router.get('/documents', protect, getDocuments);
router.delete('/documents/:documentId', protect, deleteDocument);

module.exports = router;
