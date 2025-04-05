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
