coins3d/ -- offline renders of the client's REAL Eye of the Unknown 3D models
==========================================================================

Source models (unmodified, read-only): bp-shop/apps/market/public/media/ar/set_eye_*.glb
  silence = set_eye_blue, ametherion = set_eye_purple, cycle = set_eye_green,
  dominion = set_eye_red, veritas = set_eye_silver
Their base-colour texture is the client's own coin photography, so colours match the
photos in ../coins/. Geometry adds the real sculpted relief, rim and 240-reed edge.

Lighting = the client's AcquisitionScene.tsx rig (ACES filmic, RoomEnvironment PMREM
reflections, hemisphere #dfe8ef/#15191d, warm key spot #fff1df at (-3,7,4) with shadows,
cool rect strip #f3f5ff front-left, cool rim rect #d2e7ff back-right), coin placed where
their inspect view puts it, camera fov 32, straight on. Tuned toward the photos:
exposure 1.0 (app 1.08), env 0.42 (app 0.75), hemi 0.08 (app 0.23), antique-silver
albedo x0.72 / roughness 0.60, and the enamel shaded as a levelled satin fill (normals
smoothed over 1.2 mm, low specular, texture-driven colour) because the raw enamel mesh
follows the iris striations underneath and read as streaky pink plastic.
All files: transparent background (straight alpha, WebP), rendered at 1.5x and
downsampled (Lanczos, premultiplied). Coin centre = image centre in every file.

FILES
-----
dominion-turn/00.webp .. 40.webp   41 frames, 1100x1100, yaw sweep
veritas-turn/00.webp  .. 40.webp   41 frames, 1100x1100, yaw sweep
    yaw(deg) = -40 + 2 * frameIndex      (00 = -40, 20 = 0 face-on, 40 = +40)
    Rotation is about the coin's vertical axis through its centre; no tilt.
    Negative yaw: the coin's left side recedes, the reeded edge shows on the right.
    Positive yaw: the right side recedes, the reeded edge shows on the left.
    Same camera/scale for every frame, so frames can be played/scrubbed in place
    (e.g. frame = round((yawDeg + 40) / 2), clamp 0..40; ping-pong for a float).
    Face-on frame 20: coin disc spans 976 px of 1100 (88.7%).

silence-face.webp, ametherion-face.webp, cycle-face.webp, dominion-face.webp,
veritas-face.webp   1600x1600 face-on hero stills (yaw 0). Coin disc 1418 px (88.6%).
    To swap with a ../coins/<id>.webp photo (disc 872/1000 = 87.2%) at the same
    on-screen coin size, draw the render at 0.984x the photo's box size.

silence-macro.webp  2400x2400, Silence obverse close-up, rendered with the camera
    dollied in (not an upscale): view height = 0.55 of the coin diameter, centred on
    the enamel spiral iris (+ eyelid relief at top/bottom). Full bleed, opaque coin
    surface across the whole frame (alpha = 1 everywhere). Texture detail is the
    GLB's 1280 px photo map, so at 1:1 the enamel is slightly soft; relief/striations
    are true geometry and stay crisp. Best used at <= 1:1 (2400 px across = ~0.55 coin).

Total ~20.5 MB (88 files).

Renderer (re-runnable): scratchpad v3/coins3d/render.html + drive.mjs (Playwright,
SwiftShader WebGL) + encode.py; look parameters in look.json, job list prod.json.
