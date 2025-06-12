#include <cstdint>
#include <cmath>
#include <vector>
#include <algorithm>
#include "layer.h"
#include <unordered_map>
#include <unordered_set>
#include <utility> 
#include <queue> 
#include <array>
#include <cmath>

// Cache of layers 
std::unordered_map<int, Layer> layers;

/**
 * Monochrome functions
 * 
 * Various methods to convert RGB pixels to grayscale.
 */

uint8_t grayscale_average(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((r + g + b) / 3);
}

uint8_t grayscale_luminosity(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>(0.299 * r + 0.587 * g + 0.114 * b);
}

uint8_t grayscale_lightness(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>((std::max({r, g, b}) + std::min({r, g, b})) / 2);
}

uint8_t grayscale_itu(uint8_t r, uint8_t g, uint8_t b) {
    return static_cast<uint8_t>(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

void apply_monochrome_filter(int layer_id, uint8_t(*grayscale_fn)(uint8_t, uint8_t, uint8_t)) {
    Layer& layer = layers[layer_id];
    int layer_width = layer.pixels[0].size();
    int layer_height = layer.pixels.size();

    for (int y = 0; y < layer_height; ++y) {
        auto& row = layer.pixels[y]; 
        for (int x = 0; x < layer_width; ++x) {
            Pixel& p = row[x];
            uint8_t gray = grayscale_fn(p.r, p.g, p.b);
            p.r = p.g = p.b = gray;
            // p.a preserved
        }
    }
}

/**
 * Gaussian blur function 
 * 
 * This function applies a Gaussian blur to a specific layer in the image.
 */

 void gaussian_blur_layer(int layer_id, double sigma, int kernelSize) {
    if (kernelSize % 2 == 0) kernelSize++;
    int halfKernel = kernelSize / 2;

    // Generate 1D Gaussian kernel
    std::vector<float> kernel(kernelSize);
    float denom = 2.0f * sigma * sigma;
    float sum = 0.0f;

    for (int i = 0; i < kernelSize; ++i) {
        int x = i - halfKernel;
        kernel[i] = std::exp(-(x * x) / denom);
        sum += kernel[i];
    }
    for (float& k : kernel) k /= sum;

    Layer& layer = layers[layer_id];
    const int width = layer.pixels[0].size();
    const int height = layer.pixels.size();

    // Temp buffer: store RGBA per pixel as 4 * uint8_t
    std::vector<uint8_t> temp(width * height * 4);

    // === HORIZONTAL PASS ===
    for (int y = 0; y < height; ++y) {
        Pixel* row = layer.pixels[y].data();
        for (int x = 0; x < width; ++x) {
            float r = 0, g = 0, b = 0, a = 0;

            for (int k = -halfKernel; k <= halfKernel; ++k) {
                int sampleX = x + k;
                if (sampleX < 0) sampleX = 0;
                else if (sampleX >= width) sampleX = width - 1;

                float coeff = kernel[k + halfKernel];
                Pixel& p = row[sampleX];
                r += p.r * coeff;
                g += p.g * coeff;
                b += p.b * coeff;
                a += p.a * coeff;
            }

            int idx = (y * width + x) * 4;
            temp[idx]     = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, r)));
            temp[idx + 1] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, g)));
            temp[idx + 2] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, b)));
            temp[idx + 3] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, a)));
        }
    }

    // === VERTICAL PASS ===
    for (int y = 0; y < height; ++y) {
        Pixel* row = layer.pixels[y].data();
        for (int x = 0; x < width; ++x) {
            float r = 0, g = 0, b = 0, a = 0;

            for (int k = -halfKernel; k <= halfKernel; ++k) {
                int sampleY = y + k;
                if (sampleY < 0) sampleY = 0;
                else if (sampleY >= height) sampleY = height - 1;

                float coeff = kernel[k + halfKernel];
                int idx = (sampleY * width + x) * 4;

                r += temp[idx]     * coeff;
                g += temp[idx + 1] * coeff;
                b += temp[idx + 2] * coeff;
                a += temp[idx + 3] * coeff;
            }

            row[x].r = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, r)));
            row[x].g = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, g)));
            row[x].b = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, b)));
            row[x].a = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, a)));
        }
    }
}

/**
 * Edge detection options 
 */

