import { fullHtmlDocument } from './content.js';
import { MIME, outputName, safeName } from './formats.js';
import { absoluteUrl, use, runBackground } from './runtime.js';
import { convertToPdf, PDF_FILTERS } from './suite.js';

async function parseSpreadsheet(e) {
  const { data } = e;
  importScripts(data.xlsxUrl);
  const { buffer, ext } = data;
  let workbook;

  const XLSXLib = XLSX;
  const binaryWorkbookFormats = ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'ods', 'ots', 'dbf'];

  if (binaryWorkbookFormats.includes(ext)) {
    workbook = XLSXLib.read(buffer, { type: 'array', cellDates: true });
  } else {
    const text = new TextDecoder().decode(buffer);
    workbook = XLSXLib.read(text, { type: 'string', FS: ext === 'tsv' ? '\t' : ',' });
  }

  const first = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSXLib.utils.sheet_to_json(first, { defval: null, raw: true });

  const html = XLSXLib.utils.sheet_to_html(first, { id: 'converted-table', editable: false });

  self.postMessage({ rows, html });
}

async function buildSpreadsheet(e) {
  const { data } = e;
  importScripts(data.xlsxUrl);
  const { rows, target } = data;

  const XLSXLib = XLSX;
  const sheet = XLSXLib.utils.json_to_sheet(rows);
  const workbook = XLSXLib.utils.book_new();
  XLSXLib.utils.book_append_sheet(workbook, sheet, 'Data');

  if (target === 'xlsx' || target === 'ods') {
    const array = XLSXLib.write(workbook, { type: 'array', bookType: target, compression: true });
    const buffer = array.buffer || array;
    self.postMessage({ bytes: array }, [buffer]);
  } else if (target === 'csv' || target === 'tsv') {
    const text = XLSXLib.utils.sheet_to_csv(sheet, {
      FS: target === 'tsv' ? '\t' : ',',
      RS: '\n',
      blankrows: true,
    });
    const bytes = new TextEncoder().encode('\ufeff' + text);
    const buffer = bytes.buffer || bytes;
    self.postMessage({ bytes }, [buffer]);
  }
}

async function buildHtmlTable(e) {
  const { data } = e;
  importScripts(data.xlsxUrl);
  const { rows } = data;

  const XLSXLib = XLSX;
  const sheet = XLSXLib.utils.json_to_sheet(rows);
  const html = XLSXLib.utils.sheet_to_html(sheet, { id: 'converted-table', editable: false });
  self.postMessage({ html });
}

function xmlValue(element) {
  const children = [...element.children];
  const attributes = Object.fromEntries(
    [...element.attributes].map((attribute) => [`@${attribute.name}`, attribute.value]),
  );
  if (!children.length) {
    const text = (element.textContent || '').trim();
    return Object.keys(attributes).length ? { ...attributes, '#text': text } : text;
  }
  const parsed = { ...attributes };
  for (const child of children) {
    const key = child.localName || child.nodeName;
    const value = xmlValue(child);
    if (!(key in parsed)) parsed[key] = value;
    else if (Array.isArray(parsed[key])) parsed[key].push(value);
    else parsed[key] = [parsed[key], value];
  }
  return parsed;
}

function parseXml(source) {
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror') || !document.documentElement) {
    throw new Error('Invalid XML document');
  }
  return { [document.documentElement.localName]: xmlValue(document.documentElement) };
}

function parseIni(source) {
  const parsed = {};
  let section = parsed;
  for (const rawLine of source.replace(/^\ufeff/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) {
      const path = heading[1]
        .split('.')
        .map((value) => value.trim())
        .filter(Boolean);
      section = parsed;
      for (const part of path) section = section[part] ||= {};
      continue;
    }
    const separator = line.search(/[:=]/);
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    section[key] = /^(true|false)$/i.test(value)
      ? value.toLowerCase() === 'true'
      : /^-?\d+(?:\.\d+)?$/.test(value)
        ? Number(value)
        : value.replace(/^("|')|("|')$/g, '');
  }
  return parsed;
}

async function parseStructured(item) {
  const source = await item.file.text();
  if (item.ext === 'json') return JSON.parse(source);
  if (item.ext === 'ndjson')
    return source
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          throw new Error(`Invalid NDJSON on line ${index + 1}`);
        }
      });
  if (item.ext === 'xml') return parseXml(source);
  if (item.ext === 'ini') return parseIni(source);
  if (item.ext === 'toml') {
    const { parse } = await import(absoluteUrl('smol-toml/index.js'));
    return parse(source);
  }
  await use('yaml');
  return jsyaml.load(source);
}

function findRecordArray(value, depth = 0) {
  if (depth > 5 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value) && value.every((entry) => entry && typeof entry === 'object'))
    return value;
  if (Array.isArray(value)) return null;
  for (const child of Object.values(value)) {
    const found = findRecordArray(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function flattenRecord(value, prefix = '', flat = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenRecord(child, prefix ? `${prefix}.${key}` : key, flat);
    }
  } else flat[prefix || 'value'] = Array.isArray(value) ? JSON.stringify(value) : value;
  return flat;
}

