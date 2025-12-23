#!/bin/bash

# Simple WASM build script for Casper smart contract
# This bypasses cargo-odra and uses standard Rust toolchain

echo "🔨 Building Casper smart contract..."

# Clean previous builds
cargo clean

# Build for wasm32-unknown-unknown target
echo "📦 Compiling to WASM..."
cargo build --release --target wasm32-unknown-unknown --lib

if [ $? -eq 0 ]; then
    echo "✅ WASM build successful!"
    
    # Find the WASM file
    WASM_FILE=$(find target/wasm32-unknown-unknown/release -name "*.wasm" | head -n 1)
    
    if [ -n "$WASM_FILE" ]; then
        echo "📄 WASM file: $WASM_FILE"
        ls -lh "$WASM_FILE"
        
        # Optional: Optimize WASM with wasm-opt if available
        if command -v wasm-opt &> /dev/null; then
            echo "🚀 Optimizing WASM..."
            wasm-opt -Oz "$WASM_FILE" -o "${WASM_FILE%.wasm}_optimized.wasm"
            echo "✅ Optimized WASM: ${WASM_FILE%.wasm}_optimized.wasm"
        else
            echo "ℹ️  wasm-opt not found, skipping optimization"
        fi
    fi
else
    echo "❌ WASM build failed"
    exit 1
fi
