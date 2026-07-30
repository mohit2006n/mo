function blob(fileOrBlob, name) {
  if (typeof File === 'function' && fileOrBlob instanceof File) return fileOrBlob;
  if (!(fileOrBlob instanceof Blob)) throw new TypeError('A File or Blob is required.');
  if (!name) throw new TypeError('A filename is required when converting a Blob.');
  if (typeof File === 'function') return new File([fileOrBlob], name, { type: fileOrBlob.type });
  Object.defineProperty(fileOrBlob, 'name', { configurable: true, value: name });
  return fileOrBlob;
}

export function normalize(request) {
  if (!request || typeof request !== 'object') {
    throw new TypeError('A conversion request is required.');
  }
  const target = String(request.target || '')
    .trim()
    .toLowerCase();
  if (!target) throw new TypeError('A target format is required.');
  return {
    file: blob(request.file, request.name),
    target,
    save: Boolean(request.save),
    signal: request.signal instanceof AbortSignal ? request.signal : null,
  };
}

export function normalizeBatch(requests) {
  if (!Array.isArray(requests) || !requests.length) {
    throw new TypeError('At least one conversion request is required.');
  }
  return requests.map(normalize);
}

export function snapshot(groups) {
  return groups.map((group) => ({
    kind: group.kind,
    inputs: [...group.inputs],
    outputs: [...group.outputs],
  }));
}