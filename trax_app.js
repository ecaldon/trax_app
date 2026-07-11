/** @file TRAX: Web app to perform meteorological analysis through the drawing of contours */
/**
* @copyright
* Copyright 2026 Ezekiel Caldon
*/

/**
 * See docs/ARCHITECTURE.md for design overview and rationale. This
 * file's doc comments describe individual class/method
 * behavior. You can run `jsdoc` to generate a browsable reference.
 * This documentation is available {@link|https://ecaldon.github.io/trax_app/docs/api/|here.}
 */

/**
* @license
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
* 
* http://www.apache.org/licenses/LICENSE-2.0
* 
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/* Actual website code starts here */

/* Global variables */

/**
 * Index of the frame currently being displayed.
 * @type {number} @global
 */
let frameIdx = 0;
/**
 * Total number of frames loaded into the app.
 * @type {number} @global
 */
let numFrames = 0;
/**
 * Index of the map layer currently being displayed.
 * @type {number} @global
 */
let layerIdx = 0;
/**
 * Total number of layers loaded into the app.
 * @type {number} @global
 */
let numLayers = 0;
/**
 * Scale factor each background image was drawn at, relative to its native size. Recorded in exported CSV metadata so coordinates can be mapped back to original image pixels.
 * @type {number} @global
 */
let scale = [];
/**
 * Array of arrays of image filenames, one inner array per layer, used to label exported CSV rows.
 * @type {string[][]} @global
 */
const layerFilenameArrays = [];
/**
 * The background-canvas controller for this session.
 * @type {BckdCanvasClass} @global
 */
let bckdClass;
/**
 * The drawing-canvas controller for this session.
 * @type {DrawCanvasClass} @global
 */
let drawClass;
/**
 * The drawing tool currently selected: 0 = select, 1 = pen, 2 = pan.
 * @type {number} @global
 */
let currentTool = 1;
/**
 * Whether the currently selected shape is showing transparent "provisional" midpoint markers for point insertion.
 * @type {boolean} @global
 */
let editingPoints = false;

/* Global constants */

/**
 * Side length, in px, of the selection/provisional-point handle squares drawn on the canvas. 
 * @type {number} @global @constant 
 * @default 9px
 */
const mySelBoxSize = 9;
/**
 * Half of {@link mySelBoxSize}; used to center handle squares on their point coordinate.
 * @type {number} @global @constant
 */
const half = mySelBoxSize / 2;

/* HTML Objects */
/* This section declares the HTML elements used within the JS so their state can be read/modified and user actions responded to. */

/* Top controls */
/* Top left panel */
const undo = document.querySelector("#undo");
const redo = document.querySelector("#redo");
const download = document.querySelector("#download");
/* Frame label */
const frameLabel = document.querySelector("#frameNum");
/* Layer picker */
const layerPicker = document.querySelector("#layerPicker");

/* Canvas objects */
/**
 * The canvas the user sees is actually two stacked canvases: bckdCanvas
 * (the background map/radar imagery) and drawCanvas (user-drawn shapes).
 * Both live inside the canvasContainer div. See {@link
 * https://www.w3schools.com/graphics/canvas_drawing.asp|more info about the Canvas API}
 */
const canvasContainer = document.querySelector("#canvasContainer");
const bckdCanvas = document.querySelector("#bckdCanvas");
const bckdCtx = bckdCanvas.getContext('2d');
const drawCanvas = document.querySelector("#drawCanvas");
const drawCtx = drawCanvas.getContext('2d');

/* Draw controls */
const toolRadios = document.querySelectorAll('input[name="toolSelect"]');
/* Set current tool and cursor based on tool radios */
for(var i = 0, max = toolRadios.length; i < max; i++) {
    toolRadios[i].onclick = function() {
      currentTool = Number(this.value); // Set current tool to the value of the radio button
      // Set cursor style based on current tool
      if (currentTool === 1) {
        drawClass.selection = null; // Deselect any selected shape when switching to pen tool
        canvasContainer.style.cursor = "crosshair";
      } else if (currentTool === 2) {
        canvasContainer.style.cursor = "grab";
      } else {
        canvasContainer.style.cursor = "default";
      }
    }
}

/* Bottom controls */
/* Overlay last */
const overlayLast = document.querySelector("#overlayLast");
/* Frame navigation */
const bck = document.querySelector("#backOne");
const frameSlider = document.querySelector("#frameSlider");
const fwd = document.querySelector("#fwdOne");
/* Contour control */
const colorPicker = document.querySelector("#contourColor");
const contourLabel = document.querySelector("#contourLabel");
const pauseButton = document.querySelector("#endContour");
const deleteButton = document.querySelector("#deleteContour");

/* Command pattern classes */

/**
 * Interface for any user action on the canvas that should support
 * undo/redo. Any new action ("concrete command") must extend this class
 * and implement {@link Command#execute|Command.execute()} and {@link Command#undo|Command.undo()}.
 * 
 * Note that {@link Command#execute|execute()} doubles as the redo path — there is no separate
 * redo method. The app state at original-execution time may not match
 * the state at redo time (e.g. the user has since changed frames), so
 * {@link Command#execute|execute()} implementations must restore relevant context (frame,
 * selection) themselves rather than assume it.
 * @abstract
 */
class Command {
  /** Executes (or redoes) the command. Must be implemented by subclasses. */
  execute() {
    throw new Error('execute() method must be implemented');
  }

  /** Undoes the command. Must be implemented by subclasses. */
  undo() {
    throw new Error('undo() method must be implemented');
  }
}

/**
 * Bundles a sequence of {@link Commands} so they execute/undo as a single
 * unit. Used for actions that are one fluid user gesture (e.g. dragging a
 * shape) but internally register as multiple commands, so they undo
 * together rather than one-by-one. 
 * @see {@link HistoryManager#beginCommandGroup|HistoryManager.beginCommandGroup()}
 */
class CommandGroup {
  constructor() {
    /**
     * Commands belonging to this group, in execution order.
     * @type {Command[]}
     */
    this.commands = [];
  }

  /**
   * Adds a command to this group.
   * @param {Command} command
   */
  addCommand(command) {
    this.commands.push(command);
  }

  /** Executes every command in the group, in order. */
  execute() {
    this.commands.forEach(command => command.execute());
  }

  /** Undoes every command in the group, in reverse order. */
  undo() {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) { 
      this.commands[i].undo();
    }
  }
}

/**
 * Stores the history of executed {@link Command}/{@link CommandGroup}
 * objects for undo/redo, and manages grouping consecutive commands that
 * belong to one user gesture.
 */
class HistoryManager {
  constructor() {
    /**
     * Commands executed, oldest first.
     * @type {Array<Command|CommandGroup>}
     */
    this.history = [];
    /**
     * Stack that keeps undone commands, ready to redo.
     * @type {Array<Command|CommandGroup>}
     */
    this.redoStack = [];
    /**
     * Maximum number of history entries kept before the oldest is dropped.
     * @type {number} @constant
     * @default 100
     */
    this.maxHistorySize = 100; /* TODO: See what the greatest size without crashing the program could be */
    /**
     * Whether commands are currently being collected into {@link HistoryManager#currentCommandGroup|HistoryManager.currentCommandGroup} instead of pushed to history individually.
     * @type {boolean}
     */
    this.groupingActive = false;
    /**
     * The command group currently being built, if grouping is active.
     * @type {CommandGroup|null}
     */
    this.currentCommandGroup = null;
  }

  /**
   * Executes a command immediately. If a command group is active, the
   * command is added to that group instead of being pushed to history on
   * its own; otherwise it's pushed to {@link HistoryManager#history|HistoryManager.history} directly and the redo stack is cleared.
   * @param {Command} command Command to be executed
   */
  executeCommand(command) {
    command.execute();

    if (this.groupingActive && this.currentCommandGroup) {
      this.currentCommandGroup.addCommand(command);
    } else {
      // Clear redo stack when a new command is executed
      this.redoStack = [];

      // Add to history, maintaining max size
      this.history.push(command);

      if (this.history.length > this.maxHistorySize) {
        this.history.shift(); // Remove oldest command
      }
    }
    if (undo.disabled) {
      undo.disabled = false;
    }
  }

