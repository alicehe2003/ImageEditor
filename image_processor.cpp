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
            uint8_t gray = static_cast<uint8_t>((r + g + b) / 3);
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
            uint8_t gray = static_cast<uint8_t>(std::max({r, g, b}) + std::min({r, g, b}) / 2);
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

    // Clamp utility 
    inline uint8_t clamp(int value) {
        return static_cast<uint8_t>(std::max(0, std::min(value, 255)));
    }

    void edge_sobel(uint8_t* data, int width, int height) {
        int size = width * height * 4; 
        uint8_t* temp = new uint8_t[size]; 
        std::copy(data, data + size, temp);

        // Sobel kernels
        const int Gx[3][3] = {
            {-1, 0, 1},
            {-2, 0, 2},
            {-1, 0, 1}
        };
        const int Gy[3][3] = {
            {1, 2, 1},
            {0, 0, 0},
            {-1, -2, -1}
        };

        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int gx = 0, gy = 0;

                // Apply kernels to grayscale intensity 
                for (int ky = -1; ky <= 1; ky++) {
                    for (int kx = -1; kx <= 1; kx++) {
                        int px = (y + ky) * width + (x + kx);
                        uint8_t r = temp[px * 4];
                        uint8_t g = temp[px * 4 + 1];
                        uint8_t b = temp[px * 4 + 2];
                        uint8_t gray = static_cast<uint8_t>((r + g + b) / 3);

                        gx += gray * Gx[ky + 1][kx + 1];
                        gy += gray * Gy[ky + 1][kx + 1];
                    }
                }

                int magnitude = static_cast<int>(std::sqrt(gx * gx + gy * gy));
                uint8_t edge = clamp(magnitude);

                int idx = (y * width + x) * 4;
                data[idx] = edge; // R
                data[idx + 1] = edge; // G
                data[idx + 2] = edge; // B
                data[idx + 3] = 255; // A
            }
        }

        delete[] temp; // Clean up temporary buffer
    }
}