void edge_sobel_layer(int layer_id) {
    Layer& layer = layers[layer_id];

    const int height = layer.pixels.size();
    if (height == 0) return;
    const int width = layer.pixels[0].size();

    // Precompute grayscale to a linear buffer for cache efficiency
    std::vector<uint8_t> gray_buffer(width * height);
    for (int y = 0; y < height; ++y) {
        Pixel* row = layer.pixels[y].data();
        for (int x = 0; x < width; ++x) {
            // Simple average grayscale
            gray_buffer[y * width + x] = static_cast<uint8_t>((row[x].r + row[x].g + row[x].b) / 3);
        }
    }

    // Sobel kernels as 1D arrays to avoid 2D indexing overhead
    constexpr int Gx[9] = {-1, 0, 1, -2, 0, 2, -1, 0, 1};
    constexpr int Gy[9] = {1, 2, 1, 0, 0, 0, -1, -2, -1};

    // Output buffer for edge magnitude
    std::vector<int> magnitudes(width * height, 0);

    int maxMag = 1;

    // Apply Sobel - skip border pixels (1..height-2, 1..width-2)
    // Unroll kernel loops for 3x3 fixed size (9 operations)
    for (int y = 1; y < height - 1; ++y) {
        int base_idx = y * width;
        int prev_idx = (y - 1) * width;
        int next_idx = (y + 1) * width;

        for (int x = 1; x < width - 1; ++x) {
            int gx = 0, gy = 0;

            // Manually unrolled 3x3 kernel convolution
            // Indices relative to center pixel (x,y)
            gx += gray_buffer[prev_idx + (x - 1)] * Gx[0];
            gx += gray_buffer[prev_idx + x] * Gx[1];
            gx += gray_buffer[prev_idx + (x + 1)] * Gx[2];
            gx += gray_buffer[base_idx + (x - 1)] * Gx[3];
            gx += gray_buffer[base_idx + x] * Gx[4];
            gx += gray_buffer[base_idx + (x + 1)] * Gx[5];
            gx += gray_buffer[next_idx + (x - 1)] * Gx[6];
            gx += gray_buffer[next_idx + x] * Gx[7];
            gx += gray_buffer[next_idx + (x + 1)] * Gx[8];

            gy += gray_buffer[prev_idx + (x - 1)] * Gy[0];
            gy += gray_buffer[prev_idx + x] * Gy[1];
            gy += gray_buffer[prev_idx + (x + 1)] * Gy[2];
            gy += gray_buffer[base_idx + (x - 1)] * Gy[3];
            gy += gray_buffer[base_idx + x] * Gy[4];
            gy += gray_buffer[base_idx + (x + 1)] * Gy[5];
            gy += gray_buffer[next_idx + (x - 1)] * Gy[6];
            gy += gray_buffer[next_idx + x] * Gy[7];
            gy += gray_buffer[next_idx + (x + 1)] * Gy[8];

            // Approximate magnitude by sum of abs gx + abs gy (faster than sqrt)
            int mag = std::abs(gx) + std::abs(gy);

            magnitudes[base_idx + x] = mag;
            if (mag > maxMag) maxMag = mag;
        }
    }

    // Normalize and write back to pixels (skip borders)
    const float invMax = 255.0f / maxMag;
    for (int y = 1; y < height - 1; ++y) {
        Pixel* row = layer.pixels[y].data();
        int base_idx = y * width;
        for (int x = 1; x < width - 1; ++x) {
            int mag = magnitudes[base_idx + x];
            uint8_t edge = static_cast<uint8_t>(mag * invMax);
            row[x].r = row[x].g = row[x].b = edge;
        }
    }
}

void laplacian_filter_layer(int layer_id) {
    Layer& layer = layers[layer_id];

    const int height = layer.pixels.size();
    if (height == 0) return;
    const int width = layer.pixels[0].size();

    // Precompute grayscale buffer for cache efficiency
    std::vector<uint8_t> gray_buffer(width * height);
    for (int y = 0; y < height; ++y) {
        Pixel* row = layer.pixels[y].data();
        for (int x = 0; x < width; ++x) {
            gray_buffer[y * width + x] = static_cast<uint8_t>((row[x].r + row[x].g + row[x].b) / 3);
        }
    }

    // Laplacian kernel 3x3 as 1D array (row-major)
    constexpr int kernel[9] = {
        -1, -1, -1,
        -1,  8, -1,
        -1, -1, -1
    };

    // Buffer to store convolution results
    std::vector<int> laplacian_values(width * height, 0);

    for (int y = 1; y < height - 1; ++y) {
        int base_idx = y * width;
        int prev_idx = (y - 1) * width;
        int next_idx = (y + 1) * width;

        for (int x = 1; x < width - 1; ++x) {
            // Manually unrolled convolution sum
            int sum = 0;
            sum += gray_buffer[prev_idx + (x - 1)] * kernel[0];
            sum += gray_buffer[prev_idx + x] * kernel[1];
            sum += gray_buffer[prev_idx + (x + 1)] * kernel[2];
            sum += gray_buffer[base_idx + (x - 1)] * kernel[3];
            sum += gray_buffer[base_idx + x] * kernel[4];
            sum += gray_buffer[base_idx + (x + 1)] * kernel[5];
            sum += gray_buffer[next_idx + (x - 1)] * kernel[6];
            sum += gray_buffer[next_idx + x] * kernel[7];
            sum += gray_buffer[next_idx + (x + 1)] * kernel[8];

            laplacian_values[base_idx + x] = sum;
        }
    }

    // Amplify by 3 and clamp, then write back
    for (int y = 1; y < height - 1; ++y) {
        Pixel* row = layer.pixels[y].data();
        int base_idx = y * width;
        for (int x = 1; x < width - 1; ++x) {
            int amplified = laplacian_values[base_idx + x] * 3;

            // Clamp without std::min/max (faster)
            if (amplified < 0) amplified = 0;
            else if (amplified > 255) amplified = 255;

            uint8_t edge = static_cast<uint8_t>(amplified);
            row[x].r = row[x].g = row[x].b = edge;
        }
    }
}

