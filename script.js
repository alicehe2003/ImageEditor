// Get the canvas and 2D drawing context
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
// Variables for pixel data and loaded WASM module
let imageData;
let wasmModule; // Declare wasmModule globally

// Image id counter 
let imageIdCounter = 0; 

// Layer order tracking 
let uploadedLayerOrder = []; 

// Currently selected layer (default to 0)
let selectedLayerId = 0;

// Dimensions of the canvas should be max of all images 
let maxWidth = 0; 
let maxHeight = 0; 

// PeerJS setup
let peer;
let connections = []; // To store multiple connections

// Declare processImageFile and handleReceivedImage in a scope accessible by setupConnectionListeners
// They will be properly assigned within the Module().then block
let processImageFile;
let handleReceivedImage;

function initializePeer() {
  // IMPORTANT: Replace 'localhost' with your server's IP or domain if running on a different machine
  // For local development using "Go Live", 'localhost' or '127.0.0.1' is correct.
  peer = new Peer({
    host: 'localhost', // Or '127.0.0.1' if 'localhost' doesn't resolve
    port: 9000,        // The port you started your peerjs server on
    path: '/',         // Use '/' if you didn't specify a --path, or '/image-editor' if you did
    secure: false      // Use 'false' for local HTTP development. Set to 'true' for HTTPS/WSS in production.
  }); 
  peer.on('open', function(id) {
    console.log('My peer ID is: ' + id);
    alert('Your Peer ID: ' + id + '\nShare this ID with others to connect.');
  });

  peer.on('connection', function(conn) {
    console.log('Incoming connection from: ' + conn.peer);
    connections.push(conn);
    setupConnectionListeners(conn);
  });

  peer.on('error', function(err) {
    console.error('PeerJS error:', err);
  });
}

function connectToPeer() {
  const peerId = prompt("Enter Peer ID to connect to:");
  if (peerId) {
    const conn = peer.connect(peerId);
    conn.on('open', function() {
      console.log('Connected to: ' + peerId);
      connections.push(conn);
      setupConnectionListeners(conn);
    });
    conn.on('error', function(err) {
      console.error('Connection error:', err);
    });
  }
}

function setupConnectionListeners(conn) {
  conn.on('data', function(data) {
    console.log('Received data:', data);
    if (data.type === 'image') {
      // Ensure handleReceivedImage is defined before it's called
      if (typeof handleReceivedImage === 'function') {
        handleReceivedImage(data.imageSrc);
      } else {
        console.error("handleReceivedImage is not yet defined!");
      }
    }
  });

  conn.on('close', function() {
    console.log('Connection closed with: ' + conn.peer);
    connections = connections.filter(c => c.peer !== conn.peer); // Remove closed connection
  });
}

// Call this to initialize PeerJS when the script loads
initializePeer();

// Add a button or input to trigger connecting to another peer
document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.createElement('button');
  connectBtn.textContent = 'Connect to Peer';
  connectBtn.onclick = connectToPeer;
  document.querySelector('.headers_left').appendChild(connectBtn);
});


