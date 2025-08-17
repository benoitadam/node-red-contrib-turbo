# Node-RED PocketBase Integration

Node-RED nodes for PocketBase integration: authentication, CRUD operations, and real-time subscriptions.

## Installation

```bash
npm install
npm run build
```

## Nodes

- **pb-auth**: Authenticate with PocketBase
- **pb-list**: List records from collections  
- **pb-get**: Get a specific record
- **pb-create**: Create new records
- **pb-update**: Update existing records
- **pb-delete**: Delete records
- **pb-realtime**: Real-time collection subscriptions
- **pb-download**: Download files from PocketBase

## Usage

```
Inject → pb-auth → pb-list → Debug
```

## File Upload & Download

### File Upload (pb-create / pb-update)

Upload files by providing Buffer data in your payload:

```javascript
// Single file upload
msg.payload = {
    name: "My Document", 
    file: msg.payload  // Direct Buffer
};

// Single file with metadata
msg.payload = {
    name: "My Document",
    file: {
        buffer: msg.payload,      // Buffer data
        filename: "document.pdf", // Original filename
        mimetype: "application/pdf" // MIME type
    }
};

// Multiple files upload
msg.payload = {
    name: "Photo Gallery",
    photos: [                     // Array for multiple files
        { 
            buffer: buffer1, 
            filename: "photo1.jpg", 
            mimetype: "image/jpeg" 
        },
        { 
            buffer: buffer2, 
            filename: "photo2.png", 
            mimetype: "image/png" 
        }
    ]
};
return msg;
```

**Supported formats:**
- **Single file**: Direct Buffer or `{ buffer, filename, mimetype }`
- **Multiple files**: Array of Buffer objects or metadata objects
- Automatic indexing for unnamed files: `source_0`, `source_1`, etc.

### File Download (pb-download)

Download files from PocketBase records:

```javascript
// Download configuration
msg.collection = "documents";
msg.recordId = "abc123"; 
msg.filename = "attachment.pdf";
msg.mode = "buffer"; // "buffer", "base64", or "url"
return msg;
```

**Download modes:**
- **`buffer`**: Returns file content as Node.js Buffer
- **`base64`**: Returns file content as base64 encoded string  
- **`url`**: Returns only the file URL (no download)

**Example flow:**
```
Inject → pb-auth → pb-download → Function → File Out
```

## ✅ Status

This project is **functional and working**.

## ⚠️ Disclaimer

- Adapt and customize for your needs
- Author not responsible for issues
- Test thoroughly before production use

## 📄 License

MIT License - Open source, modifiable, not for resale.