/**
 * Bucket fill tool 
 */

// Helper function - check if within error threshold 
inline bool pixel_within_threshold_fast(const Pixel& p1, const Pixel& p2, float threshold_sq) {
    int dr = p1.r - p2.r;
    int dg = p1.g - p2.g;
    int db = p1.b - p2.b;
    int da = p1.a - p2.a;

    int dist_sq = dr * dr + dg * dg + db * db + da * da;
    return dist_sq <= threshold_sq;
}

void bucket_fill_layer(int layer_id, int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float error_threshold) {
    Layer& layer = layers[layer_id];
    int width = layer.pixels[0].size();
    int height = layer.pixels.size();

    if (x < 0 || x >= width || y < 0 || y >= height) return;

    const Pixel ref_pixel = layer.pixels[y][x];

    // Normalize threshold: scale [0,100] to [0, 255^2*4]
    int max_channel_distance = 255;
    float max_possible_sq = 4.0f * max_channel_distance * max_channel_distance;
    float threshold_sq = (error_threshold / 100.0f) * max_possible_sq;

    // Use 1D visited array for speed and memory
    std::vector<bool> visited(width * height, false);

    // Use vector as queue (faster than std::queue)
    std::vector<std::pair<int, int>> queue;
    queue.reserve(width * height);
    queue.emplace_back(x, y);
    visited[y * width + x] = true;

    while (!queue.empty()) {
        auto [cx, cy] = queue.back();
        queue.pop_back();

        Pixel& cur_pixel = layer.pixels[cy][cx];

        if (!pixel_within_threshold_fast(cur_pixel, ref_pixel, threshold_sq)) continue;

        if (a == 255) {
            cur_pixel.r = r;
            cur_pixel.g = g;
            cur_pixel.b = b;
            cur_pixel.a = a;
        } else {
            float src_a = a / 255.0f;
            float dst_a = cur_pixel.a / 255.0f;
            float out_a = src_a + dst_a * (1.0f - src_a);

            if (out_a > 0.0f) {
                cur_pixel.r = static_cast<uint8_t>((r * src_a + cur_pixel.r * dst_a * (1.0f - src_a)) / out_a);
                cur_pixel.g = static_cast<uint8_t>((g * src_a + cur_pixel.g * dst_a * (1.0f - src_a)) / out_a);
                cur_pixel.b = static_cast<uint8_t>((b * src_a + cur_pixel.b * dst_a * (1.0f - src_a)) / out_a);
                cur_pixel.a = static_cast<uint8_t>(out_a * 255.0f);
            }
        }

        // Check 4 neighbors
        const int dx[4] = {1, -1, 0, 0};
        const int dy[4] = {0, 0, 1, -1};
        for (int d = 0; d < 4; ++d) {
            int nx = cx + dx[d], ny = cy + dy[d];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                int idx = ny * width + nx;
                if (!visited[idx]) {
                    visited[idx] = true;
                    queue.emplace_back(nx, ny);
                }
            }
        }
    }
}

