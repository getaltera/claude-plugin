---
name: metaobjects-sync
description: Sync metaobject definitions and entries between Shopify stores using the Altera CLI — export from source store, review, and import to target store. Use when the user wants to copy, migrate, or sync metaobjects across stores.
argument-hint: "[source-domain] [target-domain]"
disable-model-invocation: true
---

## Sync Metaobjects Across Stores

You are syncing metaobject definitions and their entries from one Shopify store to another using the Altera CLI (`npx altera`).

### Prerequisites

- Both source and target shops must be configured: `npx altera shop list`
- Both API keys need appropriate permissions (read on source, write on target)
- Add a shop if needed: `npx altera shop add <domain>`

### General Rules

All temporary files (exports, import results, analysis files) go in the `.altera-sync/` subdirectory to keep the working directory clean. **Every** `npx altera export create` and `npx altera import create` command MUST include `--output .altera-sync`. Create the directory if it doesn't exist.

### Step 1: Gathering Parameters

1. Read store configurations from `npx altera shop list`
2. If the user specified source/destination stores, use those. Otherwise, list available stores and ask.
3. If importing specific metaobject types, run `npx altera export create metaobject_definitions:+id,+type --format csv --output .altera-sync -s <source-domain>` to get the list of types from the source store and ask which ones to sync.
5. Before executing, show a complete plan summary and wait for confirmation.

### Step 2: Export from source store

Use `-s` to target the source store directly (no need to switch with `shop use`). Use `--quiet` to suppress progress output. Use `--format csv` so files are easy to parse.

Export definitions and entries as **separate commands** (run them in parallel):

#### Export metaobject definitions
```
npx altera export create metaobject_definitions:+id,+type,+__command,+name,+description,+access__storefront,+access__admin,+capabilities__publishable__enabled,+capabilities__translatable__enabled,+capabilities__onlineStore__enabled,+capabilities__onlineStore__data__urlHandle,+capabilities__renderable__enabled,field_definitions --format csv --output .altera-sync --quiet -s <source-domain>
```

#### Export metaobject entries
```
npx altera export create metaobjects:+id,+handle,+__command,+displayName,+capabilities__publishable__status,+definition__type,+definition__name,+fields__key,+fields__value --format csv --output .altera-sync --quiet -s <source-domain>
```

To filter to a specific metaobject type, add `-f metaobjects.type=<type-handle>` to the entries export.

#### Save snapshots

After each export completes, copy the CSVs to a snapshot directory for reference:

```
metaobjects/<store-slug>/definitions/YYYY-MM-DD_HHmmss.csv
metaobjects/<store-slug>/entries/YYYY-MM-DD_HHmmss.csv
```

Use the store's domain slug (e.g. `my-store` from `my-store.myshopify.com`) and the current timestamp. Create the directories if they don't exist.

### Step 3: Inspect the exports

Use the spreadsheet reader to inspect each CSV:
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/read-spreadsheet.mjs <definitions-csv> --columns "Type,Name,Description,Field: Key,Field: Type,Field: Required"
node ${CLAUDE_PLUGIN_ROOT}/scripts/read-spreadsheet.mjs <entries-csv> --columns "Definition: Handle,Handle,Display Name,Status,Field,Value"
```

### Step 4: Review with the user

Present a summary:
- **Definitions to sync:** list each type with its field count and entry count
- **Entries to sync:** count per type
- Flag any potential conflicts (e.g. if target store might already have definitions with the same type handle)

### Step 5: Import to target store

Use `-s` to target the destination store directly.

#### Before importing: snapshot the target store's current state

Export the target store's current metaobject definitions and entries (in parallel) and save them as snapshots — this provides a rollback point if needed:

```
npx altera export create metaobject_definitions:+id,+type,+__command,+name,+description,+access__storefront,+access__admin,+capabilities__publishable__enabled,+capabilities__translatable__enabled,+capabilities__onlineStore__enabled,+capabilities__onlineStore__data__urlHandle,+capabilities__renderable__enabled,field_definitions --format csv --output .altera-sync --quiet -s <target-domain>
```
```
npx altera export create metaobjects:+id,+handle,+__command,+displayName,+capabilities__publishable__status,+definition__type,+definition__name,+fields__key,+fields__value --format csv --output .altera-sync --quiet -s <target-domain>
```

Save to the target store's snapshot directories:
```
metaobjects/<target-store-slug>/definitions/YYYY-MM-DD_HHmmss.csv
metaobjects/<target-store-slug>/entries/YYYY-MM-DD_HHmmss.csv
```

#### Import order matters:
1. **Definitions first** — the target store needs the definitions before entries can be created
2. **Entries second** — once definitions exist, import the entries

#### Import definitions

Analyze the file for errors:
```
npx altera import create <definitions-csv> --analyze-only --quiet -s <target-domain>
```

If no errors:
```
npx altera import create <definitions-csv> --output .altera-sync --quiet -s <target-domain>
```

#### Import entries

Analyze the file for errors:
```
npx altera import create <entries-csv> --analyze-only --quiet -s <target-domain>
```

If no errors:
```
npx altera import create <entries-csv> --output .altera-sync --quiet -s <target-domain>
```

### Step 6: Verify

Spot-check by exporting from the target store and comparing with the source snapshots using the spreadsheet reader. The provide a URL to the target store's admin for manual verification. The URL is in the format `https://admin.shopify.com/store/<store-slug>/content/metaobjects/entries/<metaobject-definition-type>`

### Transferring Files Between Stores

If metaobject entries reference files (images, videos, 3D models), those files must exist in the target store before importing entries that reference them. Only download the specific files referenced in the entries — not all files from the source store.

#### Extract filenames from entries

After exporting metaobject entries (Step 2), parse the entries CSV to extract filenames from file-type field values. Collect all unique filenames into a comma-separated list.

#### Download from source store
```
npx altera files download .altera-sync/<source-store-slug>/files --filename <comma-separated-filenames> --output .altera-sync --quiet -s <source-domain>
```

- `--filename` filters to only the files referenced in the entries
- `--output .altera-sync` sends the Excel summary to the temp directory, keeping the files directory clean with only the actual files

#### Upload to target store
```
npx altera files upload .altera-sync/<source-store-slug>/files --output .altera-sync --command NEW --quiet -s <target-domain>
```

Use `--command NEW` to only add files that don't already exist in the target store, avoiding duplicates.

After importing metaobject entries, check if there are any missing file references in the target store by analyzing the entries import result. If there are missing files, the import will fail with errors indicating which file references are missing. In that case, upload the missing files to the target store and re-run the entries import.

### Notes

- **Import order:** Definitions must exist before their entries can be imported
- **Snapshots:** Always taken before importing to the target store — stored in `metaobjects/<store-slug>/` with timestamps
- **Type handles are unique:** If the target store already has a definition with the same type handle, the import will merge/update it (MERGE command)
- **References between metaobjects:** If entries reference other metaobjects, ensure those types and entries exist in the target store first
- **File references:** Metaobject fields that reference files (images, etc.) may need the files to be uploaded to the target store separately using `npx altera files upload`
- **Store targeting:** Use `-s <domain>` on every command to be explicit about which store you're operating on — this avoids accidents from a stale `shop use` selection
- To filter metaobjects by type: `-f metaobjects.type=<handle>`
- To filter by update date: `-f metaobjects.updated_at>=2024-01-01`
- Run `npx altera --llm` for full CLI reference including async job management, field discovery (`ref fields`), and filter syntax
