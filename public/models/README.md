# Fixture 3D models (glTF)

A fixture node can render a sourced `.glb` from this folder, falling back to a box
block-out when no asset is present. Vite serves this folder at `/models`, and a node
references it by setting `modelUrl: '/models/<id>.glb'` (the viewer auto-centres each
model and uniformly scales it to fit the node's box).

No models are bundled today — the built-in kitchen fixtures (dishwasher, range, hood,
fridge) draw composed box block-outs. Drop a `.glb` here and point a fixture node's
`modelUrl` at it to light one up.

## Conventions for new models

- **Format:** binary glTF (`.glb`), Y-up, model facing **+Z** (toward the room). If a
  model imports rotated, set `modelRotationY` on the node.
- **Fit:** real-world units don't matter (auto-fit to the box), but keep proportions right.
- **Budget:** keep meshes/textures lightweight — they load over the network at runtime.
- **Licensing:** only add models you may redistribute (CC0 / CC-BY with credit).
