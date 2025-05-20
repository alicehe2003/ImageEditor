#include <vector> 

class Pixel {
public: 
    uint8_t r; 
    uint8_t g;
    uint8_t b;
    uint8_t a;

    Pixel(uint8_t r, uint8_t g, uint8_t b, uint8_t a) 
        : r(r), g(g), b(b), a(a) {}
}; 

class Layer {
public: 
    int id; 
    std::vector<std::vector<Pixel*>> pixels; 

    Layer(int id) : id(id) {}
}; 
