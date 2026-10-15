// Writes out/preview_<variant>.html: a self-contained 3D viewer (STL embedded, three.js from CDN).
// Open it in a browser to orbit the model. Append #top, #front, #side or #pod for fixed views.
import fs from "node:fs";
import path from "node:path";

for (const variant of ["bar", "disc"]) {
  const stl = fs.readFileSync(path.join("out", variant, `assembly_${variant}.stl`)).toString("base64");
  const html = `<!doctype html><meta charset="utf-8"><title>4FG scale - ${variant}</title>
<style>html,body{margin:0;height:100%;background:#EDF7ED;font:13px system-ui}#i{position:fixed;left:12px;top:10px;color:#1A2E1A}</style>
<div id="i">4FG outdoor scale, ${variant} load cells. Drag to orbit, scroll to zoom. Hash: #top #front #side #pod</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script>
const b64="${stl}";
const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer;
const geo=new THREE.STLLoader().parse(bin);
geo.computeVertexNormals();
const scene=new THREE.Scene();scene.background=new THREE.Color(0xEDF7ED);
const cam=new THREE.PerspectiveCamera(30,innerWidth/innerHeight,10,10000);
cam.up.set(0,0,1);
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(innerWidth,innerHeight);document.body.appendChild(r.domElement);
const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x2D7450,metalness:.1,roughness:.6,flatShading:true}));
scene.add(mesh);
scene.add(new THREE.HemisphereLight(0xffffff,0x88aa88,.9));
const d=new THREE.DirectionalLight(0xffffff,.8);d.position.set(300,-600,800);scene.add(d);
const c=new THREE.Vector3(0,-70,25);
const views={top:[0,-70,1700],front:[0,-1700,60],side:[1700,-70,60],pod:[420,-700,260],iso:[800,-1100,700]};
const v=views[location.hash.slice(1)]||views.iso;
cam.position.set(...v);
if(location.hash==="#top")cam.up.set(0,1,0);
const o=new THREE.OrbitControls(cam,r.domElement);o.target.copy(location.hash==="#pod"?new THREE.Vector3(0,-310,40):c);o.update();
(function a(){requestAnimationFrame(a);r.render(scene,cam)})();
</script>`;
  fs.writeFileSync(path.join("out", `preview_${variant}.html`), html);
}
console.log("preview written");
