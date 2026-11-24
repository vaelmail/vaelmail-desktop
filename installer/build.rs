use std::path::PathBuf;

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"));
    let source = manifest.join("setup.conf.json");
    let config = manifest.join("tauri.conf.json");
    println!("cargo:rerun-if-changed={}", source.display());
    let wanted = std::fs::read(&source).expect("setup.conf.json is missing");
    if std::fs::read(&config).ok().as_deref() != Some(wanted.as_slice()) {
        std::fs::write(&config, &wanted).expect("tauri.conf.json could not be written");
    }
    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    let target = out.join("payload.bin");
    println!("cargo:rerun-if-env-changed=VAEL_SETUP_PAYLOAD");
    println!("cargo:rerun-if-env-changed=VAEL_SETUP_VERSION");
    match std::env::var("VAEL_SETUP_PAYLOAD") {
        Ok(path) if !path.is_empty() => {
            println!("cargo:rerun-if-changed={path}");
            std::fs::copy(&path, &target).expect("the setup payload could not be read");
        }
        _ => std::fs::write(&target, b"").expect("the empty payload could not be written"),
    }
    tauri_build::build();
}
