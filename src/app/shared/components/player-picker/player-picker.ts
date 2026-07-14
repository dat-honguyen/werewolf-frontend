import { Component, computed, input, output, signal } from '@angular/core';

export interface PlayerPickerCandidate {
    playerId: string;
    displayName: string;
    excluded?: boolean;
}

@Component({
    selector: 'app-player-picker',
    imports: [],
    templateUrl: './player-picker.html',
    styleUrl: './player-picker.scss'
})
export class PlayerPicker {
    readonly candidates = input.required<PlayerPickerCandidate[]>();
    readonly allowNoTarget = input(false);
    readonly noTargetLabel = input('No kill');

    readonly picked = output<string | null>();

    private readonly selectedIdSignal = signal<string | null | undefined>(undefined);
    readonly selectedId = computed(() => this.selectedIdSignal());

    select(playerId: string | null): void {
        this.selectedIdSignal.set(playerId);
        this.picked.emit(playerId);
    }
}