  /**
   * Begins collecting subsequent {@link HistoryManager#executeCommand|HistoryManager.executeCommand}
   * calls into a single {@link CommandGroup} rather than separate history
   * entries. Call when a continuous user gesture (drag, multi-step
   * action) begins, and then ends with {@link HistoryManager#endCommandGroup|HistoryManager.endCommandGroup}.
   */
  beginCommandGroup() { /* TODO: Abstract command group into beginning and end points for drag actions */
    this.groupingActive = true;
    this.currentCommandGroup = new CommandGroup();
  }

  /**
   * Ends the current command group (started via
   * {@link HistoryManager#beginCommandGroup|HistoryManager.beginCommandGroup}) and pushes it to history as
   * a single undoable unit, if it contains at least one command.
   */
  endCommandGroup() {
    if (this.groupingActive && this.currentCommandGroup) {
      if (this.currentCommandGroup.commands.length > 0) {
        this.redoStack = [];
        this.history.push(this.currentCommandGroup);
        if (this.history.length > this.maxHistorySize) {
          this.history.shift();
        }
      }
      this.groupingActive = false;
      this.currentCommandGroup = null;
    }
  }

  /** Undoes the most recent command/group in history, moving it to the redo stack and redraws the current frame. */
  undo() {
    if (this.history.length > 0) {
      const command = this.history.pop();
      command.undo();
      drawClass.draw(frameIdx);
      this.redoStack.push(command);
    }
    if (redo.disabled) {
      redo.disabled = false;
    }
    if (this.history.length == 0) {
      undo.disabled = true;
    }
    console.log("History ", this.history);
    console.log("Redo stack ", this.redoStack);
  }

  /** Re-executes the most recently undone command/group, moving it back to history and redraws the current frame. */
  redo() {
    if (this.redoStack.length > 0) {
      const command = this.redoStack.pop();
      command.execute();
      drawClass.draw(frameIdx);
      this.history.push(command);
    }
    if (undo.disabled) {
      undo.disabled = false;
    }
    if (this.redoStack.length == 0) {
      redo.disabled = true;
    }
    console.log("History ", this.history);
    console.log("Redo stack ", this.redoStack);
  }
}

/* Canvas classes */

/**
 * Controls the background canvas, which renders the map/radar imagery
 * for the current layer and frame. It lies underneath the {@link DrawCanvasClass}.
 */
class BckdCanvasClass {
  /**
   * @param {HTMLImageElement[]} images - Frame images for the first layer, in frame order.
   * @param {string} first_filename - Filename of the first image, shown in the layer picker.
   */
  constructor(images, first_filename) {
    /**
     * Array of per-layer image arrays.
     * @type {HTMLImageElement[][]}
     */
    this.layers = [];
    this.layers.push(images);
    numFrames = images.length;
    frameSlider.max = numFrames - 1;
    frameSlider.value = frameIdx;
    var opt = document.createElement('option');
    opt.value = numLayers;
    opt.innerHTML = first_filename;
    layerPicker.appendChild(opt);
  }

  /**
   * Adds a new layer of images. All layers must share the same frame count.
   * @param {HTMLImageElement[]} images
   * @param {string} first_filename
   * @throws {Error} If `images.length` doesn't match the existing frame count.
   */
  addLayer(images, first_filename) {
    if (images.length != numFrames) {
      window.alert("New layer must have same number of frames as existing layers");
      throw new Error("New layer must have same number of frames as existing layers");
    }
    this.layers.push(images);
    var opt = document.createElement('option');
    opt.value = numLayers++;
    opt.innerHTML = first_filename;
    layerPicker.appendChild(opt);
    this.draw(numLayers-1, frameIdx);
    layerPicker.selectedIndex = numLayers-1;
    layerIdx = numLayers-1;
  }

  /** Clears the background canvas. */
  clear() {
    bckdCtx.clearRect(0, 0, bckdCanvas.width, bckdCanvas.height);
  }

