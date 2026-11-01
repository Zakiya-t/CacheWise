
#include <iostream>
#include <vector>
#include <chrono>
#include <cstdint>
#include <string>

using namespace std;

int main(int argc, char* argv[]) {

    string mode = argc > 1 ? argv[1] : "row";
    int n = argc > 2 ? stoi(argv[2]) : 2048;
    int repetitions = argc > 3 ? stoi(argv[3]) : 5;

    if ((mode != "row" && mode != "column") ||
        n < 1 || n > 4096 ||
        repetitions < 1 || repetitions > 100) {
        cerr << "Invalid arguments\n";
        return 1;
    }

    // Allocate and initialize actual memory
    vector<uint32_t> matrix(
        static_cast<size_t>(n) * n
    );

    for (size_t i = 0; i < matrix.size(); i++) {
        matrix[i] = static_cast<uint32_t>(i % 100 + 1);
    }

    uint64_t checksum = 0;

    auto start = chrono::steady_clock::now();

    // Actual CPU memory-access experiment
    for (int r = 0; r < repetitions; r++) {

        if (mode == "row") {

            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    checksum += matrix[
                        static_cast<size_t>(i) * n + j
                    ];
                }
            }

        } else {

            for (int j = 0; j < n; j++) {
                for (int i = 0; i < n; i++) {
                    checksum += matrix[
                        static_cast<size_t>(i) * n + j
                    ];
                }
            }
        }
    }

    auto end = chrono::steady_clock::now();

    double elapsed_ms =
        chrono::duration<double, milli>(end - start).count();

    cout << "\n========== CACHEWISE RESULT ==========\n";

    cout << "Execution mode: " << mode << endl;
    cout << "Matrix size: " << n << " x " << n << endl;
    cout << "Repetitions: " << repetitions << endl;
    cout << "Checksum: " << checksum << endl;
    cout << "Execution time: " << elapsed_ms << " ms" << endl;

    cout << "======================================\n";

    return 0;
}
