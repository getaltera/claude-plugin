# Altera Claude Code Plugin

A [Claude Code](https://claude.ai/claude-code) plugin with skills for managing Shopify stores using the [Altera Shopify App](https://apps.shopify.com/altera-import-export) and [CLI](https://www.npmjs.com/package/altera).  Altera is a Matrixify-compatible bulk import/export tool for Shopify with support for expanded data types like metaobject definitions, translations and locations.

## Installation

```
/plugin install altera@getaltera
```

## Skills

| Skill | Description |
|-------|-------------|
| `/altera:metaobjects-sync` | Sync metaobject definitions and entries between Shopify stores |

## Prerequisites

- **Altera app** — Install the [Altera](https://apps.shopify.com/altera) Shopify app on your store(s) and generate API keys.
- **Altera CLI** — Install via `npm install -g altera` or use with `npx altera`
- **Store configuration** — Add your stores with `npx altera shop add <domain>`

## License

MIT
