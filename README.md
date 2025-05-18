# Image Editor 

### Emscripten 

Emscripten is an open-source compiler toolchain that allows you to compile C and C++ code into WASM, so it can run effectively in web browser. 

Run the following in the command line: 

`emcc image_processor.cpp \
  -o image_processor.js \
  -s MODULARIZE=1 \
  -s 'EXPORT_NAME="Module"' \
  -s EXPORTED_FUNCTIONS='["_make_monochrome", "_malloc", "_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "HEAPU8"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -O2` 

It compiles the C++ file and outputs `image_processor.wasm` (the compiled WASM) and `image_processor.js` (the JS wrapper). `_malloc` and `_free` allows JS to allocate and free memory in WASM. `HEAPU8` is used by JS to access raw WASM memory as a Uint8Array. Memory growth in WASM is allowed if needed (such as for large images). 


