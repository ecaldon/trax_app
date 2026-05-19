# Contributing to trax_app
## Ways you can contribute:
- Create an issue
- Work on an issue
- Create a pull request for your fork
> More details to come as this repository becomes more suited for organized contribution. The plan is to implement milestones to organize work into next steps.

## Code structure & key design concepts
> This section will take you through the JavaScript code in the order of the code top to bottom, which is not necessarily the order the user will interact with the website. The HTML and CSS files are fairly self-explanatory and relevant components are treated a few times in the JavaScript section.

### [Video of Zeke Caldon & Dr. Aryeh Drager discussing the code of the app and next steps for new features]()

### Global variables
There are eight global objects that are used across the JavaScript file:
- `frameIdx`: The current frame being displayed
- `numFrames`: The total number of frames loaded into the app
- `layerIdx`: The current map layer being displayed
- `numLayers`: The total number of layers loaded into the app
- `layerFilenameArrays`: Array of arrays of image filenames for each layer
- `bckdClass`: The `bckdCanvasClass` that is used for this session.
- `drawClass`: The `drawCanvasClass` that is used for this session.
- `currentTool`: The current drawing tool selected by the user. (0 is the select <span>&#8598;</span> tool, 1 is the pen <span>&#10002;</span> tool, and 2 is the pan <span>&#10021;</span> tool)

### Global constants
`mySelBoxSize`: The size of selection box handles throughout the canvas interface in px.

### HTML Objects
This section declares the HTML elements within the JavaScript file so their state can be modified and user actions can be responded to through JavaScript functions.
#### Top controls
All non-Google related controls on the top bar.
#### Canvas objects
The canvas the user sees is actually made up of two canvases: the background canvas, which displays the map image, and the drawing canvas which draws and responds to the user's actions. These are kept within a `<div>` element called `canvasContainer`. Each canvas has a canvas object and a context within the app. [See here for more about the HTML Canvas API](https://www.w3schools.com/graphics/canvas_drawing.asp).

#### Draw controls
The draw control apparatus is a radio button interface in the background. The `for` loop within this section changes the CSS style of the `canvasContainer` object to change the user's cursor to the applicable style for the tool selected (e.g., to change it to a crosshair for the pen tool).

#### Bottom controls
All controls on the bottom bar.

### Command Pattern Classes
The TRAX app utilizes the [command pattern](https://www.geeksforgeeks.org/system-design/command-pattern/) to facilitate the undo/redo functionality of the app. This section of the code defines classes for commands, groups of related consecutive commands, and a history manager that stores previous commands for undo/redo.

#### `Command` class
An interface for any action taken in the canvas by the user. Any new action developed that should be supported by the undo/redo functionality should `extend` `Command`. This requires that new action (i.e. "concrete command" class) to have an `execute()` and `undo()` method. See the Concrete Commands section for more information.

#### `CommandGroup` class
An interface to store groups of commands as one command. For example, if the user drags a contour, that will register as multiple commands undertaken, but it is not desirable for these commands to each be undone one by one, since the user's initial action was one fluid motion. Any set of commands that will be in the same user action (e.g., dragging/resizing a point/contour) should be siloed into a `CommandGroup` by calling `historyManager.beginCommandGroup` when the user action begins and calling `historyManager.endCommandGroup` when the user action ends.

#### `HistoryManager` class
This class:
- Stores:
  -  A history of commands executed (`this.history`)
  -  A stack of undone commands that could possibly be redone (`this.redoStack`)
- Provides methods for:
  -  Executing commands (`HistoryManager.executeCommand(command)`)
  -  Undoing and redoing commands stored in the history and redo stack (`HistoryManager.undo()` and `HistoryManager.redo()`)
  -  Beginning and ending command groups (`HistoryManager.beginCommandGroup()` & `HIstoryManager.endCommandGroup()`)

### Canvas Classes
#### `BckdCanvasClass`

This class is an object initiating the functionality of the background canvas.

**`constructor(images, first_filename)`**

 When it is first constructed after the user uploads images via the Google Drive Picker, the following happens:
1. The `images` array is pushed to an array of arrays named `this.layers` in the `BckdCanvasClass` object.
2. The [`numFrames` global variable](#global-variables) is updated to the number of images uploaded by the user
3. The `frameSlider` object is updated to reflect the number of frames specified in `numFrames`.
4. The `layerPicker` object adds a new `option` for the uploaded layer which is named the value of `first_filename`.

**`addLayer(images, first_filename)`**

This method adds a new layer as a result of the user uploading new images other than the first time in this session. If the length of the `images` array does not match with the `numFrames` global variable, a `window.alert` is called and an `Error` is thrown. Otherwise, the method roughly does the equivalent of executing steps 2 and 4 of the `constructor` method to add a new layer of images to the background canvas.

**`clear()`**

Erases the entire `bckdCtx` by calling `clearRect()`.

**`draw(layer, frame)`**

1. Calls `this.clear()` to clear the canvas for redrawing.
2. Draws the image for the specified `layer` and `frame`, scaling if necessary for the confines of the `canvasContainer` in the given window.

#### `DrawCanvasClass`
> The `DrawCanvasClass` is the heart of the program and is quite complex. It is developed specifically for the HTML Canvas API which is a simple but powerful interface. However, developing for HTML Canvas has a bit of a learning curve as the API doesn't do a lot of the heavy lifting for you. I highly recommend buying/borrowing the book [HTML5 Unleashed](https://www.amazon.com/HTML5-Unleashed-Simon-Sarris/dp/0672336278) by Simon Sarris if you are new to developing for the HTML5 Canvas and want to contribute; it is cheap (used versions under $10) and well worth your money. Many of the pieces of this specific class are built from the concepts in this book. Despite the obstacles the Canvas API may provide new programmers, it has been determined that it is essential for the continued development of this app because it affords almost infinite possibilities in terms of customizing the interface for the most intuitive user experience.

**`constructor()`**

*Mouse offset variables*

Owing to the complex nature of determining the user's mouse position for Canvas operations, the class first stores the width & height of HTML and CSS style elements to the left and top of the `canvasContainer` for use in the `getPos()` function. These values are stored as `this.styleBorderLeft`, `this.styleBorderTop`, `this.htmlLeft`, and `this.htmlTop`.

*Shape objects*

- `this._shapes`: An array of `Shape` objects that the user has created in this session.
- `this._selection`: Stores the `Shape` object currently selected by the user. If there is no shape selected, the variable is `null`.

>Constructor variables that start with `this._` are variables that may be set and/or retrieved by functions & methods outside the `DrawCanvasClass` through `get` and `set` methods within the class. Otherwise, the variables may only be used by methods within the class.

*State tracking*

Abstractions of user actions to properly draw contours onto the Canvas:

- `this.dragState`: Stores information on the current dragging action if the user is undertaking such an action. If there is no current drawing action, the variable is `null`. For more info, see TODO
- `this.expectResize`: Stores the index of a selection point in the selected shape that the user is hovering over with their cursor. If the user's cursor is not hovering over a selection point in the selected shape, the variable is `-1`.

*History manager*

A `HistoryManager` object is constructed and stored within the `DrawCanvasClass` as `this._historyManager`. Since the `HistoryManager` object only takes commands that affect the state of the drawing canvas, it was decided to store the `HistoryManager` object in this class as it would be the most intuitive and organized way of arranging it within the script. The `HistoryManager` stored by the `DrawCanvasClass` does have `get` privileges by other functions and methods throughout the code, indicated by its variable name beginning with `this._` in the `constructor()` method.

**`clear()`**

Erases the entire `drawCtx` by calling `clearRect()`.

**`draw(frame)`**

1. Clears `drawCtx` for redrawing by calling `this.clear()`.
2. Sets the `drawCtx.globalAlpha` to `1.0` for completely opaque drawing, and then draws each shape on the canvas for the specified `frame` by executing a `for` loop that cycles over `this._shapes`, calling `.draw(drawCtx, frame)` for each `Shape` object.
3. If the "overlay last" checkbox is checked, sets the `drawCtx.globalAlpha` to `0.5` for semi-transparent drawing, and then draws each shape on the canvas for `frame - 1` (if applicable) by using the same method as step 2.

**`getPos(e)`**

Returns the `x` and `y` of the current mouse position relative to the canvas (i.e., with the top left corner of the canvas having `(x,y) = (0,0)`).

**`doDown(e)`**

Handles the action of a user clicking (or touching on tablet) within the `CanvasContainer` in the context of the current tool selected, if the user clicked on a `Shape` object, and other factors.