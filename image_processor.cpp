#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>
#include "layer.h"
#include <unordered_map>

// Cache of layers 
std::unordered_map<int, Layer*> layers;

extern "C" {

    /**
     * Each pixel in the image is represented by 4 bytes (RGBA), so for an 
     * image of width `width` and height `height`, the size of the data array 
     * is `width * height * 4`. 
     * 
     * data layout: [pixel_0_R, pixel_0_G, pixel_0_B, pixel_0_A, 
     *               pixel_1_R, pixel_1_G, pixel_1_B, pixel_1_A, ...]
     */

    void data_to_layer(uint8_t* data, int width, int height, int id) {
        Layer* layer = new Layer(id);
        layer->pixels.resize(height, std::vector<Pixel*>(width)); 

        // Current x, y position in the image 
        int x = 0, y = 0;

        int size = width * height * 4;

        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t a = data[i + 3];

            // Create a new pixel and assign it to the layer 
            layer->pixels[y][x] = new Pixel(r, g, b, a);

            // Move to the next pixel 
            x++;
            if (x >= width) {
                x = 0;
                y++;
            }
        }

        // Store the layer in the cache
        layers[id] = layer;
    }

    void clear_layers() {
        for (auto& [id, layer] : layers) {
            for (auto& row : layer->pixels) {
                for (Pixel* p : row) {
                    delete p;
                }
            }
            delete layer;
        }
        layers.clear();
    }    

    void monochrome_average(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found

        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
        
        int index = 0; 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 

                // Handle missing pixel 
                if (!p) {
                    index += 4; 
                    continue;
                }

                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel

                // Compute the simple average to get the grayscale value
                uint8_t gray = static_cast<uint8_t>((r + g + b) / 3); 

                // Write grayscale value to R, G, B, keep original A 
                data[index] = gray; // R
                data[index + 1] = gray; // G
                data[index + 2] = gray; // B
                data[index + 3] = a; // A

                // Write greyscale value to pixel 
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;

                // Move to the next pixel
                index += 4; 
            }
        }
    }

    void monochrome_luminosity(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found

        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
        
        int index = 0; 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 

                // Handle missing pixel 
                if (!p) {
                    index += 4; 
                    continue;
                }

                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel

                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>(0.299 * r + 0.587 * g + 0.114 * b);

                // Write grayscale value to R, G, B, keep original A 
                data[index] = gray; // R
                data[index + 1] = gray; // G
                data[index + 2] = gray; // B
                data[index + 3] = a; // A

                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;

                // Move to the next pixel
                index += 4; 
            }
        }
    }

    void monochrome_lightness(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found

        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
        
        int index = 0; 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 

                // Handle missing pixel 
                if (!p) {
                    index += 4; 
                    continue;
                }

                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel

                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>((std::max({r, g, b}) + std::min({r, g, b})) / 2);

                // Write grayscale value to R, G, B, keep original A 
                data[index] = gray; // R
                data[index + 1] = gray; // G
                data[index + 2] = gray; // B
                data[index + 3] = a; // A

                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;

                // Move to the next pixel
                index += 4; 
            }
        }
    }

    void monochrome_itu(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found

        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
        
        int index = 0; 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 

                // Handle missing pixel 
                if (!p) {
                    index += 4; 
                    continue;
                }

                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel

                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>(0.2126 * r + 0.7152 * g + 0.0722 * b);

                // Write grayscale value to R, G, B, keep original A 
                data[index] = gray; // R
                data[index + 1] = gray; // G
                data[index + 2] = gray; // B
                data[index + 3] = a; // A

                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;

                // Move to the next pixel
                index += 4; 
            }
        }
    } 

    void gaussian_blur(uint8_t* data, int layer_id, double sigma, int kernelSize) {
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

        // Get layer 
        Layer* layer = layers[layer_id];
        if (!layer) return; // Layer not found

        int width = layer->pixels[0].size();
        int height = layer->pixels.size();

        // Create temporary buffer for the blurred image 
        std::vector<uint8_t> temp(width * height * 4);

        // Horizontal blur 
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                double r = 0, g = 0, b = 0, a = 0; 

                for (int k = -halfKernel; k <= halfKernel; k++) {
                    int sampleX = std::clamp(x + k, 0, width - 1);
                    int idx = (y * width + sampleX) * 4; 

                    Pixel* p = layer->pixels[y][sampleX];

                    r += p->r * kernel[k + halfKernel];
                    g += p->g * kernel[k + halfKernel];
                    b += p->b * kernel[k + halfKernel];
                    a += p->a * kernel[k + halfKernel];
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

                // Populate the original data with the blurred values
                data[dstIdx] = static_cast<uint8_t>(r);
                data[dstIdx + 1] = static_cast<uint8_t>(g);
                data[dstIdx + 2] = static_cast<uint8_t>(b);
                data[dstIdx + 3] = static_cast<uint8_t>(a);

                // Update the pixel in the layer
                Pixel* p = layer->pixels[y][x];
                p->r = static_cast<uint8_t>(r);
                p->g = static_cast<uint8_t>(g);
                p->b = static_cast<uint8_t>(b);
                p->a = static_cast<uint8_t>(a);
            }
        }
    }

    // Clamp utility 
    inline uint8_t clamp(int value) {
        return static_cast<uint8_t>(std::max(0, std::min(value, 255)));
    }

    void edge_sobel(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id];
        if (!layer) return;
    
        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
    
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
    
        // First pass: compute magnitudes and find the max value
        std::vector<int> magnitudes(width * height, 0);
        int maxMag = 1; // Avoid division by zero
    
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int gx = 0, gy = 0;
    
                for (int ky = -1; ky <= 1; ky++) {
                    for (int kx = -1; kx <= 1; kx++) {
                        Pixel* p = layer->pixels[y + ky][x + kx];
                        uint8_t gray = static_cast<uint8_t>((p->r + p->g + p->b) / 3);
                        gx += gray * Gx[ky + 1][kx + 1];
                        gy += gray * Gy[ky + 1][kx + 1];
                    }
                }
    
                int mag = static_cast<int>(std::sqrt(gx * gx + gy * gy));
                magnitudes[y * width + x] = mag;
                if (mag > maxMag) maxMag = mag;
            }
        }
    
        // Second pass: normalize and write to data and layer
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int mag = magnitudes[y * width + x];
                uint8_t edge = static_cast<uint8_t>((mag * 255) / maxMag);
    
                int idx = (y * width + x) * 4;
                data[idx] = edge;
                data[idx + 1] = edge;
                data[idx + 2] = edge;
                data[idx + 3] = 255;
    
                Pixel* p = layer->pixels[y][x];
                p->r = p->g = p->b = edge;
                p->a = 255;
            }
        }
    }    

    void laplacian_filter(uint8_t* data, int layer_id) {
        Layer* layer = layers[layer_id];
        if (!layer) return;
    
        int width = layer->pixels[0].size();
        int height = layer->pixels.size();
    
        const int kernel[3][3] = {
            {-1, -1, -1},
            {-1,  8, -1},
            {-1, -1, -1}
        };
    
        std::vector<std::vector<int>> laplacian_values(height, std::vector<int>(width, 0));
    
        // First pass: compute Laplacian
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int sum = 0;
                for (int ky = -1; ky <= 1; ky++) {
                    for (int kx = -1; kx <= 1; kx++) {
                        Pixel* p = layer->pixels[y + ky][x + kx];
                        uint8_t gray = static_cast<uint8_t>((p->r + p->g + p->b) / 3);
                        sum += gray * kernel[ky + 1][kx + 1];
                    }
                }
                laplacian_values[y][x] = sum;
            }
        }
    
        // Second pass: apply the result
        for (int y = 1; y < height - 1; y++) {
            for (int x = 1; x < width - 1; x++) {
                int raw = laplacian_values[y][x];
                
                // Amplify the result to make edges more visible
                int amplified = raw * 3; // Multiply by 3 for stronger edges
                
                // Clamp the result to 0-255 range
                uint8_t edge = static_cast<uint8_t>(std::max(0, std::min(255, amplified)));

                int idx = (y * width + x) * 4;
                data[idx] = edge;
                data[idx + 1] = edge;
                data[idx + 2] = edge;
                data[idx + 3] = 255;
    
                Pixel* p = layer->pixels[y][x];
                p->r = edge;
                p->g = edge;
                p->b = edge;
                p->a = 255;
            }
        }
    }


    void edge_laplacian_of_gaussian(uint8_t* data, int layer_id, double sigma, int kernelSize) {
        // Step 1: convert to grayscale 
        monochrome_itu(data, layer_id);
        
        // Step 2: apply Gaussian blur 
        gaussian_blur(data, layer_id, sigma, kernelSize);

        // Step 3: apply Laplacian filter
        laplacian_filter(data, layer_id);
    }

    
}
