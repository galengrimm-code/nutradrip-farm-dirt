# Claude Code Guidelines for soil-app-inline

## Project Structure

```
/js
  /core
    data.js   - Shared data functions (localStorage, IndexedDB, SheetsAPI, client/farm data)
    utils.js  - Shared utilities (formatNumber, colors, data helpers, debounce)
  /features
    (empty - page-specific features stay inline)

index.html      - Main map app
settings.html   - Settings page
import.html     - Data import
analysis.html   - Analysis/charts
```

## Adding New Code

**Shared code (used by multiple pages)** → Add to `/js/core/`:
- Data loading/saving functions → `data.js`
- Utility functions (formatting, colors, helpers) → `utils.js`

**Page-specific code (UI, page logic)** → Keep inline in the HTML file

## Module Usage

All HTML pages include:
```html
<script src="js/core/data.js"></script>
<script src="js/core/utils.js"></script>
```

Access shared functions via:
- `DataCore.functionName()` - data operations
- `window.Utils.functionName()` - utilities

Pages extend these with page-specific overrides when needed (see how index.html extends Utils).
