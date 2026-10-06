use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat, Rgb, RgbImage, Rgba, RgbaImage};
use resume_studio_lib::{
    domain::{
        project::Asset,
        validation::{parse_project, MAX_IMAGE_BYTES},
    },
    storage::{
        photos::{import_photo, prepare_resources, validate_asset, write_resources},
        read_project, write_project,
    },
};
use std::{fs, io::Cursor};

fn png(width: u32, height: u32) -> Vec<u8> {
    let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
        width,
        height,
        Rgba([30, 80, 160, 128]),
    ));
    let mut output = Cursor::new(Vec::new());
    image.write_to(&mut output, ImageFormat::Png).unwrap();
    output.into_inner()
}

fn asset(bytes: &[u8], mime: &str) -> Asset {
    Asset {
        id: "photo-safe".into(),
        media_type: mime.into(),
        base64: STANDARD.encode(bytes),
    }
}

#[test]
fn real_png_import_resize_json_move_and_resource_expansion_preserve_photo() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("架空の写真 space.png");
    let original = png(900, 1200);
    fs::write(&source, &original).unwrap();
    let imported = import_photo(&source).unwrap();
    assert_eq!((imported.width, imported.height), (600, 800));
    let bytes = STANDARD.decode(&imported.base64).unwrap();
    let decoded = image::load_from_memory(&bytes).unwrap().to_rgba8();
    assert_eq!(
        decoded.get_pixel(300, 400)[3],
        128,
        "PNG transparency must survive"
    );
    assert_eq!(
        fs::read(&source).unwrap(),
        original,
        "Import must not write the original"
    );
    let mut project =
        parse_project(include_bytes!("../../tests/fixtures/project-empty.json")).unwrap();
    project.assets.push(Asset {
        id: "photo-safe".into(),
        media_type: imported.media_type,
        base64: imported.base64,
    });
    project.profile.photo_asset_id = Some("photo-safe".into());
    let saved = root.path().join("プロジェクト.json");
    write_project(&saved, &project).unwrap();
    let destination = root.path().join("移動先");
    fs::create_dir(&destination).unwrap();
    let moved = destination.join("応募 書類.json");
    fs::rename(saved, &moved).unwrap();
    fs::remove_file(source).unwrap();
    let restored = read_project(&moved).unwrap();
    assert_eq!(restored.assets[0].base64, project.assets[0].base64);
    let generated = root.path().join("生成 dir");
    fs::create_dir(&generated).unwrap();
    let resources = prepare_resources(&restored.assets).unwrap();
    assert_eq!(resources[0].asset_id, "photo-safe");
    assert_eq!(resources[0].file_name, "photo-1.png");
    write_resources(&generated, &resources).unwrap();
    let extracted = fs::read(generated.join("photo-1.png")).unwrap();
    assert_eq!(image::load_from_memory(&extracted).unwrap().width(), 600);
    assert!(
        write_resources(&generated, &resources).is_err(),
        "Existing assets must not be overwritten"
    );
    assert_eq!(fs::read(generated.join("photo-1.png")).unwrap(), extracted);
}

#[test]
fn jpeg_exif_orientation_is_applied_once_and_metadata_is_removed() {
    let root = tempfile::tempdir().unwrap();
    let image = RgbImage::from_fn(120, 80, |x, _| {
        if x < 60 {
            Rgb([240, 10, 10])
        } else {
            Rgb([10, 10, 240])
        }
    });
    let mut jpeg = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 95)
        .encode_image(&image)
        .unwrap();
    // APP1 Exif: little-endian TIFF, one SHORT Orientation=6 (90 degrees clockwise).
    let exif = b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
    let mut source = jpeg[..2].to_vec();
    source.extend([0xff, 0xe1]);
    source.extend(((exif.len() + 2) as u16).to_be_bytes());
    source.extend(exif);
    source.extend(&jpeg[2..]);
    let path = root.path().join("回転.jpg");
    fs::write(&path, source).unwrap();
    let imported = import_photo(&path).unwrap();
    assert_eq!((imported.width, imported.height), (80, 120));
    let bytes = STANDARD.decode(imported.base64).unwrap();
    assert!(!bytes.windows(4).any(|bytes| bytes == b"Exif"));
    let image = image::load_from_memory(&bytes).unwrap().to_rgb8();
    assert!(image.get_pixel(40, 20)[0] > 200);
    assert!(image.get_pixel(40, 100)[2] > 200);
    fs::write(&path, bytes).unwrap();
    let again = import_photo(&path).unwrap();
    assert_eq!(
        (again.width, again.height),
        (80, 120),
        "Rotation must not be applied twice"
    );
}

#[test]
fn corrupt_mismatched_unsupported_and_oversized_photos_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("入力.png");
    for bytes in [
        b"GIF89a".to_vec(),
        b"plain text".to_vec(),
        png(3, 4)[..40].to_vec(),
    ] {
        fs::write(&path, &bytes).unwrap();
        assert!(import_photo(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
    assert!(validate_asset(&asset(&png(3, 4), "image/jpeg")).is_err());
    let mut invalid = asset(&png(3, 4), "image/png");
    invalid.base64 = "%%%".into();
    assert!(validate_asset(&invalid).is_err());
    fs::write(&path, png(8193, 1)).unwrap();
    assert!(import_photo(&path).is_err());
    fs::write(&path, png(4001, 4001)).unwrap();
    assert!(matches!(import_photo(&path), Err(error) if error.contains("1600万画素")));
    let oversized = fs::File::create(&path).unwrap();
    oversized.set_len((MAX_IMAGE_BYTES + 1) as u64).unwrap();
    assert!(import_photo(&path).is_err());
    assert!(import_photo(root.path()).is_err());
    let mut project: serde_json::Value =
        serde_json::from_slice(include_bytes!("../../tests/fixtures/project-full.json")).unwrap();
    project["assets"][0]["mediaType"] = serde_json::json!("image/jpeg");
    assert!(parse_project(&serde_json::to_vec(&project).unwrap()).is_err());
}
