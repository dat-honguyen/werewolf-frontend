// src/app/shared/components/room-shell/room-shell.ts
import {
    Component,
    DestroyRef,
    ElementRef,
    afterNextRender,
    computed,
    effect,
    inject,
    signal,
    viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, switchMap } from 'rxjs';
import { GameApiService } from '../../../core/services/game-api.service';
import { GameStateService, GameView } from '../../../core/services/game-state.service';
import { LobbyApiService } from '../../../core/services/lobby-api.service';
import { PlayerIdentityService } from '../../../core/services/player-identity.service';
import { ToastService } from '../../../core/services/toast.service';
import { WerewolfHubService } from '../../../core/services/werewolf-hub.service';
import { AliveFlag, diffNewlyDead } from '../../../core/utils/death-diff.util';
import { extractErrorMessage } from '../../../core/utils/http-error.util';
import { shouldShowPhaseTransition } from '../../../core/utils/phase-family.util';
import { roleAccent } from '../../../core/utils/role-accent.util';
import { DEFAULT_GAME_SETTINGS, LocalLobbyPlayer } from '../../../core/models/lobby.model';
import { Role } from '../../../core/models/role.model';
import { IdentityGrimoireCard } from '../identity-grimoire-card/identity-grimoire-card';
import { PhaseBanner } from '../phase-banner/phase-banner';
import { PhaseTransition } from '../phase-transition/phase-transition';
import { PlayerGrid, PlayerGridEntry } from '../player-grid/player-grid';
import { RoomActionPanel } from '../room-action-panel/room-action-panel';
import { RoleGuideModal } from '../role-guide-modal/role-guide-modal';
import { HelpGuideModal } from '../help-guide-modal/help-guide-modal';
import { SettingsModal } from '../settings-modal/settings-modal';
import { LanguageSwitch } from '../language-switch/language-switch';
import { RoomBackdrop } from '../room-backdrop/room-backdrop';

interface ChatMessage {
    senderId: string;
    senderName: string;
    text: string;
    sentAtUtc: string;
    isSystem?: boolean;
}

const PHASE_ANNOUNCEMENT_KEY: Partial<Record<GameView, string>> = {
    'day-discussion': 'roomShell.phaseAnnouncement.dayDiscussion',
    night: 'roomShell.phaseAnnouncement.night',
    voting: 'roomShell.phaseAnnouncement.voting'
};

type ChatTab = 'town' | 'pack';
type NightAction = 'cupid' | 'seer' | 'werewolf' | 'doctor' | 'witch';

const WOLF_VOTE_POLL_MS = 2000;
/** How long to hold a "tallying the votes" message before revealing who was lynched -- voting used
 * to resolve to the result the instant the closing SignalR notification landed, which read as
 * abrupt and gave players no beat to register the vote had actually closed. Only applies to lynch
 * deaths (a vote outcome); night/hunter-revenge/quit deaths still reveal immediately. */
const VOTE_RESULT_REVEAL_DELAY_MS = 3000;

