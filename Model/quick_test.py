#!/usr/bin/env python3
"""
Quick test to verify the chatbot service is working
"""

import requests
import json

def test_connection():
    """Test if the chatbot service is accessible"""
    try:
        print("🔍 Testing chatbot service connection...")
        response = requests.get("http://localhost:8002/health", timeout=5)
        if response.status_code == 200:
            print("✅ Chatbot service is running and accessible")
            return True
        else:
            print(f"❌ Chatbot service returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to chatbot service on port 8002")
        print("   Make sure the service is running with: python start_chatbot.py")
        return False
    except Exception as e:
        print(f"❌ Error testing connection: {e}")
        return False

def test_backend_connection():
    """Test if the backend can reach the chatbot service"""
    try:
        print("🔍 Testing backend connection to chatbot...")
        response = requests.get("http://localhost:5000/api/chatbot/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend can reach chatbot service")
            return True
        else:
            print(f"❌ Backend returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to backend on port 5000")
        print("   Make sure the backend is running with: npm start")
        return False
    except Exception as e:
        print(f"❌ Error testing backend connection: {e}")
        return False

def test_simple_chat():
    """Test a simple chat message"""
    try:
        print("🔍 Testing simple chat message...")
        chat_data = {
            "message": "Hello, this is a test message",
            "user_id": "test_user"
        }
        response = requests.post("http://localhost:8002/chat", json=chat_data, timeout=10)
        if response.status_code == 200:
            result = response.json()
            print("✅ Chat message sent successfully")
            print(f"   Response: {result['response'][:100]}...")
            return True
        else:
            print(f"❌ Chat message failed with status {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error testing chat: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Quick Chatbot Service Test")
    print("=" * 40)
    
    # Test 1: Direct chatbot service
    test1 = test_connection()
    
    # Test 2: Backend connection
    test2 = test_backend_connection()
    
    # Test 3: Simple chat
    test3 = test_simple_chat() if test1 else False
    
    print("\n" + "=" * 40)
    print("📊 Test Results:")
    print(f"   Chatbot Service: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"   Backend Connection: {'✅ PASS' if test2 else '❌ FAIL'}")
    print(f"   Chat Function: {'✅ PASS' if test3 else '❌ FAIL'}")
    
    if all([test1, test2, test3]):
        print("\n🎉 All tests passed! The chatbot should be working now.")
    else:
        print("\n⚠️  Some tests failed. Please check the issues above.")
        
        if not test1:
            print("\n💡 To fix chatbot service issues:")
            print("   1. Make sure you have a .env file with GOOGLE_API_KEY")
            print("   2. Run: cd Model && python start_chatbot.py")
            
        if not test2:
            print("\n💡 To fix backend issues:")
            print("   1. Make sure the backend is running: cd backend && npm start")
            print("   2. Check that the backend can reach port 8002")

if __name__ == "__main__":
    main()
