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


// DOM is loaded 
document.addEventListener('DOMContentLoaded', () => {
    // Upload and display video 
    const videoInput = document.getElementById('videoUploader'); 
    const videoContainer = document.getElementById('videoContainer'); 

    videoInput.addEventListener('change', function () {
        // Convert FileList to Array
        const files = Array.from(this.files);  

        files.forEach(file => {
            if (file.type.startsWith('video/')) {
                const videoURL = URL.createObjectURL(file); 

                // Create a new video element 
                const video = document.createElement('video'); 
                video.src = videoURL; 
                // TODO: custom width and height 
                video.width = 640; 
                video.height = 360; 
                video.controls = true; 
                video.style.marginBottom = '20px'; 

                // Add to container 
                videoContainer.appendChild(video); 
            }
        }); 

        this.value = ''; 
    }); 
}); 

