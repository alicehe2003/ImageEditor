// Get the canvas and 2D drawing context
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
// Variables for pixel data and loaded WASM module
let imageData;
let wasmModule;

// Image id counter 
let imageIdCounter = 0; 

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
      // Extracts pixel data from canvas for processing 
      imageData = ctx.getImageData(0, 0, img.width, img.height); 
      const pixelData = imageData.data;

      const len = imageData.data.length;
      const dataPtr = wasmModule._malloc(len);
      const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
      heap.set(pixelData);

      // Call the C++ function to process and cache the image
      wasmModule.ccall("data_to_layer", null, ["number", "number", "number", "number"],
        [dataPtr, imageData.width, imageData.height, imageIdCounter]);

      // Free WASM memory
      wasmModule._free(dataPtr);

      console.log("Image with ID " + imageIdCounter + " loaded to C++.");

      imageIdCounter++;
    };
    img.src = URL.createObjectURL(file);
  });

  // Attach event listeners for each monochrome button 
  document.getElementById("monochrome_average")
    .addEventListener("click", () => applyMonochromeFilter("monochrome_average"));

  document.getElementById("monochrome_luminosity")
    .addEventListener("click", () => applyMonochromeFilter("monochrome_luminosity"));

  document.getElementById("monochrome_lightness")
    .addEventListener("click", () => applyMonochromeFilter("monochrome_lightness"));

  document.getElementById("monochrome_itu")
    .addEventListener("click", () => applyMonochromeFilter("monochrome_itu"));

  // Applies a selected monochrome filter using a C++ function compiled to WASM
  function applyMonochromeFilter(cppFunctionName) {
    if (!imageData) return;

    // Calculate the number of bytes needed for the image data (width * height * 4)
    // and allocate memory in WASM heap for pixel data
    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);

    // Create a JS view into WASM memory starting at dataPtr
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);

    // Call the WASM function specified by cppFunctionName
    // cppFunctionName is the name of the C++ function (must be exported with 
    // Emscripten via EXPORTED_FUNCTIONS)
    // null is the return type (void)
    // ["number", "number"] is the type of the arguments
    // [dataPtr, 0] are the argument values 
    wasmModule.ccall(cppFunctionName, null, ["number", "number"],
      [dataPtr, 0]);

    // Copy the processed pixel data back into the canvas
    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);

    // Free WASM memory
    wasmModule._free(dataPtr);
  }

  // Attach event listener for the gaussian blur button
  document.getElementById("blur_gaussian").addEventListener("click", () => {
    if (!imageData) return;

    // Get sigma and kernel size values from the input fields 
    const sigma = parseFloat(document.getElementById("sigma").value);
    const kernelSize = parseInt(document.getElementById("kernel").value);

    // Validate ranges 
    if (isNaN(sigma) || sigma < 0 || sigma > 50) {
      alert("Sigma must be between 0 and 50");
      return;
    }

    if (isNaN(kernelSize) || kernelSize < 1 || kernelSize > 50 || kernelSize % 2 === 0) {
      alert("Kernel size must an odd number be between 1 and 50");
      return;
    }

    // Allocate WASM memory 
    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);

    // Call Gaussian blur function in WASM 
    wasmModule.ccall("gaussian_blur", null, ["number", "number", "number", "number"],
      [dataPtr, 0, sigma, kernelSize]);

    // Copy the result back into JS memory and render 
    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);

    // Free WASM memory
    wasmModule._free(dataPtr);
  }); 

  // Attach event listener for the sobel button
  document.getElementById("edge_sobel").addEventListener("click", () => {
    if (!imageData) return;

    // Allocate WASM memory 
    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);

    // Call Sobel function in WASM 
    wasmModule.ccall("edge_sobel", null, ["number", "number"],
      [dataPtr, 0]);

    // Copy the result back into JS memory and render 
    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);

    // Free WASM memory
    wasmModule._free(dataPtr);
  });

  // Attach event listener for the Laplacian of Gaussian button
  document.getElementById("edge_laplacian_of_gaussian").addEventListener("click", () => {
    if (!imageData) return;

    const sigma = parseFloat(document.getElementById('log_sigma').value);
    let kernelSize = parseInt(document.getElementById('log_kernel').value);

    // Validate ranges 
    if (isNaN(sigma) || sigma < 0 || sigma > 50) {
      alert("Sigma must be between 0 and 50");
      return;
    }

    if (isNaN(kernelSize) || kernelSize < 1 || kernelSize > 50 || kernelSize % 2 === 0) {
      alert("Kernel size must an odd number be between 1 and 50");
      return;
    }

    // Allocate WASM memory 
    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
    heap.set(imageData.data);

    // Call Laplacian of Gaussian function in WASM 
    wasmModule.ccall("edge_laplacian_of_gaussian", null, ["number", "number", "number", "number"],
      [dataPtr, 0, sigma, kernelSize]);

    // Copy the result back into JS memory and render 
    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);

    // Free WASM memory
    wasmModule._free(dataPtr);
  }); 

  // Colour picker - TODO

});
