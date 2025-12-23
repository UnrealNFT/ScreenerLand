#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔧 Fixing Odra 2.4.0 compatibility issues..."

# Fix 1: Replace get_or_revert with get_or_revert_with
echo "  - Fixing Var::get_or_revert() calls..."
sed -i 's/\.get_or_revert(&self\.env())/.get_or_revert_with(Error::NotInitialized)/g' src/token_factory.rs

# Fix 2: Fix move error in check_graduation
echo "  - Fixing token_launch move error..."
sed -i '/self\.launches\.set(&mint, token_launch);/a\        let real_cspr_reserves = token_launch.real_cspr_reserves;' src/token_factory.rs
sed -i 's/final_mcap_cspr: token_launch\.real_cspr_reserves,/final_mcap_cspr: real_cspr_reserves,/' src/token_factory.rs

# Fix 3: Remove unused imports
echo "  - Removing unused imports..."
sed -i 's/use odra::host::{Deployer, HostRef, NoArgs};/use odra::host::{Deployer, HostRef};/' src/token_factory.rs

# Fix 4: Remove mut from immutable variables
echo "  - Fixing mutable variables..."
sed -i 's/let mut factory = TokenFactory::deploy(/let factory = TokenFactory::deploy(/' src/token_factory.rs

# Fix 5: Prefix unused variable
echo "  - Fixing unused variables..."
sed -i 's/let buyer = env\.get_account(4);/let _buyer = env.get_account(4);/' src/token_factory.rs

echo "✅ All fixes applied!"
echo "🧪 Running tests..."
cargo odra test
