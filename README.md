# ZeroPlot

Paste CSV data and get a line plot or a scatter plot. Written from scratch in plain HTML, CSS and JavaScript:
no libraries, no build step, no external requests.

![ZeroPlot](docs/screenshot.png)

## Features

- Paste CSV data and click **Apply data**. The first column is x, the second column is y.
- **Line** or **scatter** plot, drawn as SVG.
- Editable **axis titles** for x and y (taken from the CSV header row by default).
- **Automatic axis scaling** with round tick values (1, 2 or 5 times a power of ten).
- **Fixed layout**: the plot is always 720 × 440 px with a vertical and a horizontal grid.
- **Data table** with the plotted values.

CSV details: a header row is optional; commas, semicolons and tabs are accepted; with semicolons or tabs, decimal commas
(`21,5`) work, as exported by German Excel. Rows without two numbers are skipped and counted, extra columns are ignored.

## Run it

1. Open a terminal in the project folder.
2. Start a local web server (browsers do not load JavaScript modules from `file://`):
   ```sh
   node scripts/serve.js
   ```
   Any static server works too, for example `python3 -m http.server 8080`.
3. Open <http://localhost:8080>.

## Tests

```sh
node --test
```

Uses Node's built-in test runner (Node 20 or newer), so there is nothing to install.

## How it works

```
CSV text ──► parseCSV() ──► [x, y] points ──► renderChart() ──► SVG markup ──► page
                                                   └── niceAxis(): automatic, round axis ranges
```

| File | Responsibility |
| --- | --- |
| `src/csv.js` | Parse pasted CSV into `[x, y]` points and default axis titles |
| `src/axis.js` | Nice tick values (Heckbert's 1-2-5 rule), the data-to-pixel mapping and tick labels |
| `src/chart.js` | The fixed layout: grid, axes, line or markers and titles, returned as an SVG string |
| `site/app.js` | The page: CSV input, line/scatter switch, axis titles and the data table |

Both library modules are pure functions without DOM access, which is why every test runs in Node.
Using them elsewhere takes two calls:

```js
import { parseCSV } from './src/csv.js';
import { renderChart } from './src/chart.js';

const { points, xLabel, yLabel } = parseCSV('Time (s),Height (m)\n0,0\n1,15.1\n2,20.4');
document.getElementById('chart').innerHTML = renderChart({ points, type: 'scatter', xLabel, yLabel });
```

## Version history

This is a deliberately small base. A larger prototype with a Canvas renderer, time and log axes, zoom and pan,
tooltips, multiple series, themes and an examples gallery is kept in git under the tag `prototype-full`.
Look at a part of it with, for example:

```sh
git show prototype-full:src/interaction/hittest.js
```

## License

[MIT](LICENSE)
