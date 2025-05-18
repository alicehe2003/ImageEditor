// Get the canvas and 2D drawing context
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
// Variables for pixel data and loaded WASM module
let imageData;
let wasmModule;

Module().then((mod) => {
  wasmModule = mod;

  // Debugging: shows available methods and access to raw WASM memory HEAPU8
  console.log("WASM loaded:", Object.keys(wasmModule));
  console.log("HEAPU8?", wasmModule.HEAPU8);

  // Waits for user to choose an image file
  document.getElementById("upload").addEventListener("change", (e) => {
    // Gets first selected file 
    const file = e.target.files[0];
    if (!file) return;

    // Loads image in memory. Once loaded, it resizes the canvas and draws the 
    // image on the canvas. 
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      // Extracts pizel data from canvas for processing 
      imageData = ctx.getImageData(0, 0, img.width, img.height);
    };
    img.src = URL.createObjectURL(file);
  });

  // Wait for button click with ID "monochrome_average"
  document.getElementById("monochrome_average").addEventListener("click", () => {
    if (!imageData) return;

    // Calculate the number of bytes needed for the image data (width * height * 4)
    // and allocates memory in WASM heap for pixel data
    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);

    // Create JS view into WASM meory starting at dataPtr, and copies 
    // JS pixel data into WASM memory
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
    heap.set(imageData.data);

    // Calls the WASM function monochrome_average
    // "monochrome_average" is the name of the C++ function (must be exported with 
    // Emscripten via EXPORTED_FUNCTIONS)
    // null is the return type (void)
    // ["number", "number", "number"] is the type of the arguments
    // [dataPtr, imageData.width, imageData.height] is the argument values 
    wasmModule.ccall("monochrome_average", null, ["number", "number", "number"],
      [dataPtr, imageData.width, imageData.height]);

    // Copies the processed pixel data back into the canvas
    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);
    // Free WASM memory 
    wasmModule._free(dataPtr);
  });
});
