// Copy a narrow edge profile from the original render, aligned to each pose's
// own silhouette. The face, hair interior and geometry are never resampled.
const clamp = (n) => Math.max(0, Math.min(1, n));
function sample(image, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const colour = [0, 0, 0, 0];
  for (const [dx, dy, weight] of [[0,0,(1-fx)*(1-fy)], [1,0,fx*(1-fy)], [0,1,(1-fx)*fy], [1,1,fx*fy]]) {
    const px = Math.max(0, Math.min(image.width-1, x0+dx)), py = Math.max(0, Math.min(image.height-1, y0+dy));
    for (let c=0;c<4;c++) colour[c] += image.rgba[(py*image.width+px)*4+c]*weight;
  }
  return colour;
}
function silhouette(image, region) {
  const segments = [], bins = new Map(), size = 16;
  const alpha = (x,y) => image.rgba[(y*image.width+x)*4+3];
  const [left,top,right,bottom] = region;
  for(let y=top;y<bottom-1;y++) for(let x=left;x<right-1;x++) {
    const points = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]], crossings=[];
    for(let i=0;i<4;i++) {
      const a=points[i], b=points[(i+1)%4], av=alpha(...a), bv=alpha(...b);
      if((av>=128)===(bv>=128)) continue;
      const t=(128-av)/(bv-av); crossings.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
    for(let i=0;i+1<crossings.length;i+=2) {
      const a=crossings[i],b=crossings[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(length<1e-6) continue;
      let normal=[dy/length,-dx/length];
      if(sample(image,(a[0]+b[0])/2+normal[0],(a[1]+b[1])/2+normal[1])[3]>=128) normal=normal.map(v=>-v);
      const segment={a,b,normal};segments.push(segment);
      const key=Math.floor((a[0]+b[0])/2/size)+','+Math.floor((a[1]+b[1])/2/size);
      if(!bins.has(key)) bins.set(key,[]);bins.get(key).push(segment);
    }
  }
  return (x,y,radius) => {
    let closest=null;const bx=Math.floor(x/size),by=Math.floor(y/size),range=Math.ceil(radius/size)+1;
    for(let dy=-range;dy<=range;dy++) for(let dx=-range;dx<=range;dx++) for(const s of bins.get((bx+dx)+','+(by+dy))??[]) {
      const vx=s.b[0]-s.a[0],vy=s.b[1]-s.a[1],t=clamp(((x-s.a[0])*vx+(y-s.a[1])*vy)/(vx*vx+vy*vy));
      const p=[s.a[0]+vx*t,s.a[1]+vy*t],distance=Math.hypot(x-p[0],y-p[1]);
      if(distance<=radius&&(!closest||distance<closest.distance)) closest={...s,p,distance};
    }
    return closest;
  };
}
export function refineReferenceHairOutline(image, original, reference, spec, change) {
  const targetEdge=silhouette(image,change.region), referenceEdge=silhouette(reference,spec.referenceRegion);
  const [left,top,right,bottom]=change.region, [cx,cy]=change.alignmentCentre, [rx,ry]=spec.referenceCentre;
  const scale=change.referenceScale, band=spec.profileDepth/scale;
  for(let y=top;y<bottom;y++) for(let x=left;x<right;x++) {
    const i=(y*image.width+x)*4,alpha=original[i+3];if(!alpha)continue;
    const fade=clamp((bottom-1-y)/change.endFadePixels);
    const edge=targetEdge(x,y,band+2);
    if(!edge) {
      if(alpha<128){image.rgba[i+3]=Math.round(alpha*(1-fade));if(!image.rgba[i+3]) image.rgba.fill(0,i,i+3);}
      continue;
    }
    const inside=alpha>=128, distance=inside?edge.distance:-edge.distance;
    if(!inside&&edge.distance>1.5) {
      image.rgba[i+3]=Math.round(alpha*(1-fade));if(!image.rgba[i+3]) image.rgba.fill(0,i,i+3);continue;
    }
    const mapped=[rx+(edge.p[0]-cx)*scale,ry+(edge.p[1]-cy)*scale];
    const native=referenceEdge(...mapped,32);if(!native)throw new Error('Missing original contour profile');
    const colour=sample(reference,native.p[0]-native.normal[0]*distance*scale,native.p[1]-native.normal[1]*distance*scale);
    const strength=fade*clamp((band-edge.distance)/(spec.innerFadePixels/scale));
    for(let c=0;c<3;c++)image.rgba[i+c]=Math.round(original[i+c]+(colour[c]-original[i+c])*strength);
    const alphaStrength=fade*clamp((2-edge.distance*scale)/.75);
    image.rgba[i+3]=Math.round(alpha+(colour[3]-alpha)*alphaStrength);
    // Never paint into fully transparent source pixels. The sampled native alpha
    // only smooths the existing narrow edge; the rest of the silhouette stays put.
  }
}