function rowsFromStructured(data) {
  const records = findRecordArray(data);
  if (records) return records.map((value) => flattenRecord(value));
  if (Array.isArray(data)) {
    if (!data.length) return [];
    return data.map((value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? flattenRecord(value)
        : { value: Array.isArray(value) ? JSON.stringify(value) : value },
    );
  }
  if (data && typeof data === 'object') return [flattenRecord(data)];
  return [{ value: data }];
}

async function dataToWorkbook(item) {
  await use('xlsx');
  let workbook;
  const binaryWorkbookFormats = [
    'xls',
    'xlsx',
    'xlsm',
    'xlsb',
    'xltx',
    'xltm',
    'ods',
    'ots',
    'dbf',
  ];
  const textWorkbookFormats = ['csv', 'tsv', 'dif', 'sylk', 'fods'];
  if (binaryWorkbookFormats.includes(item.ext))
    workbook = XLSX.read(await item.file.arrayBuffer(), { type: 'array', cellDates: true });
  else if (textWorkbookFormats.includes(item.ext))
    workbook = XLSX.read(await item.file.text(), {
      type: 'string',
      FS: item.ext === 'tsv' ? '\t' : ',',
    });
  else {
    const data = await parseStructured(item);
    const sheet = XLSX.utils.json_to_sheet(rowsFromStructured(data));
    workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
  }
  if (!workbook.SheetNames.length) throw new Error('No readable table was found');
  return workbook;
}

function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowsToXml(rows) {
  const body = rows
    .map(
      (row) =>
        `<row>${Object.entries(row)
          .map(
            ([key, value]) => `<field name="${escapeXmlText(key)}">${escapeXmlText(value)}</field>`,
          )
          .join('')}</row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<data>${body}</data>\n`;
}

function iniValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /[\n;#=]/.test(value)) return JSON.stringify(value);
  return String(value);
}

function rowsToIni(rows) {
  return `${rows
    .map(
      (row, index) =>
        `[row${index + 1}]\n${Object.entries(row)
          .map(([key, value]) => `${key}=${iniValue(value)}`)
          .join('\n')}`,
    )
    .join('\n\n')}\n`;
}

function tomlSafe(value) {
  if (Array.isArray(value)) return value.map(tomlSafe);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, tomlSafe(child)]));
  }
  return value === null || value === undefined ? '' : value;
}

export async function convertData(item, target, onProgress) {
  if (target === item.ext) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }
  onProgress(8);
  if (target === 'pdf' && PDF_FILTERS[item.ext]) {
    const blob = await convertToPdf(item, onProgress);
    return { files: [{ name: outputName(item.file, 'pdf'), blob }] };
  }
  const spreadsheetFormats = ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'ods', 'ots', 'fods'];
  const allSpreadsheetFormats = ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'ods', 'ots', 'dbf', 'csv', 'tsv', 'dif', 'sylk', 'fods'];
  const isSpreadsheetInput = allSpreadsheetFormats.includes(item.ext);
  let rows, html;

  if (isSpreadsheetInput) {
    const buffer = await item.file.arrayBuffer();
    const result = await runBackground(
      parseSpreadsheet,
      { xlsxUrl: absoluteUrl('xlsx.full.min.js'), buffer, ext: item.ext },
      [buffer]
    );
    rows = result.rows;
    html = result.html;
  } else {
    const data = await parseStructured(item);
    rows = rowsFromStructured(data);
  }

  onProgress(48);
  let blob;

  if (target === 'xlsx' || target === 'ods' || target === 'csv' || target === 'tsv') {
    const { bytes } = await runBackground(
      buildSpreadsheet,
      { xlsxUrl: absoluteUrl('xlsx.full.min.js'), rows, target }
    );
    blob = new Blob([bytes], { type: MIME[target] });
  } else if (['json', 'ndjson', 'yaml', 'xml', 'toml', 'ini'].includes(target)) {
    if (target === 'json') blob = new Blob([JSON.stringify(rows, null, 2)], { type: MIME.json });
    else if (target === 'ndjson')
      blob = new Blob([rows.map((row) => JSON.stringify(row)).join('\n') + '\n'], {
        type: MIME.ndjson,
      });
    else if (target === 'yaml') {
      await use('yaml');
      blob = new Blob([jsyaml.dump(rows, { noRefs: true, lineWidth: 100 })], { type: MIME.yaml });
    } else if (target === 'xml') blob = new Blob([rowsToXml(rows)], { type: MIME.xml });
    else if (target === 'ini') blob = new Blob([rowsToIni(rows)], { type: MIME.ini });
    else {
      const { stringify } = await import(absoluteUrl('smol-toml/index.js'));
      blob = new Blob([stringify({ data: tomlSafe(rows) })], { type: MIME.toml });
    }
  } else if (target === 'html') {
    if (!html) {
      const result = await runBackground(
        buildHtmlTable,
        { xlsxUrl: absoluteUrl('xlsx.full.min.js'), rows }
      );
      html = result.html;
    }
    blob = new Blob([fullHtmlDocument(html, safeName(item.file.name))], { type: MIME.html });
  } else throw new Error('Unsupported data target');

  onProgress(95);
  return { files: [{ name: outputName(item.file, target), blob }] };
}