let Module = null;

// Initialize WASM module
async function initWasm() {
    // The window.Module object will be populated by the video.js script
    // Set up configuration before loading the script
    window.Module = {
        onRuntimeInitialized: function() {
            console.log("WASM runtime initialized");
            Module = window.Module;
            document.getElementById('status-message').textContent = "WASM Module loaded - ready to process videos";
            document.getElementById('process-btn').disabled = false;
        },
        print: function(text) {
            console.log("WASM output:", text);
        },
        printErr: function(text) {
            console.error("WASM error:", text);
        }
    };
    
    try {
        // Load the JavaScript glue code that Emscripten generated
        const script = document.createElement('script');
        script.src = 'build/video.js';
        script.onerror = () => {
            document.getElementById('status-message').textContent = 
                "Error: Failed to load WASM module. Make sure build/video.js exists.";
            console.error("Failed to load WASM module script");
        };
        document.body.appendChild(script);
    } catch (err) {
        document.getElementById('status-message').textContent = 
            "Error initializing WASM: " + err.message;
        console.error("Error initializing WASM:", err);
    }
}

// Process a single frame to grayscale
function processFrameToGrayscale(ctx, width, height) {
    if (!Module || !Module._grayscale) {
        throw new Error("WASM module not loaded or grayscale function not found");
    }
    
    // Get image data from canvas
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    
    // Allocate memory in WASM
    const pixelPtr = Module._alloc(pixels.length);
    
    // Copy pixels to WASM memory
    Module.HEAPU8.set(pixels, pixelPtr);
    
    // Process in WASM
    Module._grayscale(pixelPtr, width, height);
    
    // Copy back to JS
    pixels.set(Module.HEAPU8.subarray(pixelPtr, pixelPtr + pixels.length));
    
    // Free WASM memory
    Module._freeMemory(pixelPtr);
    
    // Put processed pixels back
    ctx.putImageData(imageData, 0, 0);
}

// Process entire video by processing each frame
async function processVideoToGrayscale(videoElement) {
    return new Promise(async (resolve, reject) => {
        try {
            // Create canvas for video processing
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            
            // Set up MediaRecorder for capturing output
            let stream;
            try {
                stream = canvas.captureStream();
            } catch (e) {
                throw new Error("Canvas.captureStream() not supported in this browser");
            }
            
            // Check for MediaRecorder support
            if (!window.MediaRecorder) {
                throw new Error("MediaRecorder not supported in this browser");
            }
            
            // Try different MIME types for compatibility
            let mimeType = 'video/webm';
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                mimeType = 'video/webm;codecs=vp9';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
                mimeType = 'video/webm;codecs=vp8';
            } else if (!MediaRecorder.isTypeSupported('video/webm')) {
                throw new Error("No supported video recording format found");
            }
            
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 5000000
            });
            
            // Array to hold recorded chunks
            const recordedChunks = [];
            
            // Save recorded data
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            };
            
            // When recording completes
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: mimeType });
                resolve(blob);
            };
            
            // Create a progress display
            const progressDisplay = document.createElement('div');
            progressDisplay.className = 'progress-display';
            progressDisplay.textContent = 'Processing: 0%';
            videoElement.parentNode.appendChild(progressDisplay);
            
            // Start recording
            mediaRecorder.start(1000); // Capture in 1-second chunks for better performance
            
            // Reset video and wait for it to be ready
            videoElement.currentTime = 0;
            await new Promise(resolve => {
                videoElement.oncanplay = resolve;
            });
            
            // Start playback
            const playPromise = videoElement.play();
            if (playPromise) {
                await playPromise.catch(err => {
                    console.error("Video play error:", err);
                    // Try to recover by muting the video and trying again
                    videoElement.muted = true;
                    return videoElement.play();
                });
            }
            
            // Process frame by frame
            const processNextFrame = () => {
                if (videoElement.ended || videoElement.paused) {
                    mediaRecorder.stop();
                    progressDisplay.remove();
                    return;
                }
                
                // Draw current frame
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                
                try {
                    // Process frame
                    processFrameToGrayscale(ctx, canvas.width, canvas.height);
                } catch (err) {
                    console.error("Frame processing error:", err);
                }
                
                // Update progress
                const progress = Math.floor((videoElement.currentTime / videoElement.duration) * 100);
                progressDisplay.textContent = `Processing: ${progress}%`;
                
                // Request next frame
                requestAnimationFrame(processNextFrame);
            };
            
            // Start processing
            processNextFrame();
            
        } catch (error) {
            reject(error);
        }
    });
}

