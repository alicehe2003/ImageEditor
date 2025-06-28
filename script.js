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
      const originalWidth = img.width;
      const originalHeight = img.height;
      maxWidth = Math.max(maxWidth, originalWidth);
      maxHeight = Math.max(maxHeight, originalHeight);

      // Draw this image onto a temp canvas to extract pixel data
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = originalWidth;
      tempCanvas.height = originalHeight;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
      tempCtx.drawImage(img, 0, 0);

      const tempImageData = tempCtx.getImageData(0, 0, originalWidth, originalHeight);
      const pixelData = tempImageData.data; // This is a Uint8ClampedArray

      const len = pixelData.length;
      const dataPtr = wasmModule._malloc(len); // Allocate memory in WASM heap
      const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len); // Create a view
      heap.set(pixelData); // Copy pixel data to WASM heap

      wasmModule.ccall("data_to_layer", null, ["number", "number", "number", "number"],
        [dataPtr, originalWidth, originalHeight, imageIdCounter]);
      wasmModule._free(dataPtr); // Free the temporary buffer after copying to Layer struct

      addLayerToUI(imageIdCounter, img.src);
      uploadedLayerOrder.push(imageIdCounter);
      imageIdCounter++;

      // Update canvas dimensions and re-render only if max dimensions change
      if (canvas.width !== maxWidth || canvas.height !== maxHeight) {
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        // Reallocate persistent output buffer if canvas size changes
        if (wasmOutputPtr) {
          wasmModule._free(wasmOutputPtr);
        }
        const newLen = canvas.width * canvas.height * 4;
        wasmOutputPtr = wasmModule._malloc(newLen);
        wasmOutputHeap = new Uint8ClampedArray(wasmModule.HEAPU8.buffer, wasmOutputPtr, newLen);
        processedImageData = new ImageData(wasmOutputHeap, canvas.width, canvas.height);
      }
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
    // Use Promise.all to ensure all images are processed before rendering the final merged image
    // Helps with consistency if multiple images are uploaded at once
    let loadPromises = fileArray.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageSrc = event.target.result;
          // Share the image with connected peers
          connections.forEach(conn => {
            conn.send({ type: 'image', imageSrc: imageSrc });
          });
          // Process the image locally as well
          processImageFile(imageSrc); // This will update maxWidth/maxHeight and layers
          resolve();
        };
        reader.readAsDataURL(file);
      });
    });

    // After all files are processed and layers added, render the final merged image
    Promise.all(loadPromises).then(() => {
        // Dimensions and output buffer are already updated in processImageFile calls
        // Just re-render
        renderMergedImage(uploadedLayerOrder);
    });
  });

  // Centralized function to call WASM merge_layers and render
  function renderMergedImage(layerOrder) {
    if (!wasmOutputPtr) {
        // If no images loaded yet, or canvas not initialized, do nothing
        return;
    }

    const orderPtr = wasmModule._malloc(layerOrder.length * 4);
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, layerOrder.length);
    for (let i = 0; i < layerOrder.length; i++) {
      orderHeap[i] = layerOrder[i];
    }

    // Call WASM function to merge layers directly into wasmOutputPtr
    wasmModule.ccall("merge_layers", null, ["number", "number", "number", "number", "number"],
      [wasmOutputPtr, canvas.width, canvas.height, orderPtr, layerOrder.length]);

    // Now, putImageData directly uses the wasmOutputHeap (which is backed by wasmOutputPtr)
    ctx.putImageData(processedImageData, 0, 0);

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

  // Helper function to apply any filter that modifies a layer and then re-renders
  function applyFilterAndRender(cppFunctionName, ...args) {
    if (!wasmOutputPtr) {
      console.warn("No image loaded yet to apply filter.");
      return;
    }

    const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);
    const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
    for (let i = 0; i < uploadedLayerOrder.length; i++) {
      orderHeap[i] = uploadedLayerOrder[i];
    }

    // Call the WASM function
    wasmModule.ccall(cppFunctionName, null,
      ["number", "number", "number", "number", "number", "number", ...args.map(arg => typeof arg === 'number' ? 'number' : 'float')], // Adjust types dynamically
      [wasmOutputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, selectedLayerId, ...args]);

    ctx.putImageData(processedImageData, 0, 0); // Render from the same ImageData object

    wasmModule._free(orderPtr);
  }

  // Attach event listeners for each monochrome button
  document.getElementById("monochrome_average")
    .addEventListener("click", () => timeOperation("Monochrome (Average)", () => applyFilterAndRender("monochrome_average")));

  document.getElementById("monochrome_luminosity")
    .addEventListener("click", () => timeOperation("Monochrome (Luminosity)", () => applyFilterAndRender("monochrome_luminosity")));

  document.getElementById("monochrome_lightness")
    .addEventListener("click", () => timeOperation("Monochrome (Lightness)", () => applyFilterAndRender("monochrome_lightness")));

  document.getElementById("monochrome_itu")
    .addEventListener("click", () => timeOperation("Monochrome (ITU-R)", () => applyFilterAndRender("monochrome_itu")));


  // Attach event listener for the gaussian blur button
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
      applyFilterAndRender("gaussian_blur", sigma, kernelSize);
    });
  });

  // Attach event listener for the sobel button
  document.getElementById("edge_sobel").addEventListener("click", () => {
    timeOperation("Edge Detection (Sobel)", () => {
      applyFilterAndRender("edge_sobel");
    });
  });

  // Attach event listener for the Laplacian of Gaussian button
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
      applyFilterAndRender("edge_laplacian_of_gaussian", sigma, kernelSize);
    });
  });

  // Attach event listener for when user clicks on the canvas to use bucket tool
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

      // Note: bucket_fill expects threshold in [0, 100] as per your C++ code's internal scaling
      applyFilterAndRender("bucket_fill", x, y, r, g, b, a, threshold);
    });
  });

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
      const extension = format === "image/png" ? "png" : "jpg";
      const dataURL = canvas.toDataURL(format); // This captures the current canvas content

      const link = document.createElement("a");
      link.href = dataURL;
      link.download = `canvas_output.${extension}`;
      link.click();

      dropdown.classList.add("hidden");
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

      if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
        alert("Please enter valid width and height values.");
        return;
      }
      applyFilterAndRender("quad_compression", newWidth, newHeight);
    });
  });

});
