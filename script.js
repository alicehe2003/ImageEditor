// Get the canvas and 2D drawing context
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");

// Variables for pixel data and loaded WASM module
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

// Persistent WASM output buffer and ImageData object
let wasmOutputPtr = 0;
let wasmOutputHeap = null;
let processedImageData = null;

// Flag to indicate if the image and WASM buffers are ready for operations
let isImageReady = false;

// PeerJS setup
let peer;
let connections = []; // To store multiple connections

// Declare processImageFile, handleReceivedImage, and applyOperationLocally
// in a scope accessible by setupConnectionListeners and Module().then block
let processImageFile;
let handleReceivedImage;
let applyOperationLocally; 

/**
 * Set up and configure the PeerJS client in the browser, allowing it to 
 * connect to a PeerJS signaling server and then establick P2P connections 
 * with other clients. 
 */
function initializePeer() {
  peer = new Peer({
    host: 'localhost',  // hostname or IP address 
    port: 9000,         // 9000 is default for PeerJS server 
    path: '/',          // serve from specific path or subpath 
    secure: false       // whether to use secure (WSS) or insecure (WS) WebSocket connection to signaling server
  });
  // Pop up to share peer ID with others 
  peer.on('open', function(id) {
    console.log('My peer ID is: ' + id);
    alert('Your Peer ID: ' + id + '\nShare this ID with others to connect.');
  });
  // Triggers when another peer successfully attempts to connect to this client
  peer.on('connection', function(conn) {
    console.log('Incoming connection from: ' + conn.peer);
    connections.push(conn);
    setupConnectionListeners(conn);
  });
  // Catches errors with PeerJS client 
  peer.on('error', function(err) {
    console.error('PeerJS error:', err);
  });
}

/**
 * Triggered by connect to peer button. Asks user for Peer ID, 
 * and sets up connection.
 */
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

/**
 * Send all operations to all connected peers. 
 */
function sendOperationToPeers(operationType, payload) {
  connections.forEach(conn => {
    conn.send({
      type: 'operation',              // Indicate that this is an operation message
      operationType: operationType,   // The function name 
      payload: payload                // The function input parameters and data
    });
  });
}

/**
 * Defines how application reacts when data is received from a connected peer, or when 
 * a connection is closed. 
 */
function setupConnectionListeners(conn) {
  // Event listener, triggered when connected peer sends data to this data channel 
  // The structure of data depends on what the sender (conn.send()) has sent 
  conn.on('data', function(data) {
    console.log('Received data:', data);
    // Handles messages that represent raw image data 
    if (data.type === 'image_binary') {
      // Extract image data buffer from received message 
      const receivedDataFromPeer = data.imageDataBuffer;

      if (receivedDataFromPeer && receivedDataFromPeer.buffer instanceof ArrayBuffer) {
        // Reconstructs an ImageData object from received binary data and its original dimentions 
        // ImageData is standard browser API for pixel manipulation 
        const receivedUint8ClampedArray = new Uint8ClampedArray(receivedDataFromPeer.buffer);
        const receivedImageData = new ImageData(receivedUint8ClampedArray, data.width, data.height);

        // Handles received images 
        if (typeof handleReceivedImage === 'function') {
          handleReceivedImage(receivedImageData);
        } else {
          console.error("handleReceivedImage is not yet defined!");
        }
      } else {
          console.error("Received image data is not in an expected TypedArray/ArrayBuffer format:", receivedDataFromPeer);
      }
    } else if (data.type === 'operation') {
        // Handles received operation
        if (typeof applyOperationLocally === 'function') {
            // Pass true for 'isRemote' to prevent re-sending
            // Execute received operation 
            applyOperationLocally(data.operationType, data.payload, true);
        } else {
            console.error("applyOperationLocally is not yet defined!");
        }
    }
  });

  // Triggers when connection with specific peer is closed
  conn.on('close', function() {
    console.log('Connection closed with: ' + conn.peer);
    // Updates global connections array by removing the closed connection
    // Ensures application only attempts to send message to active peers 
    connections = connections.filter(c => c.peer !== conn.peer);
  });
}

