import type{GridShotSessionStats}from'../types/training'
import{calculateGridShotConsistency,median as analyticsMedian}from'../modes/gridShot/gridShotAnalytics'
import{evaluateGridShotGrade}from'../modes/gridShot/gridShotGrade'
export interface HitScoreBreakdown{base:number;speedBonus:number;comboBonus:number;stabilityBonus:number;total:number;interval:number|null;speedLabel:'FIRST'|'FLOW'|'FAST'|'GOOD'|'STEADY'|'SLOW'}
export function speedBonus(interval:number|null){if(interval===null)return{bonus:0,label:'FIRST' as const};if(interval<=180)return{bonus:50,label:'FLOW' as const};if(interval<=230)return{bonus:40,label:'FAST' as const};if(interval<=300)return{bonus:30,label:'GOOD' as const};if(interval<=400)return{bonus:20,label:'STEADY' as const};if(interval<=550)return{bonus:10,label:'SLOW' as const};return{bonus:0,label:'SLOW' as const}}
export function comboBonus(combo:number){return combo>=50?20:combo>=30?15:combo>=20?10:combo>=10?5:0}
export function isStable(intervals:number[]){if(intervals.length<5)return false;const a=intervals.slice(-5),mean=a.reduce((x,y)=>x+y,0)/a.length,variance=a.reduce((n,v)=>n+(v-mean)**2,0)/a.length;return Math.sqrt(variance)/mean<=.16}
export function scoreGridShotHit(interval:number|null,combo:number,recentIntervals:number[]):HitScoreBreakdown{const speed=speedBonus(interval),stable=isStable(recentIntervals);const base=100,comboPoints=comboBonus(combo),stabilityBonus=stable?5:0;return{base,speedBonus:speed.bonus,comboBonus:comboPoints,stabilityBonus,total:base+speed.bonus+comboPoints+stabilityBonus,interval,speedLabel:speed.label}}
export function consistencyScore(intervals:number[]){return calculateGridShotConsistency(intervals,intervals.length+1,0)}
export function median(values:number[]){return analyticsMedian(values)}
export function gradeGridShot(stats:Pick<GridShotSessionStats,'accuracy'|'targetsPerMinute'|'maxCombo'|'consistencyScore'>){return evaluateGridShotGrade({accuracy:stats.accuracy,targetsPerMinute:stats.targetsPerMinute,maxCombo:stats.maxCombo,consistency:stats.consistencyScore}).grade}
