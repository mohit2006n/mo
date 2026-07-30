// @ts-nocheck
// SPDX-License-Identifier: MIT
// Runs inside the ZetaOffice/LibreOffice WebAssembly worker.
import { ZetaHelperThread } from './zetaHelper.js';

const zHT = new ZetaHelperThread();
const zetajs = zHT.zetajs;
const css = zHT.css;
let currentModel;

const hidden = new css.beans.PropertyValue({ Name: 'Hidden', Value: true });
const overwrite = new css.beans.PropertyValue({ Name: 'Overwrite', Value: true });

function closeCurrentDocument() {
  if (!currentModel) return;
  try {
    if (currentModel.queryInterface(zetajs.type.interface(css.util.XCloseable))) {
      currentModel.close(false);
    }
  } catch (_) {
    // LibreOffice will release the model when the next document is opened.
  }
  currentModel = undefined;
}

zHT.thrPort.onmessage = (event) => {
  const message = event.data;
  if (message.cmd !== 'suite-file')
    throw new Error(`Unknown document worker command: ${message.cmd}`);

  try {
    closeCurrentDocument();
    currentModel = zHT.desktop.loadComponentFromURL(`file://${message.from}`, '_blank', 0, [
      hidden,
    ]);
    if (!currentModel) throw new Error('LibreOffice could not open this document');
    const outputFilter = new css.beans.PropertyValue({ Name: 'FilterName', Value: message.filter });
    currentModel.storeToURL(`file://${message.to}`, [overwrite, outputFilter]);
    zetajs.mainPort.postMessage({
      cmd: 'suite-converted',
      requestId: message.requestId,
      from: message.from,
      to: message.to,
    });
  } catch (error) {
    let detail = error?.message || String(error);
    try {
      const exception = zetajs.catchUnoException(error);
      detail = exception?.Message || detail;
    } catch (_) {}
    zetajs.mainPort.postMessage({
      cmd: 'suite-error',
      requestId: message.requestId,
      message: detail,
    });
  }
};

zHT.thrPort.postMessage({ cmd: 'suite-ready' });
