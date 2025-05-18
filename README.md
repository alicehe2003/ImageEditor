# Image Editor 

### Emscript 

`emcc image_processor.cpp \
  -o image_processor.js \
  -s MODULARIZE=1 \
  -s 'EXPORT_NAME="Module"' \
  -s EXPORTED_FUNCTIONS='["_make_monochrome", "_malloc", "_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "HEAPU8"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -O2` 

  
