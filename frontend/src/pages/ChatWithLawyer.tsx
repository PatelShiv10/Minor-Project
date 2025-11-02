
import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, ArrowLeft, Phone, Video, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface Message {
  _id: string;
  text: string;
  sender: 'user' | 'lawyer';
  createdAt: string;
}

const ChatWithLawyer = () => {
  const { lawyerId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Remove auto-scroll behavior
  const [messageDeleteDialogOpen, setMessageDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [lawyerData, setLawyerData] = useState<any>(null);

  const userId = user?.id;

  // No auto-scroll on mount or on message updates

  useEffect(() => {
    const fetchConversation = async () => {
      try {
        if (!lawyerId || !userId) return;
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ lawyerId, userId });
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/conversation?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load messages');
        const data = await res.json();
        setMessages(data.data);
      } catch (e) {
        setError('Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };
    fetchConversation();
  }, [lawyerId, userId]);

  // Fetch lawyer data including consultation fee
  useEffect(() => {
    const fetchLawyerData = async () => {
      try {
        if (!lawyerId) return;
        const token = localStorage.getItem('token');
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/lawyer/${lawyerId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load lawyer data');
        const data = await res.json();
        setLawyerData(data.data);
      } catch (e) {
        console.error('Failed to load lawyer data:', e);
      }
    };
    fetchLawyerData();
  }, [lawyerId]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !lawyerId || !userId) return;
    const optimistic: Message = {
      _id: 'temp-' + Date.now(),
      text: inputText,
      sender: 'user',
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimistic]);
    setInputText('');

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ lawyerId, userId, text: optimistic.text })
      });
      if (!res.ok) throw new Error('Failed to send');
      const { data } = await res.json();
      setMessages(prev => prev.map(m => m._id === optimistic._id ? data : m));
    } catch (e) {
      setMessages(prev => prev.filter(m => m._id !== optimistic._id));
      alert('Failed to send message');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleDeleteMessage = async () => {
    if (!messageToDelete) return;
    
    try {
      setDeletingMessage(true);
      const token = localStorage.getItem('token');
      
      // Log the request details for debugging
      console.log(`Deleting message with ID: ${messageToDelete._id}`);
      
      // Make the DELETE request
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/message/${messageToDelete._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
          // No Content-Type header for DELETE requests as they typically don't have a body
        },
      });
      
      // Log response details for debugging
      console.log('Delete response status:', response.status);
      
      // Get the response text first
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      
      // Try to parse the response as JSON
      let responseData;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('Could not parse response as JSON:', parseError);
        responseData = { 
          success: false,
          message: 'Server returned non-JSON response' 
        };
      }
      
      console.log('Delete response data:', responseData);
      
      if (response.ok && responseData.success) {
        // Success - remove the message from state
        setMessages(messages.filter(msg => msg._id !== messageToDelete._id));
        setMessageDeleteDialogOpen(false);
        console.log('Message deleted successfully');
      } else {
        // Error
        const errorMessage = responseData.message || 'Unknown error';
        console.error(`Error deleting message (${response.status}):`, errorMessage);
        alert(`Failed to delete message: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error in delete operation:', error);
      alert(`Error deleting message: ${error.message}`);
    } finally {
      setDeletingMessage(false);
      setMessageToDelete(null);
    }
  };
  
  const openDeleteDialog = (message: Message) => {
    setMessageToDelete(message);
    setMessageDeleteDialogOpen(true);
  };

  const lawyer = useMemo(() => {
    if (lawyerData) {
      return {
        name: `${lawyerData.firstName || ''} ${lawyerData.lastName || ''}`,
        specialization: lawyerData.specialization || 'General Law',
        avatar: lawyerData.firstName ? lawyerData.firstName.charAt(0) : 'L',
        hourlyRate: lawyerData.consultationFee || 0
      };
    }
    return {
      name: 'Lawyer',
      specialization: 'General Law',
      avatar: 'L',
      hourlyRate: 0
    };
  }, [lawyerData]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-soft p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button asChild variant="ghost" size="sm">
              <Link to="/find-lawyer">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-teal text-white rounded-full flex items-center justify-center font-semibold">
                {lawyer.avatar}
              </div>
              <div>
                <h2 className="font-semibold text-navy">{lawyer.name}</h2>
                <div className="flex items-center space-x-2">
                  
                  
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex space-x-2">
            
            
            {/* <Button asChild size="sm" className="bg-teal hover:bg-teal-light text-white">
              <Link to={`/booking/${lawyerId}`}>Book Consultation</Link>
            </Button> */}
          </div>
        </div>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            <Card className="shadow-soft border-0 flex flex-col h-[70vh]">
              {/* Messages */}
              <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
                {loading && <div className="text-center text-gray-500">Loading...</div>}
                {error && <div className="text-center text-red-600">{error}</div>}
                {messages.map((message) => (
                  <div
                    key={message._id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[70%] ${message.sender === 'user' ? 'order-2' : 'order-1'} relative group`}>
                      <div className={`p-4 rounded-lg ${
                        message.sender === 'user' 
                          ? 'bg-teal text-white' 
                          : 'bg-gray-100'
                      }`}>
                        <p className="leading-relaxed">{message.text}</p>
                      </div>
                      <div className={`text-xs text-gray-500 mt-1 flex items-center ${
                        message.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}>
                        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                        {message.sender === 'user' && (
                          <button 
                            onClick={() => openDeleteDialog(message)}
                            className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete message"
                          >
                            <Trash2 className="h-3 w-3 text-gray-400 hover:text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input Area */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message..."
                    className="flex-1 border-gray-300 focus:border-teal focus:ring-teal"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim()}
                    className="bg-teal hover:bg-teal-light text-white px-6"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Lawyer Info Sidebar */}
          <div className="w-80">
            <Card className="shadow-soft border-0 h-[70vh] flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg text-navy">Lawyer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 overflow-y-auto">
                <div className="text-center">
                  <div className="w-16 h-16 bg-teal text-white rounded-full flex items-center justify-center text-xl font-semibold mx-auto mb-3">
                    {lawyer.avatar}
                  </div>
                  <h3 className="font-semibold text-navy">{lawyer.name}</h3>
                  <p className="text-teal">{lawyer.specialization}</p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Consultation Fee:</span>
                    <span className="font-medium">
                      {lawyer.hourlyRate > 0 ? `₹${lawyer.hourlyRate}` : 'Fee not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Response Time:</span>
                    <span className="font-medium">&lt; 5 minutes</span>
                  </div>
                  <div className="flex justify-between">
                   
                    <div className="flex items-center space-x-2">
                      
                      
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This chat is for initial consultation. 
                    For detailed legal advice, please book a formal consultation.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Delete Message Dialog */}
      <Dialog open={messageDeleteDialogOpen} onOpenChange={setMessageDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Message</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Are you sure you want to delete this message? This action cannot be undone.</p>
            {messageToDelete && (
              <div className="mt-2 p-3 bg-gray-100 rounded-md">
                <p className="text-sm text-gray-800">{messageToDelete.text}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex space-x-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => setMessageDeleteDialogOpen(false)}
              disabled={deletingMessage}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteMessage}
              disabled={deletingMessage}
            >
              {deletingMessage ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatWithLawyer;
