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

// Concurrency control variables
let isLeader = false;
let leaderId = null;
let peerIds = []; // To keep track of all connected peer IDs, including self
let requestQueue = []; // Queue for leader's processing of follower requests
let isLeaderProcessingRequest = false; // Flag to prevent concurrent leader processing

// Follower-specific variables for request management
let pendingRequest = null; // Stores the current request a follower is waiting for approval on
let requestTimeout = null; // Timer for the pending request

// 100 seconds timeout for follower requests 
// TODO: change this to something more reasonable 
const REQUEST_TIMEOUT_MS = 100000; 

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
    peerIds.push(id); // Add self ID to the list
    updateLeader(); // Determine initial leader
  });
  // Triggers when another peer successfully attempts to connect to this client
  peer.on('connection', function(conn) {
    console.log('Incoming connection from: ' + conn.peer);
    connections.push(conn);
    // Add new peer ID only if not already present
    if (!peerIds.includes(conn.peer)) {
        peerIds.push(conn.peer); // Add new peer ID
    }
    updateLeader(); // Re-establish leader on new connection
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
      // Add connected peer ID only if not already present
      if (!peerIds.includes(peerId)) {
        peerIds.push(peerId); // Add connected peer ID
      }
      updateLeader(); // Re-establish leader on new connection
      setupConnectionListeners(conn);
    });
    conn.on('error', function(err) {
      console.error('Connection error:', err);
    });
  }
}

/**
 * Determines the leader among connected peers. The peer with the lowest ID becomes the leader.
 */
function updateLeader() {
  const sortedPeerIds = [...peerIds].sort();
  const oldLeaderId = leaderId;
  leaderId = sortedPeerIds[0];
  isLeader = (peer.id === leaderId);

  if (oldLeaderId !== leaderId) {
    console.log(`Leader changed from ${oldLeaderId || 'N/A'} to ${leaderId}. I am ${isLeader ? 'the LEADER' : 'a FOLLOWER'}.`);
    // If leader changed and I am a follower, re-evaluate pending request
    if (!isLeader && pendingRequest) {
      console.log(`Leader changed. My pending request (${pendingRequest.requestType}) will be retried with the new leader.`);
      clearTimeout(requestTimeout); // Clear old timeout
      requestTimeout = null; // Reset timeout handle
      const requestToRetry = pendingRequest; // Store it for retry
      pendingRequest = null; // Clear pending request
      // Immediately retry the request with the new leader
      sendRequestToLeader(requestToRetry.requestType, requestToRetry.payload);
    }
  } else {
    console.log(`Current leader is ${leaderId}. I am ${isLeader ? 'the LEADER' : 'a FOLLOWER'}.`);
  }

  // If a new leader is elected and this peer is the new leader, process any pending requests
  if (isLeader && oldLeaderId !== leaderId) {
    processRequestQueue();
  }
}

/**
 * Send an operation to all connected peers.
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
 * Send image data to all connected peers.
 */
function sendImageToPeers(width, height, imageDataBuffer, canvasWidth, canvasHeight) {
  connections.forEach(conn => {
    conn.send({
      type: 'image_binary',
      width: width,
      height: height,
      imageDataBuffer: imageDataBuffer,
      // Include the current canvas dimensions of the sender
      canvasWidth: canvasWidth,
      canvasHeight: canvasHeight
    });
  });
}

/**
 * Send a request to the leader.
 */
function sendRequestToLeader(requestType, payload) {
  if (isLeader) {
    console.warn("I am the leader, no need to send request to myself.");
    return;
  }
  if (pendingRequest) {
    console.warn("Already have a pending request. Please wait for the current one to complete.");
    return;
  }

  const leaderConn = connections.find(conn => conn.peer === leaderId);
  if (leaderConn) {
    console.log(`Peer ${peer.id} asking for ${requestType} request to leader ${leaderId}.`);
    pendingRequest = { requestType, payload }; // Store the pending request
    requestTimeout = setTimeout(() => {
      console.error(`Request for ${requestType} to leader ${leaderId} timed out! Assuming leader disconnected.`);
      // Leader likely disconnected or failed to respond.
      // Clear pending request and trigger leader re-election.
      pendingRequest = null;
      requestTimeout = null;
      // Force an update to trigger leader re-election if the leader is truly gone
      // This might not be strictly necessary if conn.on('close') already handles it,
      // but it's a good safeguard for timeout scenarios.
      if (!connections.some(conn => conn.peer === leaderId)) { // If the leader connection is truly gone
          console.log("Leader connection not found, triggering leader re-election.");
          peerIds = peerIds.filter(id => id !== leaderId); // Manually remove timed-out leader from list
          updateLeader(); // Re-elect leader
      }
      alert("Leader did not respond. A new leader will be elected or try connecting again.");
    }, REQUEST_TIMEOUT_MS);

    leaderConn.send({
      type: 'request',
      requestType: requestType,
      payload: payload,
      fromPeerId: peer.id
    });
  } else {
    console.error(`Could not find connection to leader ${leaderId}. Cannot send request.`);
    alert("Cannot connect to leader. Please ensure leader is online and try connecting again.");
    pendingRequest = null; // Clear pending request if no leader connection found
    clearTimeout(requestTimeout); // Clear timeout
    requestTimeout = null; // Reset timeout handle
  }
}

