#include <cstdint>
#include <cmath>
#include <vector>
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

    void gaussian_blur(uint8_t* data, int width, int height, double sigma, int kernelSize) {
        // Ensure kernelSize is odd for centering 
        if (kernelSize % 2 == 0) kernelSize++; 

        int halfKernel = kernelSize / 2;

        // Create Gaussian kernel
        std::vector<double> kernel(kernelSize); 
        double sum = 0.0;

        for (int i = 0; i < kernelSize; i++) {
            int x = i - halfKernel;
            kernel[i] = std::exp(-(x * x) / (2 * sigma * sigma));
            sum += kernel[i];
        } 

        // Normalize kernel 
        for (double& k : kernel) k /= sum;

        // Create temporary buffer for the blurred image 
        std::vector<uint8_t> temp(width * height * 4);

        // Horizontal blur 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                double r = 0, g = 0, b = 0, a = 0; 

                for (int k = -halfKernel; k <= halfKernel; k++) {
                    int sampleX = std::clamp(x + k, 0, width - 1);
                    int idx = (y * width + sampleX) * 4; 

                    r += data[idx] * kernel[k + halfKernel];
                    g += data[idx + 1] * kernel[k + halfKernel];
                    b += data[idx + 2] * kernel[k + halfKernel];
                    a += data[idx + 3] * kernel[k + halfKernel];
                }

                int dstIdx = (y * width + x) * 4;
                temp[dstIdx] = static_cast<uint8_t>(r);
                temp[dstIdx + 1] = static_cast<uint8_t>(g);
                temp[dstIdx + 2] = static_cast<uint8_t>(b);
                temp[dstIdx + 3] = static_cast<uint8_t>(a);
            }
        }

        // Vertical blur
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                double r = 0, g = 0, b = 0, a = 0;

                for (int k = -halfKernel; k <= halfKernel; k++) {
                    int sampleY = std::clamp(y + k, 0, height - 1);
                    int idx = (sampleY * width + x) * 4;

                    r += temp[idx] * kernel[k + halfKernel];
                    g += temp[idx + 1] * kernel[k + halfKernel];
                    b += temp[idx + 2] * kernel[k + halfKernel];
                    a += temp[idx + 3] * kernel[k + halfKernel];
                }

                int dstIdx = (y * width + x) * 4;
                data[dstIdx] = static_cast<uint8_t>(r);
                data[dstIdx + 1] = static_cast<uint8_t>(g);
                data[dstIdx + 2] = static_cast<uint8_t>(b);
                data[dstIdx + 3] = static_cast<uint8_t>(a);
            }
        }
    }
}
