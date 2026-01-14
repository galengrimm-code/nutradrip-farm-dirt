# Changelog

All notable changes to the Soil Sample Analysis app will be documented in this file.

## [v1.0.0] - 2026-01-14

### Added
- **Version Tracking**: App now shows version number and build timestamp in footer
- **Data Verification Check**: Button below scatter plot to verify yield correlation calculations
- **Yield Search Radius Display**: Shows the yield trim distance used during import (50ft, 150ft, etc.)
- **Multi-year Yield Handling**:
  - "All Years (Average)" - averages yield across years at each location
  - "All Years (Combined)" - each year as separate data point
  - Specific year selection
- **Enhanced Scatter Plot**:
  - Larger chart (900x500)
  - Trend line with equation (y = mx + b)
  - R² display
  - 95% prediction interval bands
  - Yield threshold analysis with interactive slider
  - Swap Axes toggle (X=Nutrient/Y=Yield or X=Yield/Y=Nutrient)
  - Points highlighted above/below threshold
- **Field Trends Improvements**: Smaller graphs for better PDF export layout
- **Yield Correlation Field Filter**: Dropdown filters to only show fields with yield data

### Fixed
- Scatter plot visibility (was hidden behind Debug button)
- Field Trends graph sizing and layout for exports

---

## Previous Versions

### v18 - Map Enhancements
- Smooth color gradients for nutrient visualization
- Year filtering by attribute

### v17 - Year Comparison
- Compare nutrient levels between sample years
- Side-by-side field comparison

### v16 - Yield Import
- Import yield maps from shapefiles
- Automatic sample-to-yield matching
- Configurable search radius (50-150ft)

### v15 - Analysis Features
- Field trends with visual graphs
- Rankings and comparisons
- Export to PDF reports

### v14 - Core Features
- Map view with nutrient color coding
- Google Sheets data storage
- IndexedDB caching for offline use
- Multi-field support
