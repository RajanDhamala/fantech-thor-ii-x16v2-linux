// An approximate reference-based mesh, not a photogrammetry scan or CAD model.
// Axes: X left/right, Y up, -Z cable/front. All positions use arbitrary units.
const mouseSections = [
  [-1.10, 0.01, 0.01], [-1.04, 0.38, 0.13], [-0.88, 0.51, 0.24],
  [-0.55, 0.58, 0.35], [-0.15, 0.62, 0.49], [0.25, 0.65, 0.59],
  [0.60, 0.60, 0.55], [0.86, 0.48, 0.40], [1.04, 0.27, 0.17], [1.10, 0.01, 0.01],
];
const mouseDark = [0.105, 0.123, 0.137];
const mouseRubber = [0.036, 0.044, 0.052];
const mouseTrim = [0.19, 0.21, 0.23];

function mouseNormal(v) {
  const length = Math.hypot(...v) || 1;
  return v.map(n => n / length);
}
function mouseCross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function mouseSubtract(a, b) { return a.map((n, i) => n - b[i]); }
function mouseSection(z) {
  const at = Math.max(-1.10, Math.min(1.10, z));
  function slope(i, component) {
    if(i===0 || i===mouseSections.length-1) return 0;
    const a=mouseSections[i-1],b=mouseSections[i],c=mouseSections[i+1];
    const before=(b[component]-a[component])/(b[0]-a[0]);
    const after=(c[component]-b[component])/(c[0]-b[0]);
    // Monotone Hermite slopes keep the silhouette smooth without overshooting.
    return before*after<=0 ? 0 : 2*before*after/(before+after);
  }
  for (let i = 1; i < mouseSections.length; i++) {
    const a = mouseSections[i-1], b = mouseSections[i];
    if (at <= b[0]) {
      const t = (at-a[0]) / (b[0]-a[0]);
      const t2=t*t,t3=t2*t,span=b[0]-a[0];
      return [1,2].map(k=>(2*t3-3*t2+1)*a[k]+(t3-2*t2+t)*span*slope(i-1,k)
        +(-2*t3+3*t2)*b[k]+(t3-t2)*span*slope(i,k));
    }
  }
  return [0.01, 0.01];
}
function mouseSurface(z, u) {
  const [width, height] = mouseSection(z);
  return [width*u, 0.07 + height*Math.pow(Math.max(0, 1-u*u), 0.62), z];
}

