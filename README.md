# Node-RED Contrib Turbo

A collection of utility nodes for Node-RED that simplify common message manipulation and value assignment tasks.

## Installation

```bash
npm install node-red-contrib-turbo
```

## Migration Notice

> **⚠️ turbo-ts has been migrated**  
> The `turbo-ts` node has been moved to a dedicated package: [`node-red-contrib-ts`](https://www.npmjs.com/package/node-red-contrib-ts)  
> 
> **For TypeScript support, please install:**
> ```bash
> npm install node-red-contrib-ts
> ```
> 
> This package now focuses on utility nodes (`turbo-set`, `turbo-exec`) for message manipulation and shell execution.

## Available Nodes

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