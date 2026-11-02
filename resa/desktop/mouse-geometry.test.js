import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseGeometry, clampMouseCamera, mouseViewProjection, projectMousePoint, stepMouseWheel } from './mouse-geometry.js';

test('mesh has finite renderable triangles, lighting and all seven button surfaces', () => {
  const mesh=createMouseGeometry();
  assert.equal(mesh.vertices.length % (mesh.stride*3),0);
  assert.ok(mesh.vertices.length > 1000);
  assert.ok([...mesh.vertices].every(Number.isFinite));
  const ids=new Set();let glowing=0;
  for(let i=0;i<mesh.vertices.length;i+=mesh.stride) {
    assert.ok(Math.abs(mesh.vertices[i]) < 2);
    assert.ok(Math.abs(mesh.vertices[i+1]) < 2);
    assert.ok(Math.abs(mesh.vertices[i+2]) < 2);
    if(mesh.vertices[i+9]===1) glowing++;
    ids.add(mesh.vertices[i+10]);
  }
  assert.ok(glowing>0);
  for(let i=0;i<7;i++) assert.ok(ids.has(i));
  assert.equal(mesh.hotspots.length,7);
  assert.ok(mesh.wheelCenter.every(Number.isFinite));
  let wheelRadius=0;
  for(let i=0;i<mesh.vertices.length;i+=mesh.stride) {
    if(mesh.vertices[i+10]!==2) continue;
    wheelRadius=Math.max(wheelRadius,Math.hypot(mesh.vertices[i+1]-mesh.wheelCenter[1],mesh.vertices[i+2]-mesh.wheelCenter[2]));
  }
  assert.ok(wheelRadius>.11 && wheelRadius<.13,'wheel vertices must rotate around their own axle');
});

test('orbit camera keeps its target centered and projects hotspots from different angles', () => {
  const camera=clampMouseCamera({yaw:-.62,pitch:.78,distance:4.3});
  const matrix=mouseViewProjection(camera,1);
  const target=projectMousePoint([0,.17,0],matrix);
  assert.ok(Math.abs(target[0])<.00001 && Math.abs(target[1])<.00001);
  assert.ok(target[2]>-1 && target[2]<1);
  const front=projectMousePoint([.4,.3,-.5],matrix);
  const side=projectMousePoint([.4,.3,-.5],mouseViewProjection({...camera,yaw:camera.yaw+Math.PI/2},1));
  assert.ok(Math.abs(front[0]-side[0])>.05);
});

test('drag and zoom limits cannot flip the camera or pass through the model', () => {
  const extreme=clampMouseCamera({yaw:2,pitch:99,distance:-100});
  assert.equal(extreme.pitch,1.4);assert.equal(extreme.distance,2.6);
  const invalid=clampMouseCamera({yaw:NaN,pitch:NaN,distance:Infinity});
  assert.ok(Object.values(invalid).every(Number.isFinite));
  assert.ok([...mouseViewProjection(invalid,.01)].every(Number.isFinite));
});

test('wheel animation moves in both directions, settles, and stays bounded over many turns',()=>{
  for(const target of [-100,100]) {
    let motion=stepMouseWheel(0,target,1/60);
    assert.equal(Math.sign(motion.angle),Math.sign(target));
    assert.ok(Math.abs(motion.angle)<Math.abs(target));
    for(let i=0;i<120 && motion.moving;i++) motion=stepMouseWheel(motion.angle,motion.target,1/60);
    assert.equal(motion.moving,false);
    assert.ok(Math.abs(motion.angle)<Math.PI*2);
    assert.equal(motion.angle,motion.target);
  }
  assert.equal(stepMouseWheel(0,1,0).angle,0);
  assert.equal(stepMouseWheel(0,1,60).angle,stepMouseWheel(0,1,.05).angle,'a resumed frame cannot jump through a large animation step');
  assert.deepEqual(stepMouseWheel(0,1,1/60,true),{angle:1,target:1,moving:false});
});
