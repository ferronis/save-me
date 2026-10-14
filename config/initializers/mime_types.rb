# Serve the viewer's web app manifest with its proper type; Rack doesn't know
# the .webmanifest extension and would send text/plain.
Rack::Mime::MIME_TYPES[".webmanifest"] = "application/manifest+json"
