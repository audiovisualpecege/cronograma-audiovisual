// Regras puras do cronograma, sem I/O, usadas pelo app, pelo worker e espelhadas nas funções SQL.
// A única leitura de arquivo é a das planilhas (import/read.ts), que recebe os bytes prontos.
export * from './types.ts';
export * from './time.ts';
export * from './scheduling.ts';
export * from './publication.ts';
export * from './calendar.ts';
export * from './classify.ts';
export * from './names.ts';
export * from './validate.ts';
export * from './patterns.ts';
export { sha256Hex } from './sha256.ts';
export * from './import/types.ts';
export { parseDayCell, parseDayTitle, parseTimeCell, splitNames, inferYear } from './import/cells.ts';
export * from './import/read.ts';
export * from './import/plan.ts';
export { ELIGIBILITY_CASES, eligibilityContext, type EligibilityCase } from './cases/eligibility.ts';
export { SEED } from './cases/seed.ts';
