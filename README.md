# VideoEditor

Web-based video editor using JavaScript, C++, and WebAssembly. 

## Functionalities 

### Core 

Frontend UI (JavaScript/HTML/CSS) 
- Upload videos 
- Timeline editor 
- Drag videos to trim 
- Preview player 
- Export controls

Video processing engine (C++ compiled to WASM) 
- Frame decoding/encoding 
- Pixel manipulation functions 
- Video segment trimming 
- Final video composition 

### Additional 

TODO 

## Data flow 

Browser -> upload -> JS handlers -> decode to raw frames 

Raw frames -> WASM processing -> manipulate frames 

Timeline adjustments -> re-composition of video segments 

Export -> re-encoding -> download 

# Notes 

In `cpp`, use `extern "C"` to avoid C++ name mangling for functions or variables in wraps, making them compatible with C linkage conventions. 
- C++ uses name mangling to support function overloading and namespace, but C doesn't. Linker will not recognize mangled C++ names unless told to use C-style linkage. 

Use Emscripten to compile C++ to WASM. `emcc code.cpp -s WASM=1 -s EXPORTED_FUNCTIONS='["_add"]' -o code.js` 
- Creates `code.wasm` - the WebAssembly binary, and `code.js` - the glue JS file to load and call WASM. 
- This also automatically generates the `Module` JavaScript object. 
- Emscripten's naming convention: prefix the function name with an underscore in the export list. For example, `add(...)` in C++ compiles to `_add(...)` in JS. 

`Module` is a JavaScript object responsible for loading the WASM binary and exposing compile C++ functions to JS. 
- It also includes the WASM memory, runtime environment, and helper functions. 

`onRuntimeInitialized` is a callback function that runs once the WASM module is fully loaded and ready to use. This is needed because you cannot safely call any exported WASM functions until the module is done initializing. 




