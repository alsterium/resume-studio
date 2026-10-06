use crate::domain::{project::Asset, validation::MAX_IMAGE_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{imageops::FilterType, DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits};
use serde::Serialize;
use std::{
    fs::File,
    io::{Cursor, Read},
    path::Path,
};

const MAX_DIMENSION: u32 = 8192;
const MAX_PIXELS: u64 = 16_000_000;
const MAX_DECODE_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPhoto {
    pub media_type: String,
    pub base64: String,
    pub width: u32,
    pub height: u32,
}

pub struct PhotoResource {
    pub asset_id: String,
    pub file_name: String,
    pub bytes: Vec<u8>,
}

fn decode(bytes: &[u8], expected: Option<&str>) -> Result<(DynamicImage, ImageFormat), String> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err("写真は1枚5MiB以内にしてください。".into());
    }
    let format = image::guess_format(bytes).map_err(|_| "写真の形式を確認できませんでした。")?;
    let media_type = match format {
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::Png => "image/png",
        _ => return Err("写真はJPEGまたはPNGを選択してください。".into()),
    };
    if expected.is_some_and(|mime| mime != media_type) {
        return Err("写真の実体とMIMEが一致しません。".into());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "写真が破損しているか寸法が上限を超えています。")?;
    let (width, height) = decoder.dimensions();
    if width == 0
        || height == 0
        || u64::from(width) * u64::from(height) > MAX_PIXELS
        || decoder.total_bytes() > MAX_DECODE_BYTES
    {
        return Err("写真は8192px以内・1600万画素以内にしてください。".into());
    }
    let orientation = decoder
        .orientation()
        .map_err(|_| "写真の向きを確認できませんでした。")?;
    let mut image =
        DynamicImage::from_decoder(decoder).map_err(|_| "写真を読み込めませんでした。")?;
    image.apply_orientation(orientation);
    Ok((image, format))
}

fn normalize(
    bytes: &[u8],
    expected: Option<&str>,
) -> Result<(Vec<u8>, ImageFormat, u32, u32), String> {
    let (mut image, format) = decode(bytes, expected)?;
    if image.width() > 600 || image.height() > 800 {
        image = image.resize(600, 800, FilterType::Lanczos3);
    }
    // Re-encode pixels only: apply orientation and omit source metadata.
    let (width, height) = (image.width(), image.height());
    let mut output = Cursor::new(Vec::new());
    if format == ImageFormat::Jpeg {
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 90)
            .encode_image(&image.to_rgb8())
            .map_err(|_| "写真を整形できませんでした。")?;
    } else {
        DynamicImage::ImageRgba8(image.to_rgba8())
            .write_to(&mut output, ImageFormat::Png)
            .map_err(|_| "写真を整形できませんでした。")?;
    }
    let bytes = output.into_inner();
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("整形した写真が5MiBを超えています。".into());
    }
    Ok((bytes, format, width, height))
}

pub fn import_photo(path: &Path) -> Result<ImportedPhoto, String> {
    let file = File::open(path).map_err(|_| "写真を開けませんでした。")?;
    let metadata = file
        .metadata()
        .map_err(|_| "写真を確認できませんでした。")?;
    if !metadata.is_file() || metadata.len() > MAX_IMAGE_BYTES as u64 {
        return Err("写真は5MiB以内の通常ファイルを選択してください。".into());
    }
    let mut source = Vec::new();
    file.take((MAX_IMAGE_BYTES + 1) as u64)
        .read_to_end(&mut source)
        .map_err(|_| "写真を読み込めませんでした。")?;
    let (bytes, format, width, height) = normalize(&source, None)?;
    Ok(ImportedPhoto {
        media_type: if format == ImageFormat::Jpeg {
            "image/jpeg"
        } else {
            "image/png"
        }
        .into(),
        base64: STANDARD.encode(bytes),
        width,
        height,
    })
}

fn asset_bytes(asset: &Asset) -> Result<Vec<u8>, String> {
    if asset.base64.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err("写真は1枚5MiB以内にしてください。".into());
    }
    STANDARD
        .decode(&asset.base64)
        .map_err(|_| "写真のbase64が不正です。".into())
}

pub fn validate_asset(asset: &Asset) -> Result<(), String> {
    decode(&asset_bytes(asset)?, Some(&asset.media_type))?;
    Ok(())
}

pub fn prepare_resources(assets: &[Asset]) -> Result<Vec<PhotoResource>, String> {
    if assets.len() > 4 {
        return Err("写真は4枚以内にしてください。".into());
    }
    assets
        .iter()
        .enumerate()
        .map(|(index, asset)| {
            let (bytes, format, _, _) = normalize(&asset_bytes(asset)?, Some(&asset.media_type))?;
            let extension = if format == ImageFormat::Jpeg {
                "jpg"
            } else {
                "png"
            };
            Ok(PhotoResource {
                asset_id: asset.id.clone(),
                file_name: format!("photo-{}.{}", index + 1, extension),
                bytes,
            })
        })
        .collect()
}

pub fn write_resources(directory: &Path, resources: &[PhotoResource]) -> Result<(), String> {
    for resource in resources {
        // Filename must have been generated by prepare_resources, never from asset IDs.
        if !matches!(
            resource.file_name.as_str(),
            "photo-1.jpg"
                | "photo-2.jpg"
                | "photo-3.jpg"
                | "photo-4.jpg"
                | "photo-1.png"
                | "photo-2.png"
                | "photo-3.png"
                | "photo-4.png"
        ) {
            return Err("写真の資源名が不正です。".into());
        }
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(directory.join(&resource.file_name))
            .map_err(|_| "写真の資源を作成できませんでした。")?;
        file.write_all(&resource.bytes)
            .map_err(|_| "写真の資源を書き込めませんでした。")?;
    }
    Ok(())
}
