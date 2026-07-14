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

    readonly notifications$: Observable<WerewolfNotification> =
        this.notificationsSubject.asObservable();

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
