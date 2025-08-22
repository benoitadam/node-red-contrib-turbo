# Node-RED Contrib Helpers

Un ensemble d'outils utilitaires pour Node-RED qui simplifient les tâches courantes de manipulation de messages et d'assignation de valeurs.

## Installation

```bash
npm install node-red-contrib-helpers
```

## Nœuds disponibles

### helpers-set

Nœud polyvalent qui permet de définir des valeurs aux propriétés d'un message depuis différentes sources : chemins, valeurs statiques ou templates.

#### Configuration

- **Target Path**: Chemin de destination (ex: `payload`, `result[0].value`)
- **Source Type**: Type de source de données
- **Source Path**: Chemin source (visible pour Message Path)
- **Content**: Valeur statique (visible pour JSON/Text Value)

#### Types de Source

| Type | Description | Interface | Exemple |
|------|-------------|-----------|---------|
| **Message Path** | Définit une valeur depuis un chemin du message | Champ Source Path | `payload.user.name`, `data.items[0]` |
| **JSON Value** | JSON statique parsé automatiquement | Éditeur Monaco JSON | `{"key": "value", "array": [1, 2, 3]}` |
| **JSON Template** | JSON avec templates interpolés | Éditeur Monaco JSON | `{"user": "{{payload.name}}", "id": {{data.id}}}` |
| **Text Value** | Texte statique sans traitement | Éditeur Monaco texte | `Hello World`, `Configuration complete` |
| **Text Template** | Texte avec templates interpolés | Éditeur Monaco texte | `Hello {{payload.name}}!`, `Status: {{data.status}}` |

#### Exemples d'utilisation

**Définition depuis un chemin :**
```
Target: payload
Source Type: Message Path
Source Path: data.user.name
→ Définit msg.payload = msg.data.user.name
```

**Définition JSON statique :**
```
Target: config
Source Type: JSON Value
Content: {"enabled": true, "retries": 3, "timeout": 5000}
→ Définit msg.config = objet JSON
```

**Définition avec template JSON :**
```
Target: result
Source Type: JSON Template
Content: {"user": "{{payload.name}}", "count": {{data.items.length}}}
→ Définit msg.result = objet JSON avec variables interpolées
```

**Définition de texte :**
```
Target: status
Source Type: Text Value
Content: Processing completed successfully
→ Définit msg.status = chaîne
```

**Définition avec template texte :**
```
Target: message
Source Type: Text Template
Content: Hello {{payload.user}}, you have {{data.count}} messages
→ Définit msg.message = texte avec variables interpolées
```

#### Fonctionnalités

- ✅ Interface conditionnelle selon le type de source sélectionné
- ✅ Éditeur Monaco avec coloration syntaxique (JSON/texte)
- ✅ Support des chemins imbriqués et indices de tableau
- ✅ Templates avec interpolation de variables `{{...}}`
- ✅ Parsing automatique JSON vers objet JavaScript
- ✅ Gestion d'erreurs avec messages détaillés
- ✅ 5 modes : Message Path, JSON/Text Value/Template

### helpers-shell

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

## Licence

MIT