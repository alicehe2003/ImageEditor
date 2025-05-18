#include <cstdint>

extern "C" {
    void make_monochrome(uint8_t* data, int width, int height) {
        int size = width * height * 4;
        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t gray = (r + g + b) / 3;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }
}
