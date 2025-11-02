import os
import json
import base64
import logging
import threading
from datetime import datetime
from typing import Optional, Dict, Any, List
from io import BytesIO
import tempfile

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# External libs
import requests
from bs4 import BeautifulSoup

# For document processing

import PyPDF2
import docx
from PIL import Image
import pytesseract
# except ImportError:
#     print("Warning: Some document processing libraries not installed")
    # PyPDF2 = None
    # docx = None
    # Image = None
    # pytesseract = None

try:
    import google.generativeai as genai
except Exception:
    genai = None

# Load environment
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DocumentQA API", version="1.0.0")

# FIXED: Proper CORS configuration for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative React dev port
        "http://localhost:5000",  # Your backend port
        "https://lovable.dev",    # Your deployment platform
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini (same as LawSimplify.py)
GENERATION_CONFIG = {"response_mime_type": "application/json"}
MODEL_NAME = "gemini-2.5-pro"

if GOOGLE_API_KEY and genai:
    genai.configure(api_key=GOOGLE_API_KEY)
    gemini_model = genai.GenerativeModel(model_name=MODEL_NAME, generation_config=GENERATION_CONFIG)
    logger.info("Gemini AI model configured successfully")
else:
    gemini_model = None
    logger.warning("Gemini AI model not configured - set GOOGLE_API_KEY")


class DocumentUploadRequest(BaseModel):
    content: str = Field(..., description="Base64 encoded document content")
    filename: str = Field(..., description="Original filename")
    content_type: str = Field(..., description="MIME type of the document")


class QuestionRequest(BaseModel):
    question: str = Field(..., description="Question about the document")
    document_id: str = Field(..., description="Document identifier")
    context: Optional[str] = Field(None, description="Additional context")


class DocumentAnalysisRequest(BaseModel):
    content: str = Field(..., description="Base64 encoded document content")
    filename: str = Field(..., description="Original filename")
    content_type: str = Field(..., description="MIME type")
    analysis_type: str = Field(default="summary", description="Type of analysis: summary, key_points, legal_issues")


# FIXED: Thread-safe document storage with locking
class ThreadSafeDocumentStore:
    def __init__(self):
        self._store = {}
        self._lock = threading.RLock()

    def store_document(self, doc_id: str, doc_data: dict):
        with self._lock:
            self._store[doc_id] = doc_data

    def get_document(self, doc_id: str):
        with self._lock:
            return self._store.get(doc_id)

    def delete_document(self, doc_id: str):
        with self._lock:
            return self._store.pop(doc_id, None)

    def list_documents(self):
        with self._lock:
            return dict(self._store)

document_store = ThreadSafeDocumentStore()


def validate_file_input(filename: str, content_type: str, content_size: int = None):
    """Validate file input parameters"""
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Filename is required")

    if not content_type or not content_type.strip():
        raise HTTPException(status_code=400, detail="Content type is required")

    # Validate file extension
    allowed_extensions = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif']
    if not any(filename.lower().endswith(ext) for ext in allowed_extensions):
        raise HTTPException(status_code=400, detail=f"Unsupported file extension. Allowed: {allowed_extensions}")

    # Validate content type
    allowed_types = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif'
    ]

    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")


def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    if not PyPDF2:
        raise HTTPException(status_code=500, detail="PDF processing not available. Install PyPDF2.")

    try:
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
    except Exception as e:
        logger.error(f"PDF extraction error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error reading PDF: {str(e)}")


