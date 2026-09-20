import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const css = readFileSync(join(root, "src/styles.css"), "utf8")
const engine = readFileSync(join(root, "src/valuationEngine.js"), "utf8").replace(/\nexport\s*\{[\s\S]*?\}\s*$/m, "\n")
const app = readFileSync(join(root, "src/app.js"), "utf8").replace(/^import\s+\{[\s\S]*?\}\s+from\s+["']\.\/valuationEngine\.js["']\n/, "")
const script = `${engine}\n${app}`.replaceAll("</script", "<\\/script")

const description = "Eval System 2 is a classification-aware company valuation engine. Enter a public ticker for automated SEC-filing and market-data ingestion, or enter financials manually, to get a fair-value estimate blended from a discounted cash flow model, direct competitor comps, industry multiples, observed public-market pricing, backlog/pipeline conversion, and asset-backing tracks - each weighted through an auditable signal ledger that prevents any qualitative factor from being double-counted."

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eval System 2</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Eval System 2 - Valuation Engine" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="app">
      <noscript>
        <main style="max-width:640px;margin:60px auto;padding:0 20px;font-family:system-ui,sans-serif;line-height:1.6;color:#1c2733;">
          <h1>Eval System 2 - Valuation Engine</h1>
          <p>${description}</p>
          <p>This app requires JavaScript to run interactively.</p>
        </main>
      </noscript>
    </div>
    <script>
${script}
    </script>
  </body>
</html>
`

mkdirSync(root, { recursive: true })
writeFileSync(join(root, "index.html"), html)
