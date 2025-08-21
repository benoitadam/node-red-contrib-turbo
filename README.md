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

### Smart Parameter Resolution

All nodes automatically extract collection and record ID from multiple sources with fallback logic:

```javascript
// Method 1: Explicit parameters
msg.collection = "users";
msg.recordId = "abc123";

// Method 2: PocketBase record (auto-extracted)
msg.payload = {
  id: "abc123",
  collectionName: "users",
  name: "John Doe",
  email: "john@example.com"
};

// Method 3: Separate record object
msg.record = pbRecord;  // PocketBase record
msg.payload = newData;  // Data for operations
```

**Resolution priority:**
1. Node configuration
2. `msg.collection` / `msg.recordId`
3. `record.collectionName` / `record.id` (auto-extracted)

**Chaining benefits:**
```
pb-get → pb-update → pb-delete
```
Collection and ID automatically propagate through `msg.collection` and `msg.recordId`.

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

// File object with local path
msg.payload = {
    name: "My Document",
    file: {
        file: {
            path: "/path/to/local/file.pdf",
            name: "document.pdf",        // Optional: override filename
            type: "application/pdf"      // Optional: override MIME type
        }
    }
};

// Multiple files (arrays supported)
msg.payload = {
    name: "Gallery",
    photos: [
        buffer1,  // Direct Buffer
        { file: { url: "https://example.com/photo.jpg" } },      // URL
        { file: { base64: "...", name: "photo.png" } },         // base64
        { file: { path: "/local/image.jpg", name: "local.jpg" } } // Local file
    ]
};
```

**Supported formats:**
- **Direct**: Buffer, File object, ArrayBuffer
- **File object**: `{ file: { buffer/url/base64/path, name?, type? } }`
- **Arrays**: Mixed arrays of any supported format

**File sources:**
- **buffer**: Direct Buffer or ArrayBuffer data
- **url**: HTTP/HTTPS URL (auto-downloaded)
- **base64**: Base64 encoded string data
- **path**: Local filesystem path (Node.js only)

### File Download (pb-download)

Download files from PocketBase records with automatic parameter resolution:

```javascript
// Method 1: Explicit parameters
msg.collection = "documents";
msg.recordId = "abc123"; 
msg.filename = "attachment";
msg.mode = "buffer";

// Method 2: Auto-extract from record
msg.payload = {
  id: "abc123",
  collectionName: "documents",
  attachment: "file1.pdf",
  photos: ["img1.jpg", "img2.png"]
};
// Auto-extracts: collection="documents", recordId="abc123", filename="attachment"

// Method 3: Multiple files with fields
msg.fields = "attachment,photos";  // Download specific file fields
msg.host = "cdn.example.com";     // Override URL host
```

**Download modes:**
- **`buffer`**: Returns file content as Node.js Buffer with metadata
- **`base64`**: Returns ready-to-use data URI with MIME type
- **`url`**: Returns only the file URL (no download)
- **`url+type`**: Returns file URL with MIME type (HEAD request only)

**Smart filename detection:**
1. `msg.filename` or node config
2. `record.file` (single file field name)
3. `msg.fields` (comma-separated multiple fields)

**Example flows:**
```
pb-get → pb-download → File Out        # Auto-chaining
pb-list → pb-download → Function       # Batch download
```

## ✅ Status

This project is **functional and working**.

## ⚠️ Disclaimer

- Adapt and customize for your needs
- Author not responsible for issues
- Test thoroughly before production use

## 📄 License

MIT License - Open source, modifiable, not for resale.