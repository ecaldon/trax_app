# TRAX Architecture
## Overview
TRAX is a manual meteorological analysis and annotation tool that allows users to upload meteorological maps and create contours that are exported into a .csv. The eventual goal is for the app to serve as an interface to create human-made machine learning training datasets of meteorological features.

**For documentatation of the JavaScript code, [see here.](https://ecaldon.github.io/trax_app/docs/api/)**

## Architecture
```mermaid
flowchart TD
    GD[Google Drive load/save imagery] -.needs work.-> UI
    LF[Local Files] -.needs work.-> UI
    UI[UI / Canvas layer
    mouse, touch, and draw events] --> CMD
    CMD[Command layer 
    execute, undo, redo, history stack] --> DM
    DM[Data model
    shapes, points, feature categories] -.needs work.-> EXP
    EXP[Export layer
    GeoJSON, KML, GeoTIFF, contours] -.planned.-> BRIDGE

    BRIDGE[Tracker / ML bridge
    Python module?]

    style BRIDGE stroke-dasharray: 5 5
```

## Command Pattern
All actions taken by the user on the canvas are wrapped in a Command pattern, which allows each canvas action to be undone/redone. Each Command has an `execute()` method for when the action is done/redone, and an `undo()` method for when the action is undone. 
