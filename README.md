# Wealthsimple ROI Analyzer

Chrome extension for more advanced ROI graphs.

## Build

Chart.js is not part of this repository. `npm install` downloads it, and `npm run package` copies `chart.umd.js` into `dist/` next to the extension files, then writes `wealthsimple-roi-analyzer.zip`. Load the unpacked extension from `dist/` after `npm run build`.

## License

This extension is free software under the GNU General Public License v3.0 or later. See `LICENSE`.

`wealthsimple_api.js` is a JavaScript port of [ws-api](https://github.com/gboudreau/ws-api-python) by Guillaume Boudreau, which is also GPL-3.0-or-later. That copyright notice is kept at the top of `wealthsimple_api.js`.

Third-party pieces keep their own terms inside this GPL package. See `NOTICE`.

## Credits

Graph icon by [Icons8](https://icons8.com).