// Handle file upload
document.getElementById('video-upload').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    const videoContainer = document.getElementById('video-container');
    videoContainer.innerHTML = '';
    
    files.forEach(file => {
        if (!file.type.startsWith('video/')) return;
        
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        
        const video = document.createElement('video');
        video.controls = true;
        video.src = URL.createObjectURL(file);
        
        const p = document.createElement('p');
        p.textContent = file.name;
        
        videoItem.appendChild(video);
        videoItem.appendChild(p);
        videoContainer.appendChild(videoItem);
    });
});

// Process button click
document.getElementById('process-btn').addEventListener('click', async function() {
    const videos = document.querySelectorAll('.video-item video');
    if (videos.length === 0) {
        alert('Please upload videos first');
        return;
    }
    
    this.disabled = true;
    this.textContent = 'Processing...';
    
    const downloadSection = document.getElementById('download-section');
    const downloadLinks = document.getElementById('download-links');
    downloadSection.style.display = 'block';
    downloadLinks.innerHTML = '';
    
    // Process each video one by one
    for (const video of videos) {
        try {
            // Ensure video is loaded
            if (video.readyState < 2) {
                await new Promise(resolve => {
                    video.onloadeddata = resolve;
                });
            }
            
            // Create status message
            const statusElement = document.createElement('p');
            statusElement.textContent = `Processing ${video.parentNode.querySelector('p').textContent}...`;
            downloadLinks.appendChild(statusElement);
            
            // Process the video
            const processedBlob = await processVideoToGrayscale(video);
            
            // Remove status message
            downloadLinks.removeChild(statusElement);
            
            // Create download link
            const a = document.createElement('a');
            a.className = 'download-link';
            a.href = URL.createObjectURL(processedBlob);
            a.download = `grayscale_${video.parentNode.querySelector('p').textContent}`;
            a.textContent = `Download ${video.parentNode.querySelector('p').textContent} (Grayscale)`;
            downloadLinks.appendChild(a);
        } catch (err) {
            console.error('Error processing video:', err);
            const errorMsg = document.createElement('p');
            errorMsg.style.color = 'red';
            errorMsg.textContent = `Error processing ${video.parentNode.querySelector('p').textContent}: ${err.message}`;
            downloadLinks.appendChild(errorMsg);
        }
    }
    
    this.disabled = false;
    this.textContent = 'Process Videos (Grayscale)';
});

// Add some CSS for the progress display
const style = document.createElement('style');
style.textContent = `
.progress-display {
    margin-top: 10px;
    padding: 5px;
    background-color: #f0f0f0;
    border-radius: 4px;
    text-align: center;
}
`;
document.head.appendChild(style);

// Add a status message to the page
const statusMessage = document.createElement('div');
statusMessage.id = 'status-message';
statusMessage.style.margin = '10px 0';
statusMessage.style.padding = '5px';
statusMessage.style.backgroundColor = '#eef';
statusMessage.style.borderRadius = '4px';
statusMessage.textContent = 'Loading WASM module...';
document.querySelector('.upload-section').appendChild(statusMessage);

// Disable the process button until WASM is loaded
document.getElementById('process-btn').disabled = true;

// Initialize
initWasm();
