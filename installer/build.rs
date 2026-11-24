use std::path::PathBuf;

fn main() {
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
