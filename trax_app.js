/* TRAX: Web app to perform meteorological analysis through the drawing of contours */
/* Copyright (C) 2026 Ezekiel Caldon */
/*
This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.
*/
/*
  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
*/
/*
    You should have received a copy of the GNU General Public License along
    with this program; if not, email Ezekiel Caldon, zc009026@ohio.edu.
*/
/* Actual website code starts here */
/* Global variables */
let frameIdx = 0; // Global variable to track current frame index
let numFrames = 0;
let layerIdx = 0; // Global variable to track current layer index
let numLayers = 0;
const layerFilenameArrays = [];
let bckdClass;
let drawClass;
let currentTool = 1; // 0 = select, 1 = pen, 2 = pan
/* Global constants */
const mySelBoxSize = 9;
/* HTML Objects */
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
const canvasContainer = document.querySelector("#canvasContainer");
const bckdCanvas = document.querySelector("#bckdCanvas");
const bckdCtx = bckdCanvas.getContext('2d');
const drawCanvas = document.querySelector("#drawCanvas");
const drawCtx = drawCanvas.getContext('2d');

/* Draw controls */
const toolRadios = document.querySelectorAll('input[name="toolSelect"]');
// Set current tool and cursor based on tool radios
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
class Command {
  execute() {
    throw new Error('execute() method must be implemented');
  }

  undo() {
    throw new Error('undo() method must be implemented');
  }
}

class CommandGroup {
  constructor() {
    this.commands = [];
  }

  addCommand(command) {
    this.commands.push(command);
  }

  execute() {
    this.commands.forEach(command => command.execute());
  }

  undo() {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) { 
      this.commands[i].undo();
    }
  }
}

class HistoryManager {
  constructor() {
    this.history = [];
    this.redoStack = [];
    this.maxHistorySize = 100; /* TODO: See what the greatest size without crashing the program could be */
    this.groupingActive = false;
    this.currentCommandGroup = null;
  }

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

