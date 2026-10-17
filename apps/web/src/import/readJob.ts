// O trabalho do Web Worker da importação: abre o .xlsx com o SheetJS e os parsers do core, avisando cada
// aba lida. Fica separado do worker.ts para os testes rodarem a mesma leitura sem um Worker de verdade.
import { ImportFileError, readWorkbook, type WorkbookRead } from '@cronograma/core';

export type ReadRequest = { type: 'read'; data: ArrayBuffer; now?: string };

export type ReadMessage =
  | { type: 'progress'; sheet: string; index: number; total: number }
  | { type: 'done'; result: WorkbookRead }
  | { type: 'error'; code: 'arquivo_invalido' | 'arquivo_protegido' | 'erro_leitura'; message: string };

export function runRead(req: ReadRequest, post: (msg: ReadMessage) => void): void {
  try {
    const result = readWorkbook(req.data, {
      now: req.now ? new Date(req.now) : undefined,
      onSheet: ({ name, index, total }) => post({ type: 'progress', sheet: name, index, total }),
    });
    post({ type: 'done', result });
  } catch (err) {
    if (err instanceof ImportFileError) post({ type: 'error', code: err.code, message: err.message });
    else post({ type: 'error', code: 'erro_leitura', message: 'A leitura da planilha parou no meio. Confira o arquivo no Excel e envie de novo.' });
  }
}