  /**
   * Draws the image for the given layer/frame, scaling it down to fit
   * within canvasContainer if it's larger than the canvas in either
   * dimension. Updates the global {@link scale} factor used in CSV export.
   * @param {number} layer - Number of the {@link layerIdx | layer} to be drawn
   * @param {number} frame - Number of the {@link frameIdx | frame} to be drawn
   */
  draw(layer, frame) {
    this.clear();
    const curImg = this.layers[layer][frame];
    if (curImg.height > bckdCanvas.height && curImg.width > bckdCanvas.width) {
      scale = Math.min(bckdCanvas.width / curImg.width, bckdCanvas.height / curImg.height);
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else if (curImg.height > bckdCanvas.height) {
      scale = bckdCanvas.height / curImg.height;
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else if (curImg.width > bckdCanvas.width) {
      scale = bckdCanvas.width / curImg.width;
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else {
      scale = 1;
      bckdCtx.drawImage(curImg,0,0);
    }
  }
}

/**
 * Controls the drawing canvas: shape storage, selection, mouse/touch
 * event handling, and dispatching user actions as {@link Command}s for
 * undo/redo. This is the heart of the app's interactivity.
 *
 * Properties prefixed `this._` are intended to be read/written from
 * outside the class via the `get`/`set` accessors below; unprefixed
 * properties are for internal use within the class only.
 */
class DrawCanvasClass {
  constructor() {
    // Mouse offset variables — used by getPos() to translate page-relative
    // mouse coordinates into canvas-relative coordinates.
    this.styleBorderTop = 0;
    this.styleBorderLeft = 0;
    if (window.getComputedStyle) {
      this.styleBorderTop = parseInt(getComputedStyle(drawCanvas, null).getPropertyValue('border-top-width'));
      this.styleBorderLeft = parseInt(getComputedStyle(drawCanvas, null).getPropertyValue('border-left-width')); /* TODO: Save scale factor */
    }
    var html = document.body.parentNode;
    this.htmlTop = html.offsetTop;
    this.htmlLeft = html.offsetLeft;

    // Shape objects
    /**
     * All shapes currently in this session.
     * @type {Shape[]}
     */
    this._shapes = [];
    /**
     * The currently selected shape, or null if none.
     * @type {Shape|null}
     */
    this._selection = null;

    // State tracking
    /**
     * Info about an in-progress drag, or null if the user isn't dragging.
     * 
     * The parameter `mode: 'body'` is in effect when the user is dragging the whole shape.
     * 
     * The parameter `mode: 'point'` is in effect when the user is dragging a single selection handle.
     * @type {{mode: 'body'|'point', startMouse: {x: number, y: number}, startPoints: Array<{x: number, y: number}>}|null}
     */
    this.dragState = null;
    /**
     * Index of the selection handle the cursor is hovering over, -1 if none.
     * @type {number}
     */
    this.expectResize = -1;
    /**
     * Index of the selected shape's provisional points that the cursor is hovering over, or -1 if none.
     * @type {number}
     */
    this.expectInsert = -1;

    // History manager
    /** @type {HistoryManager} */
    this._historyManager = new HistoryManager();
  }

  get selection() {
    return this._selection;
  }

  set selection(val) {
    this._selection = val;
  }

  get shapes() {
    return this._shapes;
  }

  /** Clears the drawing canvas. */
  clear() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

  /**
   * Redraws all shapes for the given frame. If "overlay last" is
   * checked, also draws the previous frame's shapes at 50% opacity as a
   * reference ghost.
   * @param {number} frame
   */
  draw(frame) {
    this.clear();

    // draw all shapes
    var l = this._shapes.length;
    for (var i = 0; i < l; i++) {
      drawCtx.globalAlpha = 1.0;
      this._shapes[i].draw(drawCtx, frame);
    }

    if (overlayLast.checked) {
      if (frameIdx > 0) {
        drawCtx.globalAlpha = 0.5;
        var l = this._shapes.length;
        for (var i = 0; i < l; i++) {
          this._shapes[i].draw(drawCtx, frame - 1);
        }
      }
    }
  }

  /**
   * Translates a mouse/touch event's page coordinates into coordinates
   * relative to the drawing canvas's top-left corner.
   * @param {MouseEvent|Touch} e
   * @returns {{x: number, y: number}}
   */
  getPos(e) {
    var element = drawCanvas, offsetX = 0, offsetY = 0, mx, my;

    if (element.offsetParent !== undefined) {
      do {
        offsetX += element.offsetLeft;
        offsetY += element.offsetTop;
      } while ((element = element.offsetParent));
    }

    // Add padding and border style widths to offset
    offsetX += this.styleBorderLeft + this.htmlLeft;
    offsetY += this.styleBorderTop + this.htmlTop;

    mx = e.pageX - offsetX;
    my = e.pageY - offsetY;

    return {x: mx, y: my};
  }

  /**
   * Handles mousedown/touchstart on the canvas. Behavior depends on
   * {@link currentTool}:
   * - Select tool (0): begins a point-drag or shape-drag if the cursor is
   *   over a handle/shape, inserts a point if hovering a provisional
   *   marker, or selects/deselects a shape under the cursor.
   * - Pen tool (1): starts a new shape if none is selected, otherwise
   *   adds a point to the selected shape (closing it if clicking near its
   *   first point).
   * @param {MouseEvent|Touch} e
   */
  doDown(e) {
    var pos = this.getPos(e);
    var mx = pos.x;
    var my = pos.y;
    if (currentTool === 0) {
      if (this.expectResize !== -1) {
        let selPoints = this._selection.getPoints(frameIdx);
        this.dragState = {
          mode: 'point',
          startPoints: selPoints.map(p => ({x: p.x, y: p.y}))
        };
        this._historyManager.beginCommandGroup();
        canvasContainer.style.cursor = 'grabbing';
        return;
      }

      if (this.expectInsert !== -1) {
        this._historyManager.executeCommand(new InsertPointCommand(this._selection, this.expectInsert));
        this.draw(frameIdx);
        return;
      }
    
      // run through all the objects
      var l = this.shapes.length;
      for (var i = l-1; i >= 0; i--) {
        // if the mouse pixel exists, select and break
        let selPoints = this.shapes[i].getPoints(frameIdx);
        if (this.shapes[i].hitTest(mx, my) > 0) {
          this.deSelect();
          this._selection = this.shapes[i];
          colorPicker.disabled = false;
          colorPicker.value = this._selection.color;
          contourLabel.disabled = false;
          contourLabel.placeholder = "";
          contourLabel.value = this._selection.label;
          pauseButton.disabled = false;
          deleteButton.disabled = false;
          this.dragState = {
            mode: 'body',
            startMouse: {x: mx, y: my},
            startPoints: selPoints.map(p => ({x: p.x, y: p.y}))
          };
          this._historyManager.beginCommandGroup();
          this.draw(frameIdx);
          return;
        }
      }
      
      // havent returned means we have selected nothing
      this.deSelect();
      // Draw again because we might need the selection boxes to disappear
      this.draw(frameIdx);
    } else if (currentTool === 1) {
      if (this._selection == null) {
        const command = new CreateShapeCommand(this, mx, my);
        this._historyManager.executeCommand(command);
      } else {
        let selPoints = this._selection.getPoints(frameIdx);
        // If the user clicks near the starting point, close the shape and return to select mode
        if (mx > (selPoints[0].x - 5) && mx < (selPoints[0].x + 5) && my > (selPoints[0].y - 5) && my < (selPoints[0].y + 5)) {
          this._historyManager.beginCommandGroup();
          this._historyManager.executeCommand(new AddPointCommand(this._selection, selPoints[0].x, selPoints[0].y));
          this._historyManager.executeCommand(new CloseShapeCommand(this._selection));
          this._historyManager.endCommandGroup();
        } else {
          this._historyManager.executeCommand(new AddPointCommand(this._selection, mx, my));
        }
      }
      this.draw(frameIdx);
    }
  }

  /**
   * Handles mousemove/touchmove on the canvas. If a drag is in progress,
   * calls the corresponding drag command. Otherwise, with the
   * select tool active and a shape selected, updates
   * {@link DrawCanvasClass#expectResize|DrawCanvasClass.expectResize}/
   * {@link DrawCanvasClass#expectInsert|DrawCanvasClass.expectInsert}
   * and the cursor style based on what the cursor is currently hovering
   * (a selection handle, a provisional point, the shape body, or nothing).
   * @param {MouseEvent|Touch} e
   */
  doMove(e) {
    var mouse = this.getPos(e);
    // If we're dragging a shape, move it by the amount the mouse has moved since the mouse originally clicked
    if (this.dragState && this.dragState.mode === 'body' && this._selection) {
      this._historyManager.executeCommand(new DragShapeCommand(this._selection, this.dragState, mouse));
      this.draw(frameIdx);
    // If we're dragging the point of a shape, move just that point to the mouse location
    } else if (this.dragState && this.dragState.mode === 'point' && this._selection) {
      this._historyManager.executeCommand(new DragPointCommand(this._selection, this.expectResize, this.dragState, mouse))
      this.draw(frameIdx);
    }
    
    if (this._selection !== null && (!this.dragState) && currentTool === 0) {
      let selPoints = this._selection.getPoints(frameIdx);
      let provPoints = this._selection.provisionalPoints;
      for (var i = 0; i < selPoints.length; i++) {
        var cur = selPoints[i];
        if ((mouse.x >= (cur.x - half)) && (mouse.x <= (cur.x + half)) && 
            (mouse.y >= (cur.y - half)) && (mouse.y <= (cur.y + half))) {
          // we found one!
          this.expectResize = i;
          this.expectInsert = -1;
          canvasContainer.style.cursor = 'pointer';
          return;
        }
      }

      for (var i = 0; i < provPoints.length; i++) {
        var cur = provPoints[i];
        if ((mouse.x >= (cur.x - half)) && (mouse.x <= (cur.x + half)) && 
            (mouse.y >= (cur.y - half)) && (mouse.y <= (cur.y + half))) {
          // we found one!
          this.expectResize = -1;
          this.expectInsert = i;
          canvasContainer.style.cursor = 'pointer';
          return;
        }
      }

      if (this._selection.hitTest(mouse.x, mouse.y) > 0) {
        this.expectResize = -1;
        this.expectInsert = -1;
        canvasContainer.style.cursor = 'all-scroll';
        return;
      }

      // not over a selection box, return to normal
      this.dragState = null;
      this.expectResize = -1;
      this.expectInsert = -1;

      for (var i = 0; i < this.shapes.length; i++) {
        if (this.shapes[i].hitTest(mouse.x, mouse.y) > 0) {
          canvasContainer.style.cursor = 'pointer';
          return;
        }
      }

      canvasContainer.style.cursor='default';
    }
  }

  /**
   * Handles mouseup/touchend on the canvas: ends any in-progress drag
   * and command group.
   * @param {MouseEvent|Touch} e
   */
  doUp(e) {
    this.dragState = null;
    this.expectResize = -1;
    if (canvasContainer.style.cursor === 'grabbing') { /* TODO: Cursor may be incorrect */
      canvasContainer.style.cursor = 'grab';
    }
    if (this._historyManager.groupingActive) {
      this._historyManager.endCommandGroup();
    }
  }

  /**
   * Handles double-click on the canvas. If the select tool is active and
   * the double-click lands on the selected shape, shows transparent
   * provisional midpoint markers (via {@link Shape#setUpProvisionalPoints|Shape.setUpProvisionalPoints()})
   * so the user can click one to insert a new point there.
   * @param {MouseEvent} e
   */
  doDoubleClick(e) {
    var pos = this.getPos(e);
    var mx = pos.x;
    var my = pos.y;
    if (currentTool === 0) {
      if (this._selection.hitTest(mx, my) > 0) {
        this._selection.setUpProvisionalPoints();
        this.draw(frameIdx);
      }
    }
  }

  /**
   * Adds a shape to the {@link DrawCanvasClass}.
   * @param {Shape} shape
   */
  addShape(shape) {
    this.shapes.push(shape);
  }

  /** Removes the currently selected shape from the session, if any, and deselects. */
  removeSelectedShape() {
    if (this._selection) {
      const index = this.shapes.indexOf(this._selection);
      if (index > -1) {
        this.shapes.splice(index, 1);
        this.deSelect();
      }
    }
  }

  /**
   * Clears the current selection and resets the contour-editor UI
   * (color picker, label field, pause/delete buttons) to their
   * no-selection state. Deactivates any provisional points on the
   * previously selected shape.
   */
  deSelect() {
    if (this._selection) {
      this._selection.deactivateProvisionalPoints();
    }
    this._selection = null;
    
    colorPicker.value = "#ff0000";
    colorPicker.disabled = true;
    contourLabel.disabled = true;
    contourLabel.placeholder = "";
    contourLabel.value = "No contour selected";
    pauseButton.disabled = true;
    deleteButton.disabled = true;
    this.draw(frameIdx);
  }

  /**
   * Applies a color change to the selected shape via a
   * {@link ColorChangeCommand}, if a shape is selected.
   * @param {Event} e - Change event from the color picker input.
   */
  changeSelectedShapeColor(e) {
    if (this._selection) {
      this._historyManager.executeCommand(new ColorChangeCommand(this._selection, e.target.value));
    }
    this.draw(frameIdx);
  }

  /**
   * Applies a label change to the selected shape via a
   * {@link LabelChangeCommand}, if a shape is selected.
   * @param {Event} event - Change event from the label input.
   */
  changeSelectedShapeLabel(event) {
    if (this._selection) {
      this._historyManager.executeCommand(new LabelChangeCommand(this._selection, event.target.value));
    }
  }

  /** Pauses the selected shape (via {@link FramePauseCommand}), if any. */
  pauseSelectedShape() {
    if (this._selection) {
      this._historyManager.executeCommand(new FramePauseCommand(this._selection));
    } /* TODO: Redraw the canvas? */
  }

  /** Deletes the selected shape (via {@link ContourDeleteCommand}), if any. */
  deleteSelectedShape() {
    if (this.selection) {
      this._historyManager.executeCommand(new ContourDeleteCommand(this, this._selection));
    }
    this.draw(frameIdx);
  }

  /**
   * Returns the largest number of points any single shape has on any
   * single frame, across all shapes. Used to size the coordinate columns
   * of the exported CSV header.
   * @returns {number}
   */
  getMaxNumPoints() {
    let max = 0;
    for (var i = 0; i < this.shapes.length; i++) {
      for (var j = 0; j < numFrames; j++) {
        if (this.shapes[i].frames[j]) {
          if (this.shapes[i].frames[j].length > max) {
            max = this.shapes[i].frames[j].length
          }
        }
      }
    }
    return max;
  }
}

/* Shape class */

/**
 * A single user-drawn annotation (contour). A shape's points are stored
 * *per frame*, not as one static geometry — features move/change across
 * frames. The `_modified` flag per frame ensures edits on one frame don't
 * silently overwrite frames the user hasn't touched, while unmodified
 * future frames continue to inherit changes forward (see
 * {@link DragShapeCommand}/{@link DragPointCommand}).
 */
class Shape {
  /**
   * @param {Array<{x: number, y: number}>} first_point - Initial point(s) the shape starts with.
   * @param {boolean} closed - Whether the shape is a closed polygon (true) or open contour (false).
   * @param {string} color - CSS color string for the shape's stroke.
   * @param {string} label - User's label for the shape.
   */
  constructor(first_point, closed, color, label) {
    this._closed = closed;
    this._color = color;
    this._label = label;
    /**
     * Map of frame index -> array of points on that frame.
     * @type {Object<number, Array<{x: number, y: number}>>}
     */
    this._frames = {};
    /**
     * Map of frame index -> whether the shape was explicitly modified on that frame.
     * @type {Object<number, boolean>}
     */
    this._modified = {};
    /**
     * Transparent midpoint markers shown when editing points; see {@link Shape#setUpProvisionalPoints|Shape.setUpProvisionalPoints}.
     * @type {Array<{x: number, y: number}>}
     */
    this._provisionalPoints = [];
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i] = first_point.map(p => ({x: p.x, y: p.y}));
    }
  }

  get closed() {
    return this._closed;
  }
  set closed(val) {
    this._closed = val;
  }

  get color() {
    return this._color;
  }
  set color(val) {
    this._color = val;
  }

  get label() {
    return this._label;
  }
  set label(val) {
    this._label = val;
  }

  get frames() {
    return this._frames;
  }

  get provisionalPoints() {
    return this._provisionalPoints;
  }

  /**
   * Adds a point to the shape on the current and all future frames.
   * @param {number} x - x coordinate with 0 being the left edge of the canvas
   * @param {number} y - y coordinate with 0 being the top edge of the canvas
   */
  addPoint(x, y) {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].push({x: x, y: y});
    }
  }

  /**
   * Inserts a point — taken from the cached provisional point at
   * `insIdx` — immediately after index `insIdx` in the shape's point
   * array, on the current and all future frames.
   * 
   * @param {number} insIdx - Index of the provisional point to insert, and the shape-point index after which it's inserted.
   */
  insertPoint(insIdx) {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].splice(insIdx+1, 0, this._provisionalPoints[insIdx]);
    }
  }

  /**
   * Whether the shape was explicitly modified on the given `frame`.
   * @param {number} frame
   * @returns {boolean} 
   */
  getModified(frame) {
    return this._modified[frame];
  }

  /**
   * Deletes the point at `idx` from the current and all future frames.
   * @param {number} idx - Index of the point in the shape as it is in the current frame.
   */
  deletePoint(idx) {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].splice(idx, 1);
    }
  }

  /** Deletes the last point of the shape from the current and all future frames. */
  deleteLastPoint() {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].pop();
    }
  }

  /**
   * The shape's points on the given frame.
   * @param {number} frame
   * @returns {Array<{x: number, y: number}>|undefined} 
   */
  getPoints(frame) {
    return this._frames[frame];
  }

  /**
   * Sets whether the shape was explicitly modified on the given frame.
   * @param {number} frame - Frame where the modified condition is being set
   * @param {boolean} condition – Boolean modified condition to be set (true or false)
   */
  setModified(frame, condition) {
    this._modified[frame] = condition;
  }

  /**
   * Computes transparent midpoint markers ("provisional points") for
   * each segment of the shape on the current frame that's longer than
   * 18px, so the user has a clickable target to insert a new point into
   * that segment. Skips if provisional points are already active
   * (`editingPoints` is true) — call {@link Shape#resetProvisionalPoints|Shape.resetProvisionalPoints()}
   * to force a recompute instead.
   */
  setUpProvisionalPoints() {
    if (!editingPoints) {
      var lengthSubtract;
      editingPoints = true;
      if (!this._closed) {
        lengthSubtract = 1;
      } else {
        lengthSubtract = 0;
      }
      for (var i = 0; i < this._frames[frameIdx].length-lengthSubtract; i++) {
        var p1 = this._frames[frameIdx][i];
        var p2 = this._frames[frameIdx][(i+1)%(this._frames[frameIdx].length)];
        if (Math.sqrt((p2.x-p1.x)**2 + (p2.y-p1.y)**2) > 18) {
          this._provisionalPoints.push({x:((p1.x + p2.x) / 2), y:((p1.y + p2.y) / 2)});
        }
      }
    }
  }

  /** Clears provisional points and exits point-editing mode. */
  deactivateProvisionalPoints() {
    this._provisionalPoints = [];
    editingPoints = false;
  }

  /**
   * Fully recomputes provisional points from the shape's current point
   * layout. This should be called after any change to the shape's points (insert,
   * delete, drag) so the provisional points are always current.
   */
  resetProvisionalPoints() {
    this.deactivateProvisionalPoints();
    this.setUpProvisionalPoints();
  }

  /**
   * Draws the shape's outline for `frameIndex` onto `ctx`, plus
   * selection handles and/or provisional point markers if this shape is
   * selected. Does nothing if the shape doesn't exist (is paused) on
   * `frameIndex`.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} frameIndex
   */
  draw(ctx, frameIndex) {

    if (this._frames[frameIndex] === undefined || this._frames[frameIndex] === null) return; // If this shape doesn't exist in the current frame, don't draw it
    ctx.strokeStyle = this._color;
    ctx.lineWidth = 4;
    
    ctx.beginPath();
    ctx.moveTo(this._frames[frameIndex][0].x, this._frames[frameIndex][0].y);
    for (var i = 1; i < this._frames[frameIndex].length; i++) {
      ctx.lineTo(this._frames[frameIndex][i].x, this._frames[frameIndex][i].y);
    }
    if (this._closed) ctx.closePath();
    ctx.stroke();

    // console.log(drawClass.selection, this)

    if (drawClass.selection === this && editingPoints === true) {
      ctx.globalAlpha = 0.5
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      for (var i = 0; i < this._provisionalPoints.length; i++) {
        var p = this._provisionalPoints[i];
        ctx.fillRect(p.x - half, p.y - half, mySelBoxSize, mySelBoxSize);
        ctx.strokeRect(p.x - half, p.y - half, mySelBoxSize, mySelBoxSize);
      }
      ctx.globalAlpha = 1;
    }

    if (drawClass.selection === this && frameIndex === frameIdx) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      // draw selection boxes
      for (var i = 0; i < this._frames[frameIndex].length; i++) {
        var p = this._frames[frameIndex][i];
        ctx.fillRect(p.x - half, p.y - half, mySelBoxSize, mySelBoxSize);
        ctx.strokeRect(p.x - half, p.y - half, mySelBoxSize, mySelBoxSize);
      }
    }
  }

  /**
   * Computes the shortest distance from the mouse cursor position (px, py) to the line
   * segment from a to b.
   * @param {number} px - Mouse cursor x
   * @param {number} py - Mouse cursor y
   * @param {{x: number, y: number}} a - First point of line segment
   * @param {{x: number, y: number}} b - Second point of line segment
   * @returns {number}
   */
  distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x)*dx + (py - a.y)*dy) / (dx*dx + dy*dy)));
    return Math.hypot(px - (a.x + t*dx), py - (a.y + t*dy));
  }

  /**
   * Tests whether (mx, my) is within `tolerance` px of any segment of
   * the shape on the current frame.
   * @param {number} mx - Mouse cursor x
   * @param {number} my - Mouse cursor y
   * @param {number} [tolerance=6] - Tolerance of hit test in px
   * @returns {boolean}
   */
  hitTest(mx, my, tolerance = 6) {
    const pts = this._frames[frameIdx];
    if (!pts) return false;
    if (pts.length < 2) return false;

    // number of segments depends on whether the shape is closed
    const segCount = this.closed ? pts.length : pts.length - 1;

    for (let i = 0; i < segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length]; // % wraps the last point back to first when closed
      if (this.distToSegment(mx, my, a, b) < tolerance) return true;
    }
    return false;
  }

  /**
   * Pauses the shape: sets its points to null on the current and all
   * future frames (so it stops being drawn/exported on those frames),
   * deselects it, and redraws.
   */
  pause() {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i] = null;
    }
    drawClass.deSelect();
    drawClass.draw(frameIdx);
  }

  /**
   * Reverses {@link Shape#pause|Shape.pause()} by restoring the shape's per-frame
   * points and re-selecting it.
   * @param {Object<number, Array<{x: number, y: number}>>} startPoints - Per-frame points to restore, as captured before pausing.
   */
  unpause(startPoints) { /* TODO: Unpause button, rather than just undo/redo */
    this._frames = startPoints;
    drawClass._selection = this;
    drawClass.draw(frameIdx);
  }
}

