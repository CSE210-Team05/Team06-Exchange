# ZeroPlot

Paste CSV data and draw a line or scatter plot using plain HTML, CSS, and JavaScript.
The app has no runtime dependencies. Development checks use ESLint.

## Local checks

Use Node.js 24 for the same environment as CI.

```sh
npm ci
npm run check
```

You can also run each check separately:

- `npm test`: unit tests for CSV parsing, axes, SVG rendering, and hover calculations.
- `npm run lint`: recommended ESLint checks for browser and Node JavaScript.
- `npm run test:smoke`: starts a temporary HTTP server and verifies the page, stylesheet,
  JavaScript entry point, and imported modules return successful responses with correct MIME types.

Check a published deployment with `SMOKE_URL=https://your-site.example/ npm run test:smoke`.
The HTTP smoke check does not execute browser JavaScript or verify downloads.

GitHub Actions runs these checks on pushes and pull requests.

## Run the app

```sh
npm start
```

Open http://localhost:8080/.

## Verify the deployment

After a deploy, check the live site:

```sh
SMOKE_URL=https://team06-exchange.vercel.app/ npm run test:smoke
```