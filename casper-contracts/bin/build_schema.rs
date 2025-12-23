use odra_build::SchemaArgs;

fn main() {
    SchemaArgs::new()
        .package_name("screener_contracts")
        .try_build();
}
