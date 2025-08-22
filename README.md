# Node-RED Contrib Helpers

Un ensemble d'outils utilitaires pour Node-RED qui simplifient les t�ches courantes de manipulation de messages.

## Installation

```bash
npm install node-red-contrib-helpers
```

## NSuds disponibles

### helpers-get-set

Extrait une propri�t� d'un message � partir d'un chemin et la place dans le payload ou dans une autre propri�t�.

**Param�tres :**
- **Source Path**: Chemin vers la propri�t� source (ex: `msg.a.b.c`)
- **Target Path**: Chemin vers la destination (ex: `msg.payload` ou `msg.b.c[5].a`)

**Exemple d'utilisation :**
- Source: `msg.data.user.name`
- Target: `msg.payload`
- R�sultat: La valeur de `msg.data.user.name` sera copi�e dans `msg.payload`

## Licence

MIT