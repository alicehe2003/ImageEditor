#!/bin/bash
source ./emsdk/emsdk_env.sh

mkdir -p build

echo "Compiling C++ to WASM..."
emcc \
    cpp/video.cpp \
    -o build/video.js \
    -O3 \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_malloc", "_freeMemory", "_alloc", "_grayscale"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=67108864

echo "Build complete!"
