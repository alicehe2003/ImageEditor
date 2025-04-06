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
