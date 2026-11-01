#include <iostream>
#include <vector>
#include <chrono>
#include <cstdint>
#include <string>
#include <iomanip>

using namespace std;

int main(int argc, char* argv[]) {
    string mode = argc > 1 ? argv[1] : "row";
    int n = argc > 2 ? stoi(argv[2]) : 2048;
    int repetitions = argc > 3 ? stoi(argv[3]) : 5;
    bool emit_trace = argc > 4 && string(argv[4]) == "--trace";
    int max_trace_records = argc > 5 ? stoi(argv[5]) : 128;

    if ((mode != "row" && mode != "column") ||
        n < 1 || n > 4096 ||
        repetitions < 1 || repetitions > 100) {
        cerr << "Invalid arguments\n";
        return 1;
    }

    // Allocate contiguous array in actual process memory
    vector<uint32_t> matrix(static_cast<size_t>(n) * n);
    for (size_t i = 0; i < matrix.size(); i++) {
        matrix[i] = static_cast<uint32_t>(i % 100 + 1);
    }

    // If trace mode is requested, emit the actual 64-bit addresses accessed by the CPU
    if (emit_trace) {
        cout << "=== MEMORY TRACE START ===\n";
        int recorded = 0;
        if (mode == "row") {
            for (int i = 0; i < n && recorded < max_trace_records; i++) {
                for (int j = 0; j < n && recorded < max_trace_records; j++) {
                    const void* addr = &matrix[static_cast<size_t>(i) * n + j];
                    cout << "READ " << addr << "\n";
                    recorded++;
                }
            }
        } else {
            for (int j = 0; j < n && recorded < max_trace_records; j++) {
                for (int i = 0; i < n && recorded < max_trace_records; i++) {
                    const void* addr = &matrix[static_cast<size_t>(i) * n + j];
                    cout << "READ " << addr << "\n";
                    recorded++;
                }
            }
        }
        cout << "=== MEMORY TRACE END ===\n";
        return 0;
    }

    uint64_t checksum = 0;
    auto start = chrono::steady_clock::now();

    // Actual CPU memory-access execution
    for (int r = 0; r < repetitions; r++) {
        if (mode == "row") {
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    checksum += matrix[static_cast<size_t>(i) * n + j];
                }
            }
        } else {
            for (int j = 0; j < n; j++) {
                for (int i = 0; i < n; i++) {
                    checksum += matrix[static_cast<size_t>(i) * n + j];
                }
            }
        }
    }

    auto end = chrono::steady_clock::now();
    double elapsed_ms = chrono::duration<double, milli>(end - start).count();

    // Calculate real memory processed in Gigabytes
    double total_bytes = static_cast<double>(n) * n * sizeof(uint32_t) * repetitions;
    double total_gb = total_bytes / (1024.0 * 1024.0 * 1024.0);
    double elapsed_sec = elapsed_ms / 1000.0;
    double throughput_gb_s = (elapsed_sec > 0) ? (total_gb / elapsed_sec) : 0.0;

    cout << "\n========== CACHEWISE RESULT ==========\n";
    cout << "Execution mode: " << mode << endl;
    cout << "Matrix size: " << n << " x " << n << endl;
    cout << "Repetitions: " << repetitions << endl;
    cout << "Checksum: " << checksum << endl;
    cout << "Total data processed: " << fixed << setprecision(2) << (total_bytes / (1024.0 * 1024.0)) << " MB" << endl;
    cout << "Execution time: " << fixed << setprecision(3) << elapsed_ms << " ms" << endl;
    cout << "Memory throughput: " << fixed << setprecision(2) << throughput_gb_s << " GB/s" << endl;
    cout << "Base memory address: " << static_cast<void*>(matrix.data()) << endl;
    cout << "======================================\n";

    return 0;
}