/** 
 * @namespace Concrete Commands 
 *
 * @description Each concrete command extends Command and implements a constructor
 * (saving everything needed to execute/undo/redo), execute() (which also
 * serves as redo()), and undo().
 */

/**
 * Creates a new shape with its first point at (`x`, `y`). Used when the pen
 * tool is clicked with no shape currently selected.
 * @extends Command
 * @memberof Concrete Commands
 */
class CreateShapeCommand extends Command {
  /**
   * @param {DrawCanvasClass} drawClass - drawClass object to draw the shape to
   * @param {number} x - x coordinate for the first point of the shape
   * @param {number} y - y coordinate for the first point of the shape
   */
  constructor(drawClass, x, y) {
    super();
    this.drawClass = drawClass;
    this.x = x;
    this.y = y;
    /**
     * Saves the shape object so redo reuses the same shape instance.
     * @type {Shape|null}
     */
    this.shape = null;
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    switchToDraw();
    if (!this.shape) {
      this.shape = new Shape([{x: this.x, y: this.y}], false, "#ff0000", "Enter a label...");
    }
    this.drawClass.addShape(this.shape);
    this.drawClass.selection = this.shape;
    colorPicker.disabled = false;
    colorPicker.value = "#ff0000";
    contourLabel.disabled = false;
    contourLabel.placeholder = "Enter a label...";
    pauseButton.disabled = false;
    deleteButton.disabled = false;
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    drawClass.deSelect();
    drawClass.selection = this.shape;
    drawClass.removeSelectedShape();
    switchToSelect();
  }
}

