#include <cstdint>
#include <algorithm>

extern "C" {

    /**
     * Each pixel in the image is represented by 4 bytes (RGBA), so for an 
     * image of width `width` and height `height`, the size of the data array 
     * is `width * height * 4`. 
     * 
     * data layout: [pixel_0_R, pixel_0_G, pixel_0_B, pixel_0_A, 
     *               pixel_1_R, pixel_1_G, pixel_1_B, pixel_1_A, ...]
     */

    void monochrome_average(uint8_t* data, int width, int height) {
        int size = width * height * 4;
        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t gray = static_cast<uint8_t>(r + g + b) / 3;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    void monochrome_luminosity(uint8_t* data, int width, int height) {
        int size = width * height * 4;
        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t gray = static_cast<uint8_t>(0.299 * r + 0.578 * g + 0.114 * b);
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    void monochrome_lightness(uint8_t* data, int width, int height) {
        int size = width * height * 4;
        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t gray = static_cast<uint8_t>(std::max({r, g, b}) + std::min({r, g, b})) / 2;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    void monochrome_itu(uint8_t* data, int width, int height) {
        int size = width * height * 4;
        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t gray = static_cast<uint8_t>(0.2126 * r + 0.7152 * g + 0.0722 * b);
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    } 

    
}
