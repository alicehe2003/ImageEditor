let wasmModule;

Module.onRuntimeInitialized = () => {
    wasmModule = Module;
};

function addNumbers() {
    const a = parseInt(document.getElementById("num1").value);
    const b = parseInt(document.getElementById("num2").value);
    // Call the WASM function
    const result = wasmModule._add(a, b); 
    document.getElementById("result").innerText = `Result: ${result}`;
}


document.addEventListener('DOMContentLoaded', () => {
    const videoInput = document.getElementById('videoUploader');
    const timelineStrip = document.getElementById('timelineStrip');
    const mainPreview = document.getElementById('mainPreview');
    const playhead = document.getElementById('playhead');
    const timelineContainer = document.getElementById('timelineContainer');
    const aspectRatioSelect = document.getElementById('aspectRatio');
    
    let videos = [];
    let videoDurations = [];
    let totalDuration = 0;
    let isDragging = false;
    // 1 frame every 2 seconds
    let framesPerSecond = 0.5; 
    let frameWidth = 120; // Increased frame width from 40 to 120 for wider timeline pictures
    
    // Handle aspect ratio changes 
    aspectRatioSelect.addEventListener('change', function() {
        applyAspectRatio(this.value); 
    }); 

    // Apply selected aspect ration to the main preview 
    function applyAspectRatio(ratio) {
        const container = document.getElementById('mainPreviewContainer'); 
        const video = mainPreview; 

        if (!video) return; 

        // Reset any previous styling
        video.style.width = '';
        video.style.height = '';
        
        // Extract width and height from ratio (e.g., "16:9", "4:3")
        const [w, h] = ratio.split(':').map(Number);
        const baseWidth = 640; // Base width
        const calculatedHeight = baseWidth * (h / w);
        
        // Apply new dimensions
        video.style.width = baseWidth + 'px';
        video.style.height = calculatedHeight + 'px';
    }

    // Handle file upload
    videoInput.addEventListener('change', async function() {
        // Convert to array of (video) files 
        const files = Array.from(this.files);

        for (const file of files) {
            if (file.type.startsWith('video/')) {
                const videoURL = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.src = videoURL;
                
                // Wait for video metadata to load
                await new Promise((resolve) => {
                    video.addEventListener('loadedmetadata', resolve);
                    video.load();
                });
                
                videos.push({
                    element: video,
                    url: videoURL,
                    duration: video.duration,
                    name: file.name
                });
                
                videoDurations.push(video.duration);
                totalDuration += video.duration;
            }
        }
        
        if (videos.length > 0) {
            createTimelineStrip();
            // Pass false to indicate no autoplay 
            setupMainVideo(false);
            // Apply currently selected aspect ratio 
            applyAspectRatio(aspectRatioSelect.value); 
        }
        
        // Reset videoInput, clearing file selection - allows re-selection of the same file
        this.value = '';
    });
    
    // Create the timeline strip with frames
    function createTimelineStrip() {
        timelineStrip.innerHTML = '';
        
        for (const video of videos) {
            video.element.style.transform = '';
        }

        // Calculate total number of frames needed
        const totalFrames = Math.ceil(totalDuration * framesPerSecond);
        
        // Set the width of the timeline strip - calculate exact width based on all frames
        const timelineWidth = totalFrames * frameWidth;
        timelineStrip.style.width = `${timelineWidth}px`;
        
        // Create frames for each video
        let currentPosition = 0;
        
        videos.forEach((video, videoIndex) => {
            const framesForVideo = Math.ceil(video.duration * framesPerSecond);
            const videoElement = video.element;
            
            videoElement.style.transform = '';
            
            // Create a marker showing where this video starts and ends
            const marker = document.createElement('div');
            marker.className = 'video-marker';
            marker.style.left = `${currentPosition * frameWidth}px`;
            marker.style.width = `${framesForVideo * frameWidth}px`;
            timelineStrip.appendChild(marker);
            
            // Add video label
            const label = document.createElement('div');
            label.className = 'video-label';
            label.style.left = `${currentPosition * frameWidth}px`;
            label.textContent = video.name;
            timelineStrip.appendChild(label);
            
            // Create frames
            for (let i = 0; i < framesForVideo; i++) {
                const frameTime = i / framesPerSecond;
                const frame = document.createElement('div');
                frame.className = 'frame';
                
                // For the last frame of a video, check if it's a partial frame
                if (i === framesForVideo - 1 && video.duration % (1/framesPerSecond) !== 0) {
                    // Calculate what fraction of a frame this represents
                    const fraction = (video.duration % (1/framesPerSecond)) / (1/framesPerSecond);
                    frame.style.width = `${frameWidth * fraction}px`;
                } else {
                    frame.style.width = `${frameWidth}px`;
                }
                
                // Capture frame at this time
                captureFrame(videoElement, frameTime).then(url => {
                    frame.style.backgroundImage = `url(${url})`;
                });
                
                frame.dataset.videoIndex = videoIndex;
                frame.dataset.frameTime = frameTime;
                frame.dataset.globalTime = (currentPosition / framesPerSecond) + frameTime;
                
                timelineStrip.appendChild(frame);
                currentPosition++;
            }
        });
    
        // Setup playhead dragging
        setupPlayheadInteraction();
    }
    
    // Capture a frame from a video at a specific time
    function captureFrame(video, time) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            // Increase canvas width to match our wider frames
            canvas.width = 240; 
            canvas.height = 180; 
            const ctx = canvas.getContext('2d');
            
            video.currentTime = time;
            
            video.addEventListener('seeked', function() {
                // Draw the video frame 
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL());
            }, { once: true });
        });
    }
    
    // Setup the main video player with all videos concatenated
    function setupMainVideo(autoplay = false) {
        if (videos.length === 0) return;
        
        mainPreview.src = videos[0].url;
        mainPreview.currentTime = 0;
        mainPreview.style.transform = ''; 

        // Pause at start 
        mainPreview.pause(); 
        
        // Update playhead position as video plays
        mainPreview.addEventListener('timeupdate', updatePlayheadPosition);
        
        // When video ends, play next video if available
        mainPreview.addEventListener('ended', playNextVideo);

        // Apply current aspect ratio
        applyAspectRatio(aspectRatioSelect.value);
    }
    
    function playNextVideo() {
        const currentIndex = videos.findIndex(v => v.url === mainPreview.src);
        if (currentIndex < videos.length - 1) {
            mainPreview.src = videos[currentIndex + 1].url;
            mainPreview.play();
        }
    }
    
    // Update playhead position based on current video time
    function updatePlayheadPosition() {
        const currentVideo = videos.find(v => v.url === mainPreview.src);
        if (!currentVideo) return;
        
        const videoIndex = videos.indexOf(currentVideo);
        let globalTime = 0;
        
        // Calculate global time by adding durations of previous videos
        for (let i = 0; i < videoIndex; i++) {
            globalTime += videos[i].duration;
        }
        
        globalTime += mainPreview.currentTime;
        
        // Position playhead - adjusted calculation to ensure accurate positioning
        const playheadPosition = (globalTime * framesPerSecond) * frameWidth;
        playhead.style.left = `${playheadPosition}px`;
        
        // Scroll timeline to keep playhead visible
        const containerWidth = timelineContainer.clientWidth;
        const scrollLeft = timelineContainer.scrollLeft;
        
        if (playheadPosition < scrollLeft || playheadPosition > scrollLeft + containerWidth) {
            timelineContainer.scrollLeft = playheadPosition - containerWidth / 2;
        }
    }
    
    // Setup playhead dragging interaction
    function setupPlayheadInteraction() {
        playhead.addEventListener('mousedown', (e) => {
            isDragging = true;
            document.addEventListener('mousemove', movePlayhead);
            document.addEventListener('mouseup', stopDrag);
            e.preventDefault();
        });
        
        timelineContainer.addEventListener('click', (e) => {
            if (isDragging) return;
            
            const rect = timelineContainer.getBoundingClientRect();
            const x = e.clientX - rect.left + timelineContainer.scrollLeft;
            const globalTime = x / (framesPerSecond * frameWidth);
            
            seekToGlobalTime(globalTime);
        });
    }
    
    function movePlayhead(e) {
        if (!isDragging) return;
        
        const rect = timelineContainer.getBoundingClientRect();
        let x = e.clientX - rect.left + timelineContainer.scrollLeft;
        
        // Constrain to timeline boundaries
        const maxX = totalDuration * framesPerSecond * frameWidth;
        x = Math.max(0, Math.min(x, maxX));
        
        const globalTime = x / (framesPerSecond * frameWidth);
        
        // Update playhead position
        playhead.style.left = `${x}px`;
        
        // Seek video to this time
        seekToGlobalTime(globalTime, false); // Pass false to prevent autoplay
    }
    
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', movePlayhead);
        document.removeEventListener('mouseup', stopDrag);
    }
    
    // Seek to a specific global time across all videos
    function seekToGlobalTime(globalTime, shouldPlay = false) {
        let accumulatedTime = 0;
        let targetVideoIndex = 0;
        let targetTime = 0;
        
        // Find which video contains this global time
        for (let i = 0; i < videos.length; i++) {
            if (globalTime <= accumulatedTime + videos[i].duration) {
                targetVideoIndex = i;
                targetTime = globalTime - accumulatedTime;
                break;
            }
            accumulatedTime += videos[i].duration;
        }
        
        // If time is beyond all videos, use last video's end
        if (globalTime >= totalDuration) {
            targetVideoIndex = videos.length - 1;
            targetTime = videos[targetVideoIndex].duration;
        }
        
        // Play the target video
        const targetVideo = videos[targetVideoIndex];
        mainPreview.src = targetVideo.url;
        mainPreview.currentTime = targetTime;
        
        // Only play if explicitly requested
        if (shouldPlay) {
            mainPreview.play();
        } else {
            mainPreview.pause();
        }
    }

    // Initialize with default aspect ratio
    applyAspectRatio(aspectRatioSelect.value);
});
