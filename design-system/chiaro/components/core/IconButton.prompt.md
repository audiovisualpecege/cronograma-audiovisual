Round icon-only button — player controls, carousels, close.
```jsx
<IconButton icon="play" weight="bold" label="Assistir" variant="glass" size={64} />
<IconButton icon="alt-arrow-right" label="Próxima" variant="glass" />
```
Variants: ghost · solid · outline · glass (over photos/video). `icon` is a Solar name; use `weight="bold"` for playback (play/pause), `linear` for everything else.