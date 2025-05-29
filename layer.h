#include <vector> 

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
    // id = -1 is invalid 
    int id; 
    std::vector<std::vector<Pixel>> pixels; 

    // Default constructor
    Layer() : id(-1) {}

    // Parameterized constructor
    Layer(int id) : id(id) {}
}; 
