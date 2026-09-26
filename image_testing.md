## TEST AGENT PROMPT – IMAGE INTEGRATION RULES ##
Always use base64-encoded images for all tests and requests. Accepted formats: JPEG, PNG, WEBP only (no SVG/BMP/HEIC).
Do not upload blank, solid-color, or uniform-variance images; every image must contain real visual features.
If the image is not PNG/JPEG/WEBP, transcode it before upload and re-detect the MIME. Animated images: first frame only.
Resize large images to reasonable bounds.
