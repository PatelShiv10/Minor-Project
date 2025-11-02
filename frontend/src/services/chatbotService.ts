const CHATBOT_API_BASE_URL = (import.meta as any).env?.VITE_CHATBOT_API_URL || 'http://localhost:8002';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatResponse {
  response: string;
  conversation_id: string;
  conversation_title: string;
}

export interface ConversationListItem {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export interface ConversationDetails {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: number;
  updated_at: number;
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let message = `HTTP error! status: ${response.status}`;
    try {
      const data = await response.json();
      message = (data && (data.detail || data.message)) || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
};

export const chatbotService = {
  async health(): Promise<{ status: string; timestamp: number }> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/health`);
    return handleResponse(res);
  },

  async sendMessage(params: { message: string; conversationId?: string; userId?: string; }): Promise<ChatResponse> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        ...(params.conversationId ? { conversation_id: params.conversationId } : {}),
        ...(params.userId ? { user_id: params.userId } : {}),
      })
    });
    return handleResponse(res);
  },

  async listConversations(userId: string): Promise<{ conversations: ConversationListItem[]; active_conversation?: string | null; }> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/conversations/${encodeURIComponent(userId)}`);
    return handleResponse(res);
  },

  async getConversation(userId: string, conversationId: string): Promise<ConversationDetails> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`);
    return handleResponse(res);
  },

  async createConversation(userId: string): Promise<{ conversation_id: string; title: string; }> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/conversations/${encodeURIComponent(userId)}/new`, {
      method: 'POST'
    });
    return handleResponse(res);
  },

  async deleteConversation(userId: string, conversationId: string): Promise<{ message: string; }> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/conversations/${encodeURIComponent(userId)}/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE'
    });
    return handleResponse(res);
  },

  async setActiveConversation(userId: string, conversationId: string): Promise<{ message: string; }> {
    const res = await fetch(`${CHATBOT_API_BASE_URL}/conversations/${encodeURIComponent(userId)}/active?conversation_id=${encodeURIComponent(conversationId)}`, {
      method: 'PUT'
    });
    return handleResponse(res);
  },
};

export default chatbotService;


