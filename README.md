# Node-RED Contrib Turbo

A collection of utility nodes for Node-RED that simplify common message manipulation and value assignment tasks.

## Installation

```bash
npm install node-red-contrib-turbo
```

## Available Nodes

### turbo-ts

Execute TypeScript code with full Node-RED context and modern JavaScript features.

#### Configuration

- **Script**: TypeScript code editor with Monaco syntax highlighting
- **Outputs**: Number of outputs (1-10) 
- **Execution Mode**: Function mode (faster but less secure) or VM mode (safer)

#### Available Context

The following variables are automatically available in your TypeScript code:

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| **msg** | `any` | Current message object | `msg.payload`, `msg.topic` |
| **node** | `Node` | Current node instance | `node.log('info')`, `node.warn('warning')` |
| **RED** | `NodeAPI` | Node-RED API | `RED.util.getSetting()` |
| **global** | `any` | Global context | `global.get('config')` |
| **env** | `object` | Environment variables | `env.get('API_KEY')`, `env.get('DATABASE_URL')` |
| **fs** | `Promise<fs>` | File system (promises) | `await fs.readFile('file.txt')` |
| **path** | `path` | Path utilities | `path.join('/home', 'user')` |
| **os** | `os` | Operating system | `os.hostname()`, `os.platform()` |
| **crypto** | `crypto` | Cryptography | `crypto.randomUUID()` |
| **util** | `util` | Node utilities | `util.promisify()` |
| **Buffer** | `Buffer` | Buffer constructor | `Buffer.from('text')` |
| **fetch** | `fetch` | HTTP client | `await fetch('https://api.com')` |
| **process** | `process` | Process information | `process.env`, `process.version` |

#### Usage Examples

**Simple data transformation:**
```typescript
// Transform payload data
const data = msg.payload;
msg.payload = {
    processed: true,
    timestamp: new Date().toISOString(),
    data: data.map(item => item.name.toLowerCase())
};

return msg;
```

**HTTP API call with environment variables:**
```typescript
// Get API credentials from environment
const apiKey = env.get('API_KEY');
const baseUrl = env.get('API_BASE_URL') || 'https://api.example.com';

// Make authenticated request
const response = await fetch(`${baseUrl}/users/${msg.payload.userId}`, {
    headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    }
});

const userData = await response.json();

return {
    ...msg,
    payload: userData,
    statusCode: response.status
};
```

**File operations:**
```typescript
// Read configuration file
const configPath = path.join(process.cwd(), 'config', 'app.json');
const configData = await fs.readFile(configPath, 'utf8');
const config = JSON.parse(configData);

// Log system information
node.log(`Running on ${os.platform()} ${os.arch()}`);
node.log(`Node.js version: ${process.version}`);

return {
    ...msg,
    payload: {
        config,
        system: {
            platform: os.platform(),
            hostname: os.hostname(),
            nodeVersion: process.version
        }
    }
};
```

**Multiple outputs:**
```typescript
// Process message and route to different outputs
const data = msg.payload;
const outputs = [];

if (data.type === 'user') {
    outputs[0] = { ...msg, payload: data }; // User output
    outputs[1] = null; // No admin output
} else if (data.type === 'admin') {
    outputs[0] = null; // No user output  
    outputs[1] = { ...msg, payload: data }; // Admin output
}

return outputs;
```

#### Features

- ✅ **Full TypeScript support** with Monaco editor (VS Code editor)
- ✅ **Async/await ready** - code runs in async function
- ✅ **Rich context** - Access to Node-RED, Node.js APIs, and environment variables
- ✅ **Multiple execution modes** - Function (fast) or VM (secure)
- ✅ **Multiple outputs** - Support for 1-10 outputs with routing logic
- ✅ **Monaco editor** - Syntax highlighting, IntelliSense, error detection
- ✅ **Error handling** - Comprehensive error reporting and debugging
- ✅ **TypeScript compilation** - Real-time TypeScript to JavaScript compilation

#### Editor Improvements

