use resume_studio_lib::compiler::diagnostics::{diagnose, TexRuntime};

fn main() {
    let report = diagnose(&TexRuntime::discover());
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    if !report.pdf_validated {
        std::process::exit(1);
    }
}
