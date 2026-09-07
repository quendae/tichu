# Tichu Blender materials

Original assets authored for this repository through the connected Blender MCP
(Blender 5.2.1 LTS, add-on 1.6, protocol 5). No stock images or external models.

- `walnut-lacquer.webp`: procedural walnut grain and clear-coat studio reflections.
- `tea-felt.webp`: tea-green fabric with procedural micro-fibre bump and sheen.
- `dragon-medallion.webp`: original coiled brass dragon relief on jade lacquer,
  used on all opponent card backs. Face ranks and suit illustrations remain SVG.
- `tichu-material-studio.blend`: editable scene with four named material presets,
  orthographic camera, two softboxes and the dragon curve geometry.

The PNG files are render masters. WebP files are the runtime assets, encoded with
Pillow at quality 86 / method 6. The three WebP requests are shared across all
cards, not duplicated per card. CSS preserves existing fallback colors/glyphs.

Regenerate from the repository root using Blender 5.x:

```sh
blender --background --python scripts/render-materials.py
```

The script creates a separate scene and saves only that scene as a Blender
library, without clearing or overwriting an existing user project. Through MCP,
set `__file__` to the script's absolute path before executing its contents.
Re-encode all three PNG masters to WebP after rendering; keep both in sync.

Only baked images ship to the browser. No WebGL engine, Blender dependency,
remote image service, motion or interaction is added to the game runtime.
