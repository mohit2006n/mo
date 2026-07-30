export class Queue {
  constructor(options = {}) {
    this.concurrency = Math.max(1, Number(options.concurrency) || 3);
    this.adapters = new Map();
    this.interface = null;
  }

  configureInterface(interfaceDefinition) {
    if (
      typeof interfaceDefinition?.inspect !== 'function' ||
      typeof interfaceDefinition?.createTask !== 'function'
    ) {
      throw new TypeError('inspect and createTask functions are required.');
    }
    this.interface = interfaceDefinition;
    return this;
  }

  async inspect(file) {
    if (!this.interface) throw new Error('The file-processing interface is not configured.');
    return this.interface.inspect(file);
  }

  async createTask(file, target, options = {}) {
    if (!this.interface) throw new Error('The file-processing interface is not configured.');
    return this.interface.createTask(file, target, options);
  }

  registerAdapter(name, handler) {
    if (!name || typeof handler !== 'function') {
      throw new TypeError('An adapter name and handler are required.');
    }
    this.adapters.set(name, handler);
    return this;
  }

  async execute(task, onProgress = () => {}) {
    if (task.options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const handler = this.adapters.get(task.adapter);
    if (!handler) throw new Error(`No conversion adapter is registered for ${task.adapter}.`);
    return await handler(task, onProgress);
  }

  async run(tasks, callbacks = {}) {
    const outputs = new Array(tasks.length);
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, tasks.length);

    const worker = async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        const task = tasks[index];
        callbacks.onStart?.(task, index);
        try {
          const value = await this.execute(task, (progress) => {
            callbacks.onProgress?.(task, progress, index);
          });
          outputs[index] = { status: 'fulfilled', value };
          callbacks.onComplete?.(task, value, index);
        } catch (error) {
          outputs[index] = { status: 'rejected', reason: error };
          callbacks.onError?.(task, error, index);
        }
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return outputs;
  }
}