import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
function entry() {
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, {hidden:true, textContent:'', events:{}, attributes:{},
      addEventListener(name, fn) {this.events[name]=fn;},
      setAttribute(name,value) {this.attributes[name]=value;},
      querySelector: node});
    return nodes.get(key);
  };
  const document={querySelector:node,body:{classList:{add(){},remove(){}}}};
  const scope={window:{},document,Promise,console};
  vm.runInNewContext(readFileSync(new URL('../app/publish-entry.js',import.meta.url),'utf8'),scope);
  return {node,api:scope.window.ShamPublishEntry,click:()=>node('#publish').events.click()};
}
test('a failed editor startup still gives a visible and dismissible publishing error',()=>{
  const p=entry(); p.click();
  assert.equal(p.node('#publish-dialog').hidden,false);
  assert.match(p.node('#publish-error').textContent,/发布组件未加载/);
  p.node('.close-dialog').events.click();
  assert.equal(p.node('#publish-dialog').hidden,true);
});
test('the entry acknowledges immediately and admits only one pending action',async()=>{
  const p=entry();let calls=0,finish;
  p.api.connect(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  p.click();p.click();
  assert.equal(p.node('#publish-dialog').hidden,false);
  assert.equal(p.node('#publish').disabled,true);
  assert.equal(p.node('#publish-label').textContent,'正在生成live图');
  await Promise.resolve();assert.equal(calls,1);finish();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.node('#publish').disabled,false);
});
test('a synchronous handler error is visible and does not strand the action',async()=>{
  const p=entry();p.api.connect(()=>{throw new Error('startup failure');});p.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(p.node('#publish-error').textContent,/发布未能启动/);
  assert.equal(p.node('#publish').disabled,false);
});