  beginCommandGroup() { /* TODO: Abstract command group into beginning and end points for drag actions */
    this.groupingActive = true;
    this.currentCommandGroup = new CommandGroup();
  }

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
class BckdCanvasClass {
  constructor(images, first_filename) {
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

  clear() {
    bckdCtx.clearRect(0, 0, bckdCanvas.width, bckdCanvas.height);
  }

  draw(layer, frame) {
    this.clear();
    const curImg = this.layers[layer][frame];
    if (curImg.height > bckdCanvas.height && curImg.width > bckdCanvas.width) {
      const scale = Math.min(bckdCanvas.width / curImg.width, bckdCanvas.height / curImg.height);
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else if (curImg.height > bckdCanvas.height) {
      const scale = bckdCanvas.height / curImg.height;
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else if (curImg.width > bckdCanvas.width) {
      const scale = bckdCanvas.width / curImg.width;
      bckdCtx.drawImage(curImg, 0, 0, (curImg.width * scale), (curImg.height * scale));
    } else {
      bckdCtx.drawImage(curImg,0,0);
    }

  }
}

class DrawCanvasClass {
  constructor() {
    // Mouse offset variables
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
    this._shapes = [];
    this._selection = null;

    // State tracking
    this.dragState = null;
    this.expectResize = -1;

    // History manager
    this._historyManager = new HistoryManager();
  }

  get selection() {
    return this._selection;
  }

  set selection(val) {
    this._selection = val;
  }

  get historyManager() {
    return this._historyManager;
  }

  get shapes() {
    return this._shapes;
  }

  clear() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

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
    
      // run through all the objects
      var l = this.shapes.length;
      for (var i = l-1; i >= 0; i--) {
        // if the mouse pixel exists, select and break
        let selPoints = this.shapes[i].getPoints(frameIdx);
        if (this.shapes[i].hitTest(mx, my) > 0) {
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
      for (var i = 0; i < selPoints.length; i++) {
        var cur = selPoints[i];
        
        if (mouse.x >= cur.x - (mySelBoxSize) && mouse.x <= cur.x + (mySelBoxSize) && /* TODO: Check if the selection handle hitbox is too large */
            mouse.y >= cur.y -(mySelBoxSize) && mouse.y <= cur.y + (mySelBoxSize)) {
          // we found one!
          this.expectResize = i;
          canvasContainer.style.cursor = 'pointer';
          return;
        }

        if (this._selection.hitTest(mouse.x, mouse.y) > 0) {
          this.expectResize = -1;
          canvasContainer.style.cursor = 'all-scroll';
          return;
        }
      }

      for (var i = 0; i < this.shapes.length; i++) {
        if (this.shapes[i].hitTest(mouse.x, mouse.y) > 0) {
          canvasContainer.style.cursor = 'pointer';
          return;
        }
      }  

      // not over a selection box, return to normal
      canvasContainer.style.cursor='auto';
      this.dragState = null;
      this.expectResize = -1;
    }
  }

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

  addShape(shape) {
    this.shapes.push(shape);
  }

  removeSelectedShape() {
    if (this._selection) {
      const index = this.shapes.indexOf(this._selection);
      if (index > -1) {
        this.shapes.splice(index, 1);
        this.deSelect();
      }
    }
  }

  deSelect() {
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

  changeSelectedShapeColor(event) {
    if (this._selection) {
      this._historyManager.executeCommand(new ColorChangeCommand(this._selection, event.target.value));
    }
    this.draw(frameIdx);
  }

  changeSelectedShapeLabel(event) {
    if (this._selection) {
      this._historyManager.executeCommand(new LabelChangeCommand(this._selection, event.target.value));
    }
  }

  pauseSelectedShape() {
    if (this._selection) {
      this._historyManager.executeCommand(new FramePauseCommand(this._selection));
    }
  }

  deleteSelectedShape() {
    if (this.selection) {
      this._historyManager.executeCommand(new ContourDeleteCommand(this, this._selection));
    }
    this.draw(frameIdx);
  }

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
class Shape {
  constructor(first_point, closed, color, label) {
    this._closed = closed;
    this._color = color;
    this._label = label;
    this._frames = {};
    this._modified = {};
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i] = first_point.map(p => ({x: p.x, y: p.y}));
    }
  }

  addPoint(x, y) {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].push({x: x, y: y});
    }
  }

  getModified(frame) {
    return this._modified[frame];
  }

  deleteLastPoint() {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i].pop();
    }
  }

  getPoints(frame) {
    return this._frames[frame];
  }

  setModified(frame, condition) {
    this._modified[frame] = condition;
  }

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

    if (drawClass.selection === this && frameIndex === frameIdx) {
      var half = mySelBoxSize / 2;
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
  distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x)*dx + (py - a.y)*dy) / (dx*dx + dy*dy)));
    return Math.hypot(px - (a.x + t*dx), py - (a.y + t*dy));
  }
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
  pause() {
    for (var i = frameIdx; i < numFrames; i++) {
      this._frames[i] = null;
    }
    drawClass.deSelect();
    drawClass.draw(frameIdx);
  }
  unpause(startPoints) { /* TODO: Unpause button, rather than just undo/redo */
    this._frames = startPoints;
    drawClass._selection = this;
    drawClass.draw(frameIdx);
  }
}

