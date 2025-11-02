#!/usr/bin/env python3
"""
Test script for the NyAI Legal Chatbot API
"""

import requests
import json
import time

# Configuration
CHATBOT_URL = "http://localhost:8002"
BACKEND_URL = "http://localhost:5000/api"

def test_chatbot_direct():
    """Test the FastAPI chatbot service directly"""
    print("🧪 Testing FastAPI Chatbot Service Directly...")
    
    # Test health check
    try:
        response = requests.get(f"{CHATBOT_URL}/health")
        if response.status_code == 200:
            print("✅ Health check passed")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to chatbot service. Is it running on port 8002?")
        return False
    
    # Test chat endpoint
    try:
        chat_data = {
            "message": "What is contract law?",
            "user_id": "test_user"
        }
        response = requests.post(f"{CHATBOT_URL}/chat", json=chat_data)
        if response.status_code == 200:
            result = response.json()
            print("✅ Chat endpoint working")
            print(f"   Response: {result['response'][:100]}...")
            return True
        else:
            print(f"❌ Chat endpoint failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Chat test failed: {e}")
        return False

def test_backend_integration():
    """Test the backend integration"""
    print("\n🧪 Testing Backend Integration...")
    
    # Test backend health check
    try:
        response = requests.get(f"{BACKEND_URL}/chatbot/health")
        if response.status_code == 200:
            print("✅ Backend chatbot health check passed")
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend service. Is it running on port 5000?")
        return False
    
    # Test backend chat endpoint (without auth for now)
    try:
        chat_data = {
            "message": "What are my rights as a tenant?",
            "conversationId": None
        }
        response = requests.post(f"{BACKEND_URL}/chatbot/message", json=chat_data)
        if response.status_code == 200:
            result = response.json()
            print("✅ Backend chat endpoint working")
            print(f"   Response: {result['data']['response'][:100]}...")
            return True
        else:
            print(f"❌ Backend chat endpoint failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Backend chat test failed: {e}")
        return False

def test_conversation_flow():
    """Test a complete conversation flow"""
    print("\n🧪 Testing Complete Conversation Flow...")
    
    try:
        # Start a new conversation
        response = requests.post(f"{CHATBOT_URL}/chat", json={
            "message": "Hello, I need help with a legal question",
            "user_id": "test_user_flow"
        })
        
        if response.status_code != 200:
            print(f"❌ Failed to start conversation: {response.status_code}")
            return False
        
        result = response.json()
        conversation_id = result['conversation_id']
        print(f"✅ Started conversation: {conversation_id}")
        
        # Continue the conversation
        response = requests.post(f"{CHATBOT_URL}/chat", json={
            "message": "What is the difference between civil and criminal law?",
            "conversation_id": conversation_id,
            "user_id": "test_user_flow"
        })
        
        if response.status_code == 200:
            print("✅ Conversation continuation working")
            
            # Get conversation history
            response = requests.get(f"{CHATBOT_URL}/conversations/test_user_flow/{conversation_id}")
            if response.status_code == 200:
                conv_data = response.json()
                print(f"✅ Conversation history retrieved: {len(conv_data['messages'])} messages")
                return True
            else:
                print(f"❌ Failed to get conversation history: {response.status_code}")
                return False
        else:
            print(f"❌ Failed to continue conversation: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Conversation flow test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 NyAI Legal Chatbot Integration Tests")
    print("=" * 50)
    
    # Test 1: Direct FastAPI service
    test1_passed = test_chatbot_direct()
    
    # Test 2: Backend integration
    test2_passed = test_backend_integration()
    
    # Test 3: Conversation flow
    test3_passed = test_conversation_flow()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Results Summary:")
    print(f"   FastAPI Service: {'✅ PASS' if test1_passed else '❌ FAIL'}")
    print(f"   Backend Integration: {'✅ PASS' if test2_passed else '❌ FAIL'}")
    print(f"   Conversation Flow: {'✅ PASS' if test3_passed else '❌ FAIL'}")
    
    if all([test1_passed, test2_passed, test3_passed]):
        print("\n🎉 All tests passed! The chatbot integration is working correctly.")
        return True
    else:
        print("\n⚠️  Some tests failed. Please check the error messages above.")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
