# Node-RED PocketBase Integration

A comprehensive Node-RED node package for seamless PocketBase integration, providing authentication, CRUD operations, and real-time subscriptions.

## 🚀 Features

- **Authentication Management**: Secure admin authentication with automatic token caching
- **CRUD Operations**: Complete Create, Read, Update, Delete operations on PocketBase collections
- **Real-time Subscriptions**: Live updates from PocketBase collections
- **Smart Token Management**: Automatic token sharing across flow context
- **TypeScript**: Full TypeScript implementation for better development experience
- **ESBuild**: Lightning-fast build process

## 📦 Nodes Included

### 🔐 pb-auth
Authenticates with PocketBase as admin and stores the token for other nodes.

**Outputs:**
- `msg.payload`: Authentication response data
- `msg.pb`: Authenticated PocketBase client instance
- `msg.pb_token`: Authentication token
- Stores token in flow context for automatic reuse

### 🗄️ pb-crud
Performs CRUD operations on PocketBase collections with intelligent authentication.

**Operations:**
- `getList`: Retrieve collection records with pagination, filtering, and sorting
- `getOne`: Get a specific record by ID
- `create`: Create new records
- `update`: Update existing records
- `delete`: Delete records

**Smart Authentication:**
- Uses `msg.pb` if available (from pb-auth node)
- Falls back to flow context token
- Auto-authenticates using environment variables if needed

**Input Parameters:**
- `msg.collection`: Collection name
- `msg.operation`: Operation type
- `msg.id`: Record ID (for getOne, update, delete)
- `msg.data`: Record data (for create, update)
- `msg.page`, `msg.perPage`: Pagination (for getList)
- `msg.filter`, `msg.sort`: Query options (for getList)

### 📡 pb-realtime
Subscribe to real-time changes in PocketBase collections.

**Features:**
- Subscribe/unsubscribe to collection changes
- Automatic cleanup on node closure
- Emits real-time events for create, update, delete operations

**Outputs:**
- `msg.payload.action`: Event type (create, update, delete)
- `msg.payload.record`: Changed record data

## 🔧 Installation

### Docker Environment
This package is designed to work with Docker-based Node-RED deployments.

1. Place the package in your `lib/pocketbase` directory
2. Mount it in your `docker-compose.yml`:
```yaml
volumes:
  - ./lib/pocketbase:/usr/src/node-red/node_modules/node-red-contrib-pocketbase
```

### Environment Variables
Set these environment variables for automatic authentication:

```env
PB_API_URL=http://localhost:8090
PB_ADMIN_USERNAME=admin@example.com
PB_ADMIN_PASSWORD=your_password
```

## 🏗️ Development

### Build System
This project uses ESBuild for fast TypeScript compilation:

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development with watch mode
npm run dev

# Type checking only
npm run lint

# Clean build directory
npm run clean
```

### Project Structure
```
lib/pocketbase/
├── src/
│   ├── common.ts         # Shared utilities and types
│   ├── pb-auth.ts        # Authentication node
│   ├── pb-crud.ts        # CRUD operations node
│   └── pb-realtime.ts    # Real-time subscriptions node
├── dist/                 # Built JavaScript files
├── *.html               # Node-RED UI templates
├── esbuild.config.js    # Build configuration
├── package.json         # Package configuration
└── tsconfig.json        # TypeScript configuration
```

## 📖 Usage Examples

### Basic Authentication Flow
```
Inject → pb-auth → pb-crud (getList) → Debug
```

### Auto-Authentication (No explicit auth needed)
```
Inject → pb-crud (getList) → Debug
```

### Real-time Monitoring
```
Inject → pb-realtime (subscribe) → Debug
```

### Complete Workflow
```
pb-auth → pb-crud (create) → pb-realtime (subscribe)
    ↓
  Debug (real-time updates)
```

## 🔄 Token Management

The package implements intelligent token management:

1. **pb-auth** stores authentication tokens in Node-RED flow context
2. **pb-crud** and **pb-realtime** automatically reuse stored tokens
3. Tokens are cached with expiration (7 days)
4. Automatic re-authentication when tokens expire
5. Fallback to environment variables for seamless operation

## ⚙️ Configuration

### Node Configuration
Each node can be configured through the Node-RED interface:

- **pb-auth**: API URL, username, password (optional if using env vars)
- **pb-crud**: Collection name, operation type
- **pb-realtime**: Collection name, action (subscribe/unsubscribe)

### Message-based Configuration
All nodes support dynamic configuration through message properties:

```javascript
msg.collection = "users";
msg.operation = "getList";
msg.filter = "status = 'active'";
msg.sort = "-created";
```

## 🛠️ Technical Details

- **TypeScript**: Full type safety and IntelliSense support
- **ESBuild**: Ultra-fast builds (10-100x faster than tsc)
- **CommonJS**: Compatible with Node-RED's module system
- **External Dependencies**: PocketBase SDK and Node-RED APIs are externalized
- **Source Maps**: Included for debugging

## 📄 License

This project is designed for M4K (Media for Kiosks) platform integration.

## 🤝 Contributing

This package is part of the M4K ecosystem. For contributions or issues, please refer to the main project repository.

---

**Built with ❤️ using TypeScript, ESBuild, and the PocketBase SDK**