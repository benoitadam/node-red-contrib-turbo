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

Upload files by providing file data in your payload:

```javascript
// Direct Buffer
msg.payload = {
    name: "My Document", 
    file: buffer  // Direct Buffer
};

// File object with Buffer
msg.payload = {
    name: "My Document",
    file: {
        file: {
            buffer: buffer,           // Buffer data
            name: "document.pdf",     // Filename
            type: "application/pdf"   // MIME type
        }
    }
};

// File object with URL (auto-downloads)
msg.payload = {
    name: "My Document",
    file: {
        file: {
            url: "https://example.com/file.pdf",
            name: "document.pdf",     // Optional: override filename
            type: "application/pdf"   // Optional: override MIME type
        }
    }
};

// File object with base64
msg.payload = {
    name: "My Document",
    file: {
        file: {
            base64: "iVBORw0KGgoAAAA...",
            name: "image.png",
            type: "image/png"
        }
    }
};

// Multiple files (arrays supported)
msg.payload = {
    name: "Gallery",
    photos: [
        buffer1,  // Direct Buffer
        { file: { url: "https://example.com/photo.jpg" } },  // URL
        { file: { base64: "...", name: "photo.png" } }       // base64
    ]
};
```

**Supported formats:**
- **Direct**: Buffer, File object
- **File object**: `{ file: { buffer/url/base64, name?, type? } }`
- **Arrays**: Mixed arrays of any supported format

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