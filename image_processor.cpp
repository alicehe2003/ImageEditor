#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>
#include "layer.h"
#include <unordered_map>
#include <unordered_set>
#include <utility> 

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

    // Helper hash for 2D positions
    struct PositionHash {
        std::size_t operator()(const std::pair<int, int>& pos) const {
            return std::hash<int>()(pos.first) ^ (std::hash<int>()(pos.second) << 1);
        }
    };

    /**
     * Output is the buffer where the merged image will be stored.
     * Width and height are the max dimentions of an image on the canvas. 
     * Order is a list of layer IDs, from bottom to top. 
     * Order size is the number of layers in the order array.
     */
    void merge_layers(uint8_t* output, int width, int height, int* order, int orderSize) {
        std::unordered_set<std::pair<int, int>, PositionHash> pixelPositions;
        
        // Initialize output to transparent black
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                int idx = (y * width + x) * 4;
                output[idx] = output[idx + 1] = output[idx + 2] = output[idx + 3] = 0;

                // Init pixel positions
                pixelPositions.insert({x, y});
            }
        } 
    
        // Iterate from top layer down to bottom layer
        for (int i = orderSize - 1; i >= 0; --i) {
            int id = order[i];
            Layer* layer = layers[id];
            if (!layer) continue;
    
            int h = layer->pixels.size();
            int w = layer->pixels[0].size();
    
            for (int y = 0; y < h; ++y) {
                for (int x = 0; x < w; ++x) {
                    // All pixels fully set, no more blending needed
                    if (pixelPositions.empty()) return;  

                    // If pixel position is not in pixelPositions set, skip it
                    if (pixelPositions.find({x, y}) == pixelPositions.end()) continue;

                    Pixel* p = layer->pixels[y][x];
                    if (!p) continue;
                    if (x >= width || y >= height) continue;
    
                    int idx = (y * width + x) * 4;
    
                    float dstAlpha = output[idx + 3] / 255.0f;  // existing alpha in output
                    float srcAlpha = p->a / 255.0f;             // new layer alpha (destination in this case)
    
                    float outAlpha = dstAlpha + srcAlpha * (1 - dstAlpha);
                    if (outAlpha == 0) continue;
    
                    for (int c = 0; c < 3; ++c) {
                        float dstColor = output[idx + c] / 255.0f;      // existing output color (source)
                        float srcColor = ((&p->r)[c]) / 255.0f;         // new pixel color (destination)
                        float outColor = (dstColor * dstAlpha + srcColor * srcAlpha * (1 - dstAlpha)) / outAlpha;
                        output[idx + c] = static_cast<uint8_t>(outColor * 255);
                    }
    
                    output[idx + 3] = static_cast<uint8_t>(outAlpha * 255);

                    // If alpha now fully opaque, remove pixel position from set
                    if (output[idx + 3] == 255) {
                        pixelPositions.erase({x, y});
                    }
                }
            }
        }
    }    

    void monochrome_average(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
        
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 
    
                // Handle missing pixel 
                if (!p) {
                    continue;
                }
    
                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel
    
                // Compute the simple average to get the grayscale value
                uint8_t gray = static_cast<uint8_t>((r + g + b) / 3); 
    
                // Write greyscale value to pixel 
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void monochrome_luminosity(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
        
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 
    
                // Handle missing pixel 
                if (!p) {
                    continue;
                }
    
                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel
    
                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>(0.299 * r + 0.587 * g + 0.114 * b);
    
                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }
    
    void monochrome_lightness(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
        
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 
    
                // Handle missing pixel 
                if (!p) {
                    continue;
                }
    
                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel
    
                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>((std::max({r, g, b}) + std::min({r, g, b})) / 2);
    
                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }
    
    void monochrome_itu(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
        
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 
    
                // Handle missing pixel 
                if (!p) {
                    continue;
                }
    
                uint8_t r = p->r;
                uint8_t g = p->g;
                uint8_t b = p->b;
                uint8_t a = p->a; // preserve the alpha channel
    
                // Compute grayscale value
                uint8_t gray = static_cast<uint8_t>(0.2126 * r + 0.7152 * g + 0.0722 * b);
    
                // Write greyscale value to pixel
                p->r = gray;
                p->g = gray;
                p->b = gray;
                p->a = a;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void gaussian_blur(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id, double sigma, int kernelSize) {
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
    
        // Get the specific layer 
        Layer* layer = layers[layer_id];
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
    
        // Create temporary buffer for the blurred image 
        std::vector<uint8_t> temp(layer_width * layer_height * 4);
    
        // Horizontal blur 
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                double r = 0, g = 0, b = 0, a = 0; 
    
                for (int k = -halfKernel; k <= halfKernel; k++) {
                    int sampleX = std::clamp(x + k, 0, layer_width - 1);
    
                    Pixel* p = layer->pixels[y][sampleX];
                    if (!p) continue; // Skip null pixels
    
                    r += p->r * kernel[k + halfKernel];
                    g += p->g * kernel[k + halfKernel];
                    b += p->b * kernel[k + halfKernel];
                    a += p->a * kernel[k + halfKernel];
                }
    
                int dstIdx = (y * layer_width + x) * 4;
                temp[dstIdx] = static_cast<uint8_t>(std::clamp(static_cast<int>(r), 0, 255));
                temp[dstIdx + 1] = static_cast<uint8_t>(std::clamp(static_cast<int>(g), 0, 255));
                temp[dstIdx + 2] = static_cast<uint8_t>(std::clamp(static_cast<int>(b), 0, 255));
                temp[dstIdx + 3] = static_cast<uint8_t>(std::clamp(static_cast<int>(a), 0, 255));
            }
        }
    
        // Vertical blur
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                double r = 0, g = 0, b = 0, a = 0;
    
                for (int k = -halfKernel; k <= halfKernel; k++) {
                    int sampleY = std::clamp(y + k, 0, layer_height - 1);
                    int idx = (sampleY * layer_width + x) * 4;
    
                    r += temp[idx] * kernel[k + halfKernel];
                    g += temp[idx + 1] * kernel[k + halfKernel];
                    b += temp[idx + 2] * kernel[k + halfKernel];
                    a += temp[idx + 3] * kernel[k + halfKernel];
                }
    
                // Update the pixel in the layer
                Pixel* p = layer->pixels[y][x];
                if (p) {
                    p->r = static_cast<uint8_t>(std::clamp(static_cast<int>(r), 0, 255));
                    p->g = static_cast<uint8_t>(std::clamp(static_cast<int>(g), 0, 255));
                    p->b = static_cast<uint8_t>(std::clamp(static_cast<int>(b), 0, 255));
                    p->a = static_cast<uint8_t>(std::clamp(static_cast<int>(a), 0, 255));
                }
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    // Clamp utility 
    inline uint8_t clamp(int value) {
        return static_cast<uint8_t>(std::max(0, std::min(value, 255)));
    }

    void edge_sobel(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id];
        if (!layer) return;
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
    
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
        std::vector<int> magnitudes(layer_width * layer_height, 0);
        int maxMag = 1; // Avoid division by zero
    
        for (int y = 1; y < layer_height - 1; y++) {
            for (int x = 1; x < layer_width - 1; x++) {
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
                magnitudes[y * layer_width + x] = mag;
                if (mag > maxMag) maxMag = mag;
            }
        }
    
        // Second pass: normalize and write to layer
        for (int y = 1; y < layer_height - 1; y++) {
            for (int x = 1; x < layer_width - 1; x++) {
                int mag = magnitudes[y * layer_width + x];
                uint8_t edge = static_cast<uint8_t>((mag * 255) / maxMag);
    
                Pixel* p = layer->pixels[y][x];
                p->r = p->g = p->b = edge;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }     

    void laplacian_filter(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        Layer* layer = layers[layer_id];
        if (!layer) return;
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
    
        const int kernel[3][3] = {
            {-1, -1, -1},
            {-1,  8, -1},
            {-1, -1, -1}
        };
    
        std::vector<std::vector<int>> laplacian_values(layer_height, std::vector<int>(layer_width, 0));
    
        // First pass: compute Laplacian
        for (int y = 1; y < layer_height - 1; y++) {
            for (int x = 1; x < layer_width - 1; x++) {
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
        for (int y = 1; y < layer_height - 1; y++) {
            for (int x = 1; x < layer_width - 1; x++) {
                int raw = laplacian_values[y][x];
                
                // Amplify the result to make edges more visible
                int amplified = raw * 3; // Multiply by 3 for stronger edges
                
                // Clamp the result to 0-255 range
                uint8_t edge = static_cast<uint8_t>(std::max(0, std::min(255, amplified)));
    
                Pixel* p = layer->pixels[y][x];
                p->r = edge;
                p->g = edge;
                p->b = edge;
            }
        }
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void edge_laplacian_of_gaussian(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id, double sigma, int kernelSize) {
        // Step 1: convert to grayscale 
        monochrome_itu(data, width, height, order, orderSize, layer_id);
        
        // Step 2: apply Gaussian blur 
        gaussian_blur(data, width, height, order, orderSize, layer_id, sigma, kernelSize);
    
        // Step 3: apply Laplacian filter
        laplacian_filter(data, width, height, order, orderSize, layer_id);
    }
      
    /**
     * Bucket fill algorithm to fill a region with a color.
     * 
     * 
     */
    void bucket_fill(uint8_t* output, int width, int height, int* order, int orderSize, int layer_id, int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float error_threshold) {
        Layer* layer = layers[layer_id]; 
        if (!layer) return; // Layer not found
    
        int layer_width = layer->pixels[0].size();
        int layer_height = layer->pixels.size();
        
        for (int y = 0; y < layer_height; y++) {
            for (int x = 0; x < layer_width; x++) {
                // Get the Pixel from layer's pixel grid 
                Pixel* p = layer->pixels[y][x]; 
    
                // Handle missing pixel 
                if (!p) {
                    continue;
                }
    
                // TODO: IMPLEMENT ALGORITHM 
                // TEMP CHECK - set entire image to RGBA for now 
                if (x >= width || y >= height) continue;
                p->r = r;
                p->g = g;
                p->b = b;
                p->a = 255;
            }
        }

        merge_layers(output, width, height, order, orderSize); 
    }
}
