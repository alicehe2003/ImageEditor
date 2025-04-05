// Entry point of application 
document.addEventListener('DOMContentLoaded', async () => {
    // Init WASM module 
    const wasmModule = await initVideoProcessor(); 


}); 

// Init WASM module 
async function initVideoProcessor() {
    try {
        return await WebAssembly.instantiateStreaming(
            fetch('build.video_processor.wasm'), 
            // Mmeory instance with initial size of 256 pages
            { env: { memory: new WebAssembly.Memory({ initial: 256 }) } }
        ); 
    } catch (error) {
        console.error('Failed to load WASM module: ', error); 
        throw error; 
    }
}
