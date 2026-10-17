import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // IndexedDB novo a cada teste: nenhuma cópia local vaza de um teste para outro.
  Dexie.dependencies.indexedDB = new IDBFactory();
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (typeof window !== 'undefined') {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  }
});
