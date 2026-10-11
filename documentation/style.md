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

(insert table with element & class)

## JavaScript Naming

Functions, variables, parameters and object properties use snake_case (`parse_csv`, `x_label`).

Constants that never change use UPPER_SNAKE_CASE (`MARKER_RADIUS`).

JavaScript files are named in snake_case as well (`csv_input.js`).

JSDoc type names use PascalCase (`ParsedData`).

Names that belong to the browser or to Node keep their own spelling (`addEventListener`, `textContent`).
