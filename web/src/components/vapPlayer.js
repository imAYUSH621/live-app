// Plays a "side-by-side alpha" MP4 (left half = colour, right half = alpha mask) as a transparent animation.
// This is the same idea as Tencent VAP used by big live apps: H.264 plays on every phone, and WebGL
// combines the two halves into a see-through 3D gift on top of the live video.
const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
// Two layouts are supported:
//  - classic: colour | alpha, both full size (video wider than tall)
//  - packed:  colour 9:16 on the left, alpha at half size in the top-right corner (video taller than wide)
const FS = `precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec4 L;
void main(){ vec3 c = texture2D(t, vec2(uv.x * L.x, uv.y)).rgb; float a = texture2D(t, vec2(L.y + uv.x * L.z, uv.y * L.w)).r;
  gl_FragColor = vec4(c * a, a); }`;

export function playVap(container, src, { loop = false, onDone: cb } = {}) {
  let finished = false;
  const onDone = () => { if (!finished) { finished = true; cb?.(); } };
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block';
  container.appendChild(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
  const video = document.createElement('video');
  // H.264 MP4 plays on all phones; browsers without H.264 (some Linux/Chromium builds) get the VP9 WebM twin.
  const webm = src.replace(/\.mp4(\?|$)/, '.webm$1');
  const h264 = video.canPlayType('video/mp4; codecs="avc1.640028"');
  let triedWebm = !h264;
  Object.assign(video, { src: h264 ? src : webm, muted: true, playsInline: true, loop, crossOrigin: 'anonymous', preload: 'auto' });
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  let raf = 0;
  let stopped = false;
  const stop = () => { stopped = true; cancelAnimationFrame(raf); video.pause(); video.removeAttribute('src'); video.load(); canvas.remove(); };
  if (!gl) { onDone?.(); return stop; }

  const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  const draw = () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const packed = vw < vh * 1.2;
      const w = packed ? Math.round((vh * 9) / 16) : vw / 2, h = vh;
      if (canvas.width !== w) {
        canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        gl.uniform4f(gl.getUniformLocation(prog, 'L'), w / vw, w / vw, packed ? (vw - w) / vw : 0.5, packed ? 0.5 : 1);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(draw);
  };
  video.addEventListener('ended', () => { if (!loop) { onDone?.(); } });
  const start = () => video.play().then(draw).catch(() => { if (triedWebm) onDone(); });
  video.addEventListener('error', () => {
    if (!triedWebm && webm !== src) { triedWebm = true; video.src = webm; start(); } else onDone?.();
  });
  start();
  return stop;
}
