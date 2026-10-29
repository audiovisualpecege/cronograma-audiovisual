import { describe, expect, it } from 'vitest';
import { TYPE_ICONS, typeIcon } from './typeIcons';

describe('typeIcon', () => {
  it('usa o ícone escolhido no cadastro', () => {
    expect(typeIcon({ name: 'AULA MBA', icon: 'podcast' }).key).toBe('podcast');
  });

  it('sem escolha, acha um pelo nome; sem regra, o calendário', () => {
    expect(typeIcon({ name: 'AULA MBA' }).key).toBe('aula');
    expect(typeIcon({ name: 'EDICAO FOTOS' }).key).toBe('edicao-foto');
    expect(typeIcon({ name: 'GRAVACAO EXTERNA' }).key).toBe('externa');
    expect(typeIcon({ name: 'Férias' }).key).toBe('ferias');
    expect(typeIcon({ name: 'NAO ESCALAR' }).key).toBe('reserva');
    expect(typeIcon({ name: 'Algo novo', icon: 'nao-existe' }).key).toBe('calendario');
  });

  it('as chaves do banco são únicas e cabem na regra do banco de dados', () => {
    const keys = TYPE_ICONS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});
