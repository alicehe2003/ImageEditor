#include <cstdint>
#include <cstddef>

extern "C" {
    // Allocate memory in WASM
    uint8_t* alloc(size_t size) {
        return new uint8_t[size];
    }
    
    // Free memory in WASM
    void free(uint8_t* ptr) {
        delete[] ptr;
    }
    
    // Convert RGBA pixels to grayscale
    void grayscale(uint8_t* pixels, int width, int height) {
        const int pixelCount = width * height * 4; // 4 channels (RGBA)
        
        for (int i = 0; i < pixelCount; i += 4) {
            // Get RGB components
            uint8_t r = pixels[i];
            uint8_t g = pixels[i+1];
            uint8_t b = pixels[i+2];
            
            // Calculate grayscale value (luminosity method)
            uint8_t gray = static_cast<uint8_t>(0.21 * r + 0.72 * g + 0.07 * b);
            
            // Set all channels to grayscale value (keep alpha)
            pixels[i] = gray;
            pixels[i+1] = gray;
            pixels[i+2] = gray;
            // pixels[i+3] remains unchanged (alpha)
        }
    }
}
