# Document Text Extraction API

A FastAPI service that extracts text from various document formats using Docling. Supports PDF, DOCX, XLSX, HTML, images, and more.

## Features

- Extract text from multiple document formats (PDF, DOCX, XLSX, HTML, images)
- RESTful API with CORS support for easy integration
- Health check endpoint
- Automatic cleanup of temporary files
- Built with FastAPI and Docling

## Setup

### Prerequisites

- Python 3.11 or higher

### Installation

1. Navigate to the fileExtractor directory:

```bash
cd fileExtractor
```

2. Create and activate a virtual environment:

```bash
# macOS/Linux
python3.11 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Running the Service

From within the fileExtractor directory, start the FastAPI server with uvicorn:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
- **API**: http://localhost:8000
- **Interactive docs**: http://localhost:8000/docs
- **Health check**: http://localhost:8000/health

## API Endpoints

### POST /extract-text/

Upload a document file and extract its text content.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form data with `file` field containing the document

**Response:**
```json
{
  "filename": "document.pdf",
  "content_type": "application/pdf",
  "text": "Extracted text content in markdown format...",
  "success": true
}
```

**Example using curl:**
```bash
curl -X POST -F "file=@./document.pdf" http://localhost:8000/extract-text/
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "document-text-extraction"
}
```

## Integration with NestJS

The API includes CORS middleware configured to accept requests from any origin. For production, update the `allow_origins` in `main.py` to your specific NestJS application URL.

**Example NestJS integration:**

```typescript
import { Injectable } from '@nestjs/common';
import FormData from 'form-data';
import fetch from 'node-fetch';

@Injectable()
export class DocumentService {
  async extractText(file: Express.Multer.File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname);

    const response = await fetch('http://localhost:8000/extract-text/', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    return result.text;
  }
}
```

## Supported File Formats

- PDF files
- Microsoft Word documents (DOCX)
- Microsoft Excel spreadsheets (XLSX)
- HTML files
- Image files (PNG, JPG, etc.)
- And more formats supported by Docling

## Development

To run in development mode with auto-reload (from within the fileExtractor directory):

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Production Deployment

For production deployment, consider:

1. Setting specific CORS origins instead of `allow_origins=["*"]`
2. Adding authentication/authorization
3. Implementing rate limiting
4. Using a production ASGI server like Gunicorn with Uvicorn workers
5. Adding logging and monitoring