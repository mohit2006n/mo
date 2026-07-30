export class Queue {
  constructor(options = {}) {
    this.concurrency = Math.max(1, Number(options.concurrency) || 3);
  }

  async run(tasks, executeFn, callbacks = {}) {
    const outputs = new Array(tasks.length);
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, tasks.length);

    const worker = async () => {
      while (cursor < tasks.length) {
        const index = cursor++;
        const task = tasks[index];
        callbacks.onStart?.(task, index);
        try {
          const value = await executeFn(task, (progress) => {
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