/**
 * Adds a point to a shape at (`x`, `y`) on the current frame (and all future
 * frames, per {@link Shape#addPoint|Shape.addPoint}).
 * @extends Command
 * @memberof Concrete Commands
 */
class AddPointCommand extends Command {
  /**
   * @param {Shape} shape - Shape object for the point to be added to
   * @param {number} x - x coordinate of the point to be added
   * @param {number} y - y coordinate of the point to be added
   */
  constructor(shape, x, y) {
    super();
    this.shape = shape;
    this.x = x;
    this.y = y;
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    switchToDraw();
    this.shape.addPoint(this.x, this.y);
    drawClass.selection.deactivateProvisionalPoints();
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    drawClass.selection.deactivateProvisionalPoints();
    this.shape.deleteLastPoint();
  }
}

/**
 * Inserts a point into a shape at a provisional-point location, then
 * resets provisional points so subsequent markers reflect the new layout.
 * @extends Command
 * @memberof Concrete Commands
 */
class InsertPointCommand extends Command {
  /**
   * @param {Shape} shape - Shape for the point to be inserted into
   * @param {number} insIdx - Index where the point will be inserted; see {@link Shape#insertPoint|Shape.insertPoint()}.
   */
  constructor(shape, insIdx) {
    super();
    this.shape = shape;
    this.insIdx = insIdx;
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.insertPoint(this.insIdx);
    this.shape.resetProvisionalPoints();
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.deletePoint(this.insIdx+1);
    this.shape.resetProvisionalPoints();
  }
}

/**
 * Closes the shape and switches to the select tool. Used
 * when the pen tool clicks near a shape's first point.
 * @extends Command
 * @memberof Concrete Commands
 */
class CloseShapeCommand extends Command {
  /** @param {Shape} shape */
  constructor(shape) {
    super();
    this.shape = shape;
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.closed = true;
    switchToSelect();
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.closed = false;
    drawClass.selection = this.shape;
    switchToDraw();
  }
}

/**
 * Drags an entire shape by the offset between the current mouse position
 * and where the drag started. Marks the current frame modified so the
 * change doesn't get silently overwritten by forward-propagation from an
 * earlier unmodified frame.
 * @extends Command
 * @memberof Concrete Commands
 */
