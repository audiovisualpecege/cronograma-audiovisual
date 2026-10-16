# Chiaro Filmes — Design System

Chiaro Filmes is an audiovisual production company (produtora audiovisual) in the interior of São Paulo (phone +55 19 — Campinas/Piracicaba region). It does every stage of production, from concept to final cut: institutional and advertising films, documentaries, event coverage, live broadcasts, and studio recordings (on-demand courses, interviews, webinars, videocasts). It has a studio complex with five studios (**Mirante** 140m², **Água** 42m², **Fogo** 42m², **Terra** 40m², **Ar** 40m²) plus a 32m² green room (**camarim**). Its clients are companies, institutions and brands (the media kit shows Skylar, PepsiCo, Koppert, Hyundai, USP, Pecege, Raízen, Syngenta, Agroceres, MBA USP/Esalq…).

The name plays on *chiaroscuro*: "Sou escuro e sou Chiaro." Light that comes out of darkness is the core idea behind the visuals.

**Surfaces represented**
- **Mídia Kit** (18-page 16:9 PDF): the main brand surface, recreated in `ui_kits/midia-kit/`.
- **Cartão de visita** (90×48mm, rounded corners, front/back): reference only, in `assets/brand/cartao-visita-ref.jpg`.
- No website or app source was provided. chiarofilmes.com and @chiarofilmes are cited on the card.

**Sources given** (in `uploads/`; the reader may not have them)
- Logos: `Chiaro*.png`, `Chiaro-Box*.png`, `Chiaro-Filmes*.png`, `Icone-Chiaro*.png` (v.2 = white version)
- `Paleta-Chiaro.png`, `Chiaro-Gradiente.png`
- `MEDIA KIT_CHIARO_V2.pdf` (a lighter version; the original >20MB file did not upload)
- `Cartão_Chiaro_CantosArredondados-90x48mm-FrenteVerso-Retrato.pdf`
- `Declaracao_de_Posicionamento_Chiaro_Filmes.docx`: positioning, personality, essence
- Fonts: Altivo (16 weights, OTF), Archivo (variable, OFL)
- Brief note: *"Cantos arredondados, voz da marca é feminina mas presente e forte."*

---

## CONTENT FUNDAMENTALS

**Language:** Brazilian Portuguese, always. Correct accents (Estúdio, Produções, Serviços).

**Voice:** feminine, present, strong. The brand speaks of itself in the **feminine first person** in manifesto texts ("Sou audaciosa e sou sensível", "Eu sou a união da técnica e da dedicação"). In institutional/commercial copy it uses **"nós"** ("Nós acreditamos…", "Oferecemos…", "Nossa equipe se desloca…"). The client is addressed as **"você/seu"** ("garantindo que seu conteúdo alcance o público").

**Personality (from the positioning document):** Versátil · Influente · Dedicada · Audaciosa · Sensível. **Essence:** *Impressionar. Comprometidos a contar histórias de forma sensível.* **Differentiator:** *UAU.*

**Tone:**
- Confident without arrogance: "não tenho medo de me posicionar".
- Poetic in short doses, built on antithesis: escuro/Chiaro, "silêncio no set"/"uau da plateia", imagens/palavras.
- Technical and concrete when describing a service: square meters, equipment ("TV 85 pol The Frame", "Chroma Key", "cafeteira Nespresso").

**Mechanics:**
- **Titles in ALL CAPS** (QUEM SOMOS, NOSSOS SERVIÇOS, ESTÚDIO MIRANTE). Body text in sentence case.
- Two-weight titles: a generic word in Light + a proper name in Black ("ESTÚDIO **ÁGUA**", "PRODUÇÃO **EXTERNA**").
- Key phrases inside paragraphs in **bold** ("Nossa equipe **se desloca até a locação escolhida**").
- Body text is justified in the dark media-kit pages, centered in the manifesto, and left-aligned in the space descriptions.
- Short CTAs in the imperative: "Clique nas imagens para ver os vídeos."
- **No emoji.** No exclamation marks in institutional copy.

**Examples**
- "Nós acreditamos que imagens falam mais alto que palavras e, apesar disso, não medimos palavras para encantar o mundo."
- "Sou o “silêncio no set” e o “uau” da plateia. Sou escuro e sou Chiaro."
- "O Estúdio Ar, com aproximadamente 40m², possui uma cenografia modular, moderna e versátil…"

