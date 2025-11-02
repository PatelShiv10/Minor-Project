#!/usr/bin/env python3
"""
Startup script for the NyAI Legal Chatbot FastAPI service
"""

import os
import sys
import subprocess
from pathlib import Path

def check_requirements():
    """Check if all required packages are installed"""
    try:
        import fastapi
        import uvicorn
        import google.generativeai
        import dotenv
        print("✅ All required packages are installed")
        return True
    except ImportError as e:
        print(f"❌ Missing required package: {e}")
        print("Please run: pip install -r requirements.txt")
        return False

def check_env_file():
    """Check if .env file exists and has GOOGLE_API_KEY"""
    env_file = Path(".env")
    if not env_file.exists():
        print("❌ .env file not found")
        print("Please create a .env file with your GOOGLE_API_KEY")
        return False
    
    with open(env_file) as f:
        content = f.read()
        if "GOOGLE_API_KEY" not in content:
            print("❌ GOOGLE_API_KEY not found in .env file")
            print("Please add GOOGLE_API_KEY=your_api_key_here to your .env file")
            return False
    
    print("✅ .env file and GOOGLE_API_KEY found")
    return True

def main():
    """Main startup function"""
    print("🚀 Starting NyAI Legal Chatbot Service...")
    print("=" * 50)
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    # Check environment
    if not check_env_file():
        sys.exit(1)
    
    print("\n🌐 Starting FastAPI server on http://localhost:8002")
    print("📚 API Documentation available at http://localhost:8002/docs")
    print("🔍 Health check available at http://localhost:8002/health")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 50)
    
    try:
        # Start the FastAPI server
        subprocess.run([
            sys.executable, "-m", "uvicorn", 
            "Chatbot:app", 
            "--host", "0.0.0.0", 
            "--port", "8002", 
            "--reload"
        ])
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
