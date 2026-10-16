# UI kit — Mídia Kit

Navigable recreation of the `MEDIA KIT_CHIARO_V2.pdf` (16:9, 1920×1080, scaled to fit). Use ← → or the dots. The current page is saved to localStorage.

- `Slides.jsx`: page types: `Capa`, `QuemSomos` (EchoTitle), `Servico` (full-bleed photo + 3 columns), `Espaco` (Névoa + SectionTitle + rounded photos), `Producoes` (category tabs + MediaCards + video dialog), `Clientes`, `Contato`.
- `index.html`: stage, navigation, and video dialog.

**Differences from the original:** the portfolio pages use extruded 3D renders that weren't extracted. They are replaced here by a skewed CSS title, with category tabs over the photos we have. The video links weren't extractable, so the player is a placeholder. The service photos (`producao-externa.jpg`, `transmissoes.jpg`) already contain the title baked into the image, exactly as in the PDF.
