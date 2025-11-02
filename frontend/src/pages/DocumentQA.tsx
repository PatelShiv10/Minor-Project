import { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, MessageCircle } from 'lucide-react';

const DocumentQA = () => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Helper to convert file to base64 string suitable for backend
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error("Cannot read file"));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle file input change - validate PDF and upload to backend
  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setUploadedFile(file);
      setAnswer('');
      setDocumentId(null);
      try {
        const base64Content = await fileToBase64(file);
        const payload = {
          content: base64Content,
          filename: file.name,
          content_type: file.type,
        };
        console.log('Uploading document:', payload.filename);
        const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/documentqa/upload`, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
        if (response.data.success) {
          setDocumentId(response.data.document_id);
        } else {
          alert('Upload error: ' + response.data.message);
          setUploadedFile(null);
        }
      } catch (error: any) {
        alert('Upload failed: ' + (error.response?.data?.message || error.message));
        setUploadedFile(null);
      }
    } else {
      alert('Please upload a PDF file only.');
      setUploadedFile(null);
      setAnswer('');
      setDocumentId(null);
    }
  };

  // Handle asking question: send to backend with documentId
  const handleAskQuestion = async () => {
    if (!uploadedFile || !question.trim() || !documentId) return;
    setIsLoading(true);
    setAnswer('');
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/documentqa/question`, {
        question,
        document_id: documentId,
        context: '',
      }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (response.data.success) {
        setAnswer(response.data.data.answer || 'No answer returned.');
      } else {
        alert('Failed to get answer: ' + response.data.message);
      }
    } catch (error: any) {
      alert('Error getting answer: ' + (error.response?.data?.message || error.message));
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-navy mb-4">Document Q&A</h1>
          <p className="text-xl text-gray-600">
            Upload any legal document and ask specific questions about its content
          </p>
        </div>

        {/* Upload Section */}
        <Card className="shadow-soft border-0 mb-8">
          <CardHeader>
            <CardTitle className="text-xl text-navy flex items-center">
              <Upload className="h-5 w-5 mr-2" />
              Upload Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-teal transition-colors">
              <input
                type="file"
                accept=".pdf"
                onChange={onFileChange}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  {uploadedFile ? uploadedFile.name : 'Click to upload PDF document'}
                </p>
                <p className="text-sm text-gray-500">
                  {uploadedFile ? 'File uploaded successfully!' : 'Drag and drop or click to browse (PDF only)'}
                </p>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Question Section */}
        {uploadedFile && (
          <Card className="shadow-soft border-0 mb-8">
            <CardHeader>
              <CardTitle className="text-xl text-navy flex items-center">
                <MessageCircle className="h-5 w-5 mr-2" />
                Ask a Question
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about this document..."
                className="border-gray-300 focus:border-teal focus:ring-teal"
                onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
              />
              <Button
                onClick={handleAskQuestion}
                disabled={!question.trim() || isLoading}
                className="bg-teal hover:bg-teal-light text-white px-8"
              >
                {isLoading ? 'Analyzing...' : 'Get Answer'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Answer Section */}
        {answer && (
          <Card className="shadow-soft border-0 bg-white">
            <CardHeader className="bg-teal/5">
              <CardTitle className="text-xl text-navy">AI Analysis Result</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-gray-700 leading-relaxed">{answer}</p>
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Disclaimer:</strong> This AI analysis is for informational purposes only and does not constitute legal advice. 
                  Always consult with a qualified attorney for legal matters.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center space-x-3">
              <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin"></div>
              <span className="text-lg text-gray-600">Analyzing your document...</span>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!uploadedFile && (
          <Card className="shadow-soft border-0 bg-blue-50">
            <CardContent className="p-6">
              <h3 className="font-semibold text-navy mb-4">How it works:</h3>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Upload a PDF document (contracts, agreements, legal forms, etc.)</li>
                <li>Ask specific questions about the document content</li>
                <li>Get AI-powered answers and explanations</li>
                <li>Use the insights to better understand your legal documents</li>
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DocumentQA;
