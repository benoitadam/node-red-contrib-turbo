# Node-RED Contrib Helpers

Un ensemble d'outils utilitaires pour Node-RED qui simplifient les tâches courantes de manipulation de messages et d'assignation de valeurs.

## Installation

```bash
npm install node-red-contrib-helpers
```

## Nœuds disponibles

### helpers-get-set

Nœud polyvalent qui permet d'extraire des propriétés d'un message ou d'assigner des valeurs statiques selon le type de source choisi.

#### Configuration

- **Target Path**: Chemin de destination (ex: `payload`, `result[0].value`)
- **Source Type**: Type de source de données
- **Source Path**: Chemin source (visible pour Message Path)
- **Content**: Valeur statique (visible pour JSON/Text Value)

#### Types de Source

| Type | Description | Interface | Exemple |
|------|-------------|-----------|---------|
| **Message Path** | Extrait une valeur depuis un chemin du message | Champ Source Path | `payload.user.name`, `data.items[0]` |
| **JSON Value** | JSON statique parsé automatiquement | Éditeur Monaco JSON | `{"key": "value", "array": [1, 2, 3]}` |
| **Text Value** | Texte statique sans traitement | Éditeur Monaco texte | `Hello World`, `Configuration complete` |

#### Exemples d'utilisation

**Extraction depuis un chemin :**
```
Target: payload
Source Type: Message Path
Source Path: data.user.name
→ Copie msg.data.user.name vers msg.payload
```

**Assignation JSON statique :**
```
Target: config
Source Type: JSON Value
Content: {"enabled": true, "retries": 3, "timeout": 5000}
→ Assigne l'objet JSON à msg.config
```

**Assignation de texte :**
```
Target: status
Source Type: Text Value
Content: Processing completed successfully
→ Assigne la chaîne à msg.status
```

#### Fonctionnalités

- ✅ Interface conditionnelle selon le type de source sélectionné
- ✅ Éditeur Monaco avec coloration syntaxique (JSON/texte)
- ✅ Support des chemins imbriqués et indices de tableau
- ✅ Parsing automatique JSON vers objet JavaScript
- ✅ Gestion d'erreurs avec messages détaillés
- ✅ Validation du contenu requis pour les types statiques

## Licence

MIT