/**
 * Initialize server and P2P first, then display button to connect to 
 * peers. Ensures that P2P is set up before displaying button. 
 */

initializePeer();

document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.createElement('button');
  connectBtn.textContent = 'Connect to Peer';
  connectBtn.onclick = connectToPeer;
  document.querySelector('.headers_left').appendChild(connectBtn);
});

Module().then((mod) => {
  wasmModule = mod;

  /**
   * Time the duration in milliseconds taken by an operation. 
   */
  function timeOperation(operationName, callback) {
    const start = performance.now();
    callback();
    const end = performance.now();
    const duration = Math.round(end - start);
    document.getElementById("timing-display").textContent = `${operationName}: ${duration} ms`;
  }

  console.log("WASM loaded:", Object.keys(wasmModule));
  console.log("HEAPU8?", wasmModule.HEAPU8);

  /**
   * Takes raw image data (either from local file upload or from peer) and 
   * prepares it for processing by WASM module. Handles P2P sharing of raw image
   * data when local image is uploaded. 
   */
  processImageFile = (sourceData) => {
    let originalWidth, originalHeight, pixelData;

    // When image is uploaded locally via the "ADD IMAGE" button
    if (sourceData instanceof ImageBitmap) {
      originalWidth = sourceData.width;
      originalHeight = sourceData.height;

      // Draw onto temporary offscreen canvas to extract ImageData
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = originalWidth;
      tempCanvas.height = originalHeight;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      tempCtx.drawImage(sourceData, 0, 0);
      const tempImageData = tempCtx.getImageData(0, 0, originalWidth, originalHeight);
      pixelData = tempImageData.data;
    } else if (sourceData instanceof ImageData) {
      // When image is shared by peer
      originalWidth = sourceData.width;
      originalHeight = sourceData.height;
      pixelData = sourceData.data;
    } else {
      console.error("Invalid sourceData type for processImageFile:", sourceData);
      return;
    }

    // Dimension validation - error detection 
    if (!originalWidth || !originalHeight || isNaN(originalWidth) || isNaN(originalHeight)) {
      console.error("Error: Image has invalid dimensions.", { originalWidth, originalHeight });
      alert("Error: The image has invalid dimensions (width or height is zero or not a number). Please try a different image.");
      return;
    }

    // Determine if main canvas needs to be resized 
    const shouldUpdateCanvasDimensions = (originalWidth > maxWidth || originalHeight > maxHeight);
    maxWidth = Math.max(maxWidth, originalWidth);
    maxHeight = Math.max(maxHeight, originalHeight);

    // Ensure WASM output buffer is always allocated when canvas dimensions are set or changed
    // This buffer will hold the final merged and processed image that is displayed on the main canvas 
    // !wasmOutputPtr condition to guarantee initial allocation
    if (shouldUpdateCanvasDimensions || !wasmOutputPtr) { 
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        if (wasmOutputPtr) {              // If it was previously allocated, free the old buffer
          wasmModule._free(wasmOutputPtr);
        }
        const newLen = canvas.width * canvas.height * 4;
        wasmOutputPtr = wasmModule._malloc(newLen);
        wasmOutputHeap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, wasmOutputPtr, newLen);
        processedImageData = new ImageData(wasmOutputHeap, canvas.width, canvas.height);
        isImageReady = true;              // Set flag to true once buffers are ready
    }

    // Send raw pixel data over PeerJS (if connections exist)
    // Only send if it's a local upload - DO NOT SEND OTHERWISE as this may cause circular sharing
    if (sourceData instanceof ImageBitmap) { 
        connections.forEach(conn => {
            conn.send({
                type: 'image_binary',
                width: originalWidth,
                height: originalHeight,
                imageDataBuffer: pixelData.buffer
            });
        });
    }

    /**
     * Copy raw pixel data for current image (which will become a new layer) into 
     * a temporary WASM memory location. Purpose: call the C++ function to cache 
     * the pixel data information. 
     */ 


    // Copy pixel data to WASM heap (for the layer)
    const len = pixelData.length;
    const dataPtr = wasmModule._malloc(len);
    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
    heap.set(pixelData);

    // Call WASM to store the layer
    wasmModule.ccall("data_to_layer", null, ["number", "number", "number", "number"],
      [dataPtr, originalWidth, originalHeight, imageIdCounter]);
    // Cleanup after data has been copied and cached in C++ 
    wasmModule._free(dataPtr);

    // Add layer to UI 
    // Create thumbnail for loaded image
    const tempCanvasForUI = document.createElement("canvas");
    tempCanvasForUI.width = originalWidth;
    tempCanvasForUI.height = originalHeight;
    const tempCtxForUI = tempCanvasForUI.getContext("2d");
    const imageDataForUIThumbnail = new ImageData(pixelData, originalWidth, originalHeight);
    tempCtxForUI.putImageData(imageDataForUIThumbnail, 0, 0);
    const imgSrcForUI = tempCanvasForUI.toDataURL();

    // Add visual representation of layer to layer panel in HTML 
    addLayerToUI(imageIdCounter, imgSrcForUI);
    // Track layer order 
    uploadedLayerOrder.push(imageIdCounter);
    // Increment counter for next image 
    imageIdCounter++;

    // Render the merged image on the main canvas
    renderMergedImage(uploadedLayerOrder);
  };

  // Process image data received from another peer 
  handleReceivedImage = (imageData) => {
    maxWidth = Math.max(maxWidth, imageData.width);
    maxHeight = Math.max(maxHeight, imageData.height);
    processImageFile(imageData); 
  };

  /**
   * Handles images uploaded locally. Processes them and shares them with peers. 
   */
  document.getElementById("upload").addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files.length) return;

    // Convert to array so map can be used 
    let loadPromises = Array.from(files).map((file) => {
      // For each file, transform it into a promise to handle concurrent uploads 
      // createImageBitmap is a modern browser API that asynchronously decodes an image file 
      // into an ImageBitmap object 
      // An ImageBitmap is an efficient image representation for drawing to canvas or WebGL 
      return createImageBitmap(file).then(imageBitmap => {
        // Send image data to peers 
        // Add image as new layer in C++ 
        // Add thumbnail to UI in Layers 
        processImageFile(imageBitmap); 
      });
    });

    // Resolve only when all promises in loadPromises have been resolved. 
    Promise.all(loadPromises).then(() => {
        // Once all images have been processed and send to peers, redraw canvas to reflect current state
        renderMergedImage(uploadedLayerOrder);
    });
  });

  /**
   * Takes individual image layers and merge them together for final rendering. 
   * Called whenever a change occurs that requires canvas to be updaded, such as 
   * when a new image is loaded or a filter is applied. 
   * 
   * Notice that instead of rendring every layer, only the layer order information 
   * is passed - since it is guaranteed that the image data is stored in C++, we 
   * only need to reference the image by ID instead of all pixel information. This 
   * saves a lot of time in copying image data to and from memory, and creates a 
   * clear separation between JS and C++. 
   */
  function renderMergedImage(layerOrder) {
    if (!wasmOutputPtr) {
        return;
    }

    const orderPtr = wasmModule._malloc(layerOrder.length * 4);
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, layerOrder.length);
    for (let i = 0; i < layerOrder.length; i++) {
      orderHeap[i] = layerOrder[i];
    }

    wasmModule.ccall("merge_layers", null, ["number", "number", "number", "number", "number"],
      [wasmOutputPtr, canvas.width, canvas.height, orderPtr, layerOrder.length]);

    ctx.putImageData(processedImageData, 0, 0);

    wasmModule._free(orderPtr);
  }

  /**
   * Add layer to layer list in UI. 
   */
  function addLayerToUI(id, src) {
    const li = document.createElement("li");
    li.classList.add("layer-item");
    li.dataset.id = id;
    li.innerHTML = `<img src="${src}" width="50"><br>Layer ${id}`;
    li.addEventListener("click", () => selectLayer(id));
    document.getElementById("layer-list").appendChild(li);
    if (id === 0) {
      selectLayer(id);
    }
  }

  /**
   * Change selected layer. 
   */
  function selectLayer(layerId) {
    selectedLayerId = layerId;
    document.querySelectorAll('.layer-item').forEach(item => {
      item.classList.remove('selected');
    });
    const selectedElement = document.querySelector(`.layer-item[data-id="${layerId}"]`);
    if (selectedElement) {
      selectedElement.classList.add('selected');
    }
    console.log(`Selected layer: ${layerId}`);
  }

  /**
   * Executes image manipulation operations on current canvas and synchronize 
   * these operations across all connected peers. 
   * 
   * operationType is a string that identifies tha name of the operation to perform 
   * payload is an object containing any parameters required for the specific operationType
   * isRemote = false is a flag that indicates if the operation was initiated by the local user
   * 
   * If isRemote = false (the deault), then the operation was initiated by the local user, 
   * and the operation needs to be sent to other connected peers. 
   * If isRemote = true, then the operation was received from another peer. In this case, 
   * the operation is executed locally but NOT re-sent back to the network, preventing infinite loops.
   */
  applyOperationLocally = (operationType, payload, isRemote = false) => {
    // If the image processing isn't ready yet, defer the operation.
    if (!isImageReady || !wasmOutputPtr) {
        console.warn("Image not ready, deferring operation:", operationType);
        // Retry after a short delay. For production, consider a more robust queuing mechanism.
        setTimeout(() => applyOperationLocally(operationType, payload, isRemote), 100);
        return;
    }

    const targetLayerId = payload.layerId !== undefined ? payload.layerId : selectedLayerId;

    const executeAndRender = (cppFunctionName, ...args) => {
      const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);
      const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
      for (let i = 0; i < uploadedLayerOrder.length; i++) {
        orderHeap[i] = uploadedLayerOrder[i];
      }

      const allArgs = [wasmOutputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, targetLayerId, ...args];
      const argTypes = ["number", "number", "number", "number", "number", "number", ...args.map(arg => typeof arg === 'number' ? 'number' : 'float')];

      wasmModule.ccall(cppFunctionName, null, argTypes, allArgs);

      ctx.putImageData(processedImageData, 0, 0);

      wasmModule._free(orderPtr);
    };

    switch (operationType) {
      case 'monochrome_average':
      case 'monochrome_luminosity':
      case 'monochrome_lightness':
      case 'monochrome_itu':
        executeAndRender(operationType);
        break;
      case 'gaussian_blur':
        executeAndRender('gaussian_blur', payload.sigma, payload.kernelSize);
        break;
      case 'edge_sobel':
        executeAndRender('edge_sobel');
        break;
      case 'edge_laplacian_of_gaussian':
        executeAndRender('edge_laplacian_of_gaussian', payload.sigma, payload.kernelSize);
        break;
      case 'bucket_fill':
        executeAndRender('bucket_fill', payload.x, payload.y, payload.r, payload.g, payload.b, payload.a, payload.threshold);
        break;
      case 'quad_compression':
        executeAndRender('quad_compression', payload.newWidth, payload.newHeight);
        break;
      default:
        console.warn(`Unknown operation type received: ${operationType}`);
    }

    if (!isRemote) {
        sendOperationToPeers(operationType, payload);
    }
  };


  // --- Event Listeners: Modified to call applyOperationLocally with operation details ---

  document.getElementById("monochrome_average")
    .addEventListener("click", () => timeOperation("Monochrome (Average)", () => applyOperationLocally("monochrome_average", { layerId: selectedLayerId })));

  document.getElementById("monochrome_luminosity")
    .addEventListener("click", () => timeOperation("Monochrome (Luminosity)", () => applyOperationLocally("monochrome_luminosity", { layerId: selectedLayerId })));

  document.getElementById("monochrome_lightness")
    .addEventListener("click", () => timeOperation("Monochrome (Lightness)", () => applyOperationLocally("monochrome_lightness", { layerId: selectedLayerId })));

  document.getElementById("monochrome_itu")
    .addEventListener("click", () => timeOperation("Monochrome (ITU-R)", () => applyOperationLocally("monochrome_itu", { layerId: selectedLayerId })));


  document.getElementById("blur_gaussian").addEventListener("click", () => {
    timeOperation("Gaussian Blur", () => {
      const sigma = parseFloat(document.getElementById("sigma").value);
      const kernelSize = parseInt(document.getElementById("kernel").value);

      if (isNaN(sigma) || sigma < 0 || sigma > 50) {
        alert("Sigma must be between 0 and 50");
        return;
      }
      if (isNaN(kernelSize) || kernelSize < 1 || kernelSize > 50 || kernelSize % 2 === 0) {
        alert("Kernel size must an odd number be between 1 and 50");
        return;
      }
      applyOperationLocally("gaussian_blur", { layerId: selectedLayerId, sigma, kernelSize });
    });
  });

  document.getElementById("edge_sobel").addEventListener("click", () => {
    timeOperation("Edge Detection (Sobel)", () => {
      applyOperationLocally("edge_sobel", { layerId: selectedLayerId });
    });
  });

  document.getElementById("edge_laplacian_of_gaussian").addEventListener("click", () => {
    timeOperation("Edge Detection (LoG)", () => {
      const sigma = parseFloat(document.getElementById('log_sigma').value);
      let kernelSize = parseInt(document.getElementById('log_kernel').value);

      if (isNaN(sigma) || sigma < 0 || sigma > 50) {
        alert("Sigma must be between 0 and 50");
        return;
      }
      if (isNaN(kernelSize) || kernelSize < 1 || kernelSize > 50 || kernelSize % 2 === 0) {
        alert("Kernel size must an odd number be between 1 and 50");
        return;
      }
      applyOperationLocally("edge_laplacian_of_gaussian", { layerId: selectedLayerId, sigma, kernelSize });
    });
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    timeOperation("Bucket Fill", () => {
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
      const threshold = parseFloat(document.getElementById("error-threshold").value);

      applyOperationLocally("bucket_fill", { layerId: selectedLayerId, x, y, r, g, b, a, threshold });
    });
  });

  const saveToggleBtn = document.getElementById("save-toggle");
  const dropdown = document.getElementById("format-dropdown");

  saveToggleBtn.addEventListener("click", () => {
    dropdown.classList.toggle("hidden");
  });

  dropdown.addEventListener("click", (e) => {
    if (e.target.classList.contains("format-option")) {
      const format = e.target.dataset.format;
      const extension = format === "image/png" ? "png" : "jpg";
      const dataURL = canvas.toDataURL(format);

      const link = document.createElement("a");
      link.href = dataURL;
      link.download = `canvas_output.${extension}`;
      link.click();

      dropdown.classList.add("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("save-controls").contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  document.getElementById("resize_button").addEventListener("click", () => {
    timeOperation("Resize", () => {
      const newWidth = parseInt(document.getElementById("new_width").value);
      const newHeight = parseInt(document.getElementById("new_height").value);

      if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
        alert("Please enter valid width and height values.");
        return;
      }
      applyOperationLocally("quad_compression", { layerId: selectedLayerId, newWidth, newHeight });
    });
  });

});