Module().then((mod) => {
  wasmModule = mod; // Assign the loaded module to the global wasmModule

  // Timer 
  function timeOperation(operationName, callback) {
    const start = performance.now();
    callback();
    const end = performance.now();
    const duration = Math.round(end - start);
    document.getElementById("timing-display").textContent = `${operationName}: ${duration} ms`;
  }  

  // Debugging: shows available methods and access to raw WASM memory HEAPU8
  console.log("WASM loaded:", Object.keys(wasmModule));
  console.log("HEAPU8?", wasmModule.HEAPU8);

  // Define processImageFile and handleReceivedImage here, where wasmModule is available
  processImageFile = (imageSrc) => {
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

      canvas.width = maxWidth;
      canvas.height = maxHeight;
      renderMergedImage(uploadedLayerOrder);
    };
    img.src = imageSrc;
  };

  handleReceivedImage = (imageSrc) => {
    // This function acts as if the user uploaded the image locally
    processImageFile(imageSrc);
  };

  // Waits for user to choose an image file
  document.getElementById("upload").addEventListener("change", (e) => {
    const files = e.target.files; 
    if (!files.length) return;
  
    const fileArray = Array.from(files);
    let loadedImages = 0;
  
    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageSrc = event.target.result;
        // Share the image with connected peers
        connections.forEach(conn => {
          conn.send({ type: 'image', imageSrc: imageSrc });
        });
        // Process the image locally as well
        processImageFile(imageSrc);
      };
      reader.readAsDataURL(file); // Read file as Data URL for sharing
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
    .addEventListener("click", () => timeOperation("Monochrome (Average)", () => applyMonochromeFilter("monochrome_average")));

  document.getElementById("monochrome_luminosity")
    .addEventListener("click", () => timeOperation("Monochrome (Luminosity)", () => applyMonochromeFilter("monochrome_luminosity")));

  document.getElementById("monochrome_lightness")
    .addEventListener("click", () => timeOperation("Monochrome (Lightness)", () => applyMonochromeFilter("monochrome_lightness")));

  document.getElementById("monochrome_itu")
    .addEventListener("click", () => timeOperation("Monochrome (ITU-R)", () => applyMonochromeFilter("monochrome_itu")));


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
    timeOperation("Gaussian Blur", () => {
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
  }); 

  // Attach event listener for the sobel button
  document.getElementById("edge_sobel").addEventListener("click", () => {
    timeOperation("Edge Detection (Sobel)", () => {
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
  }); 

  // Attach event listener for the Laplacian of Gaussian button
  document.getElementById("edge_laplacian_of_gaussian").addEventListener("click", () => {
    timeOperation("Edge Detection (LoG)", () => {
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
  }); 

  // Attach event listener for when user clicks on the canvas to use bucket tool 
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    timeOperation("Bucket Fill", () => applyBucketFill(x, y));
  });
  
  // Bucket tool 
  function applyBucketFill(x, y) {
    // Parse RGBA values from the text field
    const rgbaStr = document.getElementById("rgba").value;
    const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),\s*(\d+\.?\d*)\)/);
    if (!match) {
      alert("Invalid RGBA format");
      return;
    }
  
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    const a = Math.round(parseFloat(match[4]) * 255);

    console.log(`RGBA values: ${r}, ${g}, ${b}, ${a}`);

    // Error threshold for the bucket fill
    const threshold = parseFloat(document.getElementById("error-threshold").value);
  
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);
  
    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }
  
    // Call C++ function 
    wasmModule.ccall("bucket_fill", null, 
      ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId, x, y, r, g, b, a, threshold]
    );
  
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);
  
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
  }

  // Save image 
  const saveToggleBtn = document.getElementById("save-toggle");
  const dropdown = document.getElementById("format-dropdown");

  saveToggleBtn.addEventListener("click", () => {
    dropdown.classList.toggle("hidden");
  });

  // Handle format click
  dropdown.addEventListener("click", (e) => {
    if (e.target.classList.contains("format-option")) {
      const format = e.target.dataset.format;
      // Selects correct file extension to match chosen format
      const extension = format === "image/png" ? "png" : "jpg";
      // Captures current contents of canvas and converts to base64 encoded image
      const dataURL = canvas.toDataURL(format);

      // Temp <a> anchor/link created 
      const link = document.createElement("a");
      link.href = dataURL;
      // Tells browser to download the file instead of navigating to it
      link.download = `canvas_output.${extension}`;
      // Triggers the download 
      link.click();

      dropdown.classList.add("hidden"); // hide after save
    }
  });

  // Hide dropdown if user clicks elsewhere
  document.addEventListener("click", (e) => {
    if (!document.getElementById("save-controls").contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  // Resize layer 
  document.getElementById("resize_button").addEventListener("click", () => {
    timeOperation("Resize", () => {
    const newWidth = parseInt(document.getElementById("new_width").value);
    const newHeight = parseInt(document.getElementById("new_height").value);

    // Check for valid inputs  
    if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
      alert("Please enter valid width and height values.");
      return;
    }
    
    // Allocate memory 
    const len = canvas.width * canvas.height * 4;
    const outputPtr = wasmModule._malloc(len);
    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);

    // Copy the layer order into WASM memory
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call compression function in WASM with selected layer ID
    wasmModule.ccall("quad_compression", null, ["number", "number", "number", "number", "number", "number", "number", "number"],
      [outputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId, newWidth, newHeight]);

    // Get the processed image data and display it
    const heap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, outputPtr, len);
    const processedImage = new ImageData(heap, canvas.width, canvas.height);
    ctx.putImageData(processedImage, 0, 0);

    // Free WASM memory
    wasmModule._free(outputPtr);
    wasmModule._free(orderPtr);
    }); 
  }); 

});
