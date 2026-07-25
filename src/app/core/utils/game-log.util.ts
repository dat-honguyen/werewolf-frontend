import { TranslateService } from '@ngx-translate/core';
import { GameLogEntry } from '../models/game.model';

export interface GameLogRenderContext {
    translate: TranslateService;
    playerName: (playerId: string) => string;
}

function name(ctx: GameLogRenderContext, data: GameLogEntry['data'], key: string): string {
    const id = data[key];
    return typeof id === 'string' ? ctx.playerName(id) : '';
}

/** Renders one structured game log entry into the active locale's display string -- player ids
 * resolve through `ctx.playerName` (never a raw id shown to the player), and role/faction/cause
 * enum-ish values resolve through their existing `roles.*`/`factions.*`/`gameLog.causes.*`
 * translation keys instead of being interpolated raw (the same class of bug the Game Over
 * banner's winning-faction text had before it was fixed earlier this session). */
export function renderGameLogEntry(entry: GameLogEntry, ctx: GameLogRenderContext): string {
    const { translate } = ctx;
    const { type, data } = entry;

    switch (type) {
        case 'game_started':
            return translate.instant('gameLog.gameStarted');
        case 'role_assigned':
            return translate.instant('gameLog.roleAssigned', {
                name: name(ctx, data, 'playerId'),
                role: translate.instant('roles.' + data['role'])
            });
        case 'night_started':
            return translate.instant('gameLog.nightStarted', { n: data['nightNumber'] });
        case 'cupid_paired_lovers':
            return translate.instant('gameLog.cupidPairedLovers', {
                cupid: name(ctx, data, 'cupidPlayerId'),
                first: name(ctx, data, 'firstPlayerId'),
                second: name(ctx, data, 'secondPlayerId')
            });
        case 'seer_inspection_performed':
            return translate.instant('gameLog.seerInspectionPerformed', {
                seer: name(ctx, data, 'seerPlayerId'),
                target: name(ctx, data, 'targetPlayerId'),
                result: translate.instant(
                    'gameLog.werewolfResult.' + (data['isWerewolf'] ? 'yes' : 'no')
                )
            });
        case 'doctor_protection_chosen':
            return translate.instant('gameLog.doctorProtectionChosen', {
                doctor: name(ctx, data, 'doctorPlayerId'),
                target: name(ctx, data, 'protectedPlayerId')
            });
        case 'werewolf_target_locked':
            return translate.instant('gameLog.werewolfTargetLocked', {
                target: name(ctx, data, 'targetPlayerId')
            });
        case 'werewolf_no_kill':
            return translate.instant('gameLog.werewolfNoKill');
        case 'witch_heal_used':
            return translate.instant('gameLog.witchHealUsed', {
                witch: name(ctx, data, 'witchPlayerId')
            });
        case 'witch_poison_used':
            return translate.instant('gameLog.witchPoisonUsed', {
                witch: name(ctx, data, 'witchPlayerId'),
                target: name(ctx, data, 'targetPlayerId')
            });
        case 'witch_passed':
            return translate.instant('gameLog.witchPassed', {
                witch: name(ctx, data, 'witchPlayerId')
            });
        case 'day_started':
            return translate.instant('gameLog.dayStarted', { n: data['dayNumber'] });
        case 'voting_started':
            return translate.instant('gameLog.votingStarted');
        case 'vote_cast':
            return translate.instant('gameLog.voteCast', {
                voter: name(ctx, data, 'voterPlayerId'),
                target: name(ctx, data, 'targetPlayerId')
            });
        case 'vote_abstained':
            return translate.instant('gameLog.voteAbstained', {
                voter: name(ctx, data, 'voterPlayerId')
            });
        case 'voting_closed':
            return translate.instant('gameLog.votingClosed');
        case 'player_died':
            return translate.instant('gameLog.playerDied', {
                name: name(ctx, data, 'playerId'),
                cause: translate.instant('gameLog.causes.' + data['cause'])
            });
        case 'player_lynched':
            return translate.instant('gameLog.playerLynched', {
                name: name(ctx, data, 'playerId')
            });
        case 'no_lynch_occurred':
            return translate.instant('gameLog.noLynchOccurred');
        case 'hunter_revenge_pending':
            return translate.instant('gameLog.hunterRevengePending', {
                hunter: name(ctx, data, 'hunterPlayerId')
            });
        case 'hunter_revenge_shot_fired':
            return translate.instant('gameLog.hunterRevengeShotFired', {
                hunter: name(ctx, data, 'hunterPlayerId'),
                target: name(ctx, data, 'targetPlayerId')
            });
        case 'hunter_revenge_declined':
            return translate.instant('gameLog.hunterRevengeDeclined', {
                hunter: name(ctx, data, 'hunterPlayerId')
            });
        case 'game_ended':
            return translate.instant('gameLog.gameEnded', {
                faction: translate.instant('factions.' + data['winningFaction'])
            });
        default:
            return '';
    }
}
