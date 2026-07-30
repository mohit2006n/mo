import { MIME, outputName } from './formats.js';
import { absoluteUrl, createGzipUrl, use } from './runtime.js';
import { state } from './state.js';

async function ensureFfmpeg(onProgress = () => {}) {
  if (!state.ffmpegWasmUrl) {
    if (!state.ffmpegRequest) {
      state.ffmpegRequest = (async () => {
        const url = await createGzipUrl(
          'ffmpeg-core.wasm.gzip.bin',
          'application/wasm',
          (ratio) => onProgress(4 + ratio * 5)
        );
        state.ffmpegWasmUrl = url;
        return url;
      })().catch(err => {
        state.ffmpegRequest = null;
        throw err;
      });
    }
    await state.ffmpegRequest;
  }

  onProgress(9);
  await use('ffmpeg');

  const instance = new FFmpegWASM.FFmpeg();
  instance.on('progress', (event) => {
    if (Number.isFinite(event.progress)) {
      onProgress(Math.round(10 + event.progress * 85));
    }
  });
  instance.on('log', () => {});

  await instance.load({
    coreURL: absoluteUrl('ffmpeg-core.js'),
    wasmURL: state.ffmpegWasmUrl,
  });

  return instance;
}

function encodeArgs(input, output, target, sourceKind) {
  const preset = state.settings.mediaQuality;
  const crf = preset === 'high' ? '18' : preset === 'fast' ? '30' : '24';
  const bitrate = `${state.settings.audioBitrate || 320}k`;

  if (target === 'mp3') return ['-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', bitrate, output];
  if (target === 'wav') return ['-i', input, '-vn', '-c:a', 'pcm_s16le', output];
  if (target === 'ogg') return ['-i', input, '-vn', '-c:a', 'libvorbis', '-ar', '48000', '-b:a', bitrate, output];
  if (target === 'opus') return ['-i', input, '-vn', '-c:a', 'libvorbis', '-b:a', bitrate, '-f', 'ogg', output];
  if (target === 'flac') return ['-i', input, '-vn', '-c:a', 'flac', output];
  if (target === 'aiff') return ['-i', input, '-vn', '-c:a', 'pcm_s16be', output];
  if (target === 'm4a') return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', bitrate, output];
  if (target === 'aac') return ['-i', input, '-vn', '-c:a', 'aac', '-b:a', bitrate, '-f', 'adts', output];
  if (target === 'gif') return ['-i', input, '-loop', '0', output];

  if (sourceKind !== 'video') throw new Error('A video output needs a video input');

  if (target === 'mkv')
    return ['-i', input, '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-bf', '0', '-refs', '1', '-rc-lookahead', '0', '-x264opts', 'mbtree=0:sync-lookahead=0', '-crf', crf, '-threads', '1', '-max_muxing_queue_size', '4096', '-c:a', 'aac', output];
  if (target === 'mp4' || target === 'mov')
    return ['-i', input, '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-bf', '0', '-refs', '1', '-rc-lookahead', '0', '-x264opts', 'mbtree=0:sync-lookahead=0', '-crf', crf, '-threads', '1', '-pix_fmt', 'yuv420p', '-max_muxing_queue_size', '4096', '-c:a', 'aac', '-movflags', '+faststart', output];
  if (target === 'webm')
    return ['-i', input, '-c:v', 'libvpx', '-crf', crf, '-b:v', '0', '-threads', '1', '-deadline', 'realtime', '-cpu-used', '8', '-max_muxing_queue_size', '4096', '-c:a', 'libvorbis', output];
  if (target === 'avi')
    return ['-i', input, '-c:v', 'mpeg4', '-bf', '0', '-threads', '1', '-q:v', preset === 'high' ? '3' : preset === 'fast' ? '7' : '5', '-max_muxing_queue_size', '4096', '-c:a', 'libmp3lame', '-b:a', bitrate, output];

  throw new Error(`Unsupported media target: ${target}`);
}

export async function convertMedia(item, target, onProgress, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (target === item.ext) {
    onProgress(100);
    return { files: [{ name: outputName(item.file, target), blob: item.file }] };
  }

  onProgress(3);
  let ffmpeg = await ensureFfmpeg(onProgress);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  onProgress(10);
  const abortHandler = () => {
    try {
      ffmpeg.terminate();
    } catch (error) {
      console.warn('FFmpeg termination failed:', error);
    }
  };
  signal?.addEventListener('abort', abortHandler);

  const execute = async () => {
    const sanitizedFile = new File([item.file], `input.${item.ext || 'mp4'}`, { type: item.file.type });
    const mountPoint = '/work';
    const input = `${mountPoint}/input.${item.ext || 'mp4'}`;
    const output = `out.${target}`;

    await ffmpeg.createDir(mountPoint);
    await ffmpeg.mount(FFmpegWASM.FFFSType.WORKERFS, { files: [sanitizedFile] }, mountPoint);

    const isAudioTarget = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aiff', 'm4a', 'aac', 'gif'].includes(target);
    let exitCode = -1;
    if (!isAudioTarget) {
      exitCode = await ffmpeg.exec(['-i', input, '-c', 'copy', output]);
    }

    if (exitCode !== 0) {
      await ffmpeg.deleteFile(output).catch(() => {});
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const encode = encodeArgs(input, output, target, item.kind);
      exitCode = await ffmpeg.exec(encode);
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (exitCode !== 0) throw new Error(`FFmpeg processing failed (exit code ${exitCode})`);

    const data = await ffmpeg.readFile(output);
    await ffmpeg.unmount(mountPoint).catch((e) => console.warn('Unmount failed:', e));
    await ffmpeg.deleteDir(mountPoint).catch((e) => console.warn('Directory cleanup failed:', e));
    await ffmpeg.deleteFile(output).catch((e) => console.warn('File cleanup failed:', e));

    const blob = new Blob([data.buffer], { type: MIME[target] || 'application/octet-stream' });
    onProgress(98);
    return { files: [{ name: outputName(item.file, target), blob }] };
  };

  return execute().finally(() => {
    signal?.removeEventListener('abort', abortHandler);
    try {
      ffmpeg.terminate();
    } catch (error) {
      console.warn('FFmpeg termination failed:', error);
    }
  });
}