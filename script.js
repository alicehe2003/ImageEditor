// WASM module instance
let wasmModule = null;

// Initialize WASM module
async function initWasm() {
    try {
        const response = await fetch('build/video.wasm');
        const bytes = await response.arrayBuffer();
        wasmModule = await WebAssembly.instantiate(bytes, {
            env: {
                memory: new WebAssembly.Memory({ initial: 256 }),
                abort: () => console.log("Abort called")
            }
        });
        console.log("WASM module loaded");
    } catch (err) {
        console.error("Failed to load WASM module:", err);
    }
}

// Process video frames to grayscale
async function processVideoToGrayscale(videoElement) {
    if (!wasmModule) {
        throw new Error("WASM module not loaded");
    }

    // Create canvas to extract frames
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Draw current frame
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // Allocate memory in WASM
    const pixelBuffer = new Uint8Array(wasmModule.exports.memory.buffer);
    const pixelPtr = wasmModule.exports.alloc(pixels.length);
    const wasmPixels = pixelBuffer.subarray(pixelPtr, pixelPtr + pixels.length);
    
    // Copy pixels to WASM memory
    wasmPixels.set(pixels);
    
    // Process in WASM
    wasmModule.exports.grayscale(pixelPtr, canvas.width, canvas.height);
    
    // Copy back to JS
    pixels.set(wasmPixels);
    
    // Free WASM memory
    wasmModule.exports.free(pixelPtr);
    
    // Put processed pixels back
    ctx.putImageData(imageData, 0, 0);
    
    // Return as blob
    return new Promise((resolve) => {
        canvas.toBlob(resolve, 'video/mp4');
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
    
    // Process each video
    for (const video of videos) {
        try {
            video.pause();
            const processedBlob = await processVideoToGrayscale(video);
            
            // Create download link
            const a = document.createElement('a');
            a.className = 'download-link';
            a.href = URL.createObjectURL(processedBlob);
            a.download = `grayscale_${video.parentNode.querySelector('p').textContent}`;
            a.textContent = `Download ${video.parentNode.querySelector('p').textContent}`;
            downloadLinks.appendChild(a);
        } catch (err) {
            console.error('Error processing video:', err);
        }
    }
    
    this.disabled = false;
    this.textContent = 'Process Videos (Grayscale)';
});

// Initialize
initWasm();
