let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let imageData;
let wasmModule;

Module().then((mod) => {
  wasmModule = mod;
  console.log("WASM loaded:", Object.keys(wasmModule));
  console.log("HEAPU8?", wasmModule.HEAPU8);

  document.getElementById("upload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      imageData = ctx.getImageData(0, 0, img.width, img.height);
    };
    img.src = URL.createObjectURL(file);
  });

  document.getElementById("monochrome").addEventListener("click", () => {
    if (!imageData) return;

    const len = imageData.data.length;
    const dataPtr = wasmModule._malloc(len);

    const heap = new Uint8Array(wasmModule.HEAPU8.buffer, dataPtr, len);
    heap.set(imageData.data);

    wasmModule.ccall("make_monochrome", null, ["number", "number", "number"],
      [dataPtr, imageData.width, imageData.height]);

    imageData.data.set(heap);
    ctx.putImageData(imageData, 0, 0);
    wasmModule._free(dataPtr);
  });
});