export function createMouseGeometry() {
  const vertices = [];
  // Vertex layout: position 3, normal 3, material RGB 3, emission 1, button ID 1.
  function vertex(position, normal, color, glow = 0, id = -1) {
    vertices.push(...position, ...normal, ...color, glow, id);
  }
  function triangle(a, b, c, color, glow = 0, id = -1) {
    const n = mouseNormal(mouseCross(mouseSubtract(b, a), mouseSubtract(c, a)));
    for (const p of [a,b,c]) vertex(p,n,color,glow,id);
  }
  function surface(z0, z1, u0, u1, nz, nu, color, lift = 0, id = -1) {
    function point(i,j) {
      const z = z0+(z1-z0)*i/nz, u = u0+(u1-u0)*j/nu;
      const p = mouseSurface(z,u); p[1] += lift;
      const dz = mouseSubtract(mouseSurface(z+0.001,u), mouseSurface(z-0.001,u));
      const du = mouseSubtract(mouseSurface(z,u+0.001), mouseSurface(z,u-0.001));
      return [p,mouseNormal(mouseCross(dz,du))];
    }
    for (let i=0;i<nz;i++) for (let j=0;j<nu;j++) {
      const points = [point(i,j),point(i+1,j),point(i,j+1),point(i+1,j+1)];
      for (const k of [0,1,2,2,1,3]) vertex(points[k][0],points[k][1],color,0,id);
    }
  }
  function ellipsoid(center, radii, color, id = -1, glow = 0) {
    function point(i,j) {
      const a = Math.PI*i/16, b = 2*Math.PI*j/32;
      const n = [Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];
      return [n.map((v,k)=>center[k]+v*radii[k]),mouseNormal(n.map((v,k)=>v/radii[k]))];
    }
    for(let i=0;i<16;i++) for(let j=0;j<32;j++) {
      const p = [point(i,j),point(i+1,j),point(i,j+1),point(i+1,j+1)];
      for(const k of [0,1,2,2,1,3]) vertex(p[k][0],p[k][1],color,glow,id);
    }
  }
  function tube(path, radius, color, glow = 0, id = -1) {
    const sides=8;
    function ring(i,j) {
      const before=path[Math.max(0,i-1)],after=path[Math.min(path.length-1,i+1)];
      const tangent=mouseNormal(mouseSubtract(after,before));
      const reference=Math.abs(tangent[1])>.9 ? [1,0,0] : [0,1,0];
      const a=mouseNormal(mouseCross(tangent,reference)),b=mouseCross(tangent,a);
      const angle=j/sides*2*Math.PI;
      const n=a.map((v,k)=>v*Math.cos(angle)+b[k]*Math.sin(angle));
      return [path[i].map((v,k)=>v+n[k]*radius),n];
    }
    for(let i=0;i<path.length-1;i++) for(let j=0;j<sides;j++) {
      const p=[ring(i,j),ring(i+1,j),ring(i,j+1),ring(i+1,j+1)];
      for(const k of [0,1,2,2,1,3]) vertex(p[k][0],p[k][1],color,glow,id);
    }
  }
  const outline=[];
  for(let i=0;i<=128;i++) {
    const angle=i/128*2*Math.PI,z=1.10*Math.cos(angle);
    outline.push([mouseSection(z)[0]*Math.sign(Math.sin(angle)),0.03,z]);
  }
  // Beveled base and the continuous perimeter lighting seen in the photographs.
  for(let i=0;i<outline.length-1;i++) {
    const a=outline[i],b=outline[i+1];
    const bottomA=[a[0]*.94,-.16,a[2]*.96],bottomB=[b[0]*.94,-.16,b[2]*.96];
    triangle(a,b,bottomA,mouseRubber); triangle(bottomA,b,bottomB,mouseRubber);
    triangle([0,-.16,0],bottomA,bottomB,mouseRubber);
  }
  surface(-1.10,1.10,-1,1,64,44,mouseDark);
  tube(outline,0.015,[1,1,1],1);
  // Separate main click panels and central control spine.
  surface(-1.025,-.20,-.94,-.115,22,20,[.145,.162,.176],.007,0);
  surface(-1.025,-.20,.115,.94,22,20,[.125,.142,.156],.007,1);
  surface(-1.035,.10,-.108,.108,25,8,mouseRubber,.011);
  // Scroll wheel, axle along X. Alternating ribs keep it readable while orbiting.
  const wheel=[0,mouseSurface(-.70,0)[1]+.035,-.70];
  for(let i=0;i<48;i++) {
    const a=i/48*2*Math.PI,b=(i+1)/48*2*Math.PI;
    const r=i%2===0 ? .119 : .111;
    const points=[[-.073,wheel[1]+Math.sin(a)*r,wheel[2]+Math.cos(a)*r],
      [.073,wheel[1]+Math.sin(a)*r,wheel[2]+Math.cos(a)*r],
      [-.073,wheel[1]+Math.sin(b)*r,wheel[2]+Math.cos(b)*r],
      [.073,wheel[1]+Math.sin(b)*r,wheel[2]+Math.cos(b)*r]];
    const color=i%2===0 ? mouseTrim : mouseRubber;
    triangle(points[0],points[1],points[2],color,0,2); triangle(points[2],points[1],points[3],color,0,2);
    triangle([-.073,wheel[1],wheel[2]],points[2],points[0],mouseRubber,0,2);
    triangle([.073,wheel[1],wheel[2]],points[1],points[3],mouseRubber,0,2);
  }
  const dpi=[0,mouseSurface(-.28,0)[1]+.019,-.28];
  const light=[0,mouseSurface(.015,0)[1]+.019,.015];
  ellipsoid(dpi,[.074,.028,.09],mouseTrim,5);
  ellipsoid(light,[.074,.028,.09],mouseTrim,6);
  // A small sun glyph on the lighting button.
  const sun=[];
  for(let i=0;i<=20;i++) { const a=i/20*Math.PI*2;sun.push([Math.cos(a)*.022,light[1]+.028,light[2]+Math.sin(a)*.022]); }
  tube(sun,.004,[.7,.74,.76],0,6);
  for(let i=0;i<8;i++) { const a=i/8*Math.PI*2;tube([[Math.cos(a)*.03,light[1]+.028,light[2]+Math.sin(a)*.03],[Math.cos(a)*.043,light[1]+.028,light[2]+Math.sin(a)*.043]],.003,[.7,.74,.76],0,6); }
  // Two thumb buttons on the left side; the right side is deliberately plain.
  ellipsoid([-.619,.167,-.19],[.046,.052,.18],mouseTrim,3);
  ellipsoid([-.635,.163,.205],[.044,.052,.18],mouseTrim,4);
  // Cable stub, sensor recess and underside feet remain visible at lower orbits.
  tube([[0,.105,-1.06],[0,.10,-1.26],[.025,.075,-1.48],[.08,.05,-1.69]],.03,mouseRubber);
  ellipsoid([0,-.167,0],[.10,.012,.15],[.012,.018,.021]);
  ellipsoid([0,-.18,0],[.04,.008,.065],[.42,.025,.025]);
  for(const z of [-.78,.77]) ellipsoid([0,-.17,z],[.34,.025,.15],[.14,.16,.18]);
  // Stylized emblem, following the photographed wing/shield arrangement.
  const logoPaths=[
    [[-.20,.47],[-.035,.45],[-.035,.54],[-.14,.58],[-.07,.63]],
    [[.20,.47],[.035,.45],[.035,.54],[.14,.58],[.07,.63]],
    [[-.10,.62],[-.10,.76],[0,.85],[.10,.76],[.10,.62]],
    [[0,.57],[0,.82]],
  ];
  for(const path of logoPaths) tube(path.map(([x,z])=>[x,mouseSurface(z,x/mouseSection(z)[0])[1]+.012,z]),.012,[1,1,1],1);
  return { vertices:new Float32Array(vertices), stride:11, wheelCenter:wheel,
    hotspots:[[-.29,mouseSurface(-.78,-.55)[1]+.03,-.78],[.29,mouseSurface(-.78,.55)[1]+.03,-.78],
      [0,wheel[1]+.14,wheel[2]],[-.67,.19,-.19],[-.69,.19,.205],
      [0,dpi[1]+.06,dpi[2]],[0,light[1]+.06,light[2]]],
    normals:[[0,1,0],[0,1,0],[0,1,0],[-1,0,0],[-1,0,0],[0,1,0],[0,1,0]],
  };
}