- **Monaco Editor Integration**: Uses the same editor as VS Code
- **TypeScript Validation**: Smart error filtering for Node-RED context
- **Auto-completion**: IntelliSense for all available context variables
- **Syntax Highlighting**: Full TypeScript syntax highlighting
- **Error Suppression**: Filters out false-positive errors for `await` usage

### turbo-set

Versatile node that allows setting message property values from different sources: paths, static values, or templates.

#### Configuration

- **Target Path**: Destination path (ex: `payload`, `result[0].value`)
- **Source Type**: Type of data source
- **Source Path**: Source path (visible for Message Path)
- **Content**: Static value (visible for JSON/Text Value)

#### Source Types

| Type | Description | Interface | Example |
|------|-------------|-----------|---------|
| **Message Path** | Sets value from message path | Source Path field | `payload.user.name`, `data.items[0]` |
| **JSON Value** | Static JSON automatically parsed | Monaco JSON editor | `{"key": "value", "array": [1, 2, 3]}` |
| **JSON Template** | JSON with interpolated templates | Monaco JSON editor | `{"user": "{{payload.name}}", "id": {{data.id}}}` |
| **Text Value** | Static text without processing | Monaco text editor | `Hello World`, `Configuration complete` |
| **Text Template** | Text with interpolated templates | Monaco text editor | `Hello {{payload.name}}!`, `Status: {{data.status}}` |

#### Usage Examples

**Set from path:**
```
Target: payload
Source Type: Message Path
Source Path: data.user.name
→ Sets msg.payload = msg.data.user.name
```

**Set static JSON:**
```
Target: config
Source Type: JSON Value
Content: {"enabled": true, "retries": 3, "timeout": 5000}
→ Sets msg.config = JSON object
```

**Set with JSON template:**
```
Target: result
Source Type: JSON Template
Content: {"user": "{{payload.name}}", "count": {{data.items.length}}}
→ Sets msg.result = JSON object with interpolated variables
```

**Set static text:**
```
Target: status
Source Type: Text Value
Content: Processing completed successfully
→ Sets msg.status = string
```

**Set with text template:**
```
Target: message
Source Type: Text Template
Content: Hello {{payload.user}}, you have {{data.count}} messages
→ Sets msg.message = text with interpolated variables
```

#### Features

- ✅ Conditional interface based on selected source type
- ✅ Monaco editor with syntax highlighting (JSON/text)
- ✅ Support for nested paths and array indices
- ✅ Templates with variable interpolation `{{...}}`
- ✅ Automatic JSON parsing to JavaScript object
- ✅ Error handling with detailed messages
- ✅ 5 modes: Message Path, JSON/Text Value/Template

### turbo-exec

Execute shell commands with configurable execution modes and timeout control.

#### Configuration

- **Mode**: Execution method (Exec or Spawn)
- **Timeout**: Maximum execution time in seconds (1-300)
- **Script**: Shell commands to execute with Monaco editor

#### Execution Modes

| Mode | Description | Outputs | Use Case |
|------|-------------|---------|----------|
| **Exec** | Buffered execution, collects all output | 1 output: `{out, err, success, code}` | System commands, quick scripts |
| **Spawn** | Streaming execution, real-time output | 3 outputs: stdout, stderr, result | Long-running processes, log monitoring |

#### Examples

**System Information (Exec mode):**
```bash
uname -a
df -h
free -m
```
→ Returns complete system info in single result

**Log Monitoring (Spawn mode):**
```bash
tail -f /var/log/application.log
```
→ Streams log entries in real-time

**Build Process (Spawn mode):**
```bash
npm install
npm run build
npm test
```
→ Monitor build progress with real-time feedback

#### Features

- ✅ Two execution modes: buffered (exec) and streaming (spawn)
- ✅ Configurable timeout protection (1-300 seconds)
- ✅ Monaco editor with shell script syntax highlighting
- ✅ Process cleanup on node shutdown
- ✅ Cross-platform support (Windows/Linux/macOS)
- ✅ Real-time output streaming in spawn mode
- ✅ Comprehensive error handling and reporting

#### Security Notes

- Commands run with Node-RED process permissions
- Validate input to prevent command injection
- Use timeout to prevent runaway processes
- Consider restricted shells for untrusted input

## License

MIT