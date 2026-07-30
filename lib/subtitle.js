import { escapeHtml, fullHtmlDocument } from './content.js';
import { MIME, outputName, safeName } from './formats.js';

function parseTime(value) {
  const match = String(value)
    .trim()
    .replace(',', '.')
    .match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return (
    (Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 +
    Number(String(match[4] || '0').padEnd(3, '0'))
  );
}

function splitFields(line, count) {
  const fields = [];
  let start = 0;
  for (let index = 1; index < count; index++) {
    const comma = line.indexOf(',', start);
    if (comma < 0) break;
    fields.push(line.slice(start, comma));
    start = comma + 1;
  }
  fields.push(line.slice(start));
  while (fields.length < count) fields.push('');
  return fields;
}

function parseSrt(source) {
  const cues = [];
  const blocks = source
    .replace(/^\ufeff/, '')
    .trim()
    .split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [start, end] = lines[timingIndex]
      .split('-->')
      .map((value) => value.trim().split(/\s+/)[0]);
    cues.push({
      start: parseTime(start),
      end: parseTime(end),
      text: lines.slice(timingIndex + 1).join('\n'),
    });
  }
  return cues;
}

function parseVtt(source) {
  const lines = source.replace(/^\ufeff/, '').split(/\r?\n/);
  const cues = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].includes('-->')) continue;
    const [start, endPart] = lines[index].split('-->');
    const end = endPart.trim().split(/\s+/)[0];
    const text = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) text.push(lines[index++]);
    cues.push({ start: parseTime(start), end: parseTime(end), text: text.join('\n') });
  }
  return cues;
}

function parseAss(source) {
  const lines = source.replace(/^\ufeff/, '').split(/\r?\n/);
  let inEvents = false;
  let fields = [
    'Layer',
    'Start',
    'End',
    'Style',
    'Name',
    'MarginL',
    'MarginR',
    'MarginV',
    'Effect',
    'Text',
  ];
  const cues = [];
  for (const line of lines) {
    if (/^\s*\[events\]\s*$/i.test(line)) {
      inEvents = true;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    const format = line.match(/^\s*Format\s*:\s*(.+)$/i);
    if (format) {
      fields = format[1].split(',').map((value) => value.trim());
      continue;
    }
    const dialogue = line.match(/^\s*Dialogue\s*:\s*(.*)$/i);
    if (!dialogue) continue;
    const values = splitFields(dialogue[1], fields.length);
    const record = Object.fromEntries(
      fields.map((field, index) => [field.toLowerCase(), values[index]]),
    );
    cues.push({
      start: parseTime(record.start),
      end: parseTime(record.end),
      text: String(record.text || '')
        .replace(/\\N/gi, '\n')
        .replace(/\\h/gi, ' ')
        .replace(/\{[^}]*\}/g, ''),
    });
  }
  return cues;
}

function timestamp(milliseconds, separator = ',') {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(millis).padStart(3, '0')}`;
}

function assTimestamp(milliseconds) {
  const total = Math.max(0, Math.round(milliseconds / 10));
  const hours = Math.floor(total / 360_000);
  const minutes = Math.floor((total % 360_000) / 6000);
  const seconds = Math.floor((total % 6000) / 100);
  const centiseconds = total % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function toSrt(cues) {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.end)}\n${cue.text}`,
    )
    .join('\n\n')}\n`;
}

function toVtt(cues) {
  return `WEBVTT\n\n${cues
    .map((cue) => `${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.text}`)
    .join('\n\n')}\n`;
}

function toAss(cues) {
  const events = cues
    .map(
      (cue) =>
        `Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},Default,,0,0,0,,${cue.text.replace(/\n/g, '\\N')}`,
    )
    .join('\n');
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,40,40,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`;
}

function toText(cues) {
  return `${cues.map((cue) => `[${timestamp(cue.start, '.')}] ${cue.text}`).join('\n\n')}\n`;
}

function toHtml(cues, title) {
  const body = `<main><h1>${escapeHtml(title)}</h1>${cues
    .map(
      (cue) =>
        `<section><time>${escapeHtml(timestamp(cue.start, '.'))} – ${escapeHtml(timestamp(cue.end, '.'))}</time><p>${escapeHtml(cue.text).replace(/\n/g, '<br>')}</p></section>`,
    )
    .join('')}</main>`;
  return fullHtmlDocument(body, title);
}

export async function convertSubtitle(item, target, onProgress) {
  if (target === item.ext) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }
  onProgress(12);
  const source = await item.file.text();
  const cues =
    item.ext === 'srt'
      ? parseSrt(source)
      : item.ext === 'vtt'
        ? parseVtt(source)
        : parseAss(source);
  if (!cues.length) throw new Error('No readable subtitle cues were found');
  onProgress(55);
  const title = safeName(item.file.name);
  let text;
  if (target === 'srt') text = toSrt(cues);
  else if (target === 'vtt') text = toVtt(cues);
  else if (target === 'ass') text = toAss(cues);
  else if (target === 'txt') text = toText(cues);
  else if (target === 'html') text = toHtml(cues, title);
  else throw new Error('Unsupported subtitle target');
  onProgress(96);
  return {
    files: [
      { name: outputName(item.file, target), blob: new Blob([text], { type: MIME[target] }) },
    ],
  };
}