---

## VISUAL FOUNDATIONS

**Color.** The palette runs from darkness to light: **Noite #070010** (almost-black purple, the "escuro") → **Ametista #402B6D** → **Violeta #672FA2** (the "O" in the logo) → **Lavanda #8C4EDB**. **Pêssego #FACE95** and **Areia #F7E1C4** are warm counterpoints, used sparingly for highlights or warm backgrounds. The logo ink is **Grafite #292B33**. The light media-kit pages use **Névoa #E6E6E6**. Semantic colors (success, alert, error) were added for UI and do not appear in the sources.

**Gradient.** The official gradient is **horizontal, Lavanda → Violeta → deep Ametista** (`--gradient-chiaro`). The dark media-kit pages use a violet glow coming from the top over Noite (`--gradient-noite`). No other gradients; never blue-pink.

**Typography.** **Altivo** (geometric, wide, round O) for all display type, always uppercase. The signature pattern is **Light 300 + Black 800** on the same line. Overlines use Altivo Black at a small size ("NOSSOS SERVIÇOS"). "FILMES" in the logo is Light with very wide letter-spacing (`--tracking-filmes`). **Archivo** is for body text and UI.

**Background and imagery.** Real **full-bleed** set photography: low light, purple/violet smoke, haze, color gels (blue/orange), with the crew visible at work. Warm in the practical lights, cool and violet in the shadows, high contrast. There is grain (a 5000px noise layer over the photos in the PDF). The light pages (spaces) use a flat Névoa background with **photos in rounded rectangles (~10px)** and a soft shadow. Huge 3D typography (extruded lavender) appears on the portfolio pages. No illustration, no repeating patterns.

**Repetition / echo.** A recurring motif: a short title repeated in a stack (QUEM SOMOS ×5, CONTATO ×3, AFTERMOVIE ×2), with the top row cut off like a film frame. See `EchoTitle`.

**Frame.** The "box" in the logo (a frame open on the right) is the main brand element. It suggests a viewfinder or a frame, and should be used only through the logo assets.

**Corners.** **Rounded, always**: business card with rounded corners, photos 10px, cards 18px, dialogs 28px, buttons and tags in pill shape. Nothing has hard 90° corners.

**Cards.** White on Névoa, 18px radius, 1px `--border-subtle` border + `--shadow-sm`. On Noite: `#140A26` with a 10% white border and no shadow. Never cards with a colored side border.

**Shadows.** Soft, tinted with Noite (rgba(7,0,16,…)), never pure black. `--shadow-glow` (lavender) only for CTA hover on dark backgrounds.

**Protection.** Text over a photo uses a bottom gradient to Noite (`--gradient-protecao`), not a capsule. Exception: glass buttons (`IconButton variant="glass"`) with `backdrop-filter: blur(16px)` over video.

**Transparency and blur.** Only on the dialog scrim (Noite 62% + blur 6px) and glass buttons over images.

**Motion.** Cinematic and slow: fades and gentle reveals with `--ease-cine`. Photos zoom 4% on hover over 900ms. No bounce, no spring.

**Hover / press.** Primary buttons darken (Violeta → violeta-700 → Ametista on press). Outline/ghost buttons get a soft violet fill (`--accent-soft`). Cards lift 2px with a deeper shadow. Press = `scale(.98)`. Links go darker and get an underline.

**Layout.** 16:9 compositions with generous margins (~70px at 1920). Titles in the top-left corner, content at the bottom. No fixed elements beyond navigation.

---

## ICONOGRAPHY

The sources contain **no icon system**. The media kit uses no icons (the only graphic element is a hand-drawn arrow next to "Clique nas imagens", which is baked into the PDF images). The brand's iconic element is its own **logo icon** (frame + O), in `assets/logos/icone-chiaro*.png`.