class DragShapeCommand extends Command {
  /**
   * @param {Shape} shape - Shape to be dragged
   * @param {{startMouse: {x: number, y: number}, startPoints: Array<{x: number, y: number}>}} dragState - Object storing the starting mouse coordinates and shape points
   * @param {{x: number, y: number}} mouse - Current mouse position.
   */
  constructor(shape, dragState, mouse) {
    super();
    this.shape = shape;
    this.dragState = dragState;
    this.mouse = mouse;
    /**
     * Stores whether this shape has been modified
     * @type {boolean}
     */
    this.modified_before = this.shape.getModified(frameIdx);
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.setModified(frameIdx, true);
    for (var i = frameIdx; i < numFrames; i++) {
      let selPoints = this.shape.getPoints(i);
      if (!this.shape.getModified(i) || i == frameIdx) {
        for (var j = 0; j < selPoints.length; j++) {
          var p = selPoints[j];
          p.x = this.dragState.startPoints[j].x + (this.mouse.x - this.dragState.startMouse.x);
          p.y = this.dragState.startPoints[j].y + (this.mouse.y - this.dragState.startMouse.y);
        }
      }
    }
    if (this.shape.provisionalPoints.length > 0) {
      this.shape.resetProvisionalPoints();
    }
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.setModified(frameIdx, this.modified_before);
    for (var i = frameIdx; i < numFrames; i++) {
      let selPoints = this.shape.getPoints(i);
      if (!this.shape.getModified(i) || i == frameIdx) {
        for (var j = 0; j < selPoints.length; j++) {
          var p = selPoints[j];
          p.x = this.dragState.startPoints[j].x;
          p.y = this.dragState.startPoints[j].y;
        }
      }
    }
    if (this.shape.provisionalPoints.length > 0) {
      this.shape.resetProvisionalPoints();
    }
  }
}

/**
 * Drags a single point (selection handle) of a shape to the current
 * mouse position. If the dragged point is the shape's first or last
 * point, both are moved together (closed-shape seam).
 * @extends Command
 * @memberof Concrete Commands
 */
class DragPointCommand extends Command {
  /**
   * @param {Shape} shape
   * @param {number} expectResize - Index of the point being dragged.
   * @param {{startPoints: Array<{x: number, y: number}>}} dragState - Object storing the starting shape points
   * @param {{x: number, y: number}} mouse - Current mouse position.
   */
  constructor(shape, expectResize, dragState, mouse) {
    super();
    this.shape = shape;
    this.dragState = dragState;
    this.expectResize = expectResize;
    this.mouse = mouse;
    /**
     * Stores whether this shape has been modified
     * @type {boolean}
     */
    this.modified_before = this.shape.getModified();
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.setModified(frameIdx, true);
    for (var i = frameIdx; i < numFrames; i++) {
      let selPoints = this.shape.getPoints(i);
      if (!this.shape.getModified(i) || i == frameIdx) {
        if (this.expectResize == 0 || this.expectResize == selPoints.length-1) {
          selPoints[0].x = this.mouse.x;
          selPoints[selPoints.length-1].x = this.mouse.x;
          selPoints[0].y = this.mouse.y;
          selPoints[selPoints.length-1].y = this.mouse.y;
        } else {
          selPoints[this.expectResize].x = this.mouse.x;
          selPoints[this.expectResize].y = this.mouse.y;
        }
        
      }
    }
    if (this.shape.provisionalPoints.length > 0) {
      this.shape.resetProvisionalPoints();
    }
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.setModified(frameIdx, this.modified_before);
    for (var i = frameIdx; i < numFrames; i++) {
      let selPoints = this.shape.getPoints(this.frame);
      if (!this.shape.getModified(i) || i == frameIdx) {
        selPoints[this.expectResize].x = this.dragState.startPoints[this.expectResize].x;
        selPoints[this.expectResize].y = this.dragState.startPoints[this.expectResize].y;
      }
    }
    if (this.shape.provisionalPoints.length > 0) {
      this.shape.resetProvisionalPoints();
    }
  }
}

/**
 * Changes a shape's stroke color.
 * @extends Command
 * @memberof Concrete Commands
 */
class ColorChangeCommand extends Command {
  /**
   * @param {Shape} shape
   * @param {string} newColor
   */
  constructor(shape, newColor) {
    super();
    this.shape = shape;
    /**
     * The original stroke color of the shape.
     * @type {color}
     */
    this.oldColor = shape.color;
    this.newColor = newColor;
  }

  execute() {
    this.shape.color = this.newColor;
  }

  undo() {
    this.shape.color = this.oldColor;
  }
}

/**
 * Changes a shape's label, syncing the contour label input if the shape
 * is currently selected.
 * @extends Command
 * @memberof Concrete Commands
 */
class LabelChangeCommand extends Command {
  /**
   * @param {Shape} shape
   * @param {string} newLabel
   */
  constructor(shape, newLabel) {
    super();
    this.shape = shape;
    if (shape.label) {
      /**
       * The shape's label before it was changed.
       * @type {string}
       */
      this.oldLabel = shape.label;
    } else {
      this.oldLabel = "";
    }
    this.newLabel = newLabel;
  }

  execute() {
    this.shape.label = this.newLabel;
    if (drawClass.selection) {
      contourLabel.value = drawClass.selection.label;
    }
  }

  undo() {
    this.shape.label = this.oldLabel;
    if (drawClass.selection) {
      contourLabel.value = drawClass.selection.label;
    }
  }
}

/**
 * Pauses a shape on the current frame, saving a deep copy of its
 * per-frame points beforehand so undo can fully restore them.
 * @extends Command
 * @memberof Concrete Commands
 */
class FramePauseCommand extends Command {
  /** @param {Shape} shape - The shape to be paused */
  constructor(shape) {
    super();
    /**
     * The frame the shape was paused on
     * @type {number}
     */
    this.pause_frame = frameIdx;
    this.shape = shape;
    /**
     * Deep copy of the shape's per-frame points before pausing.
     * @type {Object<number, Array<{x: number, y: number}>>}
     */
    this.startPoints = Object.fromEntries(Object.entries(shape.frames).map(([key, frame]) => [key, frame.map(pt => ({ ...pt }))]));
  }

  execute() {
    if (this.pause_frame != frameIdx) {
      changeFrame(this.pause_frame);
    }
    this.shape.pause();
  }

  undo() {
    if (this.pause_frame != frameIdx) {
      changeFrame(this.pause_frame);
    }
    this.shape.unpause(Object.fromEntries(Object.entries(this.startPoints).map(([key, frame]) => [key,frame.map(pt => ({ ...pt }))])));
  }
}

/**
 * Deletes a shape entirely, restoring full contour-editor UI state on
 * undo so it's indistinguishable from never having been deleted.
 * @extends Command
 * @memberof Concrete Commands
 */
class ContourDeleteCommand extends Command {
  /**
   * @param {DrawCanvasClass} drawClass - drawClass for the contour to be deleted from
   * @param {Shape} shape - Shape to be deleted
   */
  constructor(drawClass, shape) {
    super();
    this.drawClass = drawClass;
    this.shape = shape;
    /**
     * Saves the frame the shape was created on in case it needs to be undone/redone.
     * @type {number}
     */
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    drawClass.deSelect();
    drawClass.selection = this.shape;
    drawClass.removeSelectedShape();
    switchToSelect();
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    switchToDraw();
    this.drawClass.addShape(this.shape);
    this.drawClass.selection = this.shape;
    colorPicker.disabled = false;
    colorPicker.value = this.shape.color;
    contourLabel.disabled = false;
    contourLabel.value = this.shape.label;
    pauseButton.disabled = false;
    deleteButton.disabled = false;
  }
}

/**
 * Sets up the canvases, canvas classes, and event listeners after the
 * Google Drive Picker callback (i.e. once the user has selected map
 * images for the first time in this session).
 * @param {HTMLImageElement[]} images - Images to be added to the first layer
 * @param {string} first_filename - The filename of the first image to be added. This is currently used to name the layer for the dropdown.
 */