/**
 * Send an approval or rejection to a follower.
 */
function sendResponseToFollower(followerId, requestType, approved, payload = {}) {
  const followerConn = connections.find(conn => conn.peer === followerId);
  if (followerConn) {
    console.log(`Leader ${peer.id} sending ${approved ? 'approval' : 'rejection'} for ${requestType} to follower ${followerId}.`);
    followerConn.send({
      type: 'response',
      requestType: requestType,
      approved: approved,
      payload: payload
    });
  } else {
    console.error(`Could not find connection to follower ${followerId}.`);
  }
}

/**
 * Handles incoming requests from followers if this peer is the leader.
 */
async function handleFollowerRequest(data) {
  console.log(`Leader ${peer.id} received a ${data.requestType} request from ${data.fromPeerId}.`);
  // Add request to queue
  requestQueue.push(data);
  processRequestQueue();
}

/**
 * Processes requests in the queue if the leader is not currently processing another request.
 */
async function processRequestQueue() {
  if (isLeader && !isLeaderProcessingRequest && requestQueue.length > 0) {
    isLeaderProcessingRequest = true;
    const request = requestQueue.shift(); // Get the first request
    const { requestType, payload, fromPeerId } = request;

    switch (requestType) {
      case 'upload_image_request':
        // Leader processes image locally
        const imageDataForLeader = new ImageData(new Uint8ClampedArray(payload.imageDataBuffer), payload.width, payload.height);
        // Using a promise to ensure processImageFile completes before sending approval/broadcast
        await new Promise(resolve => {
          // Process the image. We assume processImageFile might have async parts or takes time.
          processImageFile(imageDataForLeader, true); // true to indicate it's a leader's processing from a follower request
          resolve();
        });

        // Then leader sends approval to the follower
        sendResponseToFollower(fromPeerId, 'upload_image_request', true, {
          width: payload.width,
          height: payload.height,
          imageDataBuffer: payload.imageDataBuffer,
          canvasWidth: payload.canvasWidth,
          canvasHeight: payload.canvasHeight,
          imageId: imageIdCounter -1 // The ID assigned to the new image layer
        });

        // Leader then broadcasts the image to all other followers
        sendImageToPeers(payload.width, payload.height, payload.imageDataBuffer, payload.canvasWidth, payload.canvasHeight);
        break;
      case 'apply_operation_request':
        // Leader applies operation locally
        applyOperationLocally(payload.operationType, payload.payload, true); // true for isRemote, as it originates from another peer's request

        // Leader then sends approval to the follower
        sendResponseToFollower(fromPeerId, 'apply_operation_request', true, {
          operationType: payload.operationType,
          payload: payload.payload
        });

        // Leader then broadcasts the operation to all other followers
        sendOperationToPeers(payload.operationType, payload.payload);
        break;
      default:
        console.warn(`Unknown request type received by leader: ${requestType}`);
        sendResponseToFollower(fromPeerId, requestType, false); // Reject unknown requests
    }
    isLeaderProcessingRequest = false;
    // Process next request in queue
    processRequestQueue(); // Immediately try to process the next request
  }
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
    if (data.type === 'image_binary') {
      // Extract image data buffer from received message
      const receivedDataFromPeer = data.imageDataBuffer;

      if (receivedDataFromPeer && receivedDataFromPeer.buffer instanceof ArrayBuffer) {
        // Update local maxWidth and maxHeight based on sender's canvas dimensions
        // This is crucial for resizing the canvas on the receiving peer
        maxWidth = Math.max(maxWidth, data.canvasWidth);
        maxHeight = Math.max(maxHeight, data.canvasHeight);

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
    } else if (data.type === 'request' && isLeader) {
        // Only the leader processes requests
        handleFollowerRequest(data);
    } else if (data.type === 'response' && !isLeader) {
        // Only followers process responses
        // Clear the timeout and pending request upon receiving a response
        clearTimeout(requestTimeout);
        requestTimeout = null;
        pendingRequest = null;

        console.log(`Peer ${peer.id} received approval for ${data.requestType} from leader ${leaderId}.`);
        if (data.approved) {
          if (data.requestType === 'upload_image_request') {
            // Reconstruct and process the image, but don't re-send it
            // The image data buffer sent in the response is an ArrayBuffer, convert it
            const receivedUint8ClampedArray = new Uint8ClampedArray(data.payload.imageDataBuffer);
            const receivedImageData = new ImageData(receivedUint8ClampedArray, data.payload.width, data.payload.height);
            processImageFile(receivedImageData, false, data.payload.imageId); // false for isLocalUpload, providing imageId
          } else if (data.requestType === 'apply_operation_request') {
            // Apply the operation received from leader's approval
            applyOperationLocally(data.payload.operationType, data.payload.payload, true); // isRemote is true
          }
        } else {
          console.warn(`Request for ${data.requestType} was rejected by leader.`);
          alert(`Your request for ${data.requestType} was rejected by the leader.`);
        }
    }
  });

  // Triggers when connection with specific peer is closed
  conn.on('close', function() {
    console.log('Connection closed with: ' + conn.peer);
    // Updates global connections array by removing the closed connection
    connections = connections.filter(c => c.peer !== conn.peer);
    peerIds = peerIds.filter(id => id !== conn.peer); // Remove closed peer ID
    updateLeader(); // Re-establish leader on connection close
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
   *
   * @param {ImageBitmap|ImageData} sourceData - The image data to process.
   * @param {boolean} isLeaderProcessingFollowerRequest - True if this is the leader processing a request from a follower.
   * @param {number} [predefinedImageId] - Optional image ID to use for the new layer, useful for syncing follower images.
   */
  processImageFile = (sourceData, isLeaderProcessingFollowerRequest = false, predefinedImageId = null) => {
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
      // When image is shared by peer or approved by leader
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

    // Assign imageId. If it's a predefined ID (from leader's approval), use it. Otherwise, use counter.
    // If it's a leader processing a follower's request, the imageIdCounter is already incremented on the follower.
    // For syncing, we need to ensure the leader and follower use the same ID.
    // This logic assumes `imageIdCounter` is the next available ID.
    const currentImageId = predefinedImageId !== null ? predefinedImageId : imageIdCounter;


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
      [dataPtr, originalWidth, originalHeight, currentImageId]);
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

    // Only add if not already present (prevents duplicates when leader approves)
    if (!uploadedLayerOrder.includes(currentImageId)) {
        addLayerToUI(currentImageId, imgSrcForUI);
        // Track layer order
        uploadedLayerOrder.push(currentImageId);
        // Only increment counter if it's a new image being processed (local upload or leader processing)
        // Ensure imageIdCounter is advanced only once for a given image, whether local or remote
        if (predefinedImageId === null) { // This means it's a new image locally initiating or leader processing
            imageIdCounter++;
        }
    }


    // Render the merged image on the main canvas
    renderMergedImage(uploadedLayerOrder);
  };

  // Process image data received from another peer
  handleReceivedImage = (imageData) => {
    // maxWidth and maxHeight are already updated in setupConnectionListeners based on sender's canvas dimensions
    // Now ensure the canvas is resized if necessary using these updated dimensions.
    const shouldUpdateCanvasDimensions = (imageData.width > canvas.width || imageData.height > canvas.height);

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
    // Note: When a follower receives an image broadcast by the leader, it should process it without
    // attempting to re-send it or request approval. The `processImageFile` function
    // with its default parameters (isLeaderProcessingFollowerRequest=false, predefinedImageId=null)
    // will add it as a new layer.
    // The imageIdCounter will correctly increment for the receiving peer as well.
    processImageFile(imageData);
  };

  /**
   * Handles images uploaded locally. Processes them and shares them with peers (or requests leader approval).
   */
  document.getElementById("upload").addEventListener("change", (e) => {
    const files = e.target.files;
    if (!files.length) return;

    Array.from(files).forEach((file) => {
      createImageBitmap(file).then(imageBitmap => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = imageBitmap.width;
        tempCanvas.height = imageBitmap.height;
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
        tempCtx.drawImage(imageBitmap, 0, 0);
        const tempImageData = tempCtx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
        const pixelData = tempImageData.data;

        if (isLeader) {
          // If I am the leader, process locally and then broadcast
          processImageFile(imageBitmap);
          sendImageToPeers(imageBitmap.width, imageBitmap.height, pixelData.buffer, canvas.width, canvas.height);
        } else {
          // If I am a follower, request leader's approval
          sendRequestToLeader('upload_image_request', {
            width: imageBitmap.width,
            height: imageBitmap.height,
            imageDataBuffer: pixelData.buffer,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height
          });
        }
      });
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
   * If isRemote = false (the default), then the operation was initiated by the local user,
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

    // Get selected layer for operation (either current local layer, or remotely defined layer)
    const targetLayerId = payload.layerId !== undefined ? payload.layerId : selectedLayerId;

    const executeAndRender = (cppFunctionName, ...args) => {
      // Prepare layer order for WASM
      const orderPtr = wasmModule._malloc(uploadedLayerOrder.length * 4);
      const orderHeap = new Int32Array(wasmModule.HEAPU8.buffer, orderPtr, uploadedLayerOrder.length);
      for (let i = 0; i < uploadedLayerOrder.length; i++) {
        orderHeap[i] = uploadedLayerOrder[i];
      }

      // Construct arguments for WASM call
      const allArgs = [wasmOutputPtr, canvas.width, canvas.height, orderPtr, uploadedLayerOrder.length, targetLayerId, ...args];
      const argTypes = ["number", "number", "number", "number", "number", "number", ...args.map(arg => typeof arg === 'number' ? 'number' : 'float')];

      // Call WASM function
      wasmModule.ccall(cppFunctionName, null, argTypes, allArgs);

      // Update canvas with processed image
      ctx.putImageData(processedImageData, 0, 0);

      // Free temporary WASM memory
      wasmModule._free(orderPtr);
    };

    // Operation dispath
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

    // Only send operation to peers if operation was initiated by the local user and this peer is the leader
    // For remote operations (isRemote is true), it means the leader has already processed and broadcasted it.
    if (!isRemote && isLeader) {
        sendOperationToPeers(operationType, payload);
    }
  };


  // Event Listeners: call applyOperationLocally with operation details to ensure both applied locally and remotely

  // Helper function to handle operation clicks
  const handleOperationClick = (operationType, getPayload) => {
    timeOperation(operationType, () => {
      const payload = getPayload();
      if (isLeader) {
        applyOperationLocally(operationType, payload); // Leader applies and broadcasts
      } else {
        // Follower requests leader approval
        sendRequestToLeader('apply_operation_request', { operationType, payload });
      }
    });
  };


  document.getElementById("monochrome_average")
    .addEventListener("click", () => handleOperationClick("monochrome_average", () => ({ layerId: selectedLayerId })));

  document.getElementById("monochrome_luminosity")
    .addEventListener("click", () => handleOperationClick("monochrome_luminosity", () => ({ layerId: selectedLayerId })));

  document.getElementById("monochrome_lightness")
    .addEventListener("click", () => handleOperationClick("monochrome_lightness", () => ({ layerId: selectedLayerId })));

  document.getElementById("monochrome_itu")
    .addEventListener("click", () => handleOperationClick("monochrome_itu", () => ({ layerId: selectedLayerId })));


  document.getElementById("blur_gaussian").addEventListener("click", () => {
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
    handleOperationClick("gaussian_blur", () => ({ layerId: selectedLayerId, sigma, kernelSize }));
  });

  document.getElementById("edge_sobel").addEventListener("click", () => {
    handleOperationClick("edge_sobel", () => ({ layerId: selectedLayerId }));
  });

  document.getElementById("edge_laplacian_of_gaussian").addEventListener("click", () => {
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
    handleOperationClick("edge_laplacian_of_gaussian", () => ({ layerId: selectedLayerId, sigma, kernelSize }));
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvas.clientWidth;
    const scaleY = canvas.height / canvas.clientHeight;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

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

    handleOperationClick("bucket_fill", () => ({ layerId: selectedLayerId, x, y, r, g, b, a, threshold }));
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
    const newWidth = parseInt(document.getElementById("new_width").value);
    const newHeight = parseInt(document.getElementById("new_height").value);

    if (isNaN(newWidth) || isNaN(newHeight) || newWidth <= 0 || newHeight <= 0) {
      alert("Please enter valid width and height values.");
      return;
    }
    handleOperationClick("quad_compression", () => ({ layerId: selectedLayerId, newWidth, newHeight }));
  });
});
