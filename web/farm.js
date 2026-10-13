// Agents Farm - draws the farm on the canvas.
// Phase 4a: a still picture with fake data. No WebSocket yet.

const TILE = 16;           // one tile in the art is 16 x 16 pixels
const SCALE = 3;           // draw every tile 3 times bigger
const SIZE = TILE * SCALE; // so one tile on screen is 48 x 48 pixels

// Fake data: a field is a folder, a plot is a file in that folder.
const fields = [
  { name: "src/",   files: ["app.py", "utils.py"] },
  { name: "tests/", files: ["test_app.py"] },
  { name: "root",   files: ["README.md", "requirements.txt"] },
];

// Where things go on the grid (counted in tiles, not pixels)
const PLOT_SPACING = 3; // each plot gets 3 tiles of width, so long file names fit
const FIELD_TOP = 2;    // the top fence of every field is on row 2
const FIELD_HEIGHT = 5; // fence, empty row, plots, names, fence
const ROWS = 11;

// Every picture we use. Each name matches a file in web/assets/.
const IMAGE_NAMES = [
  "grass", "grass_tufts", "grass_flowers",
  "fence_top_left", "fence_horizontal", "fence_top_right",
  "fence_left", "fence_right", "fence_bottom_left", "fence_bottom_right",
  "sign", "plot", "crop_ripe", "farmer",
];

const canvas = document.getElementById("farm-canvas");
const ctx = canvas.getContext("2d"); // ctx is the "pen" we draw with

// Load one picture. Returns a Promise: a value that arrives later.
function loadImage(name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + name));
    img.src = "assets/" + name + ".png";
  });
}

// Load all pictures, one by one, into an object like { grass: <img>, ... }
async function loadImages() {
  const images = {};
  for (const name of IMAGE_NAMES) {
    images[name] = await loadImage(name);
  }
  return images;
}

// A field is as wide as its plots, plus one fence tile on each side
function fieldWidth(field) {
  return field.files.length * PLOT_SPACING + 2;
}

// Total width: one empty column, then each field followed by one empty column
function countColumns() {
  let cols = 1;
  for (const field of fields) {
    cols += fieldWidth(field) + 1;
  }
  return cols;
}

// Draw one tile at a grid position (col, row)
function drawTile(images, name, col, row) {
  ctx.drawImage(images[name], col * SIZE, row * SIZE, SIZE, SIZE);
}

// Draw white text with a dark outline, so it is easy to read on grass
function drawText(text, x, y, size, align) {
  ctx.font = "bold " + size + "px monospace";
  ctx.textAlign = align;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2b2233";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

// Cover the whole canvas with grass. A simple math pattern adds some
// tufts and flowers, so it looks the same every time you reload.
function drawGrass(images, cols) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const pattern = (col * 7 + row * 13) % 11;
      let name = "grass";
      if (pattern === 0) name = "grass_flowers";
      if (pattern === 5) name = "grass_tufts";
      drawTile(images, name, col, row);
    }
  }
}

// Draw a fence around a rectangle: corners, top and bottom, left and right
function drawFence(images, left, top, width, height) {
  const right = left + width - 1;
  const bottom = top + height - 1;

  // Skip the corner columns: corners get their own tiles below
  for (let col = left + 1; col < right; col++) {
    drawTile(images, "fence_horizontal", col, top);
    drawTile(images, "fence_horizontal", col, bottom);
  }
  for (let row = top + 1; row < bottom; row++) {
    drawTile(images, "fence_left", left, row);
    drawTile(images, "fence_right", right, row);
  }
  drawTile(images, "fence_top_left", left, top);
  drawTile(images, "fence_top_right", right, top);
  drawTile(images, "fence_bottom_left", left, bottom);
  drawTile(images, "fence_bottom_right", right, bottom);
}

// Draw one field: a sign with the folder name, a fence, and a plot per file
function drawField(images, field, left) {
  drawFence(images, left, FIELD_TOP, fieldWidth(field), FIELD_HEIGHT);

  // Sign above the fence, with the folder name next to it
  drawTile(images, "sign", left, FIELD_TOP - 1);
  drawText(field.name, (left + 1) * SIZE + 6, FIELD_TOP * SIZE - 16, 20, "left");

  // Plots: dirt first, then the crop on top (the crop has a see-through background)
  const plotRow = FIELD_TOP + 2;
  field.files.forEach((file, i) => {
    const col = left + 2 + i * PLOT_SPACING;
    drawTile(images, "plot", col, plotRow);
    drawTile(images, "crop_ripe", col, plotRow);

    // File name centered under the plot
    const centerX = col * SIZE + SIZE / 2;
    drawText(file, centerX, (plotRow + 1) * SIZE + 24, 14, "center");
  });
}

async function main() {
  const images = await loadImages();
  const cols = countColumns();

  // Make the canvas exactly big enough for the grid
  canvas.width = cols * SIZE;
  canvas.height = ROWS * SIZE;
  // Keep pixels sharp. Must be set after resizing, because resizing resets it.
  ctx.imageSmoothingEnabled = false;

  drawGrass(images, cols);

  let left = 1; // first field starts after one empty column
  for (const field of fields) {
    drawField(images, field, left);
    left += fieldWidth(field) + 1;
  }

  // One farmer, standing still below the first field
  drawTile(images, "farmer", 3, FIELD_TOP + FIELD_HEIGHT + 1);
}

main();
