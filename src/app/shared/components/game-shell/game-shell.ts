import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { Avatar } from '../avatar/avatar';
import { Role } from '../../../core/models/role.model';

interface ChatMessage {
    senderId: string;
    senderName: string;
    text: string;
    sentAtUtc: string;
}

type ChatTab = 'town' | 'pack';

const PHASE_LABEL: Partial<Record<string, (n: number) => string>> = {
    Night: (n) => `Night ${n}`,
    DayDiscussion: (n) => `Day ${n} — Discussion`,
    DayVoting: (n) => `Day ${n} — Voting`,
    DayResolution: (n) => `Day ${n} — Resolution`
};

/** Short "what am I trying to do" framing for the identity HUD -- deliberately not the full
 * ability description RulesApiService provides (see RoleRevealScreen), just the team objective
 * line the mockup calls out. */
const ROLE_OBJECTIVE: Record<Role, string> = {
    Villager: 'Find and eliminate every werewolf.',
    Werewolf: 'Eliminate all villagers.',
    Seer: 'Find and eliminate every werewolf.',
    Doctor: 'Find and eliminate every werewolf.',
    Hunter: 'Find and eliminate every werewolf.',
    Witch: 'Find and eliminate every werewolf.',
    Cupid: 'Find and eliminate every werewolf.',
    Tanner: 'Get yourself lynched by the village.'
};

/**
 * Persistent 3-column shell wrapping the active gameplay phases (night/day-discussion/voting/
 * hunter-revenge) -- header with phase/room info, an always-visible roster on the left, the
 * current phase's own component projected into the center, and a chat sidebar on the right.
 *
 * Town Square chat is fully wired (history fetch + live SignalR append + send). Pack Chat stays
 * visual-only for now: it's deliberately not pushed over SignalR server-side (see
 * SendPackChatMessage's backend docs), so wiring it up would need polling, out of scope here.
 */
@Component({
    selector: 'app-game-shell',
    imports: [Avatar, FormsModule],
    templateUrl: './game-shell.html',
    styleUrl: './game-shell.scss'
})
export class GameShell {
    private readonly gameState = inject(GameStateService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly gameApi = inject(GameApiService);
    private readonly hub = inject(WerewolfHubService);

    readonly roomCode = this.gameState.roomCode;
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');

    readonly isNight = computed(() => this.gameState.gameState()?.phase === 'Night');

    readonly phaseLabel = computed(() => {
        const state = this.gameState.gameState();
        if (!state) {
            return '';
        }
        const label = PHASE_LABEL[state.phase];
        return label
            ? label(state.phase === 'Night' ? state.nightNumber : state.dayNumber)
            : state.phase;
    });

    readonly roster = computed(() => {
        const state = this.gameState.gameState();
        const lobby = this.gameState.lobby();
        if (!state) {
            return [];
        }
        return state.players.map((player) => ({
            playerId: player.playerId,
            displayName: this.gameState.playerDisplayName(player.playerId),
            isAlive: player.isAlive,
            isHost: player.playerId === lobby?.hostPlayerId,
            isMe: player.playerId === this.playerIdentity.playerId()
        }));
    });

    readonly aliveCount = computed(() => this.roster().filter((p) => p.isAlive).length);
    readonly deadCount = computed(() => this.roster().length - this.aliveCount());

    readonly ownRole = computed<Role | null>(() => {
        const state = this.gameState.gameState();
        const me = state?.players.find((p) => p.playerId === this.playerIdentity.playerId());
        return me?.role ?? null;
    });

    readonly ownObjective = computed(() => {
        const role = this.ownRole();
        return role ? ROLE_OBJECTIVE[role] : '';
    });

    /** Pack Chat only makes sense to show to a living werewolf -- everyone else would just see a
     * tab that does nothing (and, if it were ever wired up, GetPackChatEndpoint 404s for them
     * anyway). */
    readonly canSeePackChat = computed(() => {
        const state = this.gameState.gameState();
        const me = state?.players.find((p) => p.playerId === this.playerIdentity.playerId());
        return me?.role === 'Werewolf' && me.isAlive;
    });

    selectChatTab(tab: ChatTab): void {
        this.chatTab.set(tab);
    }

    constructor() {
        const roomCode = this.roomCode();
        if (roomCode) {
            this.gameApi.getRoomChat(roomCode).subscribe((response) => {
                this.townMessages.set(
                    response.messages.map((m) => ({
                        senderId: m.senderId,
                        senderName: m.senderDisplayName,
                        text: m.text,
                        sentAtUtc: m.sentAtUtc
                    }))
                );
            });
        }

        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind !== 'chat.room') {
                return;
            }
            this.townMessages.update((messages) => [
                ...messages,
                {
                    senderId: notification.senderId,
                    senderName: this.gameState.playerDisplayName(notification.senderId),
                    text: notification.text,
                    sentAtUtc: notification.sentAtUtc
                }
            ]);
        });
    }

    sendTownMessage(): void {
        const roomCode = this.roomCode();
        const text = this.draftMessage().trim();
        if (!roomCode || !text) {
            return;
        }
        this.gameApi
            .sendRoomChatMessage({ roomCode, playerId: this.playerIdentity.playerId(), text })
            .subscribe();
        this.draftMessage.set('');
    }
}
