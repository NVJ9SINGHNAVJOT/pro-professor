# fonts

Self-hosted variable woff2 (latin subset) for the dashboard, declared by the `@font-face` rules in
[`../typography.css`](../typography.css) using `./fonts/…` paths relative to that file.

**These files are committed on purpose.** They are compiled into the dashboard binary by the
`//go:embed … fonts` directive in [`../main.go`](../main.go), and `go:embed` cannot reach outside
its own package — so this is the only copy, and the build fails without it. Keep the filenames as
they are; the `@font-face src` paths depend on them.

Versions are pinned to exact [Fontsource](https://fontsource.org) packages for reproducibility:

| File | Fontsource package | Upstream (Google) |
| --- | --- | --- |
| `InterVariable.woff2` | `@fontsource-variable/inter@5.2.8` | Inter v20 |
| `SpaceGrotesk-Variable.woff2` | `@fontsource-variable/space-grotesk@5.2.10` | Space Grotesk v22 |

To refresh, bump the pinned version — don't use `@latest` — and keep the same filenames:

```bash
curl -fsSL -o InterVariable.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@5.2.8/latin-wght-normal.woff2"
curl -fsSL -o SpaceGrotesk-Variable.woff2 \
  "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk:vf@5.2.10/latin-wght-normal.woff2"
```
