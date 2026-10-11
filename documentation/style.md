# Style Reference Sheet

We sould try to use the same elements when representing similar functions in our app. This is why we should agree on which elements we use for which purposes to sync our common design language.

## Source References

HTML Elements and their use-cases:
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements

HTML Classes:
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/class

Aria Labels (Relevant for Screen-Readers):
https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-label

Our defined Classes:

Page classes, set in `index.html` and styled in `app_main/stylesheets/styles_main.css`:

| Class | Element | Role |
| --- | --- | --- |
| `topbar` | `<header>` | Bar at the top of the page that holds the page title. |
| `page-title` | `<h1>` | The page title. |
| `layout` | `<main>` | Page grid: settings rail beside the plot, data table under the plot. Becomes one column on narrow screens. |
| `panel` | `<section>`, `<aside>` | Bordered box with rounded corners. Shared by the plot, settings and table areas. |
| `plot-panel` | `<section>` | Places the plot panel in the page grid. |
| `rail` | `<aside>` | Places the settings panel in the page grid. |
| `table-panel` | `<section>` | Places the data table panel in the page grid. |
| `panel-head` | `<div>` | Header row of a panel: heading on the left, note on the right. |
| `toolbar` | `<div>` | Row above the chart with the plot type switch and the download buttons. |
| `segmented` | `<div>` | Switch between line and scatter. Hides the radio buttons and shows their labels as segments. |
| `chart` | `<div>` | Wrapper around the chart and its tooltip. Scrolls sideways on narrow screens. Not the same as `id="chart"`, the element inside it that the script redraws. |
| `tooltip` | `<div>` | Box shown beside the hovered data. |
| `rail-section` | `<section>` | One group of settings in the rail (Data, Axis titles). |
| `field` | `<label>` | A form field: caption above its input. |
| `actions` | `<div>` | Row of buttons, with an optional hint beside them. |
| `button` | `<button>` | Standard button. |
| `button-primary` | `<button>` | Added to `button` for the main action (Apply data). |
| `hint` | `<span>` | Small grey helper text (keyboard shortcut, row count). |
| `status` | `<p>` | Message about the plotted data, or an error message. Hidden while empty. |
| `status-error` | `<p>` | Added to `status` by `app.js` when the message is an error. Turns it red. |
| `table-wrap` | `<div>` | Scroll container for the data table. Also styles the `<table>` that the script puts inside. |

Tooltip classes, set by `hover_tooltip.js` on the elements it creates inside `tooltip`, and styled in the same stylesheet:

| Class | Element | Role |
| --- | --- | --- |
| `tooltip-title` | `<div>` | First line: the x axis title and the x value. |
| `tooltip-row` | `<div>` | One row per series. |
| `tooltip-key` | `<span>` | Dot in the colour of the series. |
| `tooltip-name` | `<span>` | Name of the series. Cut off with an ellipsis when it is too long. |
| `tooltip-value` | `<span>` | The y value. |

Chart classes, set on the SVG elements of the chart. The stylesheet does not style them: the SVG sets its colours and sizes as attributes. The classes name the parts of the chart, and `tests/chart_rendering.test.js` finds the elements by them.

| Class | Element | Role |
| --- | --- | --- |
| `grid-x` | `<line>` | Vertical grid line at an x tick. |
| `grid-y` | `<line>` | Horizontal grid line at a y tick. |
| `axis` | `<line>` | Axis line. The bottom axis comes first, then the left axis. |
| `series` | `<polyline>` | Line of one series in a line plot. |
| `markers` | `<g>` | Group with the dots of one series in a scatter plot. |
| `empty` | `<text>` | The "No data" message. |
| `tick-x` | `<text>` | Tick label on the x axis. |
| `tick-y` | `<text>` | Tick label on the y axis. |
| `label-x` | `<text>` | Title of the x axis. |
| `label-y` | `<text>` | Title of the y axis. |
| `legend-key` | `<line>`, `<circle>` | Sample of the series colour in the legend: a short line in a line plot, a dot in a scatter plot. |
| `legend-label` | `<text>` | Name of the series in the legend. |
| `hover` | `<g>` | Highlight of the hovered data. Added to the chart by `hover_tooltip.js` and removed when the pointer leaves. |

## JavaScript Naming

Functions, variables, parameters and object properties use snake_case (`parse_csv`, `x_label`).

Constants that never change use UPPER_SNAKE_CASE (`MARKER_RADIUS`).

JavaScript files are named in snake_case as well (`csv_input.js`).

JSDoc type names use PascalCase (`ParsedData`).

Names that belong to the browser or to Node keep their own spelling (`addEventListener`, `textContent`).