function initCanvasFunctionality(images, first_filename) {
  bckdCanvas.width = canvasContainer.offsetWidth;
  bckdCanvas.height = canvasContainer.offsetHeight;
  drawCanvas.width = canvasContainer.offsetWidth;
  drawCanvas.height = canvasContainer.offsetHeight;

  bckdClass = new BckdCanvasClass(images, first_filename);
  drawClass = new DrawCanvasClass();

  numLayers = 1;

  drawRequestedFrame();

  // Fixes a problem where double clicking causes text selection on the canvas
  drawCanvas.addEventListener('selectstart', function(e) { e.preventDefault(); return false; }, false);
  
  drawCanvas.addEventListener('mousedown', function(e) {
    drawClass.doDown(e);
  }, true);

  drawCanvas.addEventListener('mousemove', function(e) {
    drawClass.doMove(e);
  }, true);

  drawCanvas.addEventListener('mouseup', function(e) {
    drawClass.doUp(e);
  }, true);

  drawCanvas.addEventListener('touchstart', function(e) {
    if (e.targetTouches.length > 0) drawClass.doDown(e.targetTouches[0]);
    e.preventDefault();
  }, true);
  
  drawCanvas.addEventListener('touchmove', function(e) {
    if (e.targetTouches.length > 0) drawClass.doMove(e.targetTouches[0]);
    e.preventDefault();
  }, true);

  drawCanvas.addEventListener('touchend', function(e) {
    if (e.targetTouches.length > 0) drawClass.doUp(e.targetTouches[0]);
    e.preventDefault();
  }, true);

  drawCanvas.addEventListener('dblclick', function(e) {
    drawClass.doDoubleClick(e);
  }, true);
}

/**
 * Redraws both canvases for the current global frame/layer. Called
 * whenever the frame or layer changes.
 */
async function drawRequestedFrame() {
  // console.log(canvasContainer.offsetWidth, canvasContainer.offsetHeight)
  // console.log(bckdCanvas.width, bckdCanvas.height)
  frameLabel.textContent = `Frame ${frameIdx+1}/${numFrames}`;
  bckdClass.clear();
  drawClass.clear();
  bckdClass.draw(layerIdx, frameIdx);
  drawClass.draw(frameIdx);
}

/* Event listener & function to resize canvases with window resize */
window.addEventListener('resize', () => {
  /* resizeCanvases(); Temporarily disabled, need to find way for shapes to adjust in addition to canvas */
}); 

/**
 * Resizes both canvases to fill canvasContainer and redraws.
 *
 * Currently disabled (not called) because shape coordinates don't
 * currently adjust when the canvas resizes, so shapes visually shift
 * out of place relative to the background image.
 */
function resizeCanvases() { /* TODO: Shapes get moved around when the window is resized, maybe just never allow it to resize? */
  bckdCanvas.width = canvasContainer.offsetWidth;
  bckdCanvas.height = canvasContainer.offsetHeight;
  drawCanvas.width = canvasContainer.offsetWidth;
  drawCanvas.height = canvasContainer.offsetHeight;
  drawRequestedFrame();
}

/**
 * Keyboard shortcuts (ignored while a form input is focused, or while a
 * modifier key is held): z/y undo/redo, Escape deselect, arrow
 * left/right change frame, arrow up/down change layer, s/d switch
 * select/draw tool, Enter switch to select after finishing a pen-drawn
 * shape.
 */
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.matches("input, textarea, select")) return;

  switch (event.key) {
    case "z": drawClass.historyManager.undo(); break;
    case "y": drawClass.historyManager.redo(); break;
    case "Escape": deSelect(); break;
    case "ArrowLeft": if (frameIdx != 0) changeFrame(frameIdx - 1); break;
    case "ArrowRight": if (frameIdx < numFrames - 1) changeFrame(frameIdx + 1); break;
    case "ArrowUp": 
      event.preventDefault();
      layerIdx--;
      layerPicker.selectedIndex = layerIdx;
      bckdClass.draw(layerIdx, frameIdx);
      break;
    case "ArrowDown":
      event.preventDefault();
      layerIdx++;
      layerPicker.selectedIndex = layerIdx;
      bckdClass.draw(layerIdx, frameIdx);
      break;
    case "s": 
      event.preventDefault();
      switchToSelect();
      break;
    case "d": switchToDraw(); break;
    case "Enter": if (currentTool === 1 && drawClass.selection) switchToSelect(); break;
  }
});

/* Event listeners and functions for top-left non-Google functions (undo/redo, download) */
undo.addEventListener("click", () => {
  drawClass.historyManager.undo();
});

redo.addEventListener("click", () => {
  drawClass.historyManager.redo();
});

download.addEventListener("click", () => {
  downloadAll();
});

/**
 * Runs the full export pipeline: renders every frame/layer to images,
 * builds the shape-data CSV, and bundles both into a downloaded zip.
 */
async function downloadAll() {
  const imageArray = await downloadImageFrames();
  const csv = downloadCsv();
  generateZipDownload(imageArray, csv);
}

/**
 * Renders every layer/frame combination (background + drawn shapes) to
 * a flattened PNG blob, using a temporary off-screen canvas so the
 * visible canvases aren't disturbed. Restores the original layer/frame
 * view afterward.
 * @returns {Promise<Blob[]>} One PNG blob per layer/frame, in layer-major order.
 */
