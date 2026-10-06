use resume_studio_lib::{
    domain::validation::parse_project,
    generator::{bundle::write_bundle, documents::generate_project, templates::DocumentKind},
};
use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() != 3 {
        return Err("usage: project_to_tex <project.json> <resume|career> <new-directory>".into());
    }
    let kind = match args[1].to_str() {
        Some("resume") => DocumentKind::Resume,
        Some("career") => DocumentKind::Career,
        _ => return Err("document kind must be resume or career".into()),
    };
    let project = parse_project(&fs::read(&args[0])?)?;
    let bundle = generate_project(&project, kind)?;
    let directory = PathBuf::from(&args[2]);
    fs::create_dir(&directory)?;
    write_bundle(&directory, &bundle)?;
    println!("Generated bundle: {}", directory.display());
    Ok(())
}
