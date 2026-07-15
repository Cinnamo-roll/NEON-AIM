import type{GridShotSessionStats}from'../types/training'
import{calculateGridShotConsistency,median as analyticsMedian}from'../modes/gridShot/gridShotAnalytics'
import{evaluateGridShotGrade}from'../modes/gridShot/gridShotGrade'
import{comboBonus,isStable,speedBonus}from'./gridShotScoreRules'
export{comboBonus,isStable,speedBonus}from'./gridShotScoreRules'
export interface HitScoreBreakdown{base:number;speedBonus:number;comboBonus:number;stabilityBonus:number;total:number;interval:number|null;speedLabel:'FIRST'|'FLOW'|'FAST'|'GOOD'|'STEADY'|'SLOW'}
export function scoreGridShotHit(interval:number|null,combo:number,recentIntervals:number[]):HitScoreBreakdown{const speed=speedBonus(interval),stable=isStable(recentIntervals);const base=100,comboPoints=comboBonus(combo),stabilityBonus=stable?5:0;return{base,speedBonus:speed.bonus,comboBonus:comboPoints,stabilityBonus,total:base+speed.bonus+comboPoints+stabilityBonus,interval,speedLabel:speed.label}}
export function consistencyScore(intervals:number[]){return calculateGridShotConsistency(intervals,intervals.length+1,0)}
export function median(values:number[]){return analyticsMedian(values)}
export function gradeGridShot(stats:Pick<GridShotSessionStats,'accuracy'|'targetsPerMinute'|'maxCombo'|'consistencyScore'>){return evaluateGridShotGrade({accuracy:stats.accuracy,targetsPerMinute:stats.targetsPerMinute,maxCombo:stats.maxCombo,consistency:stats.consistencyScore}).grade}
