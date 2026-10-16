# Design system da Chiaro Filmes: por onde começar

Esta pasta é um export do Claude Design. O conteúdo completo está em `readme.md` (em inglês): a marca,
a voz, as cores, a tipografia, os ícones e o mapa da pasta. Leia o `readme.md` inteiro antes de desenhar
ou codificar qualquer tela, e depois os arquivos que ele indicar.

Este `DESIGN.md` é a porta de entrada da forja do Task Forge: ele resume o essencial e traz as regras
da Chiaro que valem por cima do `readme.md`. Se os dois discordarem, vale este arquivo.

## O essencial

- **Tokens:** importe `styles.css` (ele puxa `tokens/fonts.css`, `colors.css`, `typography.css`,
  `spacing.css` e `base.css`). Use as variáveis (`--chiaro-violeta`, `--surface-card`, `--text-primary`,
  `--radius-*`, `--shadow-*`, `--ease-cine`...) em vez de copiar valores soltos no código.
- **Cores:** do escuro para a luz, Noite `#070010`, Ametista `#402B6D`, Violeta `#672FA2`, Lavanda
  `#8C4EDB`; Pêssego `#FACE95` e Areia `#F7E1C4` como contraponto quente, com moderação. Gradiente
  oficial só o `--gradient-chiaro` (Lavanda, Violeta, Ametista), nunca azul e rosa.
- **Tipografia:** Altivo para títulos, sempre em CAIXA ALTA, com o par Light 300 + Black 800 na mesma
  linha; Archivo para texto e interface. Os arquivos estão em `fonts/`.
- **Forma:** nada com canto reto. Botões e tags em pílula, cartões 18 px, fotos 10 px, diálogos 28 px.
- **Ícones de interface:** Solar Icons, pelos pesos `linear`, `bold` e `bold-duotone`, sem misturar
  com outra biblioteca. Em produção, instale o pacote (`@solar-icons/react` ou os SVGs de
  `@solar-icons/static`) em vez de depender do CDN: o produto tem de funcionar sem internet.
- **Componentes:** referência em `components/` (core, forms, surfaces, navigation, brand) e telas de
  exemplo em `ui_kits/`. Cada componente tem um `.prompt.md` explicando o uso.
- **Textos:** português do Brasil com acentos, títulos em caixa alta, sem emoji, sem ponto de
  exclamação, sem travessão.

## Regras da Chiaro para os produtos da forja

### Tema escuro, sempre

Todo produto sai no tema **Noite**. O `readme.md` e os tokens de `:root` descrevem também o tema claro
(fundo Névoa, cartões brancos, `color-scheme: light` em `tokens/base.css`), mas ele não vale para os
produtos da forja.

- Nenhuma tela em fundo claro, nenhuma alternância de tema, nada de seguir a preferência do sistema.
- Na web: `<html data-theme="noite">` já no primeiro HTML (sem piscar claro ao carregar), `color-scheme:
  dark` e `background: var(--surface-page)` no `body`. Pode usar o `--gradient-noite` no fundo das telas
  principais.
- Fora da web (Android, TV, desktop nativo, Electron): o tema do app usa os valores do bloco
  `[data-theme="noite"]` de `tokens/colors.css` (superfícies, textos, bordas, `--accent` Lavanda).
- Diálogos, menus, campos, dicas, barras de rolagem, telas de carregamento, instaladores com tela e
  e-mails em HTML também ficam escuros.
- Os componentes de `components/` e `ui_kits/` mostrados em fundo claro valem pela forma; as cores vêm
  sempre do tema Noite. Use o Button `light` sobre fotos escuras, e o `--shadow-glow` no hover das ações
  principais.

### Ícone do produto

O design system só traz o ícone da própria Chiaro (`assets/logos/icone-chiaro*.png`). Ele **não** é o
ícone dos produtos.

- Todo produto com interface tem um ícone próprio, desenhado para ele, que mostre o que o produto faz.
- O ícone e os logos da Chiaro nunca são o ícone do produto. O logo da Chiaro só aparece como
  assinatura, onde fizer sentido ("um produto Chiaro Filmes"), seguindo `guidelines/brand-logos.html`.
- Desenhe o símbolo em SVG na linguagem da marca: paleta e gradiente da Chiaro, cantos arredondados,
  traço limpo, legível em 16 px. Pode partir de um glifo do Solar, redesenhado para ser o símbolo.
- Guarde o SVG no código e gere dele os tamanhos que a plataforma pede: favicon e ícones do app web
  (16, 32, 180, 192, 512), os 16, 32, 48 e 128 de uma extensão, o `.ico` de um programa de desktop.

### Versão do produto

Todo app, extensão ou programa com interface mostra a sua versão (`v1.2.3`) num canto discreto e fixo
(rodapé, tela Sobre, popup da extensão), em `--text-muted` e no tamanho de legenda. As regras de
numeração estão no `CLAUDE.md` de cada projeto.

## O que está na pasta

```
DESIGN.md        esta porta de entrada
readme.md        o design system completo (em inglês)
styles.css       o ponto de entrada dos tokens
tokens/          fontes, cores, tipografia, espaçamentos, base
fonts/           Altivo (16 OTF) e Archivo variável (TTF, OFL)
assets/          logos, gradiente, paleta, fotos de referência
guidelines/      cartões de cada fundamento (cores, tipos, espaços, marca)
components/      componentes de referência em React, cada um com o seu .prompt.md
ui_kits/         o mídia kit e um site de exemplo, montados com os componentes
SKILL.md         o manifesto de skill do Claude Design
```

Ficam só no NAS, fora da cópia nos projetos: `LEIA-ME.md`, `uploads/` (os originais) e os arquivos de
trabalho do export (`.claude/`, `.thumbnail`).
