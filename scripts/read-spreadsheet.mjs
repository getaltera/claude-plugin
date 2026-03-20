#!/usr/bin/env node

/**
 * Read and display spreadsheet files (xlsx, csv) in a terminal-friendly format.
 *
 * Usage:
 *   node read-spreadsheet.mjs <file> [options]
 *
 * Options:
 *   --sheet <name>        Show only this sheet (default: all sheets)
 *   --columns <col1,col2> Show only these columns
 *   --limit <n>           Limit to first n data rows (default: all)
 *   --offset <n>          Skip first n data rows (default: 0)
 *   --filter <col>=<val>  Filter rows where column contains value (repeatable)
 *   --summary             Show column names and row counts only
 *   --json                Output as JSON instead of table
 *   --sheets              List sheet names only
 */

import { resolve, extname } from "path";

// Dynamic import so the script fails gracefully if exceljs isn't installed
let ExcelJS;
try {
  ExcelJS = await import("exceljs");
} catch {
  console.error(
    "Error: exceljs package not installed. Run: npm install (in the scripts directory)"
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { filters: [] };
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--sheet" && argv[i + 1]) {
      args.sheet = argv[++i];
    } else if (arg === "--columns" && argv[i + 1]) {
      args.columns = argv[++i].split(",").map((c) => c.trim());
    } else if (arg === "--limit" && argv[i + 1]) {
      args.limit = parseInt(argv[++i], 10);
    } else if (arg === "--offset" && argv[i + 1]) {
      args.offset = parseInt(argv[++i], 10);
    } else if (arg === "--filter" && argv[i + 1]) {
      const expr = argv[++i];
      const eqIdx = expr.indexOf("=");
      if (eqIdx > 0) {
        args.filters.push({
          col: expr.slice(0, eqIdx),
          val: expr.slice(eqIdx + 1).toLowerCase(),
        });
      }
    } else if (arg === "--summary") {
      args.summary = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--sheets") {
      args.sheetsOnly = true;
    } else if (!arg.startsWith("--")) {
      args.file = arg;
    }
    i++;
  }
  return args;
}

function truncate(str, maxLen) {
  if (str == null) return "";
  const s = String(str);
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
}

function formatTable(headers, rows) {
  const widths = headers.map((h) => Math.min(h.length, 40));
  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const cellLen = truncate(row[i], 80).length;
      widths[i] = Math.min(Math.max(widths[i], cellLen), 80);
    }
  }

  const sep = widths.map((w) => "-".repeat(w)).join(" | ");
  const headerLine = headers
    .map((h, i) => truncate(h, widths[i]).padEnd(widths[i]))
    .join(" | ");

  const lines = [headerLine, sep];
  for (const row of rows) {
    lines.push(
      headers
        .map((_, i) => truncate(row[i], widths[i]).padEnd(widths[i]))
        .join(" | ")
    );
  }
  return lines.join("\n");
}

/**
 * Convert an exceljs worksheet to an array of row objects (like xlsx's sheet_to_json).
 */
function sheetToJson(worksheet) {
  const rows = [];
  const headers = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        headers[colNumber] = cell.value != null ? String(cell.value) : "";
      });
    } else {
      const obj = {};
      for (let col = 1; col <= headers.length; col++) {
        const header = headers[col];
        if (header == null) continue;
        const cell = row.getCell(col);
        obj[header] = cell.value != null ? cell.value : "";
      }
      rows.push(obj);
    }
  });
  return { headers: headers.filter(Boolean), rows };
}

function processSheet(worksheet, sheetName, args) {
  const { headers: allHeaders, rows: data } = sheetToJson(worksheet);
  if (data.length === 0) {
    console.log(`\n=== ${sheetName} (empty) ===\n`);
    return;
  }

  if (args.summary) {
    console.log(`\n=== ${sheetName} (${data.length} rows) ===`);
    console.log("Columns:");
    allHeaders.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
    return;
  }

  // Apply filters
  let filtered = data;
  for (const f of args.filters) {
    filtered = filtered.filter((row) => {
      const val = String(row[f.col] ?? "").toLowerCase();
      return val.includes(f.val);
    });
  }

  // Apply offset and limit
  const offset = args.offset || 0;
  const limit = args.limit ?? filtered.length;
  const sliced = filtered.slice(offset, offset + limit);

  // Select columns
  const headers = args.columns
    ? args.columns.filter((c) => allHeaders.includes(c))
    : allHeaders;

  if (headers.length === 0) {
    console.log(`\n=== ${sheetName} — no matching columns ===`);
    if (args.columns) {
      console.log("Available columns:", allHeaders.join(", "));
    }
    return;
  }

  const totalMsg =
    filtered.length !== data.length
      ? ` (${sliced.length} shown / ${filtered.length} matched / ${data.length} total)`
      : ` (${sliced.length} shown / ${data.length} total)`;

  console.log(`\n=== ${sheetName}${totalMsg} ===`);

  if (args.json) {
    const output = sliced.map((row) => {
      const obj = {};
      for (const h of headers) obj[h] = row[h];
      return obj;
    });
    console.log(JSON.stringify(output, null, 2));
  } else {
    const rows = sliced.map((row) => headers.map((h) => row[h]));
    console.log(formatTable(headers, rows));
  }
}

// Main
const args = parseArgs(process.argv);

if (!args.file) {
  console.error("Usage: node read-spreadsheet.mjs <file> [options]");
  console.error("Run with --help for all options.");
  process.exit(1);
}

const filePath = resolve(args.file);
const workbook = new ExcelJS.default.Workbook();
if (extname(filePath).toLowerCase() === ".csv") {
  await workbook.csv.readFile(filePath);
} else {
  await workbook.xlsx.readFile(filePath);
}

const sheetNames = workbook.worksheets.map((ws) => ws.name);

if (args.sheetsOnly) {
  console.log("Sheets:");
  workbook.worksheets.forEach((ws, i) => {
    const { rows } = sheetToJson(ws);
    console.log(`  ${i + 1}. ${ws.name} (${rows.length} rows)`);
  });
  process.exit(0);
}

const sheets = args.sheet
  ? workbook.worksheets.filter(
      (ws) => ws.name.toLowerCase() === args.sheet.toLowerCase()
    )
  : workbook.worksheets;

if (sheets.length === 0) {
  console.error(`Sheet "${args.sheet}" not found. Available: ${sheetNames.join(", ")}`);
  process.exit(1);
}

for (const ws of sheets) {
  processSheet(ws, ws.name, args);
}
