import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Send, Search, Trash2, X, Check, Trash } from 'lucide-react';
import { LawyerSidebar } from '@/components/lawyer/LawyerSidebar';
import { LawyerTopBar } from '@/components/lawyer/LawyerTopBar';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Message {
  _id: string;
  sender: 'user' | 'lawyer';
  text: string;
  createdAt: string;
  userId: string;
  lawyerId: string;
}

interface ConversationPreview {
  userId: string;
  name: string;
  unread: number;
  lastMessage?: string;
  lastTime?: string;
  selected?: boolean;
}

const LawyerMessages = () => {
  const [currentPage, setCurrentPage] = useState('messages');
  const { user } = useAuth();
  const location = useLocation();
  const lawyerId = user?.id;

  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    location.state?.clientId || null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Delete mode states
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingConversations, setDeletingConversations] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [messageDeleteDialogOpen, setMessageDeleteDialogOpen] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(false);

  const scrollToBottom = () => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      if (isNearBottom || messages.length === 0) {
        scrollToBottom();
      }
    }
  }, [messages]);

  useEffect(() => {
    const loadConversations = async () => {
      if (!lawyerId) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load conversations');
        const data = await res.json();
        setConversations(
          data.data.map((conv: ConversationPreview) => ({
            ...conv,
            selected: false,
          }))
        );
        if (!selectedUserId && !location.state?.clientId && data.data.length > 0) {
          setSelectedUserId(data.data[0].userId);
        }
      } catch {
        // ignore
      }
    };
    loadConversations();
  }, [lawyerId, location.state?.clientId]);

  useEffect(() => {
    const loadConversation = async () => {
      if (!lawyerId || !selectedUserId) return;
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ lawyerId, userId: selectedUserId });
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/conversation?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) throw new Error('Failed to fetch conversation');
        const data = await res.json();
        setMessages(data.data);

        // refresh list
        try {
          const listRes = await fetch(
            `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/conversations`,
            {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            }
          );
          if (listRes.ok) {
            const listData = await listRes.json();
            setConversations(listData.data);
          }
        } catch {
          // ignore
        }
      } catch {
        setError('Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };
    loadConversation();
  }, [lawyerId, selectedUserId]);

  const toggleDeleteMode = () => {
    setDeleteMode(!deleteMode);
    // Reset selections when toggling delete mode
    if (!deleteMode) {
      setConversations(conversations.map((conv) => ({ ...conv, selected: false })));
    }
  };

  const toggleConversationSelection = (
    userId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    setConversations(
      conversations.map((conv) =>
        conv.userId === userId ? { ...conv, selected: !conv.selected } : conv
      )
    );
  };

  const getSelectedConversations = () => {
    return conversations.filter((conv) => conv.selected);
  };

  const handleDeleteSelected = async () => {
    const selectedConversations = getSelectedConversations();
    if (selectedConversations.length === 0) return;

    try {
      setDeletingConversations(true);
      const token = localStorage.getItem('token');
      const userIds = selectedConversations.map((conv) => conv.userId);

      const res = await fetch('http://localhost:5000/api/chat/conversations', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds }),
      });

      if (!res.ok) throw new Error('Failed to delete conversations');

      // Remove deleted conversations from state
      const remainingConversations = conversations.filter(
        (conv) => !conv.selected
      );
      setConversations(remainingConversations);

      // If the currently selected conversation was deleted, reset selection
      if (
        selectedUserId &&
        selectedConversations.some((conv) => conv.userId === selectedUserId)
      ) {
        setSelectedUserId(
          remainingConversations.length > 0
            ? remainingConversations[0].userId
            : null
        );
        setMessages([]);
      }

      // Exit delete mode
      setDeleteMode(false);
    } catch (error) {
      console.error('Error deleting conversations:', error);
      alert('Failed to delete conversations');
    } finally {
      setDeletingConversations(false);
      setDeleteDialogOpen(false);
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
      console.error('Error deleting message:', error);
      alert(`Failed to delete message: ${error.message || 'Unknown error'}`);
    } finally {
      setDeletingMessage(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !lawyerId || !selectedUserId) return;
    const optimistic: Message = {
      _id: 'temp-' + Date.now(),
      sender: 'lawyer',
      text: message,
      createdAt: new Date().toISOString(),
      userId: selectedUserId,
      lawyerId: lawyerId,
    };
    setMessages((prev) => [...prev, optimistic]);
    setMessage('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lawyerId,
          userId: selectedUserId,
          text: optimistic.text,
        }),
      });
      if (!res.ok) throw new Error('Failed to send');
      const { data } = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m._id === optimistic._id ? data : m))
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      alert('Failed to send message');
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      <LawyerSidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteSelected}
        selectedCount={getSelectedConversations().length}
      />

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={messageDeleteDialogOpen} onOpenChange={setMessageDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMessage}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMessage}
              disabled={deletingMessage}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingMessage ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex-1 flex flex-col min-w-0">
        <LawyerTopBar />

        <main className="flex-1 p-4 lg:p-6 overflow-hidden">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h1 className="text-2xl lg:text-3xl font-bold text-navy">
                Messages
              </h1>
              {location.state?.clientName && (
                <div className="text-sm text-gray-600">
                  Chatting with:{' '}
                  <span className="font-medium">
                    {location.state.clientName}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
              {/* Client List */}
              <Card className="shadow-soft border-0 lg:col-span-1 flex flex-col">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">Conversations</CardTitle>
                    {deleteMode ? (
                      <div className="flex space-x-2">
                        {getSelectedConversations().length > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteDialogOpen(true)}
                            disabled={deletingConversations}
                            className="bg-red-500 hover:bg-red-600 text-white"
                          >
                            Delete Selected
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={toggleDeleteMode}
                          className="border-gray-300"
                        >
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleDeleteMode}
                        className="border-gray-300"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete Chats
                      </Button>
                    )}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input placeholder="Search conversations..." className="pl-10" />
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden">
                  <div className="space-y-1 overflow-y-auto h-full">
                    {conversations.length === 0 && (
                      <div className="p-4 text-sm text-gray-500">
                        No conversations yet
                      </div>
                    )}
                    {conversations.map((client) => (
                      <button
                        key={client.userId}
                        onClick={() =>
                          !deleteMode && setSelectedUserId(client.userId)
                        }
                        className={`w-full p-4 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                          selectedUserId === client.userId && !deleteMode
                            ? 'bg-teal-50 border-l-4 border-l-teal'
                            : ''
                        } ${deleteMode ? 'cursor-default' : ''}`}
                      >
                        <div className="flex items-center">
                          {deleteMode && (
                            <div
                              className="mr-3"
                              onClick={(e) =>
                                toggleConversationSelection(client.userId, e)
                              }
                            >
                              <Checkbox checked={client.selected} />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-medium text-navy">
                                {client.name}
                              </h3>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-500">
                                  {client.lastTime
                                    ? new Date(client.lastTime).toLocaleString()
                                    : ''}
                                </span>
                                {client.unread > 0 && (
                                  <Badge className="bg-red-500 text-white text-xs">
                                    {client.unread}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 truncate">
                              {client.lastMessage}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Chat Area */}
              <Card className="shadow-soft border-0 lg:col-span-2 flex flex-col min-h-0">
                <CardHeader className="border-b border-gray-200 flex-shrink-0">
                  <CardTitle className="text-lg">
                    {selectedUserId
                      ? 'Conversation'
                      : 'Select a conversation'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col p-0 min-h-0 overflow-hidden">
                  {/* Messages */}
                  <div className="flex-1 p-4 space-y-4 overflow-y-auto min-h-0 messages-container">
                    {loading && (
                      <div className="text-center text-gray-500">Loading...</div>
                    )}
                    {error && (
                      <div className="text-center text-red-600">{error}</div>
                    )}
                    {!selectedUserId ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <p>Select a conversation to start messaging</p>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg) => (
                          <div
                            key={msg._id}
                            className={`flex ${
                              msg.sender === 'lawyer'
                                ? 'justify-end'
                                : 'justify-start'
                            }`}
                          >
                            <div
                              className={`max-w-[70%] ${
                                msg.sender === 'lawyer' ? 'order-2' : 'order-1'
                              } group`}
                            >
                              <div
                              className={`p-4 rounded-lg relative group ${
                                msg.sender === 'lawyer'
                                  ? 'bg-teal text-white'
                                  : 'bg-gray-100'
                              }`}
                            >
                              <p className="leading-relaxed">{msg.text}</p>
                            </div>
                              <div
                                className={`text-xs text-gray-500 mt-1 flex items-center ${
                                  msg.sender === 'lawyer' ? 'justify-end' : 'justify-start'
                                }`}
                              >
                                <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                                {msg.sender === 'lawyer' && (
                                  <button
                                    className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMessageToDelete(msg);
                                      setMessageDeleteDialogOpen(true);
                                    }}
                                    title="Delete message"
                                  >
                                    <Trash className="h-3 w-3 text-gray-400 hover:text-red-500" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={endRef} />
                      </>
                    )}
                  </div>

                  {/* Message Input */}
                  <div className="border-t border-gray-200 p-4 flex-shrink-0 bg-white">
                    <div className="flex gap-2">
                      <Input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) =>
                          e.key === 'Enter' &&
                          !e.shiftKey &&
                          (e.preventDefault(), handleSendMessage())
                        }
                        placeholder="Type your message..."
                        className="flex-1 border-gray-300 focus:border-teal focus:ring-teal"
                        disabled={!selectedUserId}
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={!selectedUserId || !message.trim()}
                        className="bg-teal hover:bg-teal-light text-white px-6"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LawyerMessages;

// Add Alert Dialog for delete confirmation
const DeleteConfirmationDialog = ({
  open,
  onOpenChange,
  onConfirm,
  selectedCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  selectedCount: number;
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the selected chat
            {selectedCount !== 1 ? 's' : ''}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-500 hover:bg-red-600"
          >
            <Check className="h-4 w-4 mr-1" /> Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
