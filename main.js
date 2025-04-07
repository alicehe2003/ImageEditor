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
    const videoPlayer = document.getElementById('videoPlayer'); 

    videoInput.addEventListener('change', function () {
        const file = this.files[0]; 

        if (file) {
            // Create local URL for video file 
            const videoURL = URL.createObjectURL(file); 
            // Load into video player 
            videoPlayer.src = videoURL; 
            videoPlayer.load(); 
        }
    }); 
}); 

