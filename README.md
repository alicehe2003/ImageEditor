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

Use `DOMContentLoaded` when you want to run JavaScript as soon as the HTML is fully parsed, but before images, CSS, or other external resources finish loading. In contrast, use `load` when you want to wait until everything is loaded. 

`initVideoProcessor` in `main.js` is an async function that loads and instantiates the WASM module, streaming it as the file is being downloaded (which is more fficient than downloading the entire file before starting to instantiate it). It returns a WASM instance that includes the module's exports (functions and memory). 

WASM modules are compiled binaries that contain the executable code for the target architecture (compiles from higher-level languages, such as C++). Loading the module into the browser is the first step to make the code available for execution. 
