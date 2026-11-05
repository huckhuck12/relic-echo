import { DamageRanking } from '../combat/damage-ranking.js';
import type { DamageSource } from '../combat/damage-ranking.js';
/** Bounded per automated run. Reads combat events; never changes combat, random draws or rewards. */
export class BuildRunMetrics {
    firstBuildAt: number | null = null;
    firstBranchAt: number | null = null;
    firstMaxLevelAt: number | null = null;
    firstEvolutionAt: number | null = null;
    bossAppearedAt: number | null = null;
    bossKilledAt: number | null = null;
    hitsTaken = 0;
    damageTaken = 0;
    lethalExposures = 0;
    private bossDamage = new DamageRanking();
    recordBossDamage(value: number, source?: DamageSource): void { this.bossDamage.record(value, source); }
    recordHurt(actual: number, lethal: boolean): void {
        this.hitsTaken++;
        this.damageTaken += actual;
        if (lethal)
            this.lethalExposures++;
    }
    observe(time: number, build: boolean, branch: boolean, maxLevel: boolean, evolution: boolean): void {
        if (build && this.firstBuildAt === null)
            this.firstBuildAt = time;
        if (branch && this.firstBranchAt === null)
            this.firstBranchAt = time;
        if (maxLevel && this.firstMaxLevelAt === null)
            this.firstMaxLevelAt = time;
        if (evolution && this.firstEvolutionAt === null)
            this.firstEvolutionAt = time;
    }
    snapshot(time: number, ranking: DamageRanking) {
        const summarize = (ledger: DamageRanking) => {
            const sources = ledger.rows().map(({ id, damage, share }) => ({ id, damage, share }));
            const buff = sources.filter(row => row.id.includes('/')).reduce((sum, row) => sum + row.damage, 0);
            return { total: ledger.total, buff, buffShare: ledger.total > 0 ? buff / ledger.total : 0, sources };
        };
        return {
            growth: { firstBuildAt: this.firstBuildAt, firstBranchAt: this.firstBranchAt, firstMaxLevelAt: this.firstMaxLevelAt, firstEvolutionAt: this.firstEvolutionAt },
            combat: { hitsTaken: this.hitsTaken, damageTaken: this.damageTaken, lethalExposures: this.lethalExposures },
            boss: {
                appearedAt: this.bossAppearedAt, killedAt: this.bossKilledAt,
                killSeconds: this.bossAppearedAt !== null && this.bossKilledAt !== null ? Math.max(0, this.bossKilledAt - this.bossAppearedAt) : null,
                observedSeconds: this.bossAppearedAt === null ? 0 : Math.max(0, (this.bossKilledAt ?? time) - this.bossAppearedAt),
                damage: summarize(this.bossDamage),
            },
            damage: summarize(ranking),
        };
    }
}