/* Concrete commands */
class CreateShapeCommand extends Command {
  constructor(drawClass, x, y) {
    super();
    this.drawClass = drawClass;
    this.x = x;
    this.y = y;
    this.shape = null;
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

class AddPointCommand extends Command {
  constructor(shape, x, y) {
    super();
    this.shape = shape;
    this.x = x;
    this.y = y;
    this.frame = frameIdx;
  }

  execute() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    switchToDraw();
    this.shape.addPoint(this.x, this.y);
  }

  undo() {
    if (this.frame != frameIdx) {
      changeFrame(this.frame);
    }
    this.shape.deleteLastPoint();
  }
}

class CloseShapeCommand extends Command {
  constructor(shape) {
    super();
    this.shape = shape;
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

class DragShapeCommand extends Command {
  constructor(shape, dragState, mouse) {
    super();
    this.shape = shape;
    this.dragState = dragState;
    this.mouse = mouse;
    this.modified_before = this.shape.getModified();
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
  }
}

class DragPointCommand extends Command {
  constructor(shape, expectResize, dragState, mouse) {
    super();
    this.dragState = dragState;
    this.shape = shape;
    this.expectResize = expectResize;
    this.mouse = mouse;
    this.modified_before = this.shape.getModified();
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
        selPoints[this.expectResize].x = this.mouse.x;
        selPoints[this.expectResize].y = this.mouse.y;
      }
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
  }
}

class ColorChangeCommand extends Command {
  constructor(shape, newColor) {
    super();
    this.shape = shape;
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

class LabelChangeCommand extends Command {
  constructor(shape, newLabel) {
    super();
    this.shape = shape;
    if (shape.label) {
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

class FramePauseCommand extends Command {
  constructor(shape) {
    super();
    this.pause_frame = frameIdx;
    this.shape = shape;
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

class ContourDeleteCommand extends Command {
  constructor(drawClass, shape) {
    super();
    this.drawClass = drawClass;
    this.shape = shape;
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

/* Initialize canvas states and event listeners after images are loaded */
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
}

/* Method to redraw the canvases based on the current global frame index and layer index. Called whenever we change frames or layers */
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
  resizeCanvases();
}); 

function resizeCanvases() { /* TODO: Shapes get moved around when the window is resized, maybe just never allow it to resize? */
  bckdCanvas.width = canvasContainer.offsetWidth;
  bckdCanvas.height = canvasContainer.offsetHeight;
  drawCanvas.width = canvasContainer.offsetWidth;
  drawCanvas.height = canvasContainer.offsetHeight;
  drawRequestedFrame();
}

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

async function downloadAll() {
  const imageArray = await downloadImageFrames();
  const csv = downloadCsv();
  generateZipDownload(imageArray, csv);
}

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

function downloadCsv() {
  const headerRow = ["num", "label", "closed", "frame_num"]
  for (var i = 0; i < numLayers; i++) {
    headerRow.push("layer_" + (i+1).toString() + "_filename");
  }
  for (var i = 0; i < drawClass.getMaxNumPoints(); i++) {
    headerRow.push("coord_" + ((i+1).toString() + "_x"));
    headerRow.push("coord_" + ((i+1).toString() + "_y"));
  }

  let csvContent = "";

  let row = headerRow.join(",");
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

document.addEventListener("keydown", (event) => {
  const keyName = event.key;

  if (keyName === "ArrowLeft") {
    if (frameIdx != 0) {
      changeFrame(frameIdx - 1);
    }
  }
});

fwd.addEventListener("click", () => {
  if (frameIdx < numFrames - 1) {
    changeFrame(frameIdx + 1);
  }
});

document.addEventListener("keydown", (event) => {
  const keyName = event.key;

  if (keyName === "ArrowRight") {
    if (frameIdx < numFrames - 1) {
      changeFrame(frameIdx + 1);
    }
  }
});

frameSlider.addEventListener("input", e => { /* TODO: Change accessibility feature so it doesn't skip multiple frames? */
  changeFrame(parseInt(e.target.value));
});

function changeFrame(newFrame) {
  frameIdx = newFrame;
  frameSlider.value = frameIdx;
  frameLabel.textContent = `Frame ${frameIdx+1}/${numFrames}`;
  drawRequestedFrame();
}

document.addEventListener("keydown", (event) => {
  const keyName = event.key;

  if (keyName === "Enter") {
    if (currentTool === 1 && drawClass.selection) {
      switchToSelect();
    }
  }
});

function switchToSelect() {
  currentTool = 0;
  toolRadios[0].checked = true;
  canvasContainer.style.cursor = "default";
}

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

/* Helper function for creating an Image object from a Google Drive file. Uses the Drive API to get the file as binary data, converts that data to a Blob, and then creates an Image object from that Blob. Returns a promise that resolves with the Image object once it's loaded. */
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
const CLIENT_ID = '592126216975-vre6eg876m5of41labf1ce9aps6mvsba.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBB_pi9RBgkdc5dPjgMhUR0210fjggjMmM';
const APP_ID = 'trax-490102';
let tokenClient;
let accessToken = localStorage.getItem('accessToken') ?? null;  
let pickerInited = false;
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