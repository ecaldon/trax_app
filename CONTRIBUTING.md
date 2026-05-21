# Contributing to trax_app
## Ways you can contribute:
- Create an issue
- Work on an issue
- Create a pull request for your fork
> More details to come as this repository becomes more suited for organized contribution. The plan is to implement milestones to organize work into next steps.

## Code structure & key design concepts
> This section will take you through the JavaScript code in the order of the code top to bottom, which is not necessarily the order the user will interact with the website. The HTML and CSS files are fairly self-explanatory and relevant components are treated a few times in the JavaScript section.

### [Video of Zeke Caldon & Dr. Aryeh Drager discussing the code of the app and next steps for new features](https://drive.google.com/file/d/1iFfsYyUoeDq1R3v5QEnazqOYNRc8V3zr/view?usp=sharing)

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

- If `currentTool = 0` (i.e., the current tool is <span>&#8598;</span>):
  - If `this.expectResize` has a value other than `-1` (i.e., the user's cursor is over a selection handle):
    - `this.dragState` is set with `mode:'point'`
    - `this.dragState` is set with `startPoints` saving a copy of the array of points of the currently selected shape for the current frame.
    - A `commandGroup` is started, so all future commands will be added to a command group.
    - The cursor style is changed to the grabbing hand.
  - Otherwise, each shape in `this.shapes` is hit tested. If the hit test is true for the shape (i.e., the user clicked on a shape):
    - The shape is set as `this._selection`.
    - The color picker is enabled and its value matches the shape selected.
    - The contour label is enabled and its value matches the shape selected.
    - The "pause" and "delete" buttons are enabled.
    - `this.dragState` is set with `mode:'body'`
    - The current mouse position is saved in `this.dragState` as `startMouse`.
    - `this.dragState` is set with `startPoints` saving a copy of the array of points of the currently selected shape for the current frame.
    - A `commandGroup` is started, so all future commands will be added to a command group.
    - The canvas is redrawn.
  - Otherwise, nothing was selected. Run `this.deSelect()` and redraw the canvas.
- If `currentTool = 1` (i.e., the current tool is <span>&#10002;</span>):
  - If there is no shape currently selected, the user is creating a new shape. Execute `CreateShapeCommand(this, mx, my)`, with mx and my being the user's cursor position.
  - Otherwise, if there is a shape selected and the user is clicking within 5px of the first point of that shape, add a point (`AddPointCommand`) equal to the first point of the shape, and close the shape (`CloseShapeCommand`). Execute both these commands within the same command group.
  - Otherwise, if there is a shape selected and the user is clicking anywhere other than within 5px of the first point of that shape, add a point (`AddPointCommand`)
  - Redraw the canvas.

**`doMove(e)`**

Handles the action of a user moving their cursor within the `CanvasContainer` to handle dragging actions if `dragState` is not `null`, and change the cursor style and `this.expectResize` for shape and point elements otherwise.

- If the user is dragging a shape (`this.dragState.mode === 'body'`), execute a `DragShapeCommand` and redraw the canvas.
- Otherwise, if the user is dragging a shape (`this.dragState.mode === 'point'`), execute a `DragPointCommand` and redraw the canvas.
- Otherwise, if there is a selected shape, there is no current dragState, and the current tool is <span>&#8598;</span>:
  - If the cursor is over a selection box in the selected shape:
    - Set `this.expectResize` to that selection box's index within the selected shape's points array.
    - Change the user's cursor style to the pointing hand.
  - Otherwise, if the cursor is over the selected shape but not a selection box:
    - Set `this.expectResize` to `-1`
    - Change the user's cursor style to `all-scroll` (<span>&#10021;</span>)
  - Otherwise, if the cursor is over a shape that is not selected, change the user's cursor style to the pointing hand.
  - Otherwise, if the cursor isn't over any of the above objects, change the user's cursor to the default arrow cursor.

**`doUp(e)`**

Handles the action of a user releasing from clicking (or tapping on mobile).
- Sets `dragState` to null.
- Sets `expectResize` to `-1`.
- Sets the cursor to the correct style for the new context of not being clicked/tapped.
- Ends the current command group.

**`addShape(shape)`**

Pushes the specified `shape` object to `this.shapes`.

**`removeSelectedShape()`**

Removes the currently selected shape from `this.shapes`, if there is one, then calls `this.deSelect()`.

**`deSelect()`**

Performs all actions necessary to accurately reflect the context of no shape currently being selected.
- Sets `this._selection` to null.
- Disables all elements in the contour editor.
- Sets the `colorPicker` value to `#ff0000` (i.e., red)
- Sets the value of `contourLabel` to `"No contour selected"`.
- Redraws the canvas.

**`changeSelectedShapeColor(e)`**

Executes a `ColorChangeCommand` for the selected shape (if there is one) and redraws the canvas.

**`changeSelectedShapeLabel(e)`**

Executes a `LabelChangeCommand` for the selected shape (if there is one).

**`pauseSelectedShape()`**

Executes a `FramePauseCommand` for the selected shape (if there is one).

**`deleteSelectedShape()`**

Executes a `ContourDeleteCommand` for the selected shape (if there is one) and redraws the canvas.

**`getMaxNumPoints()`**

Returns the maximum number of points for all shapes across all frames to determine the appropriate number of frames for the export .csv header. For example, if shape 1 has 12 points across all frames and sahpe 2 has 8 points across all frames, this function would return `12`.

### Shape class
#### `constructor(first_point, closed, color, label)`
- `this._closed`: Boolean which returns whether the shape is a closed polygon (`true`) or an open contour (`false`)
- `this._color`: Value of the shape's color.
- `this._label`: Value of the shape's label.
- `this._frames`: Array of arrays representing the shape's points on each frame. For example, the first element of `this._frames` would be an array of the shape's points on frame 1.
- `this._modified`: Array representing whether the shape's state was modified on each frame. This ensures that user modifications to the shape only carry forward to future frames that have not been modified.
- The constructor finally adds the first point of the shape specified by the `first_point` parameter to all future frames.

#### `addPoint(x, y)`
Adds the specified point to the current and all future frames.

#### `getModified(frame)`
Returns a boolean of whether the shape was modified on the specified `frame`.

#### `deleteLastPoint()`
Pops the last point of the shape from the current and all future frames.

#### `getPoints(frame)`
Returns the points array for the specified `frame`.

#### `setModified(frame, condition)`
Sets the boolean for whether the shape was modified on the specified `frame` to the specified `condition`.

#### `draw(ctx, frameIndex)`
> This method also draws heavily from code from Simon Sarris's work and requires sufficient knowledge of the Canvas API. Refer to those resources for help with understanding concepts relating to the drawing context functionality.

Draws the shape in the specified drawing context `ctx` for the specified `frameIndex`.
- If there are no points for the specified `frameIndex`, return immediately (draw nothing)
- Otherwise, set the `ctx.strokeStyle` to the shape's color and set the `ctx.lineWidth` to `4`.
- Have the context begin a path and move to the first point in the point array on the frame `frameIndex`. Then for each point in the shape, draw a line to the next point.
- If the shape is closed, have the context close the drawing path.
- Stroke the drawing path with the previously specified stroke style and line width.
- If this shape is selected and being drawn on the current frame (i.e., not drawn for the "overlay last" layer):
  - Draw selection boxes for each point in the shape on the frame `frameIndex` with white fill and black borders.

#### `distToSegment(px, py, a, b)`
Calculates the closest distance of the cursor (`px`, `py`) to the segment specified by [`a`,`b`].

#### `hitTest(mx, my, tolerance = 6)`
- If there are no or only one points on the current frame, immediately return false as it's impossible for the shape to have been hit.
- Otherwise, for each line in the shape, check if `distToSegment(mx, my, a, b)` is less than the `tolerance` of `6`. If it is, the hit test is a success and it returns true. 
- If no line in the shape returns less than the `tolerance` of `6` from `distToSegment(mx, my, a, b)`, return false.

#### `pause()`
Implements the pause functionality by setting the points arrays for the current and all future frames to `null`, de-selecting, and then redrawing the canvas.

#### `unpause(startPoints)`
Undoes the pause functionality by setting `this._frames` to `startPoints`, setting the currently selected shape to this state, and redrawing the canvas.

### Concrete commands
Concrete commands extend the `Command` class and essentially implement any user action that can be undone/redone within the context of the application. Each concrete command has a `constructor()` method which saves pertinent information about the action undertaken within the `Command` object itself, an `execute()` method which executes or redoes the action, and an `undo()` method which undoes the action.

> It's important to remember that the `execute()` method also acts as the `redo()`  method when developing. Any state of the application that would be present when the user executes an action may not be the case when redoing the action, so the `execute()` command should account for this. For example, when the user modifies a shape on frame 6, undoes that action, moves to frame 7, and then attempts to redo that action, the program should first go back to frame 6 so that the user can see that redoen action.

#### `CreateShapeCommand`
*`constructor(drawClass, x, y)`*

- `this.DrawClass`: `drawClass` that is drawing the shape
- `this.x`, `this.y`: Coords of the first point of the shape
- `this.shape`: Shape object (in case shape needs to be restored through redo)
- `this.frame`: Frame the shape was first created.

*`execute()`*
- First, change the frame to `this.frame`, and switch to the draw tool.
- If there is not a shape already saved in `this.shape`, set it to a new `Shape` object with the first point as (`this.x`, `this.y`).
- Add the shape to the draw class and set it as the selected state. 
- Enable all elements in the contour editor.

*`undo()`*
- First, change the frame to `this.frame`.
- Change the selected shape to `this.shape` and tell the draw class to remove the selected shape.
- Switch to the select tool.

#### `AddPointCommand`
*`constructor(shape, x, y)`*
- `this.shape`: Shape object for the point to be added to
- `this.x`, `this.y`: Coords of the point to be added to the shape
- `this.frame`: Frame the point was added to the shape

*`execute()`*

Change the frame to `this.frame`, switch to the draw tool, and add the point to the shape using the `Shape.addPoint` method.

*`undo()`*

Change the frame to `this.frame` and delete the last point of the shape by using the `Shape.deleteLastPoint()` method.

#### `CloseShapeCommand`
*`constructor(shape)`*
- `this.shape`: Shape object being closed
- `this.frame`: Frame the point was added to the shape

*`execute()`*

Change the frame to `this.frame`, set `this.shape.closed` to `true`, and switch to the select tool.

*`undo()`*

Change the frame to `this.frame`, set `this.shape.closed` to `false`, make the selected shape `this.shape`, and switch to the draw tool.

#### `DragShapeCommand`
*`constructor(shape, dragState, mouse)`*
- `this.shape`: Shape object being dragged
- `this.dragState`: The `dragState` object representing the drag action being undertaken
- `this.mouse`: Coordinates of current cursor position
- `this.modified_before`: Saves whether the shape was modified on this frame before this drag action.
- `this.frame`: The frame on which the drag action is being undertaken

*`execute()`*

- Change the frame to `this.frame`.
- Set the shape's modified state for this frame to `true`.
- For the current and all future frames, if the shape was not modified on the frame or it is the current frame, set all its points so they are the same distance from their respective points on the shape before the drag action (`this.dragState.startPoints`) than the mouse is from its starting position in the drag action (`this.dragState.startMouse`).
  
*`undo()`*
- Change the frame to `this.frame`.
- Set the shape's modified state for this frame to `this.modified_before` (i.e., if this shape's `modified` state was `false` before, change it back to `false`, otherwise keep it `true`)
- For the current and all future frames, if the shape was not modified on the frame or it is the current frame, set all its points to their respective points on the shape before the drag action (`this.dragState.startPoints`).

#### `DragPointCommand`
*`constructor(shape, expectResize, dragState, mouse)`*
- `this.shape`: Shape object being dragged
- `this.dragState`: The `dragState` object representing the drag action being undertaken
- `this.expectResize`: The index of the point being modified in the shape
- `this.mouse`: Coordinates of current cursor position
- `this.modified_before`: Saves whether the shape was modified on this frame before this drag action.
- `this.frame`: The frame on which the drag action is being undertaken

*`execute()`*

- Change the frame to `this.frame`.
- Set the shape's modified state for this frame to `true`.
- For the current and all future frames, if the shape was not modified on the frame or it is the current frame, set the point being moved to the mouse's position.
  
*`undo()`*
- Change the frame to `this.frame`.
- Set the shape's modified state for this frame to `this.modified_before` (i.e., if this shape's `modified` state was `false` before, change it back to `false`, otherwise keep it `true`)
- For the current and all future frames, if the shape was not modified on the frame or it is the current frame, set all its points to their respective points on the shape before the drag action (`this.dragState.startPoints`).

#### `ColorChangeCommand`
*`constructor(shape, newColor)`*
- `this.shape`: Shape whose color is being modified
- `this.oldColor`: Color before the change action
- `this.newColor`: Color after the change action

`execute()` and `undo()` set the shape's `color` to `this.newColor` and `this.oldColor`, respectively.

#### `LabelChangeCommand`
*`constructor(shape, newLabel)`*
- `this.shape`: Shape whose label is being modified
- If the shape has a label already, `this.oldLabel` is `shape.label`. Otherwise, it is set to `""`.
- `this.newLabel`: The new label to be applied to the shape.

`execute()` and `undo()` set the shape's `color` to `this.newLabel` and `this.oldLabel`, respectively, and set the `contourLabel`'s value accordingly if the shape is selected.

#### `FramePauseCommand`
*`constructor(shape)`*
- `this.pause_frame`: The frame on which the pause action was committed.
- `this.shape`: The shape on which the pause action was committed
- `this.startPoints`: The shape object's `frames` array before the pause action was committed.

`execute()` and `undo()` change the frame to `this.pause_frame` and then call `this.shape.pause()`, or `this.shape.unpause()` (with the proper parameter for the `startPoints`), respectively.

#### `ContourDeleteCommand`
*`constructor()`*
- `this.drawClass`: The `drawClass` the shape will be delete from
- `this.shape`: The shape which will be deleted
- `this.frame`: The frame on which the shape is being deleted

*`execute()`*
- Change the frame to `this.frame`.
- Select `this.shape` and execute `drawClass.removeSelectedShape()`.
- Execute `switchToSelect()`.

*`undo()`*
- Change the frame to `this.frame`.
- Execute `switchToDraw()`.
- Add `this.shape` to the `drawClass` and set it as the selected shape.
- Enable the contour editing tools and populate them with `this.shape`'s parameters.

### `initCanvasFunctionality(images, first_filename)`
This function sets up the canvases, canvas classes, and event listeners after the Google Drive Picker calls back (i.e., the user selects the map images).

- Sets the canvases so their widths and heights fill the `canvasContainer`.
- Instantiates and declares the global `bckdClass` and `drawClass` to be new `BckdCanvasClass(images, first_filename)` and new `DrawCanvasClass()`, respectively.
- Sets the `numLayers` global variable to `1`.
- Executes `drawRequestedFrame()`.
- Adds event listeners for the `doDown()`, `doMove()` and `doUp()` methods of `drawClass`.

### `drawRequestedFrame()`
Sets the `frameLabel` to the correct frame, and redraws the `bckdClass` and `drawClass` for the current `layerIdx` and `frameIdx`.

### Event listeners and helper functions
The event listeners will not be explained as they are fairly self-explanatory. Below are descriptions of the helper functions in this section.
#### `downloadAll()`
Executes `downloadImageFrames()` and `downloadCsv()`, and executes `generateZipDownload()` with the returns from theses two functions.
#### `downloadImageFrames()`
- Constructs a temporary in-memory canvas (`tempCanvas`) and context (`tempCtx`), as well as an empty array for the images of the canvas frames to be stored.
- Sets the `tempCanvas`'s width & height to that of the `bckdCanvas`.
- Calls `drawClass.deSelect()`.
- For each frame in each layer:
  - Redraws the background and draw canvases for the layer and frame
  - Draws the image of each canvas to the `tempCtx`.
  - Converts the `tempCanvas` to a `blob` object and pushes this `blob` to the `imageArray`.
  - Clears the `tempCtx`.
- Redraws the background and draw canvases for the original layer and frame
- Returns the `imageArray`.
#### `downloadCsv()`
- Constructs the `headerRow` with the following:

| Variable            |Explanation                                                                     |
|---------------------|---------------------------------------------------------------------------------|
| num                 | Numerical ID for the shape                                                      |
| label               | User-inputted label for the shape                                               |
| closed              | Boolean denoting if the shape is a closed polygon or an open contour            |
| frame_num           | Frame number for the following layer filenames and point coordinates            |
| layer_`n`_filename* | Filename of the image for each layer on the frame number specified by the row, with the largest `n` equaling `numLayers`   |
| coord_`n`_x*        | X coordinate of the n point on the shape and frame number specified by the row , with the largest `n` equaling `drawClass.getMaxNumPoints()`. |
| coord_`n`_y*        | Y coordinate of the n point on the shape and frame number specified by the row with the largest `n` equaling `drawClass.getMaxNumPoints()`.  |
- Pushes the applicable information for each shape in each frame in each layer to `csvContent`, which is returned after all information is pushed to the array.

#### `generateZipDownload(imageArray, csv)`
- Creates a new `JSZip` object.
- Adds a new folder to the `.zip` file named `canvas_images`, and adds every image in `imageArray` as a `.png` to that folder.
- Adds the `csv` as `shape_date.csv` to the `.zip` file.
- Generates the `zipData`, attaches it to a download link, and clicks the link.

#### `changeFrame(newFrame)`
Sets the global `frameIdx` to `newFrame`, updates the `frameSlider` and `frameLabel` values, and executes `drawReqeustedFrame()`.

#### `switchToSelect()`
Changes the `currentTool` variable to `0`, checks the first tool in the tool radio, and changes the cursor to default.

#### `switchToDraw()`
Changes the `currentTool` variable to `1`, checks the second tool in the tool radio, and changes the cursor to crosshairs.

#### `createImage(file)`
Gets the image as binary data, converts that data to a `Blob`, and then creates an Image object from that `Blob`. Returns a promise that resolves with the `Image` object once it's loaded.

### Google Drive API code & variables
#### Authorization scopes, API key, IDs, and global variables
- `SCOPES`: Defines the permissions scope that the Google Drive API can access. The scope defined for TRAX is `drive.readonly`. [See here for more on Google Drive API permissions.](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- The `CLIENT_ID`, `API_KEY`, AND `APP_ID` define the website's access to the Google Drive API.
- Defines an `accessToken` so that the user doesn't have to sign in again until the token expires.
- Disables the upload and sign out buttons until the API elements are loaded.

#### Load Google API client, GIS, Picker, and create picker
- `gapiLoaded()` loads the Google Drive API and initializes the Google Drive Picker.
- `gisLoaded()` loads the Google Identity Services (GIS, sign-in window)
- `maybeEnableButtons()` enables the upload/sign-out buttons when Google Drive API and GIS are loaded
- `handleAuthClick()` changes the "Sign In" button to "Upload" once the user signs in, and executes `createPicker()` once the user signs in.
- `createPicker()` creates the views shown in the Google Drive Picker and sets the callback for the picker. [See here for more on the Google Drive Picker API.](https://developers.google.com/workspace/drive/picker/guides/overview#manage-picker)
- `initalizePicker()` loads the picker.
- `pickerCallback()` defines the action once the user selects the image(s) from the picker. It extracts and sorts the images and puts the image files and filenames into arrays. It then pushes the filenames to `layerFilenameArrays`, and either executes `initCanvasFunctionality()` if this is the first time the user is uploading images, or adds a layer to the background class (if possible; if the background class returns an error for wrong number of images, the picker is reinitialized).