/**
 * Exported function APIs 
 */

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
        Layer layer(id);
        layer.pixels.resize(height, std::vector<Pixel>(width)); 

        // Current x, y position in the image 
        int x = 0, y = 0;

        int size = width * height * 4;

        for (int i = 0; i < size; i += 4) {
            uint8_t r = data[i];
            uint8_t g = data[i + 1];
            uint8_t b = data[i + 2];
            uint8_t a = data[i + 3];

            // Create a new pixel and assign it to the layer 
            layer.pixels[y][x] = Pixel(r, g, b, a);

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

    /**
     * Output is the buffer where the merged image will be stored.
     * Width and height are the max dimentions of an image on the canvas. 
     * Order is a list of layer IDs, from bottom to top. 
     * Order size is the number of layers in the order array.
     */
    void merge_layers(uint8_t* output, int width, int height, int* order, int orderSize) {
        // Initialize output to transparent black
        std::fill(output, output + (width * height * 4), 0);
    
        // Iterate from top layer down to bottom layer
        for (int i = orderSize - 1; i >= 0; --i) {
            int id = order[i];
            Layer& layer = layers[id];
    
            int h = layer.pixels.size();
            int w = layer.pixels[0].size();
    
            for (int y = 0; y < h; ++y) {
                if (y >= height) continue;
                auto& row = layer.pixels[y];
    
                for (int x = 0; x < w; ++x) {
                    if (x >= width) continue;
    
                    Pixel& p = row[x];
                    int idx = (y * width + x) * 4;
    
                    // Normalize alpha once
                    float srcAlpha = p.a * (1.0f / 255.0f);
                    float dstAlpha = output[idx + 3] * (1.0f / 255.0f);
                    float outAlpha = dstAlpha + srcAlpha * (1 - dstAlpha);
    
                    if (outAlpha == 0.0f) continue;
    
                    float invOutAlpha = 1.0f / outAlpha;
    
                    // Precompute input colors as normalized float
                    float srcRGB[3] = {
                        p.r * (1.0f / 255.0f),
                        p.g * (1.0f / 255.0f),
                        p.b * (1.0f / 255.0f)
                    };
    
                    for (int c = 0; c < 3; ++c) {
                        float dstColor = output[idx + c] * (1.0f / 255.0f);
                        float srcColor = srcRGB[c];
    
                        float outColor = (dstColor * dstAlpha + srcColor * srcAlpha * (1 - dstAlpha)) * invOutAlpha;
                        output[idx + c] = static_cast<uint8_t>(outColor * 255.0f);
                    }
    
                    output[idx + 3] = static_cast<uint8_t>(outAlpha * 255.0f);
                }
            }
        }
    }    

    void monochrome_average(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        apply_monochrome_filter(layer_id, grayscale_average);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void monochrome_luminosity(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        apply_monochrome_filter(layer_id, grayscale_luminosity);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }
    
    void monochrome_lightness(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        apply_monochrome_filter(layer_id, grayscale_lightness);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }
    
    void monochrome_itu(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        apply_monochrome_filter(layer_id, grayscale_itu);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void gaussian_blur(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id, double sigma, int kernelSize) {
        gaussian_blur_layer(layer_id, sigma, kernelSize);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    // Clamp utility 
    inline uint8_t clamp(int v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    void edge_sobel(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        edge_sobel_layer(layer_id);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }     

    void laplacian_filter(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id) {
        laplacian_filter_layer(layer_id);
    
        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }

    void edge_laplacian_of_gaussian(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id, double sigma, int kernelSize) {
        // Step 1: convert to grayscale 
        apply_monochrome_filter(layer_id, grayscale_itu);
        
        // Step 2: apply Gaussian blur 
        gaussian_blur_layer(layer_id, sigma, kernelSize);
    
        // Step 3: apply Laplacian filter
        laplacian_filter_layer(layer_id);

        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize);
    }
      
    /**
     * Bucket fill algorithm to fill a region with a color.
     * 
     * BFS algorithm, centered on the pixel at (x, y) in the layer with id `layer_id`. 
     * If the pixel in the connected region is within the error threshold of the reference pixel,
     * it will be filled with the new color (r, g, b, a). 
     */
    void bucket_fill(uint8_t* data, int width, int height, int* order, int orderSize,
                     int layer_id, int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a,
                     float error_threshold) {
        bucket_fill_layer(layer_id, x, y, r, g, b, a, error_threshold);

        // Call merge_layers to update the output data
        merge_layers(data, width, height, order, orderSize); 
    }

    /**
     * Quad tree image compression. 
     * 
     * Compresses the layer to the desired width and height. Note: given width 
     * and height must be strictly smaller than the original width and height 
     * of the image. 
     */
    void quad_compression(uint8_t* data, int width, int height, int* order, int orderSize, int layer_id, int givenWidth, int givenHeight) {
        // Check to make sure size is correct 
        if (givenWidth > width || givenHeight > height) {
            merge_layers(data, width, height, order, orderSize); 
            return;  
        }

        // Select layer with given ID 
        Layer& layer = layers[layer_id]; 

        // Layer compression 
        layer.quad_tree_compression(givenWidth, givenHeight); 

        // Call merge_layers to update the output data 
        merge_layers(data, width, height, order, orderSize); 
    }
}
