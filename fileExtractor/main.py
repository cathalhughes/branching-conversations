from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from docling.document_converter import DocumentConverter
from pathlib import Path
import tempfile
import os

app = FastAPI(
    title="Document Text Extraction API",
    description="Extract text from various document formats using Docling",
    version="1.0.0"
)

# Add CORS middleware to allow requests from NestJS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this to your NestJS app's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Document Text Extraction API is running"}

@app.post("/extract-text/")
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from uploaded document files.
    Supports PDF, DOCX, XLSX, HTML, images, and more.
    """
    # Check if file is provided
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Create temporary file
    temp_file = None
    try:
        # Create temporary file with proper suffix
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file_path = Path(temp_file.name)
            
            # Write uploaded file content to temporary file
            content = await file.read()
            temp_file.write(content)
            temp_file.flush()
        
        # Configure Docling converter
        converter = DocumentConverter()
        
        # Convert document
        result = converter.convert(str(temp_file_path))
        
        # Extract text as markdown
        text_content = result.document.export_to_markdown()
        
        return {
            "filename": file.filename,
            "content_type": file.content_type,
            "text": text_content,
            "success": True
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error processing document: {str(e)}"
        )
    
    finally:
        # Clean up temporary file
        if temp_file and temp_file_path.exists():
            os.unlink(temp_file_path)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "document-text-extraction"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)