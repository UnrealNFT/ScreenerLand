#!/bin/bash
set -e

echo "🚀 Setting up Rust toolchain in WSL..."

# Check if rustup is installed
if ! command -v rustup &> /dev/null; then
    echo "📦 Installing Rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

# Install nightly toolchain
echo "📦 Installing Rust nightly-2024-11-16..."
rustup toolchain install nightly-2024-11-16
rustup default nightly-2024-11-16

# Verify toolchain
echo "✅ Rust version:"
rustc --version
cargo --version

# Install cargo-odra if not present
if ! command -v cargo-odra &> /dev/null; then
    echo "📦 Installing cargo-odra..."
    cargo install cargo-odra --locked
fi

echo "✅ cargo-odra version:"
cargo odra --version

# Navigate to project directory
cd "$(dirname "$0")"
echo "📂 Current directory: $(pwd)"

# Clean build
echo "🧹 Cleaning previous builds..."
cargo clean

# Run tests
echo "🧪 Running smart contract tests..."
cargo odra test

echo "✅ Tests completed successfully!"
