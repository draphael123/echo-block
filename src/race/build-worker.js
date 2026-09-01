// The circuit factory, off the main thread.
//
// A build is ten to forty seconds of honest CPU — voxels, districts, meshing
// — and on the main thread even the yielding version taxes the page. Here it
// runs in a module worker: the page stays perfectly responsive, the boot
// screen animates from the phase messages this posts, and the finished
// geometry crosses back as transferred ArrayBuffers, not copies.
//
// This file must stay importable OUTSIDE a document: no DOM, no localStorage,
// and every import below reaches three.js by relative path because module
// workers do not read the page's import map.
import { byId } from './tracks/index.js';
import { buildTrack, serializeTrack } from './track.js';

onmessage = async (e) => {
  try {
    const spec = byId(e.data.trackId);
    const track = await buildTrack(spec, (label, frac) =>
      postMessage({ type: 'phase', label, frac }));
    const { payload, transfer } = serializeTrack(track);
    postMessage({ type: 'done', payload }, transfer);
  } catch (err) {
    postMessage({ type: 'fail', err: String((err && err.stack) || err) });
  }
};