async function downloadImageFrames() { /* TODO: Uncheck the overlay last */
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");
  const imageArray = [];
  tempCanvas.width = bckdCanvas.width;
  tempCanvas.height = bckdCanvas.height;
  drawClass.deSelect();
  for (let i = 0; i < numLayers; i++) {
    for (let j = 0; j < numFrames; j++) {
      // Draw background and contours for the current frame onto the temporary canvas
      bckdClass.draw(i, j);
      drawClass.draw(j);
      tempCtx.drawImage(bckdCanvas, 0, 0);
      tempCtx.drawImage(drawCanvas, 0, 0);

      const blob = await new Promise (resolve => {
        tempCanvas.toBlob(blob => resolve(blob));
      });
      imageArray.push(blob);
      tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
  }

  bckdClass.draw(layerIdx, frameIdx);
  drawClass.draw(frameIdx);
  
  return imageArray;
}

/**
 * Builds the exported CSV of shape data. The first row is a `META`
 * row carrying the current {@link scale} factor (so exported
 * pixel coordinates can be mapped back to original image resolution).
 * The header row is sized dynamically to the
 * largest point count across all shapes/frames (see
 * {@link DrawCanvasClass#getMaxNumPoints|DrawCanvasClass.getMaxNumPoints()}). One data row is written per
 * shape per frame on which that shape exists (i.e. isn't paused).
 * @returns {string} CSV content, with `\r\n` line endings.
 */
function downloadCsv() {
  let csvContent = "";

  const metaRow = ["META", "scale_factor", scale]
  let row = metaRow.join(",");
  csvContent += row + "\r\n";

  const headerRow = ["num", "label", "closed", "frame_num"]
  for (var i = 0; i < numLayers; i++) {
    headerRow.push("layer_" + (i+1).toString() + "_filename");
  }
  for (var i = 0; i < drawClass.getMaxNumPoints(); i++) {
    headerRow.push("coord_" + ((i+1).toString() + "_x"));
    headerRow.push("coord_" + ((i+1).toString() + "_y"));
  }

  row = headerRow.join(",");
  csvContent += row + "\r\n";

  for (var i = 0; i < drawClass.shapes.length; i++) {
    for (var j = 0; j < numFrames; j++) {
      if (drawClass.shapes[i].frames[j]) {
        const dataRow = [i.toString(), drawClass.shapes[i].label, drawClass.shapes[i].closed.toString(), j.toString()];
        for (var k = 0; k < numLayers; k++) {
          dataRow.push(layerFilenameArrays[k][j]);
        }
        for (var k = 0; k < drawClass.shapes[i].frames[j].length; k++) {
          dataRow.push(drawClass.shapes[i].frames[j][k].x);
          dataRow.push(drawClass.shapes[i].frames[j][k].y);
        }
        row = dataRow.join(",");
        csvContent += row + "\r\n";
      }
    }
  }
  return csvContent;
}

/**
 * Bundles exported PNG frames and the shape-data CSV into a single
 * downloaded zip file (`trax_output.zip`).
 * @param {Blob[]} imageArray - PNG blobs from {@link downloadImageFrames}.
 * @param {string} csv - CSV content from {@link downloadCsv}.
 */
async function generateZipDownload(imageArray, csv) {
  const zip = new JSZip();
  var photoZip = zip.folder("canvas_images")
  for (i = 0; i < imageArray.length; i++) {
    photoZip.file("image_" + i + ".png", imageArray[i]);
  }
  zip.file("shape_data.csv", csv);

  const zipData = await zip.generateAsync({
    type: "blob",
    streamFiles: true
  });

  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(zipData);
  link.download = "trax_output.zip";
  link.click();
}

/* Event listener for layer picker */
layerPicker.addEventListener("change", (event) => {
  layerIdx = event.target.value;
  bckdClass.draw(event.target.value, frameIdx);
})

/* Event listener for overlayLast */

overlayLast.addEventListener("click", () => {
  drawClass.draw(frameIdx);
});

/* Event listeners & functions for frame navigation */

bck.addEventListener("click", () => {
  if (frameIdx != 0) {
    changeFrame(frameIdx - 1);
  }
});

fwd.addEventListener("click", () => {
  if (frameIdx < numFrames - 1) {
    changeFrame(frameIdx + 1);
  }
});

frameSlider.addEventListener("input", e => { /* TODO: Change accessibility feature so it doesn't skip multiple frames? */
  changeFrame(parseInt(e.target.value));
});

/**
 * Changes the current frame: updates {@link frameIdx}, syncs the frame
 * slider/label, and redraws.
 * @param {number} newFrame
 */
function changeFrame(newFrame) {
  frameIdx = newFrame;
  frameSlider.value = frameIdx;
  frameLabel.textContent = `Frame ${frameIdx+1}/${numFrames}`;
  drawRequestedFrame();
}

/** Switches to the select tool (0): updates {@link currentTool}, the tool radio, and the cursor. */
function switchToSelect() {
  currentTool = 0;
  toolRadios[0].checked = true;
  canvasContainer.style.cursor = "default";
}

/** Switches to the pen/draw tool (1): updates {@link currentTool}, the tool radio, and the cursor. */
function switchToDraw() {
  currentTool = 1;
  toolRadios[1].checked = true;
  canvasContainer.style.cursor = "crosshair";
}

/* Event listeners & functions for contour parameter changes */

colorPicker.addEventListener("change", (event) => {
  drawClass.changeSelectedShapeColor(event);
});

contourLabel.addEventListener("change", (event) => {
  drawClass.changeSelectedShapeLabel(event);
});

pauseButton.addEventListener("click", () => {
  drawClass.pauseSelectedShape();
});

deleteButton.addEventListener("click", () => {
  drawClass.deleteSelectedShape();
});

/**
 * Creates an `Image` object from a Google Drive file. Fetches the file
 * as binary data via the Drive API, converts it to a Blob, and loads
 * that Blob into an Image element.
 * @param {{id: string, name: string, mimeType: string}} file - A Drive Picker doc result.
 * @returns {Promise<{image: HTMLImageElement, name: string}>} Resolves once the image has loaded.
 */
async function createImage(file) {
  return new Promise((resolve, reject) => {
    gapi.client.drive.files
      .get({
        fileId: file.id,
        alt: 'media'
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
      .then(resp => {
        // console.log("status:", resp.status)
        let binary = resp.body
        let l = binary.length
        let array = new Uint8Array(l);
        for (var i = 0; i<l; i++){
          array[i] = binary.charCodeAt(i);
        }
        let blob = new Blob([array], {type: file.mimeType});
        let mySrc;
        const reader = new FileReader();
        reader.readAsDataURL(blob); 
        reader.onloadend = function() {
          // result includes identifier 'data:image/png;base64,' plus the base64 data
          const image = new Image(); 
          image.onload = () => resolve({image, name: file.name });
          image.onerror = reject;
          // console.log(reader.result.substring(0, 60))
          image.src = reader.result;
        }
      })
      .catch(err => {
        reject(err);
      })  
  });
}

/* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ END OF ACTUAL WEBSITE CODE ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */
/* Google Drive API code & variables */
// Authorization scopes required by the Google Drive/Picker APIs
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
/* TODO: move CLIENT_ID/API_KEY/APP_ID to a gitignored config file before this repo goes public — see SECURITY note */
const CLIENT_ID = '592126216975-vre6eg876m5of41labf1ce9aps6mvsba.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBB_pi9RBgkdc5dPjgMhUR0210fjggjMmM';
const APP_ID = 'trax-490102';
/**
 * OAuth2 token client from Google Identity Services, initialized in {@link gisLoaded}.
 * @type {?Object}
 */
let tokenClient;
/**
 * Cached Drive API access token, persisted in localStorage so the user isn't re-prompted every session until it expires.
 * @type {?string}
 */
let accessToken = localStorage.getItem('accessToken') ?? null;  
/**
 * Whether the Google Picker API has finished initializing.
 * @type {boolean}
 */
let pickerInited = false;
/**
 * Whether Google Identity Services has finished initializing.
 * @type {boolean}
 */
let gisInited = false;
document.getElementById('driveUpload').style.visibility = 'hidden';
document.getElementById('signout_button').disabled = true;

/* Load Google API client, GIS, Picker, and create picker */

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
  gapi.load('client:picker', initializePicker);
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
  maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
  if (pickerInited && gisInited) {
    document.getElementById('driveUpload').style.visibility = 'visible';
  }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
  tokenClient.callback = async (response) => {
    if (response.error !== undefined) {
      throw (response);
    }
    accessToken = response.access_token;
    localStorage.setItem('accessToken', accessToken);
    document.getElementById('driveUpload').innerText = 'Upload';
    document.getElementById('signout_button').disabled = false;
    await createPicker();
  };

  if (accessToken === null) {
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Skip display of account chooser and consent dialog for an existing session.
    tokenClient.requestAccessToken({prompt: ''});
  }
}

/* On load, ask for user to sign in and initialize the API client library. */
window.onload = () => {
  handleAuthClick();
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
    document.getElementById('driveUpload').innerText = 'Sign In';
    document.getElementById('signout_button').style.visibility = 'hidden';
  }
}

/**
 *  Create and render a Google Picker object for searching images.
 */
function createPicker() { /* TODO: Show the same thing as My Drive */
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
  .setMimeTypes('image/png,image/jpeg,image/jpg')
  .setIncludeFolders(true)        // shows folders for navigation
  .setSelectFolderEnabled(false)
  const sharedView = new google.picker.DocsView(google.picker.ViewId.DOCS)
  .setMimeTypes('image/png,image/jpeg,image/jpg')
  .setIncludeFolders(true)
  .setSelectFolderEnabled(false)
  .setOwnedByMe(false)
  const picker = new google.picker.PickerBuilder()
      //.enableFeature(google.picker.Feature.NAV_HIDDEN)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOAuthToken(accessToken)
      .addView(view)
      .addView(sharedView)
      .addView(new google.picker.DocsUploadView())
      .setCallback(pickerCallback)
      .build();
  picker.setVisible(true);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializePicker() {
  await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
  pickerInited = true;
  maybeEnableButtons();
}

/**
 * Callback once the user has picked file(s) in the Google Picker.
 * Converts each picked doc into an Image (via {@link createImage}),
 * sorts them by filename, and either initializes the canvases for the
 * first time this session ({@link initCanvasFunctionality}) or adds them
 * as a new layer ({@link BckdCanvasClass#addLayer}). If adding a layer
 * fails because the frame count doesn't match, reopens the picker so the
 * user can pick a matching set.
 * @param {Object} pickerResp - Google Picker response object.
 */
async function pickerCallback(pickerResp) {
  // await htmlReadyPromise;
  if (pickerResp.action === google.picker.Action.PICKED) {
    const docs = Array.from(pickerResp.docs);
    const results = await Promise.all(docs.map(createImage));
    results.sort((a, b) => a.name.localeCompare(b.name));

    // Extract just the images into the global array
    const images = results.map(r => r.image);
    const filenames = results.map(r => r.name);

    if (!drawClass) {
      layerFilenameArrays.push(filenames);
      initCanvasFunctionality(images, filenames[0]);
    }
    else {
      try {
        bckdClass.addLayer(images, filenames[0]);
        layerFilenameArrays.push(filenames);
      }
      catch {
        createPicker();
      }
    }
  }
}
