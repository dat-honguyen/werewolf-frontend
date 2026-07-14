import { KeyValuePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { DEFAULT_GAME_SETTINGS } from '../../../core/models/lobby.model';
import {
    PlayerPicker,
    PlayerPickerCandidate
} from '../../../shared/components/player-picker/player-picker';
import { GameTable } from '../../../shared/components/game-table/game-table';
import { PlayerCard } from '../../../shared/components/player-card/player-card';

type NightAction = 'cupid' | 'seer' | 'werewolf' | 'doctor' | 'witch';

@Component({
    selector: 'app-night-action-panel',
    imports: [KeyValuePipe, PlayerPicker, GameTable, PlayerCard],
    templateUrl: './night-action-panel.html',
    styleUrl: './night-action-panel.scss'
})
export class NightActionPanel {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly hub = inject(WerewolfHubService);

    private readonly actionsTaken = signal<Set<NightAction>>(new Set());
    private readonly lastDoctorTarget = signal<string | null>(null);

    readonly wolfVotes = signal<Map<string, string | null>>(new Map());
    readonly wolfLockedTarget = signal<string | null | undefined>(undefined);
    readonly seerResult = signal<{ targetPlayerId: string; isWerewolf: boolean } | null>(null);

    readonly myPlayerId = this.playerIdentity.playerId;
    readonly state = this.gameState.gameState;
    readonly settings = computed(() => this.gameState.lobby()?.settings ?? DEFAULT_GAME_SETTINGS);

    readonly myRole = computed(() => {
        const state = this.state();
        return state?.players.find((p) => p.playerId === this.myPlayerId())?.role ?? null;
    });

    readonly alivePlayers = computed(() => (this.state()?.players ?? []).filter((p) => p.isAlive));

    readonly showCupid = computed(
        () =>
            this.myRole() === 'Cupid' &&
            this.state()?.nightNumber === 1 &&
            this.state()?.lovers === null &&
            !this.actionsTaken().has('cupid')
    );
    readonly showSeer = computed(
        () => this.myRole() === 'Seer' && !this.actionsTaken().has('seer')
    );
    readonly showWerewolf = computed(
        () => this.myRole() === 'Werewolf' && !this.actionsTaken().has('werewolf')
    );
    readonly showDoctor = computed(
        () => this.myRole() === 'Doctor' && !this.actionsTaken().has('doctor')
    );
    readonly showWitch = computed(
        () =>
            this.myRole() === 'Witch' &&
            !this.actionsTaken().has('witch') &&
            this.wolfLockedTarget() !== undefined
    );

    readonly isWaiting = computed(
        () =>
            !this.showCupid() &&
            !this.showSeer() &&
            !this.showWerewolf() &&
            !this.showDoctor() &&
            !this.showWitch()
    );

    readonly werewolfCandidates = computed<PlayerPickerCandidate[]>(() => {
        const myId = this.myPlayerId();
        const allowWolfTarget = this.settings().werewolfCanTargetWerewolf;
        return this.alivePlayers()
            .filter((p) => p.playerId !== myId)
            .map((p) => ({
                playerId: p.playerId,
                displayName: this.playerName(p.playerId),
                excluded: p.role === 'Werewolf' && !allowWolfTarget
            }));
    });

    readonly seerCandidates = computed<PlayerPickerCandidate[]>(() =>
        this.alivePlayers()
            .filter((p) => p.playerId !== this.myPlayerId())
            .map((p) => ({ playerId: p.playerId, displayName: this.playerName(p.playerId) }))
    );

    readonly doctorCandidates = computed<PlayerPickerCandidate[]>(() => {
        const lastTarget = this.lastDoctorTarget();
        const myId = this.myPlayerId();
        const canSelfProtect = this.settings().doctorCanSelfProtect;
        return this.alivePlayers().map((p) => ({
            playerId: p.playerId,
            displayName: this.playerName(p.playerId),
            excluded: p.playerId === lastTarget || (p.playerId === myId && !canSelfProtect)
        }));
    });

    readonly witchPoisonCandidates = computed<PlayerPickerCandidate[]>(() =>
        this.alivePlayers().map((p) => ({
            playerId: p.playerId,
            displayName: this.playerName(p.playerId)
        }))
    );

    readonly cupidFirstCandidates = computed<PlayerPickerCandidate[]>(() =>
        this.alivePlayers().map((p) => ({
            playerId: p.playerId,
            displayName: this.playerName(p.playerId)
        }))
    );

    private readonly cupidFirstPick = signal<string | null>(null);

    constructor() {
        effect(() => {
            const nightNumber = this.state()?.nightNumber;
            void nightNumber;
            this.actionsTaken.set(new Set());
            this.wolfVotes.set(new Map());
            this.wolfLockedTarget.set(undefined);
            this.seerResult.set(null);
        });

        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            switch (notification.kind) {
                case 'werewolf.vote': {
                    const next = new Map(this.wolfVotes());
                    next.set(notification.wolfPlayerId, notification.targetPlayerId);
                    this.wolfVotes.set(next);
                    break;
                }
                case 'werewolf.locked':
                    this.wolfLockedTarget.set(notification.targetPlayerId);
                    break;
                case 'seer.result':
                    this.seerResult.set({
                        targetPlayerId: notification.targetPlayerId,
                        isWerewolf: notification.isWerewolf
                    });
                    break;
            }
        });
    }

    playerName(playerId: string): string {
        return (
            this.gameState.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ??
            playerId
        );
    }

    submitCupidFirst(playerId: string | null): void {
        this.cupidFirstPick.set(playerId);
    }

    submitCupidPairing(secondPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        const firstPlayerId = this.cupidFirstPick();
        if (!roomCode || !firstPlayerId || !secondPlayerId) {
            return;
        }
        this.gameApi
            .submitCupidPairing({
                roomCode,
                playerId: this.myPlayerId(),
                firstPlayerId,
                secondPlayerId
            })
            .subscribe(() => this.markDone('cupid'));
    }

    submitSeer(targetPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode || !targetPlayerId) {
            return;
        }
        this.gameApi
            .submitSeerInspection({ roomCode, playerId: this.myPlayerId(), targetPlayerId })
            .subscribe(() => this.markDone('seer'));
    }

    submitWerewolfVote(targetPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .submitWerewolfVote({
                roomCode,
                playerId: this.myPlayerId(),
                targetPlayerId: targetPlayerId ?? undefined
            })
            .subscribe(() => this.markDone('werewolf'));
    }

    submitDoctor(targetPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode || !targetPlayerId) {
            return;
        }
        this.gameApi
            .submitDoctorProtection({ roomCode, playerId: this.myPlayerId(), targetPlayerId })
            .subscribe(() => {
                this.lastDoctorTarget.set(targetPlayerId);
                this.markDone('doctor');
            });
    }

    witchHeal(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .useWitchHealPotion({ roomCode, playerId: this.myPlayerId() })
            .subscribe(() => this.markDone('witch'));
    }

    witchPoison(targetPlayerId: string | null): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode || !targetPlayerId) {
            return;
        }
        this.gameApi
            .useWitchPoisonPotion({ roomCode, playerId: this.myPlayerId(), targetPlayerId })
            .subscribe(() => this.markDone('witch'));
    }

    witchPass(): void {
        const roomCode = this.gameState.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .passWitch({ roomCode, playerId: this.myPlayerId() })
            .subscribe(() => this.markDone('witch'));
    }

    private markDone(action: NightAction): void {
        const next = new Set(this.actionsTaken());
        next.add(action);
        this.actionsTaken.set(next);
    }
}
