export const state = {
  active: new Map(),
  suite: null,
  suiteRequest: null,
  suiteError: null,
  ffmpegRequest: null,
  ffmpegWasmUrl: '',
  settings: {
    imageQuality: 100,
    maxDimension: 0,
    jpegBackground: '#ffffff',
    pdfScale: 3,
    pageSize: 'a4',
    mediaQuality: 'high',
    audioBitrate: '320',
  },
};