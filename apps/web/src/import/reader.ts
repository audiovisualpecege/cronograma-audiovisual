// Liga a tela ao Web Worker da leitura. Nos testes, um worker falso entra no lugar (createWorker).
import type { WorkbookRead } from '@cronograma/core';
import type { ReadMessage, ReadRequest } from './readJob';

/** O que a tela usa de um Worker. */
export interface ReadWorker {
  postMessage(msg: ReadRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<ReadMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type CreateReadWorker = () => ReadWorker;

export const createBrowserWorker: CreateReadWorker = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'importacao' }) as unknown as ReadWorker;

export class ReadFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ReadHandle {
  result: Promise<WorkbookRead>;
  cancel(): void;
}

export function startRead(
  data: ArrayBuffer,
  options: { createWorker: CreateReadWorker; onProgress: (p: { sheet: string; index: number; total: number }) => void },
): ReadHandle {
  const worker = options.createWorker();
  let settled = false;
  let reject: (e: Error) => void = () => undefined;
  const result = new Promise<WorkbookRead>((res, rej) => {
    reject = rej;
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        options.onProgress(msg);
        return;
      }
      settled = true;
      worker.terminate();
      if (msg.type === 'done') res(msg.result);
      else rej(new ReadFailure(msg.code, msg.message));
    };
    worker.onerror = () => {
      settled = true;
      worker.terminate();
      rej(new ReadFailure('erro_leitura', 'A leitura da planilha parou no meio. Confira o arquivo no Excel e envie de novo.'));
    };
  });
  worker.postMessage({ type: 'read', data }, [data]);
  return {
    result,
    cancel() {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new ReadFailure('cancelado', 'Leitura cancelada.'));
    },
  };
}
