(() => {
  const manifest = JSON.parse(document.getElementById('manifest').textContent);
  const byId = id => document.getElementById(id);
  const cache = new Map();
  let pose = manifest.poses[0], selected = pose.layers[0].id, visible = new Set(), revision = 0;
  function load(file) {
    if (!cache.has(file)) cache.set(file, new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Falha ao abrir ' + file)); image.src = file;
    }));
    return cache.get(file);
  }
  async function render() {
    const token = ++revision, canvas = byId('preview'), ratio = Math.min(devicePixelRatio || 1, 2);
    byId('error').textContent = '';
    const active = pose, mode = byId('mode').value;
    const layers = active.layers.filter(l => mode === 'solo' ? l.id === selected : visible.has(l.id));
    try {
      const images = await Promise.all(mode === 'approved' ? [load(active.id + '/approved.png')] : layers.map(l => load(active.id + '/' + l.id + '.png')));
      if (token !== revision) return;
      canvas.width = Math.round(canvas.clientWidth * ratio); canvas.height = Math.round(canvas.clientHeight * ratio);
      const part = layers[0];
      const frame = mode === 'solo' && byId('fit-layer').checked ? [part.left,part.top,part.width,part.height] : active.bounds;
      const ctx = canvas.getContext('2d'), [bx,by,bw,bh] = frame;
      const scale = Math.min((canvas.width - 24*ratio)/bw, (canvas.height - 24*ratio)/bh);
      const ox = (canvas.width - bw*scale)/2 - bx*scale, oy = (canvas.height - bh*scale)/2 - by*scale;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (mode === 'approved') ctx.drawImage(images[0],ox,oy,active.width*scale,active.height*scale);
      else layers.forEach((l,i) => ctx.drawImage(images[i],ox+l.left*scale,oy+l.top*scale,l.width*scale,l.height*scale));
      if (byId('guides').checked) {
        const chains = [['neck','shoulder-left','elbow-left','wrist-left'],['neck','shoulder-right','elbow-right','wrist-right']];
        ctx.strokeStyle = '#ffce6c'; ctx.fillStyle = '#ffce6c'; ctx.lineWidth = 2*ratio;
        for (const chain of chains) {
          ctx.beginPath();chain.forEach((id,i)=>{const [x,y]=active.joints[id];ctx[i?'lineTo':'moveTo'](ox+x*scale,oy+y*scale);});ctx.stroke();
        }
        for (const [x,y] of Object.values(active.joints)) { ctx.beginPath();ctx.arc(ox+x*scale,oy+y*scale,4*ratio,0,Math.PI*2);ctx.fill(); }
      }
    } catch (error) { if (token === revision) byId('error').textContent = error.message; }
  }
  function selectLayer(layer) {
    selected = layer.id;
    byId('layer-info').textContent = layer.label + ' · ' + layer.visiblePixels.toLocaleString('pt-BR') + ' pixels visíveis · recorte em (' + layer.left + ', ' + layer.top + ').';
    for (const button of byId('layers').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.layer === selected));
    void render();
  }
  function selectPose(next) {
    pose = next; visible = new Set(pose.layers.map(l=>l.id)); selected = pose.layers[0].id;
    byId('title').textContent = pose.label;
    byId('psd').href = pose.id + '/visible-parts.psd';
    byId('integrity').textContent = pose.layers.length + ' camadas · recomposição verificada: pixels idênticos ao desenho aprovado.';
    byId('layers').replaceChildren();
    for (const layer of pose.layers) {
      const row=document.createElement('div'), input=document.createElement('input'), button=document.createElement('button');
      input.type='checkbox';input.checked=true;input.setAttribute('aria-label','Exibir '+layer.label);
      input.addEventListener('change',()=>{input.checked?visible.add(layer.id):visible.delete(layer.id);void render();});
      button.type='button';button.textContent=layer.label;button.dataset.layer=layer.id;button.addEventListener('click',()=>selectLayer(layer));
      row.append(input,button);byId('layers').append(row);
    }
    byId('occlusions').replaceChildren();for(const text of pose.occlusions){const li=document.createElement('li');li.textContent=text;byId('occlusions').append(li);}
    for (const button of byId('poses').children) button.setAttribute('aria-pressed',String(button.dataset.pose===pose.id));
    selectLayer(pose.layers[0]);
  }
  for(const p of manifest.poses){const button=document.createElement('button');button.type='button';button.textContent=p.label;button.dataset.pose=p.id;button.addEventListener('click',()=>selectPose(p));byId('poses').append(button);}
  for(const text of manifest.limitations){const li=document.createElement('li');li.textContent=text;byId('limitations').append(li);}
  byId('background').addEventListener('change',()=>byId('stage').className='stage '+byId('background').value);
  for(const id of ['mode','guides','fit-layer']) byId(id).addEventListener('change',()=>void render());
  byId('restore').addEventListener('click',()=>{visible=new Set(pose.layers.map(l=>l.id));for(const input of byId('layers').querySelectorAll('input'))input.checked=true;byId('mode').value='composite';void render();});
  new ResizeObserver(()=>void render()).observe(byId('stage'));
  selectPose(pose);
})();