def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file"""
    if not docx:
        raise HTTPException(status_code=500, detail="DOCX processing not available. Install python-docx.")

    try:
        doc = docx.Document(file_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"DOCX extraction error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error reading DOCX: {str(e)}")


def extract_text_from_image(file_path: str) -> str:
    """Extract text from image using OCR"""
    if not pytesseract or not Image:
        raise HTTPException(status_code=500, detail="OCR processing not available. Install pytesseract and Pillow.")

    try:
        image = Image.open(file_path)
        text = pytesseract.image_to_string(image)
        return text.strip()
    except Exception as e:
        logger.error(f"OCR extraction error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Error processing image: {str(e)}")


def extract_text_from_document(content: str, filename: str, content_type: str) -> str:
    """Extract text from various document types"""
    # Validate inputs
    validate_file_input(filename, content_type)

    # Decode base64 content
    try:
        file_data = base64.b64decode(content)
        if len(file_data) == 0:
            raise HTTPException(status_code=400, detail="Empty file content")
    except Exception as e:
        logger.error(f"Base64 decode error: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid base64 content")

    # Validate file size (15MB limit)
    max_size = 15 * 1024 * 1024  # 15MB
    if len(file_data) > max_size:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is {max_size / (1024*1024)}MB")

    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
        temp_file.write(file_data)
        temp_file_path = temp_file.name

    try:
        if content_type == "application/pdf":
            return extract_text_from_pdf(temp_file_path)
        elif content_type in ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"]:
            return extract_text_from_docx(temp_file_path)
        elif content_type.startswith("image/"):
            return extract_text_from_image(temp_file_path)
        elif content_type == "text/plain":
            return file_data.decode('utf-8', errors='replace')
        else:
            # Try to decode as text
            try:
                return file_data.decode('utf-8', errors='replace')
            except:
                raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_file_path)
        except:
            pass


@app.get("/health")
async def health():
    """Health check endpoint matching your existing pattern"""
    return {
        "status": "ok", 
        "service": "DocumentQA",
        "gemini": bool(gemini_model),
        "pdf_support": bool(PyPDF2),
        "docx_support": bool(docx),
        "ocr_support": bool(pytesseract and Image),
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/upload")
async def upload_document(request: DocumentUploadRequest):
    """Upload and process a document for Q&A"""
    if not gemini_model:
        raise HTTPException(status_code=500, detail="AI model not configured. Set GOOGLE_API_KEY.")

    try:
        logger.info(f"Processing document upload: {request.filename}")

        # Extract text from document
        text_content = extract_text_from_document(
            request.content, 
            request.filename, 
            request.content_type
        )

        if not text_content.strip():
            raise HTTPException(status_code=400, detail="No text content found in document")

        # Generate document ID (more robust)
        timestamp = datetime.utcnow().isoformat()
        document_id = f"doc_{hash(request.filename + timestamp) % 100000}"

        # Store document
        doc_data = {
            "filename": request.filename,
            "content_type": request.content_type,
            "text_content": text_content,
            "uploaded_at": timestamp,
            "word_count": len(text_content.split()),
            "char_count": len(text_content)
        }

        # Generate initial summary
        summary_prompt = f"""
        You are a legal document analyst. Analyze the following document and provide a JSON response with these keys:
        - "document_type": Type of document (contract, legal brief, agreement, etc.)
        - "summary": Brief summary of the document (max 200 words)
        - "key_topics": Array of main topics/subjects covered
        - "entities": Array of important entities mentioned (people, companies, dates)
        - "language_complexity": "simple", "moderate", or "complex"

        Document content:
        ---
        {text_content[:3000]}
        ---
        """

        try:
            response = gemini_model.generate_content(summary_prompt)
            analysis = json.loads(response.text)
            doc_data["analysis"] = analysis
            logger.info(f"Document analysis completed for: {request.filename}")
        except json.JSONDecodeError:
            logger.warning("AI response was not valid JSON, using fallback")
            doc_data["analysis"] = {
                "document_type": "unknown",
                "summary": "Document uploaded successfully. You can now ask questions about it.",
                "key_topics": [],
                "entities": [],
                "language_complexity": "moderate"
            }
        except Exception as e:
            logger.error(f"AI analysis failed: {str(e)}")
            doc_data["analysis"] = {
                "document_type": "unknown",
                "summary": "Document uploaded but analysis failed. You can still ask questions about it.",
                "key_topics": [],
                "entities": [],
                "language_complexity": "moderate"
            }

        # Store document
        document_store.store_document(document_id, doc_data)

        return {
            "success": True,
            "document_id": document_id,
            "filename": request.filename,
            "word_count": doc_data["word_count"],
            "char_count": doc_data["char_count"],
            "analysis": doc_data["analysis"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")


@app.post("/question")
async def ask_question(request: QuestionRequest):
    """Ask a question about an uploaded document"""
    if not gemini_model:
        raise HTTPException(status_code=500, detail="AI model not configured.")

    document = document_store.get_document(request.document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    text_content = document["text_content"]
    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    if len(question) > 500:
        raise HTTPException(status_code=400, detail="Question too long (max 500 characters)")

    try:
        logger.info(f"Processing question for document: {document['filename']}")

        prompt = f"""
        You are an expert legal document analyst. Answer the user's question based on the provided document content.
        Provide a JSON response with these keys:
        - "answer": Your detailed answer to the question
        - "confidence": "high", "medium", or "low" based on how certain you are
        - "relevant_sections": Array of relevant text snippets from the document (max 3)
        - "follow_up_questions": Array of 2-3 suggested follow-up questions

        If the question cannot be answered from the document content, explain what information is missing.

        Document: {document["filename"]}
        Question: {question}

        Document Content:
        ---
        {text_content}
        ---
        """

        response = gemini_model.generate_content(prompt)
        result = json.loads(response.text)

        return {
            "success": True,
            "question": question,
            "document_id": request.document_id,
            "document_name": document["filename"],
            **result
        }

    except json.JSONDecodeError:
        logger.warning("AI response was not valid JSON, using fallback")
        return {
            "success": True,
            "question": question,
            "document_id": request.document_id,
            "document_name": document["filename"],
            "answer": "I processed your question but had difficulty formatting the response. Please try rephrasing your question.",
            "confidence": "low",
            "relevant_sections": [],
            "follow_up_questions": []
        }
    except Exception as e:
        logger.error(f"Question processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/analyze")
async def analyze_document(request: DocumentAnalysisRequest):
    """Perform detailed analysis of a document"""
    if not gemini_model:
        raise HTTPException(status_code=500, detail="AI model not configured.")

    try:
        logger.info(f"Analyzing document: {request.filename}")

        # Extract text from document
        text_content = extract_text_from_document(
            request.content, 
            request.filename, 
            request.content_type
        )

        analysis_type = request.analysis_type.lower()

        if analysis_type == "summary":
            prompt = f"""
            Provide a comprehensive summary of this document in JSON format:
            - "executive_summary": Main points in 2-3 sentences
            - "detailed_summary": Comprehensive summary (300-500 words)
            - "key_sections": Array of important sections with titles and brief descriptions

            Document: {text_content}
            """
        elif analysis_type == "key_points":
            prompt = f"""
            Extract and organize key points from this document in JSON format:
            - "main_points": Array of the most important points (max 10)
            - "supporting_details": Object with main points as keys and supporting details as values
            - "action_items": Array of any action items or next steps mentioned

            Document: {text_content}
            """
        elif analysis_type == "legal_issues":
            prompt = f"""
            Identify legal issues and concerns in this document in JSON format:
            - "legal_issues": Array of potential legal issues or concerns
            - "risk_assessment": Overall risk level ("low", "medium", "high") with explanation
            - "recommendations": Array of recommended actions or considerations
            - "clauses_of_concern": Array of specific clauses that need attention

            Document: {text_content}
            """
        else:
            raise HTTPException(status_code=400, detail="Invalid analysis type. Use: summary, key_points, or legal_issues")

        response = gemini_model.generate_content(prompt)
        result = json.loads(response.text)

        return {
            "success": True,
            "filename": request.filename,
            "analysis_type": analysis_type,
            "word_count": len(text_content.split()),
            **result
        }

    except HTTPException:
        raise
    except json.JSONDecodeError:
        logger.warning("AI response was not valid JSON")
        raise HTTPException(status_code=500, detail="AI analysis returned invalid format")
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@app.get("/documents")
async def list_documents():
    """List all uploaded documents"""
    try:
        documents = []
        for doc_id, doc_data in document_store.list_documents().items():
            documents.append({
                "document_id": doc_id,
                "filename": doc_data["filename"],
                "uploaded_at": doc_data["uploaded_at"],
                "word_count": doc_data["word_count"],
                "document_type": doc_data.get("analysis", {}).get("document_type", "unknown")
            })

        # Sort by upload time (newest first)
        documents.sort(key=lambda x: x["uploaded_at"], reverse=True)

        return {
            "success": True,
            "documents": documents,
            "total": len(documents)
        }
    except Exception as e:
        logger.error(f"List documents error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list documents")


@app.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """Delete a document from storage"""
    try:
        document = document_store.delete_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        filename = document.get("filename", "Unknown")
        logger.info(f"Document deleted: {filename}")

        return {
            "success": True,
            "message": f"Document '{filename}' deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete document error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete document")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
