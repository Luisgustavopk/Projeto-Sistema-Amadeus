(() => {
  'use strict';
  const manifest = JSON.parse(document.getElementById('manifest').textContent);
  const byId = (id) => document.getElementById(id);
  const reviews = new Map(manifest.poses.map((p) => [p.id, { verdict: 'pending', notes: '' }]));
  const images = new Map();
  let current = manifest.poses[0];
  let revision = 0;

  // Fixed artwork bounds keep before/after aligned; PNG files are never rewritten.
  const bounds = new Map([['original-reference.png', manifest.referenceBounds], ...manifest.poses.map((p) => [p.file, p.bounds])]);
  const hairBounds = new Map([['original-reference.png', manifest.referenceHairBounds], ...manifest.poses.map((p) => [p.file, p.hairBounds])]);
  for (const pose of manifest.poses) if (pose.previousFile) bounds.set(pose.previousFile, pose.bounds);
  for (const pose of manifest.poses) if (pose.previousFile) hairBounds.set(pose.previousFile, pose.hairBounds);
  function load(file) {
    if (images.has(file)) return images.get(file);
    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        resolve({ image, bounds: bounds.get(file) || [0, 0, image.naturalWidth, image.naturalHeight], hairBounds: hairBounds.get(file) });
      };
      image.onerror = () => reject(new Error('Não foi possível abrir ' + file));
      image.src = file;
    });
    images.set(file, promise);
    return promise;
  }

  function paint(canvas, asset) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    const [x, y, width, fullHeight] = byId('framing').value === 'hair' && asset.hairBounds ? asset.hairBounds : asset.bounds;
    const height = byId('framing').value === 'face' ? fullHeight * .43 : fullHeight;
    const scale = Math.min((canvas.width - 24 * ratio) / width, (canvas.height - 24 * ratio) / height);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(asset.image, x, y, width, height, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
  }

  async function render() {
    const token = ++revision;
    byId('error').textContent = '';
    try {
      const previous = byId('comparison-reference').value === 'previous' && current.previousFile;
      const reference = previous || 'original-reference.png';
      byId('reference-caption').textContent = previous ? 'Revisão anterior · antes da nova correção do contorno' : 'Avatar original · render sem efeitos da interface';
      byId('reference-link').href = reference;
      const assets = await Promise.all([load(reference), load(current.file)]);
      if (token !== revision) return;
      paint(byId('original'), assets[0]);
      paint(byId('candidate'), assets[1]);
    } catch (error) { if (token === revision) byId('error').textContent = error.message; }
  }

  function select(pose) {
    current = pose;
    const review = reviews.get(pose.id);
    byId('pose-title').textContent = pose.label;
    byId('check').textContent = pose.check;
    byId('observation').textContent = pose.observation;
    byId('candidate-link').href = pose.file;
    byId('candidate-caption').textContent = 'Desenho candidato · ' + pose.file.match(/v\d+(?=\.png$)/)[0];
    byId('comparison-reference').options[1].disabled = !pose.previousFile;
    if (!pose.previousFile) byId('comparison-reference').value = 'original';
    byId('framing').options[2].disabled = !pose.hairBounds;
    if (!pose.hairBounds && byId('framing').value === 'hair') byId('framing').value = 'face';
    byId('verdict').value = review.verdict;
    byId('notes').value = review.notes;
    for (const button of byId('poses').children) button.setAttribute('aria-pressed', String(button.dataset.pose === pose.id));
    void render();
  }
  for (const pose of manifest.poses) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.pose = pose.id; button.textContent = pose.label;
    button.addEventListener('click', () => select(pose));
    byId('poses').append(button);
  }
  for (const limitation of manifest.limitations) {
    const li = document.createElement('li'); li.textContent = limitation; byId('limitations').append(li);
  }
  byId('background').addEventListener('change', () => {
    for (const stage of document.querySelectorAll('.stage')) stage.className = 'stage ' + byId('background').value;
  });
  byId('framing').addEventListener('change', () => void render());
  byId('comparison-reference').addEventListener('change', () => void render());
  byId('verdict').addEventListener('change', () => { reviews.get(current.id).verdict = byId('verdict').value; });
  byId('notes').addEventListener('input', () => { reviews.get(current.id).notes = byId('notes').value; });
  byId('export').addEventListener('click', () => {
    const data = { version: 1, manifestVersion: manifest.version, date: new Date().toISOString(), runtimeEnabled: false, reviews: manifest.poses.map((p) => ({ id: p.id, file: p.file, sha256: p.sha256, ...reviews.get(p.id) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'revisao-poses-v' + manifest.version + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  new ResizeObserver(() => void render()).observe(byId('original').parentElement);
  select(current);
})();
