Solar icon (solar-icons.vercel.app, via CDN) tinted with currentColor — use for UI affordances, never as decoration.
```jsx
<Icon name="alt-arrow-right" size={20} />
<Icon name="play" weight="bold" size={26} />
<Icon name="clapperboard" weight="bold-duotone" size={24} />
```
Names are Solar kebab-case (`alt-arrow-down`, not `chevron-down`; `close`, not `x`; `letter`, not `mail`).
Weights: `linear` (default, stroke 1.5) · `bold` (active/playback/tiny badges) · `bold-duotone` (featured, ≥24px). Never `broken`, `line-duotone` or `outline`. One weight per group. Sizes 16 · 20 · 24 · 32.