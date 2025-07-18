# Cloudflare Document Translator

A serverless document translation application built on Cloudflare Workers that provides intelligent document translation with format preservation and multi-language support.

## Overview

This application leverages Cloudflare's edge computing platform to deliver fast, scalable document translation services. It supports PDF and TXT files, extracts text with formatting preservation, and translates content using Cloudflare AI's Meta M2M100 model.

## Architecture

### Document Lifecycle Flow

```
1. UPLOAD
┌─────────────────┐
│   User Device   │
│                 │
│ [document.pdf]  │
└─────────────────┘
         │
         ▼ HTTP POST /upload
┌─────────────────┐
│ Cloudflare Edge │
│                 │
│ • File validate │
│ • Size check    │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Workers Runtime │
│                 │
│ • Generate ID   │
│ • Extract text  │
│ • Preserve fmt  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ R2 Storage      │
│                 │
│ • Store file    │
│ • Store text    │
│ • Store metadata│
└─────────────────┘

2. TRANSLATION
┌─────────────────┐
│ Workers Runtime │
│                 │
│ • Chunk text    │
│ • Prepare batch │
└─────────────────┘
         │
         ▼ Translation request
┌─────────────────┐
│ Cloudflare AI   │
│                 │
│ • Meta M2M100   │
│ • Process batch │
│ • Return trans  │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ KV Store        │
│                 │
│ • Cache results │
│ • Store metadata│
└─────────────────┘

3. DOWNLOAD
┌─────────────────┐
│ Workers Runtime │
│                 │
│ • Retrieve text │
│ • Format output │
└─────────────────┘
         │
         ▼ HTTP GET /download
┌─────────────────┐
│   User Device   │
│                 │
│ [translated.txt]│
└─────────────────┘
```

### System Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Web Client** | User interface | HTML5 + JavaScript |
| **Cloudflare Edge** | Global CDN & routing | Cloudflare Network |
| **Workers Runtime** | Serverless compute | V8 JavaScript Engine |
| **R2 Storage** | Document storage | Object storage |
| **KV Store** | Metadata cache | Key-value database |
| **Cloudflare AI** | Translation engine | Meta M2M100-1.2B |

## Features

### Document Processing
- **PDF Support**: Extracts text from PDF files using Cloudflare AI's `toMarkdown()` method
- **TXT Support**: Direct text file processing with formatting preservation
- **Format Preservation**: Maintains document structure, paragraphs, and spacing
- **File Validation**: Secure file type and size validation

### Translation Engine
- **Multi-Language Support**: 10+ languages including EN, ES, FR, DE, IT, PT, RU, JA, KO, ZH
- **AI-Powered Translation**: Meta AI M2M100-1.2B model via Cloudflare AI
- **Text Chunking**: Smart text segmentation for optimal translation quality
- **Auto-Detection**: Automatic source language detection

### User Experience
- **One-Click Workflow**: Upload and translate in a single action
- **Real-Time Status**: Progress tracking throughout the translation process
- **Professional UI**: Dark theme with Cloudflare branding
- **Responsive Design**: Works on desktop and mobile devices

### Infrastructure
- **Serverless**: Built on Cloudflare Workers for global edge deployment
- **Scalable Storage**: Cloudflare R2 for document storage
- **Fast Caching**: Cloudflare KV for metadata and translation cache
- **Security**: CORS enabled, file size limits, and secure document handling

## Supported File Formats

| Format | Extension | Processing Method | Status |
|--------|-----------|-------------------|--------|
| PDF    | `.pdf`    | Cloudflare AI `toMarkdown()` | ✅ Supported |
| Text   | `.txt`    | Direct text processing | ✅ Supported |
| Word   | `.docx`   | Manual conversion to TXT | ⚠️ Manual conversion required |

## API Documentation

### Upload Document
```http
POST /upload
Content-Type: multipart/form-data

Response:
{
  "documentId": "unique-document-id",
  "fileName": "document.pdf",
  "status": "uploaded",
  "textLength": 1234,
  "message": "Document uploaded successfully"
}
```

### Translate Document
```http
POST /translate
Content-Type: application/json

{
  "documentId": "unique-document-id",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}

Response:
{
  "documentId": "unique-document-id",
  "translatedLength": 1456,
  "status": "translated"
}
```

### Download Documents
```http
GET /download?documentId=unique-document-id&type=original
GET /download?documentId=unique-document-id&type=translated
```

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account with Workers plan
- Wrangler CLI installed

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/cloudflare-document-translator.git
   cd cloudflare-document-translator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Cloudflare resources:**
   
   Create an R2 bucket:
   ```bash
   wrangler r2 bucket create document-translator-storage
   ```
   
   Create a KV namespace:
   ```bash
   wrangler kv:namespace create TRANSLATION_CACHE
   ```
   
   Update the KV namespace ID in `wrangler.jsonc`

4. **Deploy:**
   ```bash
   npm run deploy
   ```

### Configuration

Update `wrangler.jsonc` with your resource IDs:

```json
{
  "name": "document-translator",
  "compatibility_date": "2024-01-01",
  "vars": {
    "MAX_FILE_SIZE": "52428800",
    "AUTORAG_API_URL": "https://api.autorag.com/v1"
  },
  "r2_buckets": [
    {
      "binding": "DOCUMENTS",
      "bucket_name": "document-translator-storage"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "TRANSLATION_CACHE",
      "id": "your-kv-namespace-id"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

## Development

### Local Development
```bash
# Start development server
npm run dev

# Access at http://localhost:8787
```

### Testing
```bash
# Run tests
npm run test

# Run linting
npm run lint
```

### Deployment
```bash
# Deploy to production
npm run deploy

# Deploy to staging
npm run deploy:staging
```

## Performance

- **Cold Start**: < 50ms on Cloudflare Edge
- **File Processing**: ~1-2 seconds per MB
- **Translation Speed**: ~500 words per second
- **Global Availability**: 300+ edge locations

## Security

- **File Size Limits**: 50MB maximum per file
- **File Type Validation**: Strict file type checking
- **CORS Protection**: Configured for web interface security
- **Unique Document IDs**: Prevents unauthorized access
- **Temporary Storage**: Documents auto-deleted after processing

## Monitoring

- **Cloudflare Analytics**: Built-in request monitoring
- **Worker Metrics**: Performance and error tracking
- **R2 Storage Metrics**: Storage usage and costs
- **AI Usage Tracking**: Translation API call monitoring

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- Review [Cloudflare AI documentation](https://developers.cloudflare.com/workers-ai/)

## Roadmap

- [ ] PDF output generation for translated documents
- [ ] Batch document processing
- [ ] Advanced formatting preservation
- [ ] Additional file format support
- [ ] Translation quality metrics
- [ ] Custom translation models
