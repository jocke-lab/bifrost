Sealed-case film frame sequence
================================

Source:      ../vault-opening-hq.mp4  (the client's real sealed-case opening film; the same file the
             live app plays in PackOpening). H.264 1920x1080, 24 fps constant, 145 frames, 6.04 s video
             (AAC 32 kHz stereo audio track, 6.05 s; extracted separately for the sound designer).
Frames:      f000.webp ... f144.webp  = every decoded frame, 1:1, no retiming, no resize, no grade.
             1920x1080, lossy WebP quality 82 (libwebp, preset photo, method 6). ~2.4 MB total.
Frame N is at film time N / 24 s  (pts verified: f105 = 4.375 s, f144 = 6.000 s).

Key frames
  f000  0.000 s  closed matte-black case, small in a dark frame, round silver clasp centre-front
  f048  2.000 s  violet seam LED glowing along the front rim (rim at ~53.5% of frame height = FILM.rimFrac)
  f072  3.000 s  lid just cracked, blue-violet light leaking from the seam (slow-motion lid rise starts here)
  f096  4.000 s  lid ~45-50 deg open, interior lit
  f105  4.375 s  THE IN-APP FREEZE FRAME: lid ~60 deg open, interior glowing violet/blue. The app pins
                 currentTime at 4.375 s here; the commercial holds this frame from then on.
  f106-f144      lid continues to vertical and exits the top of frame; NOT used in-app (do not show).

How scenes map time -> frame (scenes/00-shared.js)
  BVShared.FILM = { fps: 24, frames: 145, duration: 6.05, freeze: 4.375, rimFrac: 0.5352, w: 1920, h: 1080 }
  BVShared.filmTime(t):  t <= 10.0        -> 0                          (hold f000)
                         10.0 < t <= 13.0 -> t - 10.0                   (real time, f000..f072)
                         13.0 < t <= 15.0 -> 3.0 + (t - 13.0) * 0.6875  (slow-motion lid rise, f072..f105)
                         t > 15.0         -> 4.375                      (freeze on f105)
  BVShared.filmFrame(t) = min(144, round(filmTime(t) * 24))
  Path for a frame:  'assets/box/frames/f' + String(BVShared.filmFrame(t)).padStart(3, '0') + '.webp'
  Preload the frames used (f000..f105) via BV.preload so playback is deterministic (pure function of t);
  never seek the <video> element during render.

Placement: draw the frame into BVShared.layout(ctx).film {x, y, w, h}; the case's front rim (seam glow,
where the coin emerges) is at film.rimY = film.y + film.h * 0.5352. The rim stays at ~53.5% through f105.
