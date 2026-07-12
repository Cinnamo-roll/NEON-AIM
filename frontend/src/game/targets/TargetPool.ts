import type { TargetState } from '../types/training'
export interface PooledTarget { id:number; poolIndex:number; state:TargetState; visible:boolean; colliderVisible:boolean; colliderRegistered:boolean; hasScored:boolean; spawnTime:number; hitTime:number; animationProgress:number }
export class TargetPool {
  readonly targets:PooledTarget[]; readonly activeTargetColliders=new Set<number>()
  constructor(size=10){this.targets=Array.from({length:size},(_,i)=>this.fresh(i))}
  private fresh(i:number):PooledTarget{return{id:i,poolIndex:i,state:'inactive',visible:false,colliderVisible:false,colliderRegistered:false,hasScored:false,spawnTime:0,hitTime:0,animationProgress:0}}
  resetTarget(t:PooledTarget){Object.assign(t,this.fresh(t.poolIndex));this.activeTargetColliders.delete(t.poolIndex)}
  activateTarget(now=performance.now()){const t=this.targets.find(x=>x.state==='inactive');if(!t)return null;Object.assign(t,{state:'spawning',visible:true,colliderVisible:false,colliderRegistered:false,hasScored:false,spawnTime:now,animationProgress:0});return t}
  finishSpawning(t:PooledTarget){if(t.state!=='spawning')return false;Object.assign(t,{state:'active',colliderVisible:true,colliderRegistered:true});this.activeTargetColliders.add(t.poolIndex);return true}
  markTargetHit(t:PooledTarget,now=performance.now()){if(t.state!=='active'||t.hasScored||!t.colliderRegistered)return false;Object.assign(t,{state:'hit',hasScored:true,hitTime:now,colliderVisible:false,colliderRegistered:false});this.activeTargetColliders.delete(t.poolIndex);return true}
  beginDespawning(t:PooledTarget){if(t.state!=='hit')return false;t.state='despawning';return true}
  deactivateTarget(t:PooledTarget){if(t.state!=='despawning')return false;this.resetTarget(t);return true}
  ensureActive(count:number,now=performance.now()){while(this.activeCount+this.spawningCount<count){if(!this.activateTarget(now))break}return this.targets.filter(t=>t.state==='spawning')}
  get activeTargets(){return this.targets.filter(t=>t.state==='active')} get activeCount(){return this.activeTargets.length} get spawningCount(){return this.targets.filter(t=>t.state==='spawning').length}
  assertInvariants(){if(this.activeCount!==this.activeTargetColliders.size)throw new Error(`active=${this.activeCount}, colliders=${this.activeTargetColliders.size}`);for(const t of this.targets){if(t.state==='active'&&(!t.colliderVisible||!t.colliderRegistered))throw new Error(`Active target ${t.id} has no collider`);if(t.state!=='active'&&(t.colliderVisible||t.colliderRegistered))throw new Error(`Non-active target ${t.id} has collider`);if(t.visible&&t.state==='inactive')throw new Error(`Inactive target ${t.id} is visible`)}}
}
