import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WerewolfNotification } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class WerewolfHubService {
    // Server event name is unconfirmed against the real hub — isolated here so it's a one-line fix.
    private readonly notificationEventName = 'notification';

    private connection: signalR.HubConnection | null = null;
    private readonly notificationsSubject = new Subject<WerewolfNotification>();
    private readonly reconnectedSubject = new Subject<void>();

    readonly notifications$: Observable<WerewolfNotification> =
        this.notificationsSubject.asObservable();

    /** Fires when the connection recovers after a drop, so callers can resync state
     * without needing a polling loop — this is the only non-notification-driven refresh. */
    readonly reconnected$: Observable<void> = this.reconnectedSubject.asObservable();

    async connect(): Promise<void> {
        if (this.connection) {
            return;
        }
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(environment.hubUrl)
            .withAutomaticReconnect()
            .build();

        this.connection.on(this.notificationEventName, (payload: WerewolfNotification) => {
            this.notificationsSubject.next(payload);
        });
        this.connection.onreconnected(() => this.reconnectedSubject.next());

        await this.connection.start();
    }

    async joinRoom(roomCode: string, playerId: string): Promise<void> {
        await this.connection?.invoke('JoinGameRoom', { roomCode, playerId });
    }

    async leaveRoom(roomCode: string, playerId: string): Promise<void> {
        await this.connection?.invoke('LeaveGameRoom', { roomCode, playerId });
    }

    async disconnect(): Promise<void> {
        await this.connection?.stop();
        this.connection = null;
    }
}
