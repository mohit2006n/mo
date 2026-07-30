import { escapeHtml, fullHtmlDocument } from './content.js';
import { MIME, outputName, safeName } from './formats.js';
import { absoluteUrl, use } from './runtime.js';

let sqlRequest;

async function ensureSql() {
  if (sqlRequest) return sqlRequest;
  sqlRequest = use('sqljs').then(() =>
    initSqlJs({ locateFile: () => absoluteUrl('sql/sql-wasm.wasm') }),
  );
  return sqlRequest;
}

function safeTableName(value) {
  return (
    String(value)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'table'
  );
}

function jsonValue(value) {
  if (!(value instanceof Uint8Array)) return value;
  let binary = '';
  for (let index = 0; index < value.length; index += 0x8000) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x8000));
  }
  return `base64:${btoa(binary)}`;
}

function tableRows(database, table) {
  const escaped = table.replace(/"/g, '""');
  const statement = database.prepare(`SELECT * FROM "${escaped}"`);
  const rows = [];
  try {
    while (statement.step()) {
      const record = statement.getAsObject();
      rows.push(
        Object.fromEntries(Object.entries(record).map(([key, value]) => [key, jsonValue(value)])),
      );
    }
  } finally {
    statement.free();
  }
  return rows;
}

async function readTables(file, onProgress) {
  const SQL = await ensureSql();
  const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const query = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const names = query[0]?.values.map((row) => String(row[0])) || [];
    if (!names.length) throw new Error('The SQLite database contains no user tables');
    const tables = [];
    for (let index = 0; index < names.length; index++) {
      tables.push({ name: names[index], rows: tableRows(database, names[index]) });
      onProgress(20 + ((index + 1) / names.length) * 45);
    }
    return tables;
  } finally {
    database.close();
  }
}

export async function convertDatabase(item, target, onProgress) {
  if (target === item.ext) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }
  onProgress(8);
  const tables = await readTables(item.file, onProgress);
  const title = safeName(item.file.name);
  if (target === 'json') {
    const data = Object.fromEntries(tables.map((table) => [table.name, table.rows]));
    return {
      files: [
        {
          name: outputName(item.file, 'json'),
          blob: new Blob([JSON.stringify(data, null, 2)], { type: MIME.json }),
        },
      ],
    };
  }

  await use('xlsx');
  const workbook = XLSX.utils.book_new();
  for (const table of tables) {
    const sheet = XLSX.utils.json_to_sheet(table.rows);
    let sheetName = safeTableName(table.name).slice(0, 31) || 'Table';
    let index = 2;
    while (workbook.SheetNames.includes(sheetName)) {
      sheetName = `${safeTableName(table.name).slice(0, 27)}-${index++}`.slice(0, 31);
    }
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  onProgress(78);

  if (target === 'xlsx') {
    const array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', compression: true });
    return {
      files: [
        { name: outputName(item.file, 'xlsx'), blob: new Blob([array], { type: MIME.xlsx }) },
      ],
    };
  }
  if (target === 'csv') {
    const files = tables.map((table, index) => ({
      name: `${title}-${safeTableName(table.name || `table-${index + 1}`)}.csv`,
      blob: new Blob(
        [
          '\ufeff',
          XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[index]], { RS: '\n' }),
        ],
        { type: MIME.csv },
      ),
    }));
    return { files };
  }
  if (target === 'html') {
    const sections = tables
      .map(
        (table, index) =>
          `<section><h2>${escapeHtml(table.name)}</h2>${XLSX.utils.sheet_to_html(workbook.Sheets[workbook.SheetNames[index]], { editable: false })}</section>`,
      )
      .join('');
    return {
      files: [
        {
          name: outputName(item.file, 'html'),
          blob: new Blob(
            [fullHtmlDocument(`<main><h1>${escapeHtml(title)}</h1>${sections}</main>`, title)],
            {
              type: MIME.html,
            },
          ),
        },
      ],
    };
  }
  throw new Error('Unsupported database target');
}