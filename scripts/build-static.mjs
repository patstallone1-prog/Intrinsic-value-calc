import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const css = readFileSync(join(root, "src/styles.css"), "utf8")
const engine = readFileSync(join(root, "src/valuationEngine.js"), "utf8").replace(/\nexport\s*\{[\s\S]*?\}\s*$/m, "\n")
const app = readFileSync(join(root, "src/app.js"), "utf8").replace(/^import\s+\{[\s\S]*?\}\s+from\s+["']\.\/valuationEngine\.js["']\n/, "")
const script = `${engine}\n${app}`.replaceAll("</script", "<\\/script")

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eval System 2</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
${script}
    </script>
  </body>
</html>
`

mkdirSync(root, { recursive: true })
writeFileSync(join(root, "index.html"), html)
