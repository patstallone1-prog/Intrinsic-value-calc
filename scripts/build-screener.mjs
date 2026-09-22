import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const css = readFileSync(join(root, "src/screenerSite.css"), "utf8")
const engine = readFileSync(join(root, "src/valuationEngine.js"), "utf8").replace(/\nexport\s*\{[\s\S]*?\}\s*$/m, "\n")
const site = readFileSync(join(root, "src/screenerSite.js"), "utf8")
const script = `${engine}\n${site}`.replaceAll("</script", "<\\/script")
const description = "Intrinsic Value Screener: every SEC-registered public company run through the Eval System 2 valuation engine, with filters for implied upside, market-cap range, industry, data coverage and model confidence, a per-company valuation breakdown, and fill-in of any inputs the data sources could not supply."

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Intrinsic Value Screener</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Intrinsic Value Screener" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Serif:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
    <style>
${css}
    </style>
  </head>
  <body>
    <header class="masthead">
      <div>
        <p class="eyebrow">Eval System 2 &middot; Intrinsic Value Screener</p>
        <h1>Every screened public company, filterable</h1>
      </div>
      <div class="meta"><span id="meta">Loading...</span><a href="../">Open the valuation engine</a></div>
    </header>
    <noscript><p>${description}</p><p>This screener needs JavaScript to filter and sort.</p></noscript>
    <div class="stats" id="stats"></div>
    <div class="layout">
      <aside class="rail" id="rail"></aside>
      <main class="results" id="results"></main>
    </div>
    <aside class="drawer" id="drawer" aria-label="Company detail"></aside>
    <script>
${script}
    </script>
  </body>
</html>
`

mkdirSync(join(root, "dist/screener"), { recursive: true })
writeFileSync(join(root, "dist/screener/index.html"), html)
