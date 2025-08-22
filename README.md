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

## Licence

MIT