**The official UI icon set is [Solar Icons](https://solar-icons.vercel.app/)** (1,400+ icons, rounded joins and soft corners that match the brand's "nothing is 90°" rule and Altivo's round geometry). Always render it through the `Icon` component, which loads static SVGs from `@solar-icons/static@2.3.2` on jsDelivr (`dist/icons/{weight}/{name}.svg`) and tints them with `currentColor` via CSS mask. **Never mix Solar with another icon set** (Lucide, Material, Font Awesome…) on the same surface.

**Names.** Solar kebab-case, exactly as on solar-icons.vercel.app (`alt-arrow-right`, `map-point`, `videocamera-record`). Look the name up on the site; don't guess from other libraries.

**Weights.** Solar ships six styles; Chiaro uses three:

| Weight | When | Examples |
|---|---|---|
| `linear` (default, 1.5 stroke) | All functional UI: navigation, forms, buttons, inline icons next to text, close, carousels | `Button iconRight`, `Select`, `Tag` remove, `IconButton` arrows |
| `bold` | Playback controls over media, active/selected states, tiny icons on a colored disc (≤16px) | play in `MediaCard`, `Toast` icon |
| `bold-duotone` | Featured icons ≥20px that represent a service or contact channel, usually inside a round tinted disc | service cards, contact list on Noite |

Never `broken` (sketchy, off-voice), `line-duotone` or `outline`. One weight per group: a row of icons never mixes weights. Duotone stays monochrome: the secondary layer is the same color at 50% (the mask keeps that automatically). No gradient fills inside icons.

**Size.** 16 · 20 · 24 · 32px (Solar is drawn on a 24 grid). 14px only inside pill `Tag`s. In an `IconButton` the glyph is 45% of the button.

**Color.** `currentColor`. Violeta on Névoa/white, white or Pêssego on Noite, white on Violeta/Lavanda discs. Semantic colors only for status (Toast, form errors).

**Common mapping** (for anyone coming from Lucide): `x`→`close` · `chevron-*`→`alt-arrow-*` · `check`→`check` / `check-circle` · `mail`→`letter` · `phone`→`phone` · `map-pin`→`map-point` · `mic`→`microphone` · `video`→`videocamera-record` · `film`→`clapperboard-play` · `radio` (live)→`stream` · `share-2`→`share` · `sparkles`→`stars-minimalistic` · `alert-triangle`→`danger-triangle` · `party-popper`→`confetti` · `send`→`arrow-right`.

**Brand logos.** Solar has no social/brand logos. For Instagram use `camera-square` next to the handle (`@chiarofilmes`); never draw or import third-party logos as icons.

**Accessibility.** `Icon` is `aria-hidden`. Icon-only controls must be an `IconButton` with a `label`.

No emoji, and no unicode characters used as icons. Icons are UI affordances, never decoration or illustration; the brand's own symbol is the logo icon, not a Solar glyph.

---

## INDEX

```
styles.css            entry point (@imports only)
tokens/               fonts.css · colors.css · typography.css · spacing.css · base.css
fonts/                Altivo (16 OTF) · Archivo variable (TTF, OFL)
assets/logos/         all logo versions (+ -white)
assets/brand/         gradient, palette, grain sample, business card ref
assets/imagery/       media kit photos (cover, studios, camarim, services, clients)
guidelines/           foundation cards (Colors, Type, Spacing, Brand, incl. brand-iconografia)
components/           core · forms · surfaces · navigation · brand
ui_kits/midia-kit/    interactive media kit recreation
ui_kits/site/         landing site (serviços, espaços, contato)
SKILL.md              Agent Skill manifest
thumbnail.html        project tile
```

### Components
- **core/**: `Icon`, `Button`, `IconButton`, `Badge`, `Tag`
- **forms/**: `Input`, `Select`, `Checkbox`, `Radio`, `Switch`
- **surfaces/**: `Card`, `MediaCard`, `Dialog`, `Toast`, `Tooltip`
- **navigation/**: `Tabs`
- **brand/**: `Logo`, `SectionTitle`, `EchoTitle`

No source defined a component inventory, so this is a standard set sized to the brand. **Brand-specific additions:** `MediaCard` (photos/videos are the core of the portfolio), `SectionTitle` (the Light + Black title), `EchoTitle` (the repetition motif), `Logo` (real PNGs), and `Icon` (a wrapper for Solar Icons).

### UI kits
- `ui_kits/site/`: landing — Hero, Serviços (4 cards), Espaços (tabs por estúdio + galeria), Quem somos, Contato (formulário validado + toast).
- `ui_kits/midia-kit/`: Capa, Quem Somos, Serviços (Produção Externa, Transmissões), Camarim, Estúdios ×5, Produções (filter by category + video dialog), Clientes, Contato.
