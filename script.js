// Get the canvas and 2D drawing context
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
// Variables for pixel data and loaded WASM module
let imageData;
let wasmModule;

// Image id counter 
let imageIdCounter = 0; 

// Layer order tracking 
let uploadedLayerOrder = []; 

// Currently selected layer (default to 0)
let selectedLayerId = 0;

// Dimensions of the canvas should be max of all images 
let maxWidth = 0; 
let maxHeight = 0; 

Module().then((mod) => {
  wasmModule = mod;

  // Debugging: shows available methods and access to raw WASM memory HEAPU8
  console.log("WASM loaded:", Object.keys(wasmModule));
  console.log("HEAPU8?", wasmModule.HEAPU8);

  // Waits for user to choose an image file
  document.getElementById("upload").addEventListener("change", (e) => {
    const files = e.target.files; 
    if (!files.length) return;
  
    const fileArray = Array.from(files);
    let loadedImages = 0;
  
    fileArray.forEach((file) => {
      const img = new Image();
      img.onload = () => {
        // Track max dimensions
        maxWidth = Math.max(maxWidth, img.width);
        maxHeight = Math.max(maxHeight, img.height);
  
        // Draw this image onto a temp canvas to extract pixel data
        // Cannot directly read pixel data from the original image in JS
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
        tempCtx.drawImage(img, 0, 0);
  
        const tempImageData = tempCtx.getImageData(0, 0, img.width, img.height);
        const pixelData = tempImageData.data;
        const len = pixelData.length;
        const dataPtr = wasmModule._malloc(len);
        const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
        heap.set(pixelData);
  
        wasmModule.ccall("data_to_layer", null, ["number", "number", "number", "number"],
          [dataPtr, img.width, img.height, imageIdCounter]);
        wasmModule._free(dataPtr);
  
        addLayerToUI(imageIdCounter, img.src);
        uploadedLayerOrder.push(imageIdCounter);
        imageIdCounter++;
  
        loadedImages++;
  
        // When all images are loaded, render
        if (loadedImages === fileArray.length) {
          canvas.width = maxWidth;
          canvas.height = maxHeight;
          renderMergedImage(uploadedLayerOrder);
        }
      };
      img.src = URL.createObjectURL(file);
    });
  }); 
  
  function renderMergedImage(layerOrder) {
    // Allocate memory for merged image data 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(layerOrder.length * 4);
  
    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, layerOrder.length);
    for (let i = 0; i < layerOrder.length; i++) {
      orderHeap[i] = layerOrder[i];
    }
  
    // Width and height of canvas should be max width and height of all images 
    wasmModule.ccall("merge_layers", null, ["number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, layerOrder.length]);
  
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const mergedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(mergedImage, 0, 0);
  
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  }  

  // UI preview
  function addLayerToUI(id, src) {
    const li = document.createElement("li");
    li.classList.add("layer-item");
    li.dataset.id = id;
    li.innerHTML = `<img src="${src}" width="50"><br>Layer ${id}`;
    
    // Add click event listener for layer selection
    li.addEventListener("click", () => selectLayer(id));
    
    document.getElementById("layer-list").appendChild(li);
    
    // Select the first layer by default
    if (id === 0) {
      selectLayer(id);
    }
  }

  // Function to handle layer selection
  function selectLayer(layerId) {
    // Update the selected layer ID
    selectedLayerId = layerId;
    
    // Remove selected class from all layers
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.remove('selected');
    });
    
    // Add selected class to the clicked layer
    const selectedElement = document.querySelector(`.layer-item[data-id="${layerId}"]`);
    if (selectedElement) {
      selectedElement.classList.add('selected');
    }
    
    console.log(`Selected layer: ${layerId}`);
  }

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
    // Allocate memory for merged image data 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);

    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call the WASM function with the selected layer ID instead of hardcoded 0
    wasmModule.ccall(cppFunctionName, null, ["number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId]);

    // Get the processed image data and display it
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);

    // Free WASM memory
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  }

  // Attach event listener for the gaussian blur button
  document.getElementById("blur_gaussian").addEventListener("click", () => {
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

    // Allocate memory for merged image data 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);

    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call Gaussian blur function in WASM with selected layer ID
    wasmModule.ccall("gaussian_blur", null, ["number", "number", "number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId, sigma, kernelSize]);

    // Get the processed image data and display it
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);

    // Free WASM memory
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  });

  // Attach event listener for the sobel button
  document.getElementById("edge_sobel").addEventListener("click", () => {
    // Allocate memory for merged image data 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);

    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call Sobel function in WASM with selected layer ID
    wasmModule.ccall("edge_sobel", null, ["number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId]);

    // Get the processed image data and display it
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);

    // Free WASM memory
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  });

  // Attach event listener for the Laplacian of Gaussian button
  document.getElementById("edge_laplacian_of_gaussian").addEventListener("click", () => {
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

    // Allocate memory for merged image data 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);

    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call Laplacian of Gaussian function in WASM with selected layer ID
    wasmModule.ccall("edge_laplacian_of_gaussian", null, ["number", "number", "number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId, sigma, kernelSize]);

    // Get the processed image data and display it
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);

    // Free WASM memory
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  });

  // Colour picker - TODO

});
