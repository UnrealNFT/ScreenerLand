#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
extern crate alloc;

pub mod token_factory;

// Re-export for easy access
pub use token_factory::TokenFactory;
