#include <emscripten/emscripten.h>
#include <cstdint>
#include <cstdlib>

extern "C" {
    EMSCRIPTEN_KEEPALIVE
    uint8_t* alloc(size_t size) {
        return static_cast<uint8_t*>(malloc(size));
    }
    
    EMSCRIPTEN_KEEPALIVE
    void freeMemory(uint8_t* ptr) {
        ::free(ptr);
    }
    
    EMSCRIPTEN_KEEPALIVE
    void grayscale(uint8_t* pixels, int width, int height) {
        const int pixelCount = width * height;
        
        for (int i = 0; i < pixelCount * 4; i += 4) {
            uint8_t r = pixels[i];
            uint8_t g = pixels[i+1];
            uint8_t b = pixels[i+2];
            
            uint8_t gray = static_cast<uint8_t>(0.21 * r + 0.72 * g + 0.07 * b);
            
            pixels[i] = gray;
            pixels[i+1] = gray;
            pixels[i+2] = gray;
        }
    }
}
