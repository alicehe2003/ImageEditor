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
        for (int x = 0; x < layer_width; ++x) {
            Pixel& p = layer.pixels[y][x];
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
    // Ensure kernelSize is odd for centering 
    if (kernelSize % 2 == 0) kernelSize++; 
    int halfKernel = kernelSize / 2;

    // Create Gaussian kernel
    std::vector<double> kernel(kernelSize); 
    double sum = 0.0;
    double kernel_denominator = 2 * sigma * sigma; 

    for (int i = 0; i < kernelSize; i++) {
        int x = i - halfKernel;
        kernel[i] = std::exp(-(x * x) / kernel_denominator);
        sum += kernel[i];
    } 

    // Normalize kernel 
    for (double& k : kernel) k /= sum;

    // Get the specific layer 
    Layer& layer = layers[layer_id];

    int layer_width = layer.pixels[0].size();
    int layer_height = layer.pixels.size();

    // Create temporary buffer for the blurred image 
    std::vector<uint8_t> temp(layer_width * layer_height * 4);

    // Horizontal blur 
    for (int y = 0; y < layer_height; y++) {
        auto& row = layer.pixels[y]; 
        for (int x = 0; x < layer_width; x++) {
            double r = 0, g = 0, b = 0, a = 0; 

            for (int k = -halfKernel; k <= halfKernel; k++) {
                int sampleX = std::clamp(x + k, 0, layer_width - 1);

                Pixel& p = row[sampleX];

                r += p.r * kernel[k + halfKernel];
                g += p.g * kernel[k + halfKernel];
                b += p.b * kernel[k + halfKernel];
                a += p.a * kernel[k + halfKernel];
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
            Pixel& p = layer.pixels[y][x];
            p.r = static_cast<uint8_t>(std::clamp(static_cast<int>(r), 0, 255));
            p.g = static_cast<uint8_t>(std::clamp(static_cast<int>(g), 0, 255));
            p.b = static_cast<uint8_t>(std::clamp(static_cast<int>(b), 0, 255));
            p.a = static_cast<uint8_t>(std::clamp(static_cast<int>(a), 0, 255));
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
    
    int layer_width = layer.pixels[0].size();
    int layer_height = layer.pixels.size();

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
                    Pixel& p = layer.pixels[y + ky][x + kx];
                    uint8_t gray = static_cast<uint8_t>((p.r + p.g + p.b) / 3);
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

            Pixel& p = layer.pixels[y][x];
            p.r = edge;
            p.g = edge;
            p.b = edge;
        }
    }
}

/**
 * Bucket fill tool 
 */

// Helper function to check if two pixels are within a threshold
bool pixels_within_threshold(uint8_t r1, uint8_t g1, uint8_t b1, uint8_t a1,
    uint8_t r2, uint8_t g2, uint8_t b2, uint8_t a2,
    float e) {
    float nr1 = r1 / 255.0f, ng1 = g1 / 255.0f, nb1 = b1 / 255.0f, na1 = a1 / 255.0f;
    float nr2 = r2 / 255.0f, ng2 = g2 / 255.0f, nb2 = b2 / 255.0f, na2 = a2 / 255.0f;

    float dr = nr1 - nr2, dg = ng1 - ng2, db = nb1 - nb2, da = na1 - na2;

    float distance_squared = dr * dr + dg * dg + db * db + da * da;
    float normalized_distance = distance_squared / 4.0f;

    return normalized_distance <= (e / 100.0f);
}

void bucket_fill_layer(int layer_id, int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a, float error_threshold) {
    Layer& layer = layers[layer_id]; 

    int layer_width = layer.pixels[0].size();
    int layer_height = layer.pixels.size();

    if (x < 0 || x >= layer_width || y < 0 || y >= layer_height) return;

    Pixel& ref_pixel = layer.pixels[y][x];

    uint8_t ref_r = ref_pixel.r;
    uint8_t ref_g = ref_pixel.g;
    uint8_t ref_b = ref_pixel.b;
    uint8_t ref_a = ref_pixel.a;

    // Create visited matrix
    std::vector<std::vector<bool>> visited(layer_height, std::vector<bool>(layer_width, false));

    std::queue<std::pair<int, int>> q;
    q.push({x, y});
    visited[y][x] = true;

    while (!q.empty()) {
        auto [cur_x, cur_y] = q.front();
        q.pop();

        // Get current pixel
        Pixel& cur_pixel = layer.pixels[cur_y][cur_x];

        // Check if the color matches the reference
        if (pixels_within_threshold(cur_pixel.r, cur_pixel.g, cur_pixel.b, cur_pixel.a,
                                ref_r, ref_g, ref_b, ref_a, error_threshold)) {
            // Set new color
            if (a == 255) {
                // Fully opaque: just replace
                cur_pixel.r = r;
                cur_pixel.g = g;
                cur_pixel.b = b;
                cur_pixel.a = a;
            } else {
                // Blend: new = src * alpha + dst * (1 - alpha)
                float src_a = a / 255.0f;
                float dst_a = cur_pixel.a / 255.0f;
                float out_a = src_a + dst_a * (1.0f - src_a);
            
                if (out_a > 0.0f) {
                    cur_pixel.r = static_cast<uint8_t>(
                        (r * src_a + cur_pixel.r * dst_a * (1.0f - src_a)) / out_a
                    );
                    cur_pixel.g = static_cast<uint8_t>(
                        (g * src_a + cur_pixel.g * dst_a * (1.0f - src_a)) / out_a
                    );
                    cur_pixel.b = static_cast<uint8_t>(
                        (b * src_a + cur_pixel.b * dst_a * (1.0f - src_a)) / out_a
                    );
                    cur_pixel.a = static_cast<uint8_t>(out_a * 255.0f);
                }
            }                

            // Push unvisited neighbors
            const int dx[4] = {1, -1, 0, 0};
            const int dy[4] = {0, 0, 1, -1};

            for (int dir = 0; dir < 4; ++dir) {
                int nx = cur_x + dx[dir];
                int ny = cur_y + dy[dir];

                if (nx >= 0 && nx < layer_width && ny >= 0 && ny < layer_height && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    q.push({nx, ny});
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
        for (int y = 0; y < height; ++y) {
            for (int x = 0; x < width; ++x) {
                int idx = (y * width + x) * 4;
                output[idx] = output[idx + 1] = output[idx + 2] = output[idx + 3] = 0;
            }
        } 

        // Iterate from top layer down to bottom layer
        for (int i = orderSize - 1; i >= 0; --i) {
            int id = order[i];
            Layer& layer = layers[id];

            int h = layer.pixels.size();
            int w = layer.pixels[0].size();

            for (int y = 0; y < h; ++y) {
                for (int x = 0; x < w; ++x) {
                    // All pixels fully set, no more blending needed

                    Pixel& p = layer.pixels[y][x];
                    if (x >= width || y >= height) continue;

                    int idx = (y * width + x) * 4;

                    float dstAlpha = output[idx + 3] / 255.0f;  // existing alpha in output
                    float srcAlpha = p.a / 255.0f;             // new layer alpha (destination in this case)

                    float outAlpha = dstAlpha + srcAlpha * (1 - dstAlpha);
                    if (outAlpha == 0) continue;

                    for (int c = 0; c < 3; ++c) {
                        float dstColor = output[idx + c] / 255.0f;      // existing output color (source)
                        float srcColor;
                        // new pixel color (destination)
                        switch (c) {
                            case 0: srcColor = p.r / 255.0f; break;
                            case 1: srcColor = p.g / 255.0f; break;
                            case 2: srcColor = p.b / 255.0f; break;
                            case 3: srcColor = p.a / 255.0f; break;
                        }                                               
                        float outColor = (dstColor * dstAlpha + srcColor * srcAlpha * (1 - dstAlpha)) / outAlpha;
                        output[idx + c] = static_cast<uint8_t>(outColor * 255);
                    }

                    output[idx + 3] = static_cast<uint8_t>(outAlpha * 255);
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
