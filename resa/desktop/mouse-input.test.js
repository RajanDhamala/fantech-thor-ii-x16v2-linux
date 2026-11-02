import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseInputMonitor } from './mouse-input.js';

function fixture(options={}) {
  const target=new EventTarget();
  const monitor=createMouseInputMonitor({target,onChange:()=>{},...options});
  function send(type,properties={}) {
    const event=new Event(type,{cancelable:true});Object.assign(event,properties);
    target.dispatchEvent(event);return event;
  }
  return {monitor,send};
}

test('listening is opt-in and UI controls are excluded',()=>{
  const {monitor,send}=fixture({isIgnored:event=>event.control===true});
  try {
    assert.equal(send('mousedown',{button:0}).defaultPrevented,false);
    assert.equal(monitor.snapshot().total,0);
    monitor.setEnabled(true);
    assert.equal(send('mousedown',{button:0,control:true}).defaultPrevented,false);
    assert.equal(monitor.snapshot().total,0);
    assert.equal(send('mousedown',{button:0}).defaultPrevented,true);
    assert.equal(monitor.snapshot().total,1);
    monitor.setEnabled(false);
    send('mousedown',{button:2});
    assert.equal(monitor.snapshot().total,1);
    assert.deepEqual(monitor.snapshot().activeButtons,[]);
  } finally {monitor.destroy();}
});

test('standard button mapping supports chords and releases over controls',()=>{
  const {monitor,send}=fixture({isIgnored:event=>event.control===true});
  try {
    monitor.setEnabled(true);
    for(const button of [0,2,1,4,3]) send('mousedown',{button});
    assert.deepEqual(monitor.snapshot().pressed,[0,1,2,3,4]);
    assert.deepEqual(monitor.snapshot().counts,[1,1,1,1,1]);
    send('mousedown',{button:0}); // A duplicate down is not a second press.
    assert.equal(monitor.snapshot().total,5);
    for(const button of [0,2,1,4,3]) send('mouseup',{button,control:true});
    assert.deepEqual(monitor.snapshot().pressed,[]);
    assert.equal(monitor.snapshot().lastEvent,'Back · released');
    send('mousedown',{button:6}); // No raw DPI/color identity can be inferred.
    assert.equal(monitor.snapshot().total,5);
  } finally {monitor.destroy();}
});

test('wheel direction is distinct from middle click and scroll defaults are blocked',()=>{
  const {monitor,send}=fixture();
  try {
    monitor.setEnabled(true);
    assert.equal(send('wheel',{deltaY:-100}).defaultPrevented,true);
    assert.equal(monitor.snapshot().wheelDirection,-1);
    send('wheel',{deltaY:4});send('wheel',{deltaY:0});send('wheel',{deltaY:NaN});
    assert.equal(monitor.snapshot().wheelUp,1);
    assert.equal(monitor.snapshot().wheelDown,1);
    assert.equal(monitor.snapshot().total,0);
    assert.equal(send('contextmenu').defaultPrevented,true);
    assert.equal(send('auxclick',{button:3}).defaultPrevented,true);
  } finally {monitor.destroy();}
});

test('focus loss clears held buttons and pauses counting; finishing preserves results',()=>{
  const {monitor,send}=fixture();
  try {
    monitor.setEnabled(true);send('mousedown',{button:1});send('blur');
    assert.deepEqual(monitor.snapshot().activeButtons,[]);
    assert.equal(monitor.snapshot().focused,false);
    send('mousedown',{button:2});send('wheel',{deltaY:20});
    assert.equal(monitor.snapshot().total,1);
    assert.equal(monitor.snapshot().wheelDown,0);
    send('focus');send('mousedown',{button:2});
    monitor.setEnabled(false);
    assert.equal(monitor.snapshot().total,2);
    assert.deepEqual(monitor.snapshot().activeButtons,[]);
    monitor.clear();assert.equal(monitor.snapshot().total,0);
  } finally {monitor.destroy();}
});

test('quick-click and wheel feedback expires without leaving a stuck highlight',async()=>{
  const {monitor,send}=fixture({pulseMs:10});
  try {
    monitor.setEnabled(true);send('mousedown',{button:0});send('mouseup',{button:0});send('wheel',{deltaY:50});
    assert.deepEqual(monitor.snapshot().pressed,[]);
    assert.deepEqual(monitor.snapshot().activeButtons,[0]);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(monitor.snapshot().activeButtons,[]);
    assert.equal(monitor.snapshot().wheelDirection,0);
    assert.equal(monitor.snapshot().total,1);
  } finally {monitor.destroy();}
});

test('destroy removes listeners and prevents further counting',()=>{
  const {monitor,send}=fixture();
  monitor.setEnabled(true);monitor.destroy();
  assert.equal(send('mousedown',{button:0}).defaultPrevented,false);
  assert.equal(monitor.snapshot().total,0);
});

test('leaving the window clears a press when its release may arrive elsewhere',()=>{
  const {monitor,send}=fixture();
  try {
    monitor.setEnabled(true);send('mousedown',{button:0});
    send('mouseout',{relatedTarget:{}});
    assert.deepEqual(monitor.snapshot().pressed,[0]);
    send('mouseout',{relatedTarget:null});
    assert.deepEqual(monitor.snapshot().activeButtons,[]);
    assert.equal(monitor.snapshot().total,1);
  } finally {monitor.destroy();}
});
