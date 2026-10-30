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

## API documentation

The source code carries JSDoc comments. Generate the documentation from them:

```sh
npm run docs
```

This writes two untracked outputs into `docs/`:

- `docs/html/index.html`: a browsable website (clean-jsdoc-theme, with search and a light/dark toggle). Serve it over HTTP, for example `npx serve docs/html`, because the search loads an index file.
- `docs/API.md`: the same reference as one Markdown file.

Whenever a GitHub Release is published, the CI workflow builds the HTML site from the release tag and publishes it to GitHub Pages at <https://cse210-team05.github.io/Team06-Exchange/>, so the site always shows the latest release. The job can also be started by hand from the Actions tab. A repository owner must set **Settings > Pages > Source** to **GitHub Actions** once, and allow release tags in the `github-pages` environment (**Settings > Environments**); until then the `docs` job fails.

Settings are in `jsdoc.json`. See "JSDoc comments" in `documentation/style.md` for how to write the comments.

## Verify the deployment

After a deploy, check the live site:

```sh
SMOKE_URL=https://team06-exchange.vercel.app/ npm run test:smoke
```