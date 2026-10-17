// Web Worker da importação (TechSpec, Component Overview): a leitura de um arquivo grande não trava a tela,
// e "Cancelar" encerra o worker no meio sem nada enviado ao servidor.
import { runRead, type ReadMessage, type ReadRequest } from './readJob';

// O projeto compila com a lib DOM; aqui só se usa o que um worker dedicado tem.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ReadRequest>) => void) | null;
  postMessage(msg: ReadMessage): void;
};

scope.onmessage = (e) => {
  runRead(e.data, (msg) => scope.postMessage(msg));
};
