# OpenCreate Forge — Alpha 3

Alpha 3 introduces new creative tools, improvements to the editing workflow, and several stability and performance fixes.

## New Features

- New Gradient Tool with support for linear, radial, and angular gradients.
- Full gradient editor, including:
  - Repositionable control points.
  - Adding and removing colors.
  - Opacity control.
  - “Foreground to Transparent” and “Rainbow” templates.

- New `gradient_fill` layer type.
- Photoshop/Photopea-inspired Color Picker for selecting colors directly from the canvas.
- New Eyedropper Tool, activated with the `I` shortcut, with support for a temporary modifier.
- Rich Text support in the Text Tool:
  - Bold, italic, underline, and strikethrough.
  - Superscript and subscript.
  - Font color, size, and family.
  - `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, and `Ctrl+Shift+U` shortcuts.

- Edit text by double-clicking a layer or its thumbnail.
- Transform groups while preserving the relative position of their child layers.
- Temporary transformation history for undoing and redoing transformations.
- Duplicate layers by holding `Alt` while dragging with the Move Tool.
- Move selected content with the Move Tool or the keyboard arrow keys.
- Delete the contents of a selection with `Delete` or `Backspace`.
- Restrict fills to the area selected with the Select Tool.
- Automatically convert empty RasterLayers into solid fill layers.
- Draw straight lines with `Shift` + click using the Brush, Pencil, and Eraser tools.
- Status bar zoom control with a range from 5% to 5000%.
- Preview project thumbnails by hovering over project tabs.
- Project tab improvements:
  - Horizontal scrolling with the mouse wheel.
  - Navigation buttons.
  - Indicators when the active tab is outside the visible area.

- Improved drag-and-drop support:
  - Import multiple files.
  - Import files into new projects when dropped over the project tabs.
  - Transfer layers between projects by dragging and dropping them.

## Fixes and Improvements

- Added Session Guard to restore projects after crashes, unexpected shutdowns, or abnormal exits.
- Unsaved projects are now detected before the application closes normally.
- Fixed an issue that could leave the entire interface gray after a React crash.
- Fixed support for HiDPI/Retina displays on macOS.
- Reduced flickering during painting operations.
- Improved Layer Mask performance, especially on lower-end computers.
- Fixed incorrect clipping of transformed layers inside groups with styles.
- Fixed text layer transformations while preserving their vector quality.
- Fixed font weights and formatting controls in the Text Tool.
- Fixed text shifting when repeatedly changing the font size.
- Fixed the Fixed Ratio behavior in the Crop Tool.
- Fixed selection alignment and automatic scrolling.
- Improved selection modifiers using `Ctrl`, `Shift`, and `Alt`.
- Fixed the state of dragged layers when switching projects.
- Improved the quality of pixel art project thumbnails.
- Fixed modal focus, stacking order, and visual highlighting.
- Fixed text history being saved when history saving is disabled.
- Updated the GitHub link in the “About” window.

## Technical and Distribution Improvements

- Updated to Electron 41.10.6 and electron-builder 26.15.3.
- Improved the release pipeline for Windows, Linux, and macOS, including Intel and Apple Silicon builds.
- Added caching and automatic retries for downloads and builds.
- Added smoke tests and artifact validation for macOS builds.
- Expanded test coverage for the engine, layers, tools, stores, and React components.
- Added tests for gradients, Rich Text, the Color Picker, session recovery, selections, zoom, and drag-and-drop.

### Testing renderer recovery in DevTools

When running the development build, open Electron DevTools and execute:

```js
window.__forgeDebug.crashRenderer();
```

This intentionally crashes the renderer process so Session Guard and the automatic recovery flow
can be tested. The command is not exposed in production builds.

For project diagnostics, the current `ForgeEngine` instance is also available in the console:

```js
ForgeEngine.getProject();
await ForgeEngine.copyProject();
```

Both commands replace large image payloads with `...` while preserving the rest of the project data.

> Note: macOS builds use ad hoc signing and are not notarized by Apple. You may need to manually allow the app to run under **System Settings → Privacy & Security → Open Anyway**.
