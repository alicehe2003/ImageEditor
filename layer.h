#include <vector> 
#include <cmath>
#include <queue>
#include <algorithm>

class Pixel {
public: 
    uint8_t r; 
    uint8_t g;
    uint8_t b;
    uint8_t a;

    // Default constructor — sets to transparent black
    Pixel() : r(0), g(0), b(0), a(0) {}

    // Parameterized constructor
    Pixel(uint8_t r, uint8_t g, uint8_t b, uint8_t a) 
        : r(r), g(g), b(b), a(a) {}
}; 

class Layer {
public: 
    int id; 
    std::vector<std::vector<Pixel>> pixels; 

    // Default constructor
    Layer() : id(-1) {}

    // Parameterized constructor
    Layer(int id) : id(id) {} 

    /**
     * Quad tree image compression algorithm. 
     * 
     * Using the pixel information of the current layer, create and return a new 
     * compressed layer of the current layer. The compression is done using a 
     * quad tree, where each "block" in the tree has similar colour. The tree's 
     * maximum depth is limited to 100. The compressed layer should have dimensions 
     * width by height, where each represents the number of pixels. 
     */
    void quad_tree_compression(int targetWidth, int targetHeight) {
        int fullWidth = pixels[0].size();
        int fullHeight = pixels.size();

        const int MAX_DEPTH = 100;
        const int COLOR_THRESHOLD = 10;

        // Modify pixels directly instead of using a separate compressedFull
        compress_recursive(0, 0, fullWidth, fullHeight, 0, MAX_DEPTH, COLOR_THRESHOLD);

        // Downscale and update pixels to new resolution
        this->pixels = downscale(pixels, fullWidth, fullHeight, targetWidth, targetHeight);
    }
    
private:
    void compress_recursive(int x0, int y0, int w, int h, int depth,
                            int maxDepth,
                            int threshold) {
        if (w <= 1 || h <= 1 || depth >= maxDepth || is_uniform(x0, y0, w, h, threshold)) {
            Pixel avg = average_color(x0, y0, w, h);
            for (int y = y0; y < y0 + h; ++y) {
                for (int x = x0; x < x0 + w; ++x) {
                    pixels[y][x] = avg;
                }
            }
            return;
        }

        int hw = w / 2;
        int hh = h / 2;

        compress_recursive(x0,        y0,        hw, hh, depth + 1, maxDepth, threshold); // top-left
        compress_recursive(x0 + hw,   y0,        w - hw, hh, depth + 1, maxDepth, threshold); // top-right
        compress_recursive(x0,        y0 + hh,   hw, h - hh, depth + 1, maxDepth, threshold); // bottom-left
        compress_recursive(x0 + hw,   y0 + hh,   w - hw, h - hh, depth + 1, maxDepth, threshold); // bottom-right
    }

    Pixel average_color(int x0, int y0, int w, int h) {
        uint64_t sumR = 0, sumG = 0, sumB = 0, sumA = 0;
        int count = 0;

        for (int y = y0; y < y0 + h; ++y) {
            for (int x = x0; x < x0 + w; ++x) {
                Pixel& p = pixels[y][x];
                sumR += p.r;
                sumG += p.g;
                sumB += p.b;
                sumA += p.a;
                count++;
            }
        }

        return Pixel(sumR / count, sumG / count, sumB / count, sumA / count);
    }

    bool is_uniform(int x0, int y0, int w, int h, int threshold) {
        Pixel mean = average_color(x0, y0, w, h);

        for (int y = y0; y < y0 + h; ++y) {
            for (int x = x0; x < x0 + w; ++x) {
                Pixel& p = pixels[y][x];
                int dr = std::abs(p.r - mean.r);
                int dg = std::abs(p.g - mean.g);
                int db = std::abs(p.b - mean.b);
                int da = std::abs(p.a - mean.a);

                if (dr > threshold || dg > threshold || db > threshold || da > threshold)
                    return false;
            }
        }

        return true;
    }

    std::vector<std::vector<Pixel>> downscale(
        const std::vector<std::vector<Pixel>>& input,
        int srcW, int srcH, int dstW, int dstH) {
        std::vector<std::vector<Pixel>> output(dstH, std::vector<Pixel>(dstW));
    
        for (int y = 0; y < dstH; ++y) {
            for (int x = 0; x < dstW; ++x) {
                int srcX = x * srcW / dstW;
                int srcY = y * srcH / dstH;
                output[y][x] = input[srcY][srcX];
            }
        }
    
        return output;
    }
}; 
