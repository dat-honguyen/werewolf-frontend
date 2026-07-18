import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Auxiliary phase controls that don't belong on a specific opponent's PlayerGrid card: self-only
 * actions (ready toggle, witch heal, passes) and informational text (seer/werewolf-tally results,
 * vote tally, game log). Every section is independently toggled by its `show*`/non-null input, so
 * RoomShell only lights up what's relevant to the current phase.
 */
@Component({
    selector: 'app-room-action-panel',
    imports: [TranslatePipe],
    templateUrl: './room-action-panel.html',
    styleUrl: './room-action-panel.scss'
})
export class RoomActionPanel {
    // Lobby
    readonly showReadyToggle = input(false);
    readonly isReady = input(false);
    readonly readyToggle = output<void>();
    readonly showCancelLobby = input(false);
    readonly cancelLobby = output<void>();
    readonly showLeaveLobby = input(false);
    readonly leaveLobby = output<void>();

    // Night: werewolf
    readonly werewolfTally = input<{ voterName: string; targetName: string }[] | null>(null);
    readonly werewolfLockedLabel = input<string | null>(null);
    readonly showWerewolfPass = input(false);
    readonly werewolfPass = output<void>();

    // Night: seer
    readonly seerResult = input<string | null>(null);

    // Night: witch
    readonly witchTargetInfo = input<string | null>(null);
    readonly showWitchHeal = input(false);
    readonly witchHeal = output<void>();
    readonly showWitchPass = input(false);
    readonly witchPassLabel = input('Pass');
    readonly witchPass = output<void>();

    // Night: cupid
    readonly cupidHint = input<string | null>(null);

    // Night: waiting fallback
    readonly waitingText = input<string | null>(null);

    // Voting
    readonly showSubmitVote = input(false);
    readonly submitVote = output<void>();
    readonly voteTally = input<string | null>(null);

    // Hunter revenge
    readonly showHunterPass = input(false);
    readonly hunterPass = output<void>();

    // Game over
    readonly showViewLog = input(false);
    readonly viewLog = output<void>();
    readonly logEntries = input<string[] | null>(null);
    readonly showLeaveRoom = input(false);
    readonly leaveRoom = output<void>();

    private readonly logListEl = viewChild<ElementRef<HTMLUListElement>>('logList');

    constructor() {
        // The log reads oldest-to-newest (role assignments first, "X wins!" last), but the list
        // renders inside a fixed-height scroll box that opens scrolled to the top -- without this,
        // the one line players actually opened the log for (how the game just ended) is hidden
        // below a wall of role-assignment history they have to scroll past manually to find.
        effect(() => {
            this.logEntries();
            const el = this.logListEl()?.nativeElement;
            if (el) {
                queueMicrotask(() => el.scrollTo({ top: el.scrollHeight }));
            }
        });
    }
}
