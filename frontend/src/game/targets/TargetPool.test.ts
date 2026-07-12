import {describe,expect,it} from 'vitest';import {TargetPool} from './TargetPool'
describe('TargetPool',()=>{
it('uses unique ids and indexes',()=>{const p=new TargetPool();expect(new Set(p.targets.map(x=>x.id)).size).toBe(10);expect(new Set(p.targets.map(x=>x.poolIndex)).size).toBe(10)})
it('cannot double allocate',()=>{const p=new TargetPool(1);expect(p.activateTarget()).not.toBeNull();expect(p.activateTarget()).toBeNull()})
it('only active targets have colliders',()=>{const p=new TargetPool(),t=p.activateTarget()!;expect(p.markTargetHit(t)).toBe(false);p.finishSpawning(t);p.assertInvariants();expect(p.markTargetHit(t)).toBe(true);expect(p.markTargetHit(t)).toBe(false)})
it('resets completely',()=>{const p=new TargetPool();p.targets.forEach(t=>p.resetTarget(t));p.assertInvariants();expect(p.targets.every(t=>t.state==='inactive'&&!t.visible)).toBe(true)})
it('survives 5000 cycles',()=>{const p=new TargetPool(10);p.ensureActive(3);p.targets.filter(t=>t.state==='spawning').forEach(t=>p.finishSpawning(t));for(let i=0;i<5000;i++){const t=p.activeTargets[i%3];expect(p.markTargetHit(t)).toBe(true);p.ensureActive(3);p.targets.filter(x=>x.state==='spawning').forEach(x=>p.finishSpawning(x));p.beginDespawning(t);p.deactivateTarget(t);p.ensureActive(3);p.targets.filter(x=>x.state==='spawning').forEach(x=>p.finishSpawning(x));p.assertInvariants()}expect(p.activeCount).toBe(3);expect(p.activeTargetColliders.size).toBe(3);expect(new Set(p.activeTargets).size).toBe(3)})
})
