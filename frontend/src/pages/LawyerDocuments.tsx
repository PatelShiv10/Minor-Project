import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  FileText, Download, Eye, Search, Upload, 
  Plus, Filter, Loader2, Trash2, Edit,
  FileUp, Calendar, User, AlertCircle
} from 'lucide-react';
import { LawyerSidebar } from '@/components/lawyer/LawyerSidebar';
import { LawyerTopBar } from '@/components/lawyer/LawyerTopBar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  documentService, 
  Document, 
  DocumentListResponse,
  UploadDocumentRequest,
  getDocumentTypeLabel,
  getStatusColor,
  getDocumentTypeColor,
  formatFileSize,
  formatDate,
  getFileIcon
} from '@/services/documentService';
import { clientService, Client } from '@/services/clientService';

const LawyerDocuments = () => {
  const [currentPage, setCurrentPage] = useState('documents');
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNext: false,
    hasPrev: false
  });
  const [stats, setStats] = useState({
    totalDocuments: 0,
    totalSize: 0,
    statusDistribution: {},
    typeDistribution: {}
  });
  const [filters, setFilters] = useState({
    status: 'all',
    documentType: 'all',
    clientId: 'all',
    search: ''
  });
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadData, setUploadData] = useState({
    clientId: '',
    title: '',
    description: '',
    documentType: 'other',
    tags: [] as string[],
    file: null as File | null
  });
  const [uploading, setUploading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if we're viewing documents for a specific client
  const clientIdFromState = location.state?.clientId;
  const clientNameFromState = location.state?.clientName;

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let response: DocumentListResponse;

      if (clientIdFromState) {
        // Fetch documents for specific client
        response = await documentService.getClientDocuments(clientIdFromState, {
          page,
          limit: 20,
          status: filters.status !== 'all' ? filters.status : undefined,
          documentType: filters.documentType !== 'all' ? filters.documentType : undefined,
          search: filters.search || undefined,
          sortBy,
          sortOrder
        });
      } else {
        // Fetch all documents for lawyer
        response = await documentService.getLawyerDocuments({
          page,
          limit: 20,
          status: filters.status !== 'all' ? filters.status : undefined,
          documentType: filters.documentType !== 'all' ? filters.documentType : undefined,
          clientId: filters.clientId !== 'all' ? filters.clientId : undefined,
          search: filters.search || undefined,
          sortBy,
          sortOrder
        });
      }

      setDocuments(response.documents);
      setPagination(response.pagination);
      setStats(response.stats);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch documents';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await clientService.getLawyerClients({ limit: 100 });
      setClients(response.clients);
      
      // Check if there are any inactive clients
      const hasInactive = response.clients.some(client => client.status === 'inactive');
      setHasInactiveClients(hasInactive);
      
      // If we have a client ID from state, keep local mapping but don't block on status here.
      // Backend will enforce relationship validity.
      if (clientIdFromState) {
        /* no-op: clients list is now available for mapping */
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: "Error",
        description: "Failed to load clients",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchDocuments();
    // Always ensure we have the latest clients list for relationship mapping
    fetchClients();
    
    // Set the client ID in upload form if we're viewing a specific client's documents
    if (clientIdFromState) {
      setUploadData(prev => ({ ...prev, clientId: clientIdFromState }));
    }
  }, [page, filters, sortBy, sortOrder, clientIdFromState]);

  const handleUploadDocument = async () => {
    // Check if we're in client-specific view
    const currentClientId = clientIdFromState || uploadData.clientId;
    
    if (!uploadData.file || !currentClientId || !uploadData.title.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and select a file",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      // Try to map the provided id to our local clients list.
      // Accept either the LawyerClient relationship ID or the User ID.
      const selectedClient = clients.find(
        c => c._id === currentClientId || c.clientId._id === currentClientId
      );

      // Build payload. If we identified the relationship, send both IDs; otherwise
      // send the provided ID as clientId and let the backend validate the relationship.
      const documentData: UploadDocumentRequest = selectedClient
        ? {
            clientId: selectedClient.clientId._id, // User ID
            clientRelationshipId: selectedClient._id, // Relationship ID
            title: uploadData.title.trim(),
            description: uploadData.description.trim() || undefined,
            documentType: uploadData.documentType,
            tags: uploadData.tags,
            file: uploadData.file
          }
        : {
            clientId: currentClientId,
            title: uploadData.title.trim(),
            description: uploadData.description.trim() || undefined,
            documentType: uploadData.documentType,
            tags: uploadData.tags,
            file: uploadData.file
          };

      await documentService.uploadDocument(documentData);

      toast({
        title: "Success",
        description: "Document uploaded successfully"
      });

      setUploadDialogOpen(false);
      setUploadData({
        clientId: '',
        title: '',
        description: '',
        documentType: 'other',
        tags: [],
        file: null
      });

      fetchDocuments();
    } catch (error: unknown) {
      // Handle specific error for client relationship not found
      let message: string | undefined;
      if (typeof error === 'object' && error !== null && 'message' in error) {
        const msg = (error as { message?: unknown }).message;
        message = typeof msg === 'string' ? msg : undefined;
      }
      if (message && message.includes('Client relationship not found or inactive')) {
        toast({
          title: "Client Relationship Error",
          description: "The selected client doesn't have an active relationship with you. Please ensure the client is active in your client list before uploading documents.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: message || "Failed to upload document",
          variant: "destructive"
        });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = async (doc: Document) => {
    try {
      const blob = await documentService.downloadDocument(doc._id);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = doc.originalFileName;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Document downloaded successfully"
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to download document';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteDocument = async () => {
    if (!selectedDocument) return;

    setDeleting(true);

    try {
      await documentService.deleteDocument(selectedDocument._id);

      toast({
        title: "Success",
        description: "Document deleted successfully"
      });

      setDeleteDialogOpen(false);
      setSelectedDocument(null);
      fetchDocuments();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete document';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setDeleting(false);
    }
  };

  // Removed client messaging from documents section per requirement

  const handleViewDocument = async (document: Document) => {
    try {
      const blob = await documentService.downloadDocument(document._id);
      const url = window.URL.createObjectURL(blob);
      // Open in a new tab for inline preview (PDF/images render in-browser)
      window.open(url, '_blank', 'noopener,noreferrer');
      // Revoke after short delay to allow the new tab to load
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to view document';
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    }
  };

  // Check if we have any inactive clients that need activation
  const [hasInactiveClients, setHasInactiveClients] = useState(false);

  useEffect(() => {
    const checkInactiveClients = async () => {
      try {
        const response = await clientService.getLawyerClients({ status: 'inactive' });
        setHasInactiveClients(response.stats.inactive > 0);
      } catch (error) {
        console.error('Error checking inactive clients:', error);
      }
    };
    
    checkInactiveClients();
  }, []);

  // Helper to show size in MB with two decimals
  const toMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <LawyerSidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      
      <div className="flex-1 flex flex-col">
        <LawyerTopBar />
        
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            
            {/* Notification banner for inactive clients */}
            {hasInactiveClients && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-amber-800">Inactive Client Relationships Detected</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      You have inactive client relationships that need to be activated before you can upload documents for them.
                      Please visit the <Button variant="link" className="p-0 h-auto text-amber-800 font-medium underline" onClick={() => navigate('/lawyer-clients')}>Clients page</Button> and
                      use the "Activate Client" button to update their status.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
              <h1 className="text-2xl lg:text-3xl font-bold text-navy">
                {clientNameFromState ? `${clientNameFromState}'s Documents` : 'Documents'}
              </h1>
              <div className="flex gap-2">
                {clientNameFromState && (
                  <Button 
                    variant="outline"
                    onClick={() => navigate('/lawyer-clients')}
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Back to Clients
                  </Button>
                )}
                <Button 
                  className="bg-teal hover:bg-teal-light text-white w-full sm:w-auto"
                  onClick={() => setUploadDialogOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="shadow-soft border-0">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.totalDocuments}</div>
                  <div className="text-sm text-gray-600">Total Documents</div>
                </CardContent>
              </Card>
              <Card className="shadow-soft border-0">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatFileSize(stats.totalSize)}
                  </div>
                  <div className="text-sm text-gray-600">Total Size</div>
                </CardContent>
              </Card>
              <Card className="shadow-soft border-0">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {Object.keys(stats.statusDistribution).length}
                  </div>
                  <div className="text-sm text-gray-600">Status Types</div>
                </CardContent>
              </Card>
              <Card className="shadow-soft border-0">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {Object.keys(stats.typeDistribution).length}
                  </div>
                  <div className="text-sm text-gray-600">Document Types</div>
                </CardContent>
              </Card>
            </div>

            {/* Search and Filters */}
            <Card className="shadow-soft border-0 mb-6">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search documents..."
                      className="pl-10"
                      value={filters.search}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    />
                  </div>
                  {!clientIdFromState && (
                    <Select 
                      value={filters.clientId} 
                      onValueChange={(value) => setFilters(prev => ({ ...prev, clientId: value }))}
                    >
                      <SelectTrigger className="w-full lg:w-48">
                        <SelectValue placeholder="All Clients" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Clients</SelectItem>
                        {clients.map(client => (
                          <SelectItem key={client._id} value={client._id}>
                            {client.clientId.firstName} {client.clientId.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select 
                    value={filters.documentType} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, documentType: value }))}
                  >
                    <SelectTrigger className="w-full lg:w-48">
                      <SelectValue placeholder="Document Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="brief">Legal Brief</SelectItem>
                      <SelectItem value="evidence">Evidence</SelectItem>
                      <SelectItem value="correspondence">Correspondence</SelectItem>
                      <SelectItem value="legal_document">Legal Document</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select 
                    value={filters.status} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="w-full lg:w-48">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="needs_attention">Needs Attention</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Documents Grid */}
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading documents...</span>
              </div>
            ) : documents.length === 0 ? (
              <Card className="shadow-soft border-0">
                <CardContent className="text-center p-12">
                  <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">No documents found</h3>
                  <p className="text-gray-500 mb-6">
                    {filters.search || filters.status !== 'all' || filters.documentType !== 'all'
                      ? 'Try adjusting your search or filters'
                      : 'Start by uploading your first document'}
                  </p>
                  <Button 
                    onClick={() => setUploadDialogOpen(true)}
                    className="bg-teal hover:bg-teal-light text-white"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                  {documents.map((doc) => (
                    <Card key={doc._id} className="shadow-soft border-0 hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-teal rounded-lg flex items-center justify-center">
                              <span className="text-2xl">{getFileIcon(doc.mimeType)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-navy truncate">{doc.title}</h3>
                              <p className="text-sm text-gray-600">
                                {doc.clientId.firstName} {doc.clientId.lastName}
                              </p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setSelectedDocument(doc);
                              setDeleteDialogOpen(true);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between">
                            <Badge className={getStatusColor(doc.status)}>
                              {doc.status.replace('_', ' ')}
                            </Badge>
                            <Badge className={getDocumentTypeColor(doc.documentType)}>
                              {getDocumentTypeLabel(doc.documentType)}
                            </Badge>
                          </div>
                          
                          <div className="space-y-1 text-sm text-gray-600">
                            <p>Size: {toMB(doc.fileSize)}</p>
                            <p>Uploaded: {formatDate(doc.createdAt)}</p>
                            {doc.downloadCount > 0 && (
                              <p>Downloads: {doc.downloadCount}</p>
                            )}
                          </div>
                          
                          {doc.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {doc.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => handleViewDocument(doc)}
                            title="View Document"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => handleDownloadDocument(doc)}
                            title="Download Document"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {documents.length} of {pagination.totalItems} documents
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                        disabled={!pagination.hasPrev}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(prev => prev + 1)}
                        disabled={!pagination.hasNext}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
              {!clientIdFromState && !uploadData.clientId && (
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select 
                    value={uploadData.clientId} 
                    onValueChange={(value) => setUploadData(prev => ({ ...prev, clientId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem 
                          key={client._id} 
                          value={client._id}
                          disabled={client.status === 'inactive'}
                        >
                          {client.clientId.firstName} {client.clientId.lastName}
                          {client.status === 'inactive' ? ' (Inactive)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-amber-600">
                    <AlertCircle className="h-3 w-3 inline-block mr-1" />
                    Note: Only clients with active status can have documents uploaded.
                  </p>
                </div>
              )}

            {(clientIdFromState || uploadData.clientId) && (
              <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                <p className="text-sm text-teal-800">
                  <strong>Uploading for:</strong> {clientNameFromState || 'Selected Client'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Document Title *</Label>
              <Input
                id="title"
                value={uploadData.title}
                onChange={(e) => setUploadData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter document title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={uploadData.description}
                onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter document description"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentType">Document Type</Label>
              <Select 
                value={uploadData.documentType} 
                onValueChange={(value) => setUploadData(prev => ({ ...prev, documentType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="brief">Legal Brief</SelectItem>
                  <SelectItem value="evidence">Evidence</SelectItem>
                  <SelectItem value="correspondence">Correspondence</SelectItem>
                  <SelectItem value="legal_document">Legal Document</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">File *</Label>
              <Input
                id="file"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setUploadData(prev => ({ ...prev, file }));
                  }
                }}
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar"
              />
              <p className="text-xs text-gray-500">
                Supported formats: PDF, Word, Text, Images, Archives (max 25MB)
              </p>
            </div>



            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setUploadDialogOpen(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUploadDocument}
                disabled={uploading || !uploadData.file || !uploadData.title.trim() || (!clientIdFromState && !uploadData.clientId && !location.state?.clientId)}
                className="bg-teal hover:bg-teal-light text-white"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Document Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
          </DialogHeader>
          
          {selectedDocument && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 p-3 bg-red-50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-700">
                  Are you sure you want to delete "{selectedDocument.title}"? This action cannot be undone.
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">{selectedDocument.title}</h4>
                <p className="text-sm text-gray-600">
                  {selectedDocument.clientId.firstName} {selectedDocument.clientId.lastName}
                </p>
                <p className="text-sm text-gray-600">
                  {formatFileSize(selectedDocument.fileSize)} • {formatDate(selectedDocument.createdAt)}
                </p>
              </div>

              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleDeleteDocument}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Document
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LawyerDocuments;
