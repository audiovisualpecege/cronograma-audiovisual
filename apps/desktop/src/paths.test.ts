import { describe, expect, it } from 'vitest';
import { joinPath, translatePath } from './paths';

describe('translatePath', () => {
  // UT-122
  it('troca \\\\servidor\\pasta por /Volumes/pasta no Mac e o inverso no Windows', () => {
    expect(translatePath('\\\\nas\\instaladores\\cronograma', 'darwin')).toBe('/Volumes/instaladores/cronograma');
    expect(translatePath('/Volumes/instaladores/cronograma', 'win32', 'nas')).toBe('\\\\nas\\instaladores\\cronograma');
  });

  it('mantém o caminho já no formato do sistema e aceita smb:// do Finder', () => {
    expect(translatePath('\\\\nas\\instaladores\\cronograma\\', 'win32')).toBe('\\\\nas\\instaladores\\cronograma');
    expect(translatePath('/Volumes/instaladores/cronograma/', 'darwin')).toBe('/Volumes/instaladores/cronograma');
    expect(translatePath('smb://nas/instaladores/cronograma', 'darwin')).toBe('/Volumes/instaladores/cronograma');
    expect(translatePath('smb://nas/instaladores/cronograma', 'win32')).toBe('\\\\nas\\instaladores\\cronograma');
    expect(translatePath('C:\\Instaladores', 'win32')).toBe('C:\\Instaladores');
  });

  it('junta o arquivo com o separador do sistema', () => {
    expect(joinPath('\\\\nas\\instaladores', 'latest.json', 'win32')).toBe('\\\\nas\\instaladores\\latest.json');
    expect(joinPath('/Volumes/instaladores', 'latest.json', 'darwin')).toBe('/Volumes/instaladores/latest.json');
  });
});