/** Shared mm:ss formatter for both the Day Discussion and Day Voting countdowns. */
function formatCountdown(seconds: number | null): string | null {
    if (seconds === null) {
        return null;
    }
    const mins = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

const ROLE_OBJECTIVE_KEY: Record<Role, string> = {
    Villager: 'roomShell.objectives.villager',
    Werewolf: 'roomShell.objectives.werewolf',
    Seer: 'roomShell.objectives.villager',
    Doctor: 'roomShell.objectives.villager',
    Hunter: 'roomShell.objectives.villager',
    Witch: 'roomShell.objectives.villager',
    Cupid: 'roomShell.objectives.villager',
    Tanner: 'roomShell.objectives.tanner'
};

/**
 * The single persistent Room view (LUNARIS layout): header, Identity Grimoire + stats on the left,
 * phase banner + player grid + action panel in the middle, chat on the right. Absorbs the logic
 * that used to live in lobby-screen, role-reveal-screen, night-action-panel, day-discussion-screen,
 * voting-screen, hunter-revenge-modal, and game-over-screen -- those are retired as standalone
 * screens (see docs/superpowers/plans/2026-07-17-unified-room-screen.md) in favor of this always-
 * mounted shell whose *contents* change with GameStateService.currentView(), not the screen itself.
 */
@Component({
    selector: 'app-room-shell',
    imports: [
        FormsModule,
        TranslatePipe,
        IdentityGrimoireCard,
        PhaseBanner,
        PhaseTransition,
        PlayerGrid,
        RoomActionPanel,
        RoleGuideModal,
        HelpGuideModal,
        SettingsModal,
        LanguageSwitch,
        RoomBackdrop
    ],
    templateUrl: './room-shell.html',
    styleUrl: './room-shell.scss'
})
export class RoomShell {
    private readonly gameApi = inject(GameApiService);
    private readonly gameState = inject(GameStateService);
    private readonly lobbyApi = inject(LobbyApiService);
    private readonly playerIdentity = inject(PlayerIdentityService);
    private readonly toast = inject(ToastService);
    private readonly translate = inject(TranslateService);
    private readonly hub = inject(WerewolfHubService);
    private readonly router = inject(Router);

    readonly roomCode = this.gameState.roomCode;
    readonly view = this.gameState.currentView;
    readonly lobby = this.gameState.lobby;
    readonly state = this.gameState.gameState;
    readonly myPlayerId = this.playerIdentity.playerId;

    readonly showSettings = signal(false);
    readonly showRoleGuide = signal(false);
    readonly showHelpGuide = signal(false);
    readonly showPhaseTransition = signal(false);
    /** Two-way bound to IdentityGrimoireCard's own flip state (not GameStateService's one-shot
     * hasSeenRoleReveal) so the redundant objective hint below can hide once the card's back face
     * -- which already states the win condition -- is showing. */
    readonly isRoleCardFlipped = signal(false);
    readonly chatTab = signal<ChatTab>('town');
    readonly townMessages = signal<ChatMessage[]>([]);
    readonly draftMessage = signal('');

    /** Chat takes up nearly the full column height, which is fine in the lobby (nothing else
     * competes for that space) but crowds out the player grid/action panel once a game is
     * running -- so it's collapsible everywhere except the lobby view, where it always stays
     * expanded regardless of this flag. */
    readonly chatCollapsed = signal(false);
    readonly isChatCollapsed = computed(() => this.chatCollapsed() && this.view() !== 'lobby');
    private readonly townMessageCountAtCollapse = signal(0);
    readonly hasUnreadTownMessages = computed(
        () =>
            this.isChatCollapsed() && this.townMessages().length > this.townMessageCountAtCollapse()
    );

    readonly lastDeathText = signal<string | null>(null);
    readonly nowMs = signal(Date.now());
    readonly logEntries = signal<string[] | null>(null);

    // Night-phase local state (mirrors former NightActionPanel)
    private readonly actionsTaken = signal<Set<NightAction>>(new Set());
    private readonly lastDoctorTarget = signal<string | null>(null);
    private readonly cupidFirstPick = signal<string | null>(null);
    readonly wolfVotes = signal<Map<string, string | null>>(new Map());
    readonly wolfLockedTarget = signal<string | null | undefined>(undefined);
    readonly seerResult = signal<{ targetPlayerId: string; isWerewolf: boolean } | null>(null);
    readonly witchTarget = signal<string | null | undefined>(undefined);
    readonly witchHealUsed = signal(false);
    readonly witchPoisonUsed = signal(false);
    readonly dyingIds = signal<Set<string>>(new Set());
    /** The target a fire-and-forget night action (werewolf/doctor/seer/witch) was just submitted
     * against, held for a beat after showX() has already flipped false -- see nightActionAccent
     * and entries() below. */
    readonly justActedTarget = signal<{ role: Role; playerId: string } | null>(null);
    private readonly justActedTimeouts: ReturnType<typeof setTimeout>[] = [];
    private readonly voteResultTimeouts: ReturnType<typeof setTimeout>[] = [];

    /** Swaps the "Copy invite link" button's own label to a confirmation for a beat -- the only
     * feedback a clipboard write gets otherwise is silence, which reads as "did that work?". */
    readonly copiedInviteLink = signal(false);
    private copiedInviteLinkTimeout: ReturnType<typeof setTimeout> | null = null;

    // Voting-phase local state (mirrors former VotingScreen)
    readonly selectedVoteTarget = signal<string | null | undefined>(undefined);
    private readonly votesByVoter = signal<Map<string, string | null>>(new Map());

    readonly isHost = computed(() => this.lobby()?.hostPlayerId === this.myPlayerId());
    readonly myPlayer = computed<LocalLobbyPlayer | undefined>(() =>
        this.lobby()?.players.find((p) => p.playerId === this.myPlayerId())
    );
    readonly settings = computed(() => this.lobby()?.settings ?? DEFAULT_GAME_SETTINGS);

    readonly myRole = computed<Role | null>(
        () => this.state()?.players.find((p) => p.playerId === this.myPlayerId())?.role ?? null
    );
    readonly ownObjective = computed(() => {
        this.translate.currentLang();
        const role = this.myRole();
        return role ? this.translate.instant(ROLE_OBJECTIVE_KEY[role]) : '';
    });

    readonly isNight = computed(() => this.state()?.phase === 'Night');
    /** Before a game starts, there's no GameState yet -- fall back to the lobby roster so "Living
     * Souls" reads as the room's current player count instead of a misleading 0. */
    readonly aliveCount = computed(() => {
        const state = this.state();
        if (!state) {
            return this.lobby()?.players.length ?? 0;
        }
        return state.players.filter((p) => p.isAlive).length;
    });
    readonly deadCount = computed(() => {
        const state = this.state();
        if (!state) {
            return 0;
        }
        return state.players.length - this.aliveCount();
    });

    readonly canSeePackChat = computed(
        () => this.myRole() === 'Werewolf' && this.myPlayer() !== undefined
    );

    readonly canStartGame = computed(() => {
        const lobby = this.lobby();
        if (!lobby) {
            return false;
        }
        const allReady = lobby.players.every((p) => p.isReady);
        if (lobby.players.length < lobby.settings.minPlayers) {
            return false;
        }
        return allReady || lobby.settings.allowForceStart;
    });
    readonly needsForceStart = computed(
        () =>
            !(this.lobby()?.players.every((p) => p.isReady) ?? true) &&
            (this.lobby()?.settings.allowForceStart ?? false)
    );

    readonly myTurnRole = computed(() => {
        const role = this.state()?.currentNightRole ?? null;
        return role !== null && role === this.myRole() ? role : null;
    });
    private readonly currentNightNumber = computed(() => this.state()?.nightNumber);
    readonly showCupid = computed(
        () =>
            this.myRole() === 'Cupid' &&
            this.myTurnRole() === 'Cupid' &&
            this.state()?.nightNumber === 1 &&
            this.state()?.lovers === null &&
            !this.actionsTaken().has('cupid')
    );
    readonly showSeer = computed(
        () =>
            this.myRole() === 'Seer' &&
            this.myTurnRole() === 'Seer' &&
            !this.actionsTaken().has('seer')
    );
    readonly showWerewolf = computed(
        () =>
            this.myRole() === 'Werewolf' &&
            this.myTurnRole() === 'Werewolf' &&
            !this.actionsTaken().has('werewolf')
    );
    readonly showDoctor = computed(
        () =>
            this.myRole() === 'Doctor' &&
            this.myTurnRole() === 'Doctor' &&
            !this.actionsTaken().has('doctor')
    );
    readonly showWitch = computed(
        () =>
            this.myRole() === 'Witch' &&
            this.myTurnRole() === 'Witch' &&
            !this.actionsTaken().has('witch')
    );
    /** True while it's specifically *this* player's night-role turn to act -- used to highlight
     * their own grid card (see entries() below) since nothing previously distinguished "I need to
     * act now" from "someone else is acting", the reported cause of players missing their turn. */
    readonly isActingNow = computed(
        () =>
            this.showCupid() ||
            this.showSeer() ||
            this.showWerewolf() ||
            this.showDoctor() ||
            this.showWitch()
    );

    /** Colors the acting player's own selectable/selected grid cards to match their current
     * night role instead of the generic day/night --primary -- werewolf glows blood-red, doctor
     * green, etc. Only affects the acting player's own screen during their own turn; other
     * players' grids never read this (their showX() computeds are all false), so it can't leak
     * role information.
     *
     * Checked before showX(): Werewolf/Doctor/Seer/Witch submit-and-advance the instant their
     * target is clicked, which flips showX() false in the same tick -- without justActedTarget
     * carrying the accent for a beat past that, the border color would revert to --primary before
     * a human ever sees the click register. */
    readonly nightActionAccent = computed<string | null>(() => {
        const justActed = this.justActedTarget();
        if (justActed) {
            return roleAccent(justActed.role);
        }
        if (this.showWerewolf()) {
            return roleAccent('Werewolf');
        }
        if (this.showDoctor()) {
            return roleAccent('Doctor');
        }
        if (this.showSeer()) {
            return roleAccent('Seer');
        }
        if (this.showCupid()) {
            return roleAccent('Cupid');
        }
        if (this.showWitch()) {
            return roleAccent('Witch');
        }
        return null;
    });

    /** Marks `targetPlayerId` as just-acted-upon for `role`, so its grid card keeps the
     * role-accent `--selected` glow for a beat after a fire-and-forget night action (werewolf
     * attack, doctor protect, seer inspect, witch poison) submits and showX() immediately flips
     * false. Mirrors dyingIds' hold-then-clear pattern (Task 9) rather than introducing a new one. */
    private flashActedTarget(role: Role, targetPlayerId: string): void {
        this.justActedTarget.set({ role, playerId: targetPlayerId });
        this.justActedTimeouts.push(
            setTimeout(() => {
                if (this.justActedTarget()?.playerId === targetPlayerId) {
                    this.justActedTarget.set(null);
                }
            }, 700)
        );
    }

    readonly werewolfTallyDisplay = computed(() => {
        this.translate.currentLang();
        if (!this.showWerewolf()) {
            return null;
        }
        const entries = Array.from(this.wolfVotes().entries()).map(([voterId, targetId]) => ({
            voterName: this.playerName(voterId),
            targetName: targetId
                ? this.playerName(targetId)
                : this.translate.instant('roomShell.noKill')
        }));
        return entries.length > 0 ? entries : null;
    });

    readonly werewolfLockedLabel = computed(() => {
        this.translate.currentLang();
        const locked = this.wolfLockedTarget();
        if (locked === undefined) {
            return null;
        }
        return locked ? this.playerName(locked) : this.translate.instant('roomShell.noKill');
    });

    readonly secondsRemaining = computed(() => {
        const deadline = this.state()?.discussionDeadlineUtc;
        if (!deadline) {
            return null;
        }
        return Math.max(0, Math.floor((new Date(deadline).getTime() - this.nowMs()) / 1000));
    });
    readonly countdownDisplay = computed(() => formatCountdown(this.secondsRemaining()));

    readonly votingSecondsRemaining = computed(() => {
        const deadline = this.state()?.votingDeadlineUtc;
        if (!deadline) {
            return null;
        }
        return Math.max(0, Math.floor((new Date(deadline).getTime() - this.nowMs()) / 1000));
    });
    readonly votingCountdownDisplay = computed(() =>
        formatCountdown(this.votingSecondsRemaining())
    );

    /** Whichever countdown is live for the current view -- Day Discussion's or Day Voting's --
     * folded into one set of signals so PhaseBanner only needs one countdown slot instead of the
     * template picking between two. */
    readonly activeCountdownSeconds = computed(() =>
        this.view() === 'voting' ? this.votingSecondsRemaining() : this.secondsRemaining()
    );
    readonly activeCountdownDisplay = computed(() =>
        this.view() === 'voting' ? this.votingCountdownDisplay() : this.countdownDisplay()
    );
    /** Percent of the countdown's total duration still remaining, for PhaseBanner's progress-bar
     * fill. Null whenever there's no active countdown (activeCountdownSeconds() is null) or the
     * configured duration is 0 (guards a divide-by-zero rather than assuming settings are sane). */
    readonly countdownProgressPercent = computed(() => {
        const remaining = this.activeCountdownSeconds();
        if (remaining === null) {
            return null;
        }
        const total =
            this.view() === 'voting'
                ? this.settings().votingDurationSeconds
                : this.settings().discussionDurationSeconds;
        if (!total) {
            return null;
        }
        return Math.max(0, Math.min(100, (remaining / total) * 100));
    });

    /** Phase banner content, keyed off GameStateService.currentView(). */
    readonly bannerIcon = computed(() => {
        switch (this.view()) {
            case 'lobby':
                return '🐺';
            case 'role-reveal':
            case 'night':
                return '🌙';
            case 'day-discussion':
                return '☀️';
            case 'voting':
                return '⚖️';
            case 'hunter-revenge':
                return '🏹';
            case 'game-over':
                return '🏆';
        }
    });
    readonly bannerStatus = computed(() => {
        this.translate.currentLang();
        switch (this.view()) {
            case 'lobby':
                return this.translate.instant('roomShell.statusLabels.lobby');
            case 'role-reveal':
            case 'night':
                return this.translate.instant('roomShell.statusLabels.night', {
                    n: this.state()?.nightNumber ?? ''
                });
            case 'day-discussion':
                return this.translate.instant('roomShell.statusLabels.dayDiscussion');
            case 'voting':
                return this.translate.instant('roomShell.statusLabels.dayVoting');
            case 'hunter-revenge':
                return this.translate.instant('roomShell.statusLabels.hunterRevenge');
            case 'game-over':
                return this.translate.instant('roomShell.statusLabels.gameOver');
        }
    });
    readonly bannerInstruction = computed(() => {
        this.translate.currentLang();
        switch (this.view()) {
            case 'lobby':
                return this.translate.instant('roomShell.banner.lobbyStatus');
            case 'role-reveal':
            case 'night':
                return (
                    this.state()?.nightPrompt ??
                    this.translate.instant('roomShell.banner.nightStatus')
                );
            case 'day-discussion':
                return this.translate.instant('roomShell.banner.dayStatus');
            case 'voting':
                return this.translate.instant('roomShell.banner.votingStatus');
            case 'hunter-revenge':
                return this.translate.instant('roomShell.banner.hunterStatus');
            case 'game-over':
                return this.translate.instant('roomShell.banner.gameOverStatus', {
                    faction: this.state()?.result?.winningFaction ?? ''
                });
        }
    });

    /** Start Game/Force Start lives in the bottom action panel rather than the header -- it's the
     * single most consequential button in the lobby (everyone lands here first), so it sits next to
     * the ready toggle where players are already looking instead of competing for space with the
     * header's utility buttons (invite link, role guide, settings). */
    readonly startGameButton = computed<{ label: string; disabled?: boolean } | null>(() => {
        this.translate.currentLang();
        if (!this.isHost() || this.view() !== 'lobby') {
            return null;
        }
        return {
            label: this.translate.instant(
                this.needsForceStart()
                    ? 'roomShell.headerActions.forceStart'
                    : 'roomShell.headerActions.startGame'
            ),
            disabled: !this.canStartGame()
        };
    });

    /** Header contextual action button -- replaces the mockup's fake "Switch to Night/Day" toggle
     * with whatever real host action applies to the current phase (null hides the button). Lobby's
     * Start Game lives in startGameButton/the action panel instead, see above. */
    readonly headerAction = computed<{ label: string; disabled?: boolean } | null>(() => {
        this.translate.currentLang();
        if (!this.isHost()) {
            return null;
        }
        switch (this.view()) {
            case 'day-discussion':
                return { label: this.translate.instant('roomShell.headerActions.advanceToVoting') };
            case 'voting':
                return {
                    label: this.translate.instant('roomShell.headerActions.closeVotingEarly')
                };
            case 'game-over':
                return { label: this.translate.instant('roomShell.headerActions.rematch') };
            default:
                return null;
        }
    });

    readonly entries = computed<PlayerGridEntry[]>(() => {
        this.translate.currentLang();
        const lobby = this.lobby();
        const state = this.state();
        const myId = this.myPlayerId();
        const view = this.view();

        if (view === 'lobby') {
            return (lobby?.players ?? []).map((p) => ({
                playerId: p.playerId,
                displayName: p.displayName,
                isAlive: true,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                isReady: p.isReady,
                actionLabel:
                    this.isHost() && p.playerId !== myId
                        ? this.translate.instant('roomShell.gridActions.kick')
                        : undefined,
                actionVariant: 'danger' as const
            }));
        }

        if (!state) {
            return [];
        }

        const displayName = (playerId: string) => this.playerName(playerId);

        if (view === 'game-over') {
            const roles = state.result?.finalRoles ?? {};
            return state.players.map((p) => ({
                playerId: p.playerId,
                displayName: displayName(p.playerId),
                isAlive: p.isAlive,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                revealedRole: roles[p.playerId],
                dying: this.dyingIds().has(p.playerId)
            }));
        }

        if (view === 'voting') {
            const alive = state.players.filter((p) => p.isAlive);
            return [
                ...alive.map((p) => ({
                    playerId: p.playerId,
                    displayName: displayName(p.playerId),
                    isAlive: true,
                    isMe: p.playerId === myId,
                    isHost: p.playerId === lobby?.hostPlayerId,
                    voteCount: this.voteCountFor(p.playerId),
                    selected: this.selectedVoteTarget() === p.playerId,
                    actionLabel: this.translate.instant('roomShell.gridActions.vote'),
                    actionVariant: 'accent' as const,
                    dying: this.dyingIds().has(p.playerId)
                })),
                {
                    playerId: '__abstain__',
                    displayName: this.translate.instant('actionPanel.abstain'),
                    isAlive: true,
                    isMe: false,
                    isHost: false,
                    voteCount: this.abstainCount(),
                    selected: this.selectedVoteTarget() === null,
                    actionLabel: this.translate.instant('roomShell.gridActions.vote'),
                    actionVariant: 'accent' as const
                }
            ];
        }

        if (view === 'hunter-revenge') {
            const isMyTurn = state.pendingHunterRevenge[0] === myId;
            return state.players
                .filter((p) => p.isAlive)
                .map((p) => ({
                    playerId: p.playerId,
                    displayName: displayName(p.playerId),
                    isAlive: true,
                    isMe: p.playerId === myId,
                    isHost: p.playerId === lobby?.hostPlayerId,
                    actionLabel:
                        isMyTurn && p.playerId !== myId
                            ? this.translate.instant('roomShell.gridActions.shoot')
                            : undefined,
                    actionVariant: 'danger' as const,
                    dying: this.dyingIds().has(p.playerId),
                    isMyTurn: isMyTurn && p.playerId === myId
                }));
        }

        // 'role-reveal' and 'night' render identically -- the identity card handles the reveal moment.
        return state.players.map((p) => {
            const isTarget = p.playerId !== myId;
            let actionLabel: string | undefined;
            if (isTarget && p.isAlive) {
                if (this.showSeer()) {
                    actionLabel = this.translate.instant('roleActions.inspect');
                } else if (this.showWerewolf()) {
                    const excluded =
                        p.role === 'Werewolf' && !this.settings().werewolfCanTargetWerewolf;
                    actionLabel = excluded
                        ? undefined
                        : this.translate.instant('roleActions.attack');
                } else if (this.showDoctor()) {
                    const excluded =
                        p.playerId === this.lastDoctorTarget() ||
                        (p.playerId === myId && !this.settings().doctorCanSelfProtect);
                    actionLabel = excluded
                        ? undefined
                        : this.translate.instant('roleActions.protect');
                } else if (this.showWitch() && !this.witchPoisonUsed()) {
                    actionLabel = this.translate.instant('roleActions.poison');
                } else if (this.showCupid()) {
                    actionLabel =
                        this.cupidFirstPick() === p.playerId
                            ? this.translate.instant('roleActions.chosen')
                            : this.translate.instant('roleActions.pickLover');
                }
            } else if (this.showDoctor() && this.settings().doctorCanSelfProtect) {
                actionLabel =
                    this.lastDoctorTarget() === myId
                        ? undefined
                        : this.translate.instant('roleActions.protect');
            }
            return {
                playerId: p.playerId,
                displayName: displayName(p.playerId),
                isAlive: p.isAlive,
                isMe: p.playerId === myId,
                isHost: p.playerId === lobby?.hostPlayerId,
                actionLabel,
                actionVariant: 'accent' as const,
                actionDisabled: this.showCupid() && this.cupidFirstPick() === p.playerId,
                // Cupid's first pick persists on screen until the second pick confirms it, so it
                // reads its own selection state directly. Werewolf/Doctor/Seer/Witch instead
                // submit-and-advance the instant a target is clicked -- justActedTarget (set in
                // onNightGridAction/flashActedTarget) holds their target's glow for a beat past
                // that, since showX() has already flipped false by the next render.
                selected:
                    (this.showCupid() && this.cupidFirstPick() === p.playerId) ||
                    this.justActedTarget()?.playerId === p.playerId,
                dying: this.dyingIds().has(p.playerId),
                isMyTurn: p.playerId === myId && this.isActingNow()
            };
        });
    });

    /** Template ref on &__header -- its real rendered height varies with viewport width (the
     * logo/room-code and header actions wrap onto their own lines below ~480px), but toast-list
     * (a sibling of RoomShell, not a descendant -- see room.component.html) needs to clear it
     * regardless. Measuring it here and publishing it as a --header-h custom property on
     * <html> (inherited everywhere, not just within .room-shell) replaces what used to be a
     * hardcoded single-line-height guess that silently drifted out of sync whenever the header's
     * content changed. */
    private readonly headerRef = viewChild<ElementRef<HTMLElement>>('header');

    constructor() {
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            const header = this.headerRef()?.nativeElement;
            if (!header) {
                return;
            }
            const syncHeaderHeight = () =>
                document.documentElement.style.setProperty(
                    '--header-h',
                    `${header.offsetHeight}px`
                );
            syncHeaderHeight();
            const observer = new ResizeObserver(syncHeaderHeight);
            observer.observe(header);
            destroyRef.onDestroy(() => observer.disconnect());
        });

        let lastAnnouncedView: GameView | null = null;
        effect(() => {
            const view = this.view();
            if (shouldShowPhaseTransition(lastAnnouncedView, view)) {
                this.showPhaseTransition.set(true);
            }
            const key = PHASE_ANNOUNCEMENT_KEY[view];
            if (key && view !== lastAnnouncedView) {
                this.appendSystemMessage(this.translate.instant(key));
            }
            lastAnnouncedView = view;
        });

        // GameStateService.systemMessages carries room-wide status updates (join/leave/ready/
        // game-ended) that used to be ToastService popups -- folded into Town Square here instead
        // so a burst of them (several players joining at once) reads as chat history rather than
        // a stack of toasts covering the header and sidebar. `mergedSystemMessageCount` (a plain
        // closure variable, not a signal) tracks how many entries this effect has already copied
        // over, so re-running it on every new arrival only appends the delta instead of
        // re-appending the whole array each time.
        let mergedSystemMessageCount = 0;
        effect(() => {
            const systemMessages = this.gameState.systemMessages();
            if (systemMessages.length > mergedSystemMessageCount) {
                const newOnes = systemMessages.slice(mergedSystemMessageCount);
                mergedSystemMessageCount = systemMessages.length;
                for (const message of newOnes) {
                    this.appendSystemMessage(message.text, message.sentAtUtc);
                }
            }
        });

        // Fires a toast the moment it becomes this player's turn to act (a night role or Hunter's
        // Revenge) -- the grid-card pulse/tag (isMyTurn, see entries() and player-grid.scss) only
        // helps once someone is already looking at the grid, and players reported not noticing
        // their turn had started at all. Edge-triggered off a plain closure flag (not a signal) so
        // it fires once per turn instead of once per re-render while the turn is active.
        let wasMyTurn = false;
        effect(() => {
            const isMyTurn =
                this.isActingNow() ||
                (this.view() === 'hunter-revenge' &&
                    this.state()?.pendingHunterRevenge?.[0] === this.myPlayerId());
            if (isMyTurn && !wasMyTurn) {
                this.toast.show(this.translate.instant('roomShell.yourTurn'), 'success');
            }
            wasMyTurn = isMyTurn;
        });

        effect(() => {
            this.currentNightNumber();
            this.actionsTaken.set(new Set());
            this.wolfVotes.set(new Map());
            this.wolfLockedTarget.set(undefined);
            this.seerResult.set(null);
            this.witchTarget.set(undefined);
            this.witchHealUsed.set(false);
            this.witchPoisonUsed.set(false);
            this.cupidFirstPick.set(null);
        });

        let previousAlive: AliveFlag[] | null = null;
        const dyingTimeouts: ReturnType<typeof setTimeout>[] = [];
        effect(() => {
            const state = this.state();
            const nextAlive: AliveFlag[] = state
                ? state.players.map((p) => ({ playerId: p.playerId, isAlive: p.isAlive }))
                : [];
            const newlyDead = diffNewlyDead(previousAlive, nextAlive);
            previousAlive = nextAlive;
            if (newlyDead.size === 0) {
                return;
            }
            this.dyingIds.update((current) => new Set([...current, ...newlyDead]));
            dyingTimeouts.push(
                setTimeout(() => {
                    this.dyingIds.update((current) => {
                        const next = new Set(current);
                        for (const id of newlyDead) {
                            next.delete(id);
                        }
                        return next;
                    });
                }, 900)
            );
        });
        inject(DestroyRef).onDestroy(() => dyingTimeouts.forEach(clearTimeout));
        inject(DestroyRef).onDestroy(() => this.justActedTimeouts.forEach(clearTimeout));
        inject(DestroyRef).onDestroy(() => this.voteResultTimeouts.forEach(clearTimeout));
        inject(DestroyRef).onDestroy(() => {
            if (this.copiedInviteLinkTimeout) {
                clearTimeout(this.copiedInviteLinkTimeout);
            }
        });

        const roomCode = this.roomCode();
        if (roomCode) {
            this.gameApi.getRoomChat(roomCode).subscribe((response) => {
                const serverMessages = response.messages.map((m) => ({
                    senderId: m.senderId,
                    senderName: m.senderDisplayName,
                    text: m.text,
                    sentAtUtc: m.sentAtUtc
                }));
                // A phase-announcement system message (see the effect above) can already have
                // been appended locally by the time this resolves -- keep it instead of a blind
                // overwrite, which would silently drop it.
                this.townMessages.update((current) => [
                    ...serverMessages,
                    ...current.filter((m) => m.isSystem)
                ]);
            });
        }

        this.hub.notifications$.pipe(takeUntilDestroyed()).subscribe((notification) => {
            if (notification.kind === 'chat.room') {
                this.townMessages.update((messages) => [
                    ...messages,
                    {
                        senderId: notification.senderId,
                        senderName: this.playerName(notification.senderId),
                        text: notification.text,
                        sentAtUtc: notification.sentAtUtc
                    }
                ]);
            }
            if (notification.kind === 'seer.result') {
                this.seerResult.set({
                    targetPlayerId: notification.targetPlayerId,
                    isWerewolf: notification.isWerewolf
                });
            }
            if (notification.kind === 'player.died') {
                const finalText = this.translate.instant('roomShell.playerDied', {
                    name: this.playerName(notification.playerId),
                    cause: notification.cause
                });
                if (notification.cause === 'lynch') {
                    this.lastDeathText.set(this.translate.instant('roomShell.tallyingVotes'));
                    this.voteResultTimeouts.push(
                        setTimeout(
                            () => this.lastDeathText.set(finalText),
                            VOTE_RESULT_REVEAL_DELAY_MS
                        )
                    );
                } else {
                    this.lastDeathText.set(finalText);
                }
            }
            if (notification.kind === 'vote.cast') {
                const next = new Map(this.votesByVoter());
                next.set(notification.voterPlayerId, notification.targetPlayerId);
                this.votesByVoter.set(next);
            }
        });

        const tickId = setInterval(() => this.nowMs.set(Date.now()), 1000);
        inject(DestroyRef).onDestroy(() => clearInterval(tickId));

        // Discussion's countdown is otherwise cosmetic -- AdvanceToVoting is a host-only API call,
        // so nothing moves the game past Day Discussion once the clock hits 0:00 unless the host
        // clicks the button themselves. Auto-fire it for them instead. Keyed off
        // discussionDeadlineUtc (not just "seconds === 0") so this fires exactly once per
        // discussion, not on every 1s tick while the clock sits at zero waiting for the request to
        // land.
        let autoAdvancedForDeadline: string | null = null;
        effect(() => {
            if (!this.isHost() || this.view() !== 'day-discussion') {
                return;
            }
            const deadline = this.state()?.discussionDeadlineUtc;
            if (
                !deadline ||
                this.secondsRemaining() !== 0 ||
                autoAdvancedForDeadline === deadline
            ) {
                return;
            }
            autoAdvancedForDeadline = deadline;
            this.advanceToVotingAction();
        });

        // Same pattern for Day Voting: CloseVoting is host-only too, and otherwise only fires via
        // an explicit "Close Voting Early" click or once every living player has voted. Auto-fire
        // it once the voting countdown hits 0:00 so an undervoted round doesn't stall the game
        // forever waiting on a click nobody's going to make.
        let autoClosedForDeadline: string | null = null;
        effect(() => {
            if (!this.isHost() || this.view() !== 'voting') {
                return;
            }
            const deadline = this.state()?.votingDeadlineUtc;
            if (
                !deadline ||
                this.votingSecondsRemaining() !== 0 ||
                autoClosedForDeadline === deadline
            ) {
                return;
            }
            autoClosedForDeadline = deadline;
            this.closeVotingAction();
        });

        interval(WOLF_VOTE_POLL_MS)
            .pipe(
                switchMap(() => {
                    const code = this.roomCode();
                    if (!this.showWerewolf() || !code) {
                        return [];
                    }
                    return this.gameApi.getWerewolfVotes(code, this.myPlayerId());
                }),
                takeUntilDestroyed()
            )
            .subscribe((result) => {
                this.wolfVotes.set(new Map(Object.entries(result.votes)));
                this.wolfLockedTarget.set(result.lockedTarget);
            });

        effect(() => {
            const code = this.roomCode();
            if (!this.showWitch() || !code || this.witchTarget() !== undefined) {
                return;
            }
            this.gameApi
                .getWitchTarget(code, this.myPlayerId())
                .subscribe((result) => this.witchTarget.set(result.targetPlayerId));
        });
    }

    copyInviteLink(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        navigator.clipboard
            .writeText(`${location.origin}/room/${roomCode}`)
            .then(() => {
                this.copiedInviteLink.set(true);
                if (this.copiedInviteLinkTimeout) {
                    clearTimeout(this.copiedInviteLinkTimeout);
                }
                this.copiedInviteLinkTimeout = setTimeout(() => {
                    this.copiedInviteLink.set(false);
                }, 1800);
            })
            .catch(() => {});
    }

    playerName(playerId: string): string {
        return this.lobby()?.players.find((p) => p.playerId === playerId)?.displayName ?? playerId;
    }

    voteCountFor(playerId: string): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === playerId) {
                count += 1;
            }
        }
        return count;
    }

    abstainCount(): number {
        let count = 0;
        for (const target of this.votesByVoter().values()) {
            if (target === null) {
                count += 1;
            }
        }
        return count;
    }

    selectChatTab(tab: ChatTab): void {
        this.chatTab.set(tab);
    }

    toggleChatCollapsed(): void {
        const collapsing = !this.chatCollapsed();
        if (collapsing) {
            this.townMessageCountAtCollapse.set(this.townMessages().length);
        }
        this.chatCollapsed.set(collapsing);
    }

    private appendSystemMessage(text: string, sentAtUtc = new Date().toISOString()): void {
        this.townMessages.update((messages) => [
            ...messages,
            {
                senderId: 'system',
                senderName: this.translate.instant('roomShell.systemSenderName'),
                text,
                sentAtUtc,
                isSystem: true
            }
        ]);
    }

    /** Matches SendRoomChatMessageHandler.MaxMessageLength on the backend -- oversized sends are
     * silently dropped there (no error surfaces back over the SignalR fire-and-forget path), so
     * trimming here is the only feedback the user gets. */
    readonly maxTownMessageLength = 500;

    sendTownMessage(): void {
        const roomCode = this.roomCode();
        const text = this.draftMessage().trim().slice(0, this.maxTownMessageLength);
        if (!roomCode || !text) {
            return;
        }
        void this.hub.sendRoomChatMessage(roomCode, this.myPlayerId(), text);
        this.draftMessage.set('');
    }

    /** Single entry point for every PlayerGrid `(action)` click -- dispatches by current view +
     * (for night) whichever role's turn it is, since the grid itself doesn't know game rules. */
    onGridAction(playerId: string): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        switch (this.view()) {
            case 'lobby':
                this.kick(playerId);
                return;
            case 'voting':
                this.selectedVoteTarget.set(playerId === '__abstain__' ? null : playerId);
                return;
            case 'hunter-revenge':
                this.gameApi
                    .submitHunterRevengeShot({
                        roomCode,
                        playerId: this.myPlayerId(),
                        targetPlayerId: playerId
                    })
                    .subscribe({
                        error: (error: unknown) =>
                            this.toast.show(
                                extractErrorMessage(
                                    error,
                                    this.translate.instant('toasts.hunterActionFailed')
                                ),
                                'error'
                            )
                    });
                return;
            case 'game-over':
                return;
            default:
                this.onNightGridAction(roomCode, playerId);
        }
    }

    private onNightGridAction(roomCode: string, playerId: string): void {
        if (this.showSeer()) {
            this.gameApi
                .submitSeerInspection({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.flashActedTarget('Seer', playerId);
                    this.markDone('seer');
                });
        } else if (this.showWerewolf()) {
            this.gameApi
                .submitWerewolfVote({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.flashActedTarget('Werewolf', playerId);
                    this.markDone('werewolf');
                });
        } else if (this.showDoctor()) {
            this.gameApi
                .submitDoctorProtection({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.flashActedTarget('Doctor', playerId);
                    this.lastDoctorTarget.set(playerId);
                    this.markDone('doctor');
                });
        } else if (this.showWitch() && !this.witchPoisonUsed()) {
            this.gameApi
                .useWitchPoisonPotion({
                    roomCode,
                    playerId: this.myPlayerId(),
                    targetPlayerId: playerId
                })
                .subscribe(() => {
                    this.flashActedTarget('Witch', playerId);
                    this.witchPoisonUsed.set(true);
                    this.finalizeWitchIfBothPotionsResolved();
                });
        } else if (this.showCupid()) {
            const first = this.cupidFirstPick();
            if (!first) {
                this.cupidFirstPick.set(playerId);
            } else if (first !== playerId) {
                this.gameApi
                    .submitCupidPairing({
                        roomCode,
                        playerId: this.myPlayerId(),
                        firstPlayerId: first,
                        secondPlayerId: playerId
                    })
                    .subscribe(() => this.markDone('cupid'));
            }
        }
    }

    private finalizeWitchIfBothPotionsResolved(): void {
        if (
            this.settings().witchSinglePotionPerNight ||
            (this.witchHealUsed() && this.witchPoisonUsed())
        ) {
            this.markDone('witch');
        }
    }

    private markDone(action: NightAction): void {
        const next = new Set(this.actionsTaken());
        next.add(action);
        this.actionsTaken.set(next);
    }

    witchHealAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.useWitchHealPotion({ roomCode, playerId: this.myPlayerId() }).subscribe(() => {
            this.witchHealUsed.set(true);
            this.finalizeWitchIfBothPotionsResolved();
        });
    }

    witchPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .passWitch({ roomCode, playerId: this.myPlayerId() })
            .subscribe(() => this.markDone('witch'));
    }

    werewolfPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi
            .submitWerewolfVote({
                roomCode,
                playerId: this.myPlayerId(),
                targetPlayerId: undefined
            })
            .subscribe(() => this.markDone('werewolf'));
    }

    hunterPassAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.passHunterRevenge({ roomCode, playerId: this.myPlayerId() }).subscribe({
            error: (error: unknown) =>
                this.toast.show(
                    extractErrorMessage(error, this.translate.instant('toasts.hunterActionFailed')),
                    'error'
                )
        });
    }

    submitVoteAction(): void {
        const roomCode = this.roomCode();
        const selected = this.selectedVoteTarget();
        if (!roomCode || selected === undefined) {
            return;
        }
        this.gameApi
            .castVote({
                roomCode,
                voterPlayerId: this.myPlayerId(),
                targetPlayerId: selected ?? undefined
            })
            .subscribe();
    }

    votedCount(): number {
        return this.votesByVoter().size;
    }

    private kick(playerId: string): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        const kicked = lobby.players.find((p) => p.playerId === playerId);
        this.lobbyApi
            .kickPlayer({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId(), playerId })
            .subscribe({
                next: () => {
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.filter((p) => p.playerId !== playerId)
                    });
                    if (kicked) {
                        this.appendSystemMessage(
                            this.translate.instant('roomShell.playerKicked', {
                                name: kicked.displayName
                            })
                        );
                    }
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, this.translate.instant('toasts.kickFailed')),
                        'error'
                    )
            });
    }

    readyToggleAction(): void {
        const lobby = this.lobby();
        const me = this.myPlayer();
        if (!lobby || !me) {
            return;
        }
        const nextReady = !me.isReady;
        this.lobbyApi
            .setReady({ roomCode: lobby.roomCode, playerId: this.myPlayerId(), isReady: nextReady })
            .subscribe({
                next: () =>
                    this.gameState.lobby.set({
                        ...lobby,
                        players: lobby.players.map((p) =>
                            p.playerId === me.playerId ? { ...p, isReady: nextReady } : p
                        )
                    }),
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(error, this.translate.instant('toasts.readyFailed')),
                        'error'
                    )
            });
    }

    cancelLobbyAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .cancelLobby({ roomCode: lobby.roomCode, requestedBy: this.myPlayerId() })
            .subscribe({
                next: () => {
                    this.playerIdentity.clearActiveRoom();
                    void this.router.navigate(['/']);
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            this.translate.instant('toasts.cancelLobbyFailed')
                        ),
                        'error'
                    )
            });
    }

    leaveLobbyAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .leaveLobby({ roomCode: lobby.roomCode, playerId: this.myPlayerId() })
            .subscribe({
                next: () => {
                    this.playerIdentity.clearActiveRoom();
                    void this.router.navigate(['/']);
                },
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            this.translate.instant('toasts.leaveLobbyFailed')
                        ),
                        'error'
                    )
            });
    }

    advanceToVotingAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.advanceToVoting({ roomCode, requestedBy: this.myPlayerId() }).subscribe();
    }

    closeVotingAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.closeVoting({ roomCode, requestedBy: this.myPlayerId() }).subscribe();
    }

    viewLogAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.gameApi.getLog(roomCode).subscribe((log) => this.logEntries.set(log.entries));
    }

    leaveRoomAction(): void {
        this.playerIdentity.clearActiveRoom();
        void this.router.navigate(['/']);
    }

    startRematchAction(): void {
        const roomCode = this.roomCode();
        if (!roomCode) {
            return;
        }
        this.lobbyApi.rematch({ roomCode, requestedBy: this.myPlayerId() }).subscribe({
            next: () => {
                this.gameState.resetForRematch();
                void this.gameState.refreshLobby(roomCode);
            },
            error: (error: unknown) =>
                this.toast.show(
                    extractErrorMessage(error, this.translate.instant('toasts.rematchFailed')),
                    'error'
                )
        });
    }

    startGameAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        this.lobbyApi
            .startGame({
                roomCode: lobby.roomCode,
                requestedBy: this.myPlayerId(),
                forceStart: this.needsForceStart()
            })
            .subscribe({
                next: () => void this.gameState.refreshGameState(lobby.roomCode),
                error: (error: unknown) =>
                    this.toast.show(
                        extractErrorMessage(
                            error,
                            this.translate.instant('toasts.startGameFailed')
                        ),
                        'error'
                    )
            });
    }

    /** Header contextual button click -- dispatches to whichever action `headerAction()` is
     * currently describing. */
    onHeaderAction(): void {
        const lobby = this.lobby();
        if (!lobby) {
            return;
        }
        switch (this.view()) {
            case 'day-discussion':
                this.advanceToVotingAction();
                return;
            case 'voting':
                this.closeVotingAction();
                return;
            case 'game-over':
                this.startRematchAction();
                return;
        }
    }

    readonly cupidFirstPickHint = computed(() => {
        this.translate.currentLang();
        const first = this.cupidFirstPick();
        return first
            ? this.translate.instant('roomShell.cupidHint.pickSecond', {
                  name: this.playerName(first)
              })
            : this.translate.instant('roomShell.cupidHint.pickFirst');
    });
}
