source ~/emsdk/emsdk_env.sh

mkdir -p build

echo "Compiling C++ to WASM..."
em++ \
    cpp/video.cpp \
    -o build/video.wasm \
    -O3 \
    -s WASM=1 \
    -s EXPORTED_FUNCTIONS='["_alloc", "_free", "_grayscale"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s ENVIRONMENT=web \
    -s NO_EXIT_RUNTIME=0

echo "Build complete! WASM module created at build/video.wasm"