// Ease the wheel around its axle and stop requesting frames once it settles.
export function stepMouseWheel(angle, target, seconds, reducedMotion=false) {
  const next=reducedMotion ? target : angle+(target-angle)*(1-Math.exp(-Math.max(0,Math.min(seconds,.05))*18));
  const moving=Math.abs(target-next)>.001;
  const settled=target%(2*Math.PI);
  return {angle:moving?next:settled,target:moving?target:settled,moving};
}

export function clampMouseCamera(camera) {
  return { yaw:Number.isFinite(camera.yaw) ? camera.yaw : -.6,
    pitch:Math.max(-1.25,Math.min(1.4,Number.isFinite(camera.pitch)?camera.pitch:.75)),
    distance:Math.max(2.6,Math.min(6.5,Number.isFinite(camera.distance)?camera.distance:4.3)) };
}

export function mouseCameraPosition(camera) {
  return [Math.sin(camera.yaw)*Math.cos(camera.pitch)*camera.distance,
    Math.sin(camera.pitch)*camera.distance+.17,
    -Math.cos(camera.yaw)*Math.cos(camera.pitch)*camera.distance];
}

export function mouseViewProjection(camera, aspect) {
  const eye=mouseCameraPosition(camera),target=[0,.17,0];
  const z=mouseNormal(mouseSubtract(eye,target)),x=mouseNormal(mouseCross([0,1,0],z)),y=mouseCross(z,x);
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  const f=1/Math.tan(Math.PI/8),near=.1,far=30;
  const projection=[f/Math.max(.1,aspect),0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
  const result=new Float32Array(16);
  for(let col=0;col<4;col++) for(let row=0;row<4;row++) for(let k=0;k<4;k++) result[col*4+row]+=projection[k*4+row]*view[col*4+k];
  return result;
}

export function projectMousePoint(point, matrix) {
  const p=[...point,1],out=[0,0,0,0];
  for(let row=0;row<4;row++) for(let k=0;k<4;k++) out[row]+=matrix[k*4+row]*p[k];
  if(out[3]<=0) return null;
  return [out[0]/out[3],out[1]/out[3],out[2]/out[3]];
}
