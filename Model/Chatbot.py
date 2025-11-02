from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import google.generativeai as genai
import os
import json
import time
from datetime import datetime
import uvicorn

# --- Configuration ---
# Set up Google API Key securely
try:
    from dotenv import load_dotenv
    load_dotenv()
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not found in .env file. Please create one.")
    genai.configure(api_key=GOOGLE_API_KEY)
except ImportError:
    raise ImportError("python-dotenv is not installed. Please run `pip install python-dotenv`")

# --- FastAPI App Setup ---
app = FastAPI(
    title="NyAI - Intelligent Legal Chatbot",
    description="AI-powered legal assistant for Indian law",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:8080"],  # Frontend dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    timestamp: float

class Conversation(BaseModel):
    title: str
    messages: List[Message]
    created_at: float
    updated_at: float

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    user_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    conversation_title: str

class ConversationHistory(BaseModel):
    conversations: Dict[str, Conversation]
    active_conversation: Optional[str] = None

# --- Global Storage (In production, use a proper database) ---
conversation_storage: Dict[str, ConversationHistory] = {}

# --- Helper Functions ---
def get_user_history(user_id: str) -> ConversationHistory:
    """Gets or creates conversation history for a user."""
    if user_id not in conversation_storage:
        conversation_storage[user_id] = ConversationHistory(
            conversations={},
            active_conversation=None
        )
    return conversation_storage[user_id]

def save_user_history(user_id: str, history: ConversationHistory):
    """Saves conversation history for a user."""
    conversation_storage[user_id] = history

def generate_conversation_title(first_user_prompt: str) -> str:
    """Uses Gemini to generate a single, short, relevant title for the conversation."""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        prompt = f'Generate one single, very short, concise title (4 words maximum) for a legal conversation that starts with: "{first_user_prompt}". Do not provide options. Respond with the title only.'
        response = model.generate_content(prompt)
        # Take the first line of the response to ensure only one title is used.
        title = response.text.strip().split('\n')[0].replace('"', '')
        return title
    except Exception as e:
        print(f"Error generating title: {e}")
        return first_user_prompt[:30] + "..." if len(first_user_prompt) > 30 else first_user_prompt

def get_ai_response(user_message: str, conversation_context: str = "") -> str:
    """Gets AI response from Gemini."""
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        prompt = f"""
        You are an expert Indian Legal AI Assistant named NyAI. Your knowledge is up-to-date as of your last training.
        Answer the user's question based on your general understanding of Indian law.
        Provide clear, concise, and accurate answers. Always include a disclaimer that you are an AI and not a legal professional.

        Previous Conversation History for context:
        {conversation_context}

        Current User's Question: {user_message}
        
        AI Answer:
        """
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Sorry, an error occurred while processing your request: {str(e)}"

# --- API Endpoints ---
@app.get("/")
async def root():
    return {"message": "NyAI Legal Chatbot API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint for sending messages and getting AI responses."""
    try:
        user_id = request.user_id or "anonymous"
        history = get_user_history(user_id)
        
        # If no conversation_id provided, create a new conversation
        if not request.conversation_id:
            conversation_title = generate_conversation_title(request.message)
            conversation_id = f"{user_id}_{int(time.time())}"
            
            # Create new conversation
            new_conversation = Conversation(
                title=conversation_title,
                messages=[],
                created_at=time.time(),
                updated_at=time.time()
            )
            
            history.conversations[conversation_id] = new_conversation
            history.active_conversation = conversation_id
        else:
            conversation_id = request.conversation_id
            if conversation_id not in history.conversations:
                raise HTTPException(status_code=404, detail="Conversation not found")
        
        # Add user message
        user_message = Message(
            role="user",
            content=request.message,
            timestamp=time.time()
        )
        
        history.conversations[conversation_id].messages.append(user_message)
        
        # Build conversation context for AI
        conversation_context = ""
        messages_for_context = history.conversations[conversation_id].messages[:-1]  # Exclude the current message
        for message in messages_for_context:
            role = "User" if message.role == "user" else "AI"
            conversation_context += f'{role}: {message.content}\n\n'
        
        # Get AI response
        ai_response_text = get_ai_response(request.message, conversation_context)
        
        # Add AI response
        ai_message = Message(
            role="assistant",
            content=ai_response_text,
            timestamp=time.time()
        )
        
        history.conversations[conversation_id].messages.append(ai_message)
        history.conversations[conversation_id].updated_at = time.time()
        
        # Save updated history
        save_user_history(user_id, history)
        
        return ChatResponse(
            response=ai_response_text,
            conversation_id=conversation_id,
            conversation_title=history.conversations[conversation_id].title
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing chat request: {str(e)}")

@app.get("/conversations/{user_id}")
async def get_conversations(user_id: str):
    """Get all conversations for a user."""
    try:
        history = get_user_history(user_id)
        
        # Return conversations sorted by updated_at (most recent first)
        sorted_conversations = sorted(
            history.conversations.items(),
            key=lambda item: item[1].updated_at,
            reverse=True
        )
        
        conversations_list = []
        for conv_id, conversation in sorted_conversations:
            conversations_list.append({
                "id": conv_id,
                "title": conversation.title,
                "created_at": conversation.created_at,
                "updated_at": conversation.updated_at,
                "message_count": len(conversation.messages)
            })
        
        return {
            "conversations": conversations_list,
            "active_conversation": history.active_conversation
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversations: {str(e)}")

@app.get("/conversations/{user_id}/{conversation_id}")
async def get_conversation(user_id: str, conversation_id: str):
    """Get a specific conversation with all messages."""
    try:
        history = get_user_history(user_id)
        
        if conversation_id not in history.conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        conversation = history.conversations[conversation_id]
        
        return {
            "id": conversation_id,
            "title": conversation.title,
            "messages": conversation.messages,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching conversation: {str(e)}")

@app.post("/conversations/{user_id}/new")
async def create_new_conversation(user_id: str):
    """Create a new conversation for a user."""
    try:
        history = get_user_history(user_id)
        conversation_id = f"{user_id}_{int(time.time())}"
        
        new_conversation = Conversation(
            title="New Conversation",
            messages=[],
            created_at=time.time(),
            updated_at=time.time()
        )
        
        history.conversations[conversation_id] = new_conversation
        history.active_conversation = conversation_id
        
        save_user_history(user_id, history)
        
        return {
            "conversation_id": conversation_id,
            "title": new_conversation.title
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating conversation: {str(e)}")

@app.delete("/conversations/{user_id}/{conversation_id}")
async def delete_conversation(user_id: str, conversation_id: str):
    """Delete a specific conversation."""
    try:
        history = get_user_history(user_id)
        
        if conversation_id not in history.conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        del history.conversations[conversation_id]
        
        # If this was the active conversation, clear it
        if history.active_conversation == conversation_id:
            history.active_conversation = None
        
        save_user_history(user_id, history)
        
        return {"message": "Conversation deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting conversation: {str(e)}")

@app.put("/conversations/{user_id}/active")
async def set_active_conversation(user_id: str, conversation_id: str):
    """Set the active conversation for a user."""
    try:
        history = get_user_history(user_id)
        
        if conversation_id not in history.conversations:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        history.active_conversation = conversation_id
        save_user_history(user_id, history)
        
        return {"message": "Active conversation updated"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error setting